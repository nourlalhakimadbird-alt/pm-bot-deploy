#!/usr/bin/env bash
# Registers the 15-minute periodic check pm-bot depends on for time-based
# conditions ClickUp can't push a webhook for (overdue due dates, and
# escalating a BLOCKED task once it's been unanswered past the window in
# config/project.json). Real-time BLOCKED detection is handled separately by
# scripts/clickup-webhook-shim.js posting to the gateway's /hooks/agent
# endpoint directly — see docs/SETUP.md.
#
# Flags verified against `openclaw automations add --help` (OpenClaw 2026.9.4).
set -euo pipefail

npx openclaw automations add \
  --name "pm-bot-periodic-check" \
  --every 15m \
  --agent main \
  --session isolated \
  --message "Run the periodic check from the pm-bot skill: look for newly overdue tasks, BLOCKED tasks past their escalation window in config/project.json, and any state entries with last_contacted_at null (a chase that never went out, e.g. an unmapped assignee) that need retrying or a lead notification. Act per the skill's rules." \
  --no-deliver

echo "Registered. Verify with: npx openclaw automations list"
