---
name: clickup-api
description: How to read and write project data in ClickUp — tasks, milestones, statuses, dependencies, and the webhook that reports status changes.
metadata:
  {
    "openclaw":
      {
        "requires": { "env": ["CLICKUP_API_TOKEN", "CLICKUP_TEAM_ID", "CLICKUP_LIST_ID"] },
        "primaryEnv": "CLICKUP_API_TOKEN"
      }
  }
---

# ClickUp API

Base URL: `https://api.clickup.com/api/v2`. Auth header on every request:
`Authorization: <CLICKUP_API_TOKEN>` (no "Bearer" prefix — ClickUp uses the raw token).

The list this bot manages is `CLICKUP_LIST_ID`. The workspace/team is `CLICKUP_TEAM_ID`.

## Statuses

Use exactly these five ClickUp statuses on the list (create them in ClickUp's list
settings before running the bot — the bot does not invent new ones):

| Status label     | Meaning                                                    |
|-------------------|-------------------------------------------------------------|
| NOT STARTED       | Task exists, nobody has started it                          |
| IN PROGRESS        | Owner is actively working on it                              |
| BLOCKED             | Can't proceed — something is in the way                     |
| AWAITING REVIEW     | Owner finished, waiting on a named approver's sign-off       |
| COMPLETE            | Finished AND explicitly confirmed by the right person        |

Never set a task to COMPLETE yourself from this skill alone — that transition is gated
by the `pm-bot` skill's confirmation rule. This skill only performs the ClickUp write
once confirmation has already been established.

## Creating a task

`POST /list/{CLICKUP_LIST_ID}/task`

```json
{
  "name": "Frontend development",
  "assignees": [<clickup_user_id_for_owner>],
  "due_date": <unix_ms_timestamp>,
  "priority": 2,
  "status": "NOT STARTED"
}
```

Priority values in ClickUp are integers: 1 = Urgent, 2 = High, 3 = Normal, 4 = Low.
Look up the ClickUp user ID for an assignee via `GET /team/{CLICKUP_TEAM_ID}` (members
list) — match by the name/email given in the project brief. Do not guess an ID.

## Dependencies

After both tasks exist, link them:

`POST /task/{task_id}/dependency` with body `{"depends_on": "<other_task_id>"}`.

Before creating a task that "depends on Task X", resolve Task X's ClickUp task_id
first (from the ones you already created this run, or via `GET /list/{CLICKUP_LIST_ID}/task`
if it already existed).

## Milestones

ClickUp's native milestone flag varies by API/plan version, so do not rely on it alone.
Create the milestone as a normal task (name prefixed `Milestone —`, no assignee, due
date as given, no priority). Track which tasks roll up to it yourself: keep a
`milestone_of` mapping in `state/tasks_state.json`. When every task listed under a
milestone reaches COMPLETE, treat the milestone as reached and say so in status reports
— do not wait on a native ClickUp milestone-complete field.

## Reading current state

`GET /list/{CLICKUP_LIST_ID}/task?include_closed=true` — returns all tasks with
`status.status`, `due_date`, `assignees`, `dependencies`. Use this for the periodic
cron check (overdue detection) and for building status reports.

## Updating status

`PUT /task/{task_id}` with body `{"status": "<NEW_STATUS>"}`.

## Webhook (real-time BLOCKED detection)

Registered once, from a machine, not by the running agent — see `docs/SETUP.md`. The
short version: ClickUp POSTs task-status-change events to a small standalone relay
(`scripts/clickup-webhook-shim.js`), which verifies ClickUp's `X-Signature` HMAC itself
(ClickUp webhooks can't carry a custom auth header, so OpenClaw's own inbound hook token
can't be checked by ClickUp directly) and forwards a plain-language description of the
event into this gateway's `/hooks/agent` endpoint. By the time this skill's agent sees a
message like "A ClickUp webhook fired: event=taskStatusUpdated, task_id=...", signature
verification has already happened — just look up the task via `clickup-api` and act on
its current status per the `pm-bot` skill.
