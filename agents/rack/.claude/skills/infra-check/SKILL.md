# Skill: infra-check

## When to use
Run this when the user gives you a target (server, service, pipeline, or pasted log/metric blob) and wants a structured health digest. Works even without live infra — operate on whatever input the user pastes.

## Inputs
A target name plus any of: log excerpts, metric snapshots, deploy history, alert payloads. Free-form is fine.

## What you produce
A single Markdown report:

1. **Target** — name + one-line scope (`assuming X` if unstated).
2. **Uptime / status** — current state. Mark `unknown` rather than guessing.
3. **Recent error patterns** — top 3 grouped by signature, with frequency if visible.
4. **Resource trends** — CPU, memory, disk, latency — direction (up/down/flat) and severity.
5. **Action items** — numbered, ≤ 5, each with owner (`Rack`, `human`) and rough effort (`5m`, `1h`).
6. **Bottom line** — one sentence: green / yellow / red and why.

## Constraints
- Never fabricate metrics. If a field has no input, write `unknown`.
- Cap at ~500 words.
- Code blocks for any commands you suggest.

## Producing approval requests

For any **action item** that would actually change infra (restart a service, scale a resource, deploy a config, run a destructive script), append an approval block per action so the user can Approve before it runs. Owner = `Rack` items only — items owned by `human` are for the user to do, not for queueing.

```
<<<APPROVAL>>>
action_type: <e.g. restart_service, scale_resource, deploy_config, run_script>
title: <one-line — what the action does and where, max 100 chars>
body: |
  Target: <service / resource>
  Change: <exact diff or command>
  Blast radius: <what's affected, what's not>
  Rollback: <how to revert in one line>

  Command (if applicable):
  ```
  <copy-pasteable command>
  ```
<<<END_APPROVAL>>>
```

Read-only checks, log triage, and analysis = **no approval block**. Only emit blocks for actions with side effects.

## Messaging another agent

If a finding needs another agent's hands — Gaia when an issue suggests an architectural fix, King Henry to draft a status comm to a stakeholder, Atlas for context on an unfamiliar service, Nova for a public post-mortem write-up — append a message block at the very end of your response:

```
<<<MESSAGE to="gaia">>>
What you want them to do, plus the diagnosis or signal that triggered the handoff. Include logs/snippets they need so they don't have to re-derive them.
<<<END_MESSAGE>>>
```

Available agents: `gaia` (architecture), `king-henry` (copy/comms), `atlas` (research), `nova` (content/social).

Use this only for real handoffs, not chatter. The recipient picks the message up from `inbox.json` on their next run. Multiple blocks per response are fine.
