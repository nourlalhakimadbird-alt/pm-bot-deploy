# PM Bot

A project-management bot for ClickUp + Slack, built on [OpenClaw](https://openclaw.ai/)
(agent runtime/Slack gateway) and MiniMax (LLM). It creates tasks from a brief, detects
blocked/overdue tasks on its own, DMs the owner, escalates to the project lead if
there's no response, produces On Track / At Risk / Off Track status reports, logs scope
changes without losing the original objective, and never marks a task Complete without
explicit confirmation.

## Layout

- `config/openclaw.json` — OpenClaw gateway config: MiniMax provider, Slack channel.
- `config/contacts.json` — ClickUp assignee → Slack handle map. **Use real handles.**
- `config/project.json` — project objective, deadline, escalation window, scope log.
- `skills/clickup-api/SKILL.md` — how the agent talks to the ClickUp REST API.
- `skills/pm-bot/SKILL.md` — the core behavior: chasing, escalating, reporting, scope
  logging, and the completion-confirmation gate.
- `state/tasks_state.json` — runtime state (blocked-since, last-contacted, escalated
  flags) so the bot doesn't repeat itself across automation runs.
- `scripts/register-automations.sh` — registers the 15-minute periodic check with
  OpenClaw (overdue detection + escalation timing).
- `scripts/clickup-webhook-shim.js` — dependency-free relay that verifies ClickUp's
  webhook signature and forwards events to OpenClaw's `/hooks/agent` endpoint (ClickUp
  can't send the bearer token OpenClaw's inbound hooks require, so this bridges the two).
- `docs/SETUP.md` — step-by-step setup for ClickUp, Slack, MiniMax, and Hostinger.
- `docs/DEMO_SCRIPT.md` — the 5-beat recording script for the application video.

## Quick start

1. `cp .env.example .env` and fill it in — see `docs/SETUP.md`.
2. Install and run OpenClaw locally against this config (also in `docs/SETUP.md`).
3. `./scripts/register-automations.sh`.
4. Walk through `docs/DEMO_SCRIPT.md` locally before deploying, then again on the
   Hostinger VPS before recording.
