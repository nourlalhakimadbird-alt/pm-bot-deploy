# Setup

Do these in order. Steps 1–5 are all local — nothing touches the VPS until step 8. This
matches the assignment's own "test both connections before recording" checklist.

## 1. ClickUp

1. Sign up / log in at clickup.com.
2. Create (or repurpose) a **List** to hold the demo project.
3. In that List's Settings → Statuses (or via Board view → "..." on a status column →
   Edit statuses), set **Use custom statuses** and configure exactly these 5, grouped
   into ClickUp's 4 status categories:
   - **Not started**: `NOT STARTED`
   - **Active**: `IN PROGRESS`, `BLOCKED`, `AWAITING REVIEW`
   - **Closed**: `COMPLETE`

   (ClickUp only has 4 category buckets — Not started / Active / Done / Closed — so
   BLOCKED and AWAITING REVIEW both live under Active; that's expected, the bucket only
   affects ClickUp's own filtering, not what the bot does with each status.)

   Note: ClickUp's public API has no endpoint to create/edit statuses — this step is
   UI-only, there's no way to script it.
4. Get your **personal API token**: avatar → Settings → Apps → "Generate" under API
   Token. Put it in `.env` as `CLICKUP_API_TOKEN`.
5. Get your **Team ID** and **List ID** — easiest way: open the list in the browser and
   copy the URL. A real list URL looks like `app.clickup.com/{team_id}/v/li/{list_id}`
   — the Space-level "everything" view URL (`.../v/s/{space_id}`) is *not* the list URL,
   grab the one with `/v/li/`. Put them in `.env` as `CLICKUP_TEAM_ID` and
   `CLICKUP_LIST_ID`.
6. Invite the real people who'll own tasks (or just yourself under a few names) so you
   have real ClickUp users to assign tasks to.

You can sanity-check steps 4–5 anytime with:

```bash
set -a && source .env && set +a
curl -s -H "Authorization: $CLICKUP_API_TOKEN" "https://api.clickup.com/api/v2/list/$CLICKUP_LIST_ID" | python3 -m json.tool
```

## 2. Slack

1. api.slack.com/apps → "Create New App" → From scratch. Name it, pick your workspace.
2. **OAuth & Permissions** → Bot Token Scopes: `chat:write`, `im:write`, `im:history`,
   `users:read`. Install to workspace. Copy the **Bot User OAuth Token** (`xoxb-...`)
   into `.env` as `SLACK_BOT_TOKEN`.
3. **Socket Mode** → enable it, generate an **App-Level Token** with `connections:write`
   (`xapp-...`) → `.env` as `SLACK_APP_TOKEN`.
4. **Basic Information** → copy the **Signing Secret** → `.env` as `SLACK_SIGNING_SECRET`.
5. Update `config/contacts.json` with real handles from your workspace — the assignment
   is explicit about this, no placeholders.

## 3. MiniMax

Get an API key from the MiniMax platform → `.env` as `MINIMAX_API_KEY`.

## 4. Install and onboard OpenClaw locally

Global `npm install -g openclaw` needs sudo on most machines — install it as a local
project dependency instead:

```bash
npm init -y   # if package.json doesn't exist yet
npm install openclaw
```

Run every command below with `npx openclaw ...` (or add `./node_modules/.bin` to PATH).

Onboard non-interactively against this workspace, authenticating with MiniMax:

```bash
set -a && source .env && set +a
npx openclaw onboard \
  --non-interactive --accept-risk \
  --workspace "$(pwd)" \
  --auth-choice minimax-global-api \
  --minimax-api-key "$MINIMAX_API_KEY" \
  --skip-channels --skip-daemon --skip-hooks --skip-search --skip-skills --skip-ui \
  --gateway-bind loopback
```

This writes the real, live OpenClaw config to `~/.openclaw/openclaw.json` (a different
file from this repo's `config/openclaw.json`, which is a human-readable reference of the
same settings — keep them in sync by hand, or via `openclaw config patch`/`config set`).

Install the Slack plugin and add your Slack account:

```bash
npx openclaw plugins install @openclaw/slack
npx openclaw channels add --channel slack \
  --bot-token "$SLACK_BOT_TOKEN" --app-token "$SLACK_APP_TOKEN" \
  --signing-secret "$SLACK_SIGNING_SECRET" --mode socket --name "PM Bot"
```

Enable inbound hooks (needed for real-time ClickUp webhook delivery — see step 6) and
disable memory search (no OpenAI key configured, not needed for this bot):

```bash
npx openclaw config patch --stdin <<'EOF'
{ hooks: { enabled: true, allowedAgentIds: ["main"] } }
EOF
npx openclaw config set hooks.token '${OPENCLAW_HOOKS_TOKEN}'
npx openclaw config set memory.search.enabled false
```

Start the gateway and confirm everything connects:

```bash
set -a && source .env && set +a
nohup npx openclaw gateway run > /tmp/openclaw-gateway.log 2>&1 &
sleep 5 && tail -20 /tmp/openclaw-gateway.log
```

You should see `[slack] socket mode connected` with no `[config] warnings` lines. Then:

```bash
npx openclaw skills info clickup-api --agent main   # should show ✓ Ready
npx openclaw channels status --probe                 # should show Slack ...works
npx openclaw directory peers list --channel slack    # find your own Slack user ID
npx openclaw message send --channel slack --target "user:<YOUR_ID>" --message "test"
```

If you got the Slack DM, both connections are proven end to end.

**Important:** the gateway must be started with `.env` exported into its process
environment (`set -a && source .env && set +a` before `gateway run`) — OpenClaw
auto-loads the workspace `.env` for agent/skill execution, but gateway-level config
secrets like `hooks.token` are resolved from the process environment at startup, so they
need the explicit export. Restart the gateway any time you add a new variable to `.env`.

## 5. Register the periodic automation

```bash
./scripts/register-automations.sh
npx openclaw automations list   # confirm pm-bot-periodic-check, every 15m
```

This covers time-based conditions ClickUp can't push a webhook for: newly-overdue due
dates, and escalating a BLOCKED task once it's past the window in
`config/project.json`. Real-time BLOCKED detection is handled separately, by the webhook
relay in the next step.

## 6. The ClickUp webhook relay

ClickUp's webhook feature can't send a custom `Authorization` header, but OpenClaw's
inbound `/hooks/agent` endpoint requires a bearer token — so ClickUp can't call OpenClaw
directly. `scripts/clickup-webhook-shim.js` bridges this: it verifies ClickUp's
`X-Signature` HMAC itself, then forwards a plain-language event description to
`/hooks/agent` with the token OpenClaw actually requires. It has no dependencies beyond
Node's built-ins.

Register the ClickUp webhook once you have a public URL for the shim (locally, use a
tunnel like `ngrok http 8787` to test this before deploying; in production, this is the
VPS's public HTTPS address — see step 8):

```bash
set -a && source .env && set +a
curl -X POST "https://api.clickup.com/api/v2/team/$CLICKUP_TEAM_ID/webhook" \
  -H "Authorization: $CLICKUP_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"endpoint": "https://<your-public-url>/clickup", "events": ["taskStatusUpdated"]}'
```

Save the `secret` field ClickUp returns into `.env` as `CLICKUP_WEBHOOK_SECRET`. Then run
the shim (needs `CLICKUP_WEBHOOK_SECRET`, `OPENCLAW_HOOKS_TOKEN`, and the gateway
already running):

```bash
set -a && source .env && set +a
node scripts/clickup-webhook-shim.js
```

Flip a ClickUp task to Blocked and confirm the shim logs a forwarded request and the
bot DMs the owner.

## 7. Local dry run — full checklist

Before touching the VPS, confirm all of this works locally:
- [ ] `channels status --probe` shows Slack connected
- [ ] A manual Slack DM via `message send` arrives
- [ ] `curl .../hooks/agent` with the bearer token returns `"status":"ok"`
- [ ] The shim accepts a correctly-signed test payload and rejects a bad one
- [ ] `automations list` shows `pm-bot-periodic-check` scheduled

## 8. Deploy to Hostinger

You have a VPS with root SSH access but no domain — we'll use
[sslip.io](https://sslip.io) (a free wildcard DNS service that resolves
`<ip-with-dashes>.sslip.io` to that IP automatically) so Caddy can still get a real
Let's Encrypt certificate without buying a domain.

1. SSH in: `ssh root@<VPS_IP>`.
2. Install Node.js (LTS) and Caddy:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
   apt-get install -y nodejs caddy
   npm install -g pm2
   ```
3. Copy this repo and your real `.env` over (from your local machine):
   ```bash
   rsync -av --exclude node_modules --exclude .git ./ root@<VPS_IP>:~/pm-bot/
   scp .env root@<VPS_IP>:~/pm-bot/.env
   ```
4. On the VPS, install deps and repeat the onboarding + channel + hooks setup from
   step 4 above (same commands, run on the VPS this time) — `~/.openclaw` on the VPS is
   separate from your laptop's.
5. Run both processes under pm2:
   ```bash
   cd ~/pm-bot
   set -a && source .env && set +a
   pm2 start "npx openclaw gateway run" --name pm-bot-gateway
   pm2 start scripts/clickup-webhook-shim.js --name pm-bot-shim
   pm2 save
   pm2 startup   # follow its printed instructions to survive reboots
   ```
6. Point Caddy at the shim (only the shim needs to be public — the OpenClaw gateway
   itself stays on loopback). Replace `1-2-3-4` with your VPS IP, dashes instead of dots:
   ```
   # /etc/caddy/Caddyfile
   1-2-3-4.sslip.io {
     reverse_proxy /clickup 127.0.0.1:8787
   }
   ```
   ```bash
   systemctl reload caddy
   ```
7. Redo the webhook registration from step 6 above with
   `https://1-2-3-4.sslip.io/clickup` as the real public endpoint, and update
   `CLICKUP_WEBHOOK_SECRET` in the VPS's `.env` (then `pm2 restart pm-bot-gateway
   pm-bot-shim` to pick it up).
8. Re-run `./scripts/register-automations.sh` on the VPS.

Walk through `docs/DEMO_SCRIPT.md` against the deployed VPS instance before recording.
