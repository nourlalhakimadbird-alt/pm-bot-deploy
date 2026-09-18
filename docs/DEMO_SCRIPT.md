# Demo / Recording Script

Maps the assignment's 5 required recording beats to exact actions. Have ClickUp and
Slack visible side by side with the recording software (Loom recommended).

## 1. Project brief → ClickUp task

Say or type a brief to the bot in Slack, e.g.:

> New task: Backend API setup, owner James Obi, due 16 Jun, High priority, no
> dependencies.

Show it appear in ClickUp with the correct name, owner, due date, priority, and
status `NOT STARTED`.

## 2. Blocked detection → DM

In ClickUp, change that task's status to `BLOCKED` (optionally add a comment stating
the reason, e.g. "waiting on API credentials from vendor").

Without telling the bot anything, show the Slack DM arrive to the owner (via the
webhook automation) — should happen within seconds. It should name the task, state
the blocker, and show downstream impact.

## 3. No response → escalation

For the demo, temporarily lower `escalation_after_hours` in `config/project.json` to
something like `0.02` (~1 minute) so you don't wait hours on camera — mention out loud
that you're doing this for demo pacing. Don't reply to the bot's DM as the owner. Wait
for the periodic automation to fire (or trigger it manually if OpenClaw supports a
manual run command) and show the escalation DM land in the project lead's Slack DMs.

Set `escalation_after_hours` back to a real value (e.g. `4`) after recording.

## 4. Status report

Ask the bot in Slack: "Can I get a status update on the project?"

Show the reply leading with the health label (On Track / At Risk / Off Track), naming
the blocked task and why, showing which downstream tasks/milestones are impacted, and
ending with a recommended action.

## 5. Scope change

Tell the bot about a new task, e.g.:

> Add a task: Accessibility audit, owner Aisha Rahman, due 24 Jun, Medium priority.

Show it created in ClickUp, and open `config/project.json` to show `scope_log` gained
an entry while `objective` is untouched.
