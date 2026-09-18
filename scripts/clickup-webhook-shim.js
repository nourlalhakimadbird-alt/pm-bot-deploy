#!/usr/bin/env node
// ClickUp cannot send custom auth headers on its outgoing webhooks, but
// OpenClaw's inbound /hooks/agent endpoint requires a bearer token. This tiny
// relay sits in between: it verifies ClickUp's HMAC signature itself, then
// forwards a plain-language description of the event to OpenClaw with the
// token OpenClaw actually requires. No dependencies — Node's http/crypto only.
//
// Public traffic should reach ONLY this process (reverse-proxied over HTTPS).
// The OpenClaw gateway itself stays on loopback and is never exposed directly.

const http = require('http');
const crypto = require('crypto');

const {
  CLICKUP_WEBHOOK_SECRET,
  OPENCLAW_HOOKS_TOKEN,
  OPENCLAW_URL = 'http://127.0.0.1:18789',
  CLICKUP_SHIM_PORT = '8787',
} = process.env;

if (!CLICKUP_WEBHOOK_SECRET || !OPENCLAW_HOOKS_TOKEN) {
  console.error('Missing CLICKUP_WEBHOOK_SECRET or OPENCLAW_HOOKS_TOKEN in the environment.');
  process.exit(1);
}

function timingSafeEqualHex(a, b) {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function describeEvent(payload) {
  const event = payload.event || 'unknown_event';
  const taskId = payload.task_id || 'unknown_task';
  const changes = Array.isArray(payload.history_items)
    ? payload.history_items
        .map((h) => {
          const field = h.field || 'field';
          const before = h.before && h.before.status ? h.before.status : h.before;
          const after = h.after && h.after.status ? h.after.status : h.after;
          return `${field}: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`;
        })
        .join('; ')
    : '(no change details in payload)';

  return (
    `A ClickUp webhook fired: event=${event}, task_id=${taskId}. ${changes}. ` +
    `Use the clickup-api skill to look up this task's current details, then follow ` +
    `the pm-bot skill rules — if its status is now BLOCKED, chase the owner ` +
    `immediately. Otherwise take no action.`
  );
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/clickup') {
    res.writeHead(404).end();
    return;
  }

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', async () => {
    const rawBody = Buffer.concat(chunks);
    const signature = req.headers['x-signature'];

    if (!signature) {
      res.writeHead(401).end('Missing X-Signature');
      return;
    }

    const expected = crypto
      .createHmac('sha256', CLICKUP_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    if (!timingSafeEqualHex(signature, expected)) {
      res.writeHead(401).end('Bad signature');
      return;
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      res.writeHead(400).end('Invalid JSON');
      return;
    }

    const message = describeEvent(payload);

    try {
      const openclawRes = await fetch(`${OPENCLAW_URL}/hooks/agent`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENCLAW_HOOKS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agentId: 'main',
          message,
          deliver: false,
          waitForCompletion: false,
        }),
      });

      if (!openclawRes.ok) {
        console.error('OpenClaw rejected the forwarded hook:', openclawRes.status, await openclawRes.text());
        res.writeHead(502).end();
        return;
      }

      res.writeHead(200).end('ok');
    } catch (err) {
      console.error('Failed to reach OpenClaw:', err);
      res.writeHead(502).end();
    }
  });
});

server.listen(Number(CLICKUP_SHIM_PORT), () => {
  console.log(`ClickUp webhook shim listening on :${CLICKUP_SHIM_PORT}, forwarding to ${OPENCLAW_URL}/hooks/agent`);
});
