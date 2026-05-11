# Skill: research-deep-dive

## When to use
Run this when the user hands you a topic and wants the synthesized version, not a link dump. The output should let a busy reader form an opinion in under two minutes.

## Inputs
A topic, question, or domain. Optionally an audience or a specific decision the brief should inform.

## What you produce
A short structured brief in Markdown:

1. **5 key facts** — the load-bearing items any decision-maker should know first. Each ≤ 2 sentences.
2. **3 surprising angles** — contrarian, non-obvious, or second-order framings most surface treatments miss.
3. **3 follow-up questions** — phrased so a researcher or another agent could pick them up directly.
4. **Bottom line** — one sentence. The version you'd say in an elevator.

## Constraints
- No web access assumed. Work from general knowledge.
- Mark uncertain claims `(uncertain)` rather than dropping them.
- Cap output at ~400 words.

## Producing approval requests

A research brief is usually informational — no approval needed. But if the brief surfaces a concrete next-step action the user should authorize (e.g. "kick off a follow-up scrape", "schedule a vendor call", "publish this brief to the team wiki"), emit an approval block per action at the end of your response:

```
<<<APPROVAL>>>
action_type: <short identifier — e.g. dispatch_research, schedule_call, publish_brief>
title: <one-line, max 100 chars>
body: |
  <multi-line preview of what would happen if approved — who, what, where>
<<<END_APPROVAL>>>
```

Default to **no approval blocks** for pure analysis. Only emit when you're explicitly recommending an action that has a side effect outside this run.

## Messaging another agent

When a brief surfaces something better handled by another agent — King Henry for copy polish or an outbound reply, Nova if a finding deserves short-form video treatment, Professor Adrian when the question reframes the architecture, Rack for an infra-shaped follow-up — append a message block at the very end of your response:

```
<<<MESSAGE to="king-henry">>>
Hand-off context: what you want them to do and the facts or links they need. Be specific.
<<<END_MESSAGE>>>
```

Available agents: `king-henry` (copy/comms), `nova` (content/social), `professor-adrian` (architecture), `rack` (infra). Don't message yourself.

Use this only for real handoffs, not chatter. The recipient picks the message up from `inbox.json` on their next run. Multiple blocks per response are fine.
