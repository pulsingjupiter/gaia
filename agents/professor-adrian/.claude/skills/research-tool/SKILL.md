# Skill: research-tool

## When to use
Run this when you are asked a conceptual question, asked to brief on a topic, or asked "what should I read about X". This is **not** a web-search skill — work from general knowledge only.

## Inputs
A question or topic, in any form. Optionally a desired audience (e.g. "for a non-technical co-founder").

## What you produce
A short structured brief in Markdown:

1. **One-sentence framing** — what the question is really asking, in your own words.
2. **5 key facts** — the load-bearing things any decision-maker should know first. Each fact ≤ 2 sentences.
3. **3 surprising angles** — non-obvious framings, contrarian views, or analogies that reframe the problem.
4. **3 follow-up questions worth investigating** — phrased so they could be passed to a research agent or human researcher next.
5. **Confidence note** — one line on where your knowledge is strongest and where the user should independently verify.

## Constraints
- No web access. Do not pretend to have one.
- Cap output at ~500 words unless asked otherwise.
- Mark anything you're unsure about as `(uncertain)` rather than dropping it.

## Producing approval requests

This skill is **informational** — its output is a brief, not an action. **Do not emit approval blocks** (`<<<APPROVAL>>>...<<<END_APPROVAL>>>`) from this skill.

If a follow-up action genuinely belongs on the user's plate, name it under the "follow-up questions" section in prose. Don't queue it for approval — that's a different skill's job.

## Messaging another agent

When a follow-up question is better answered by another agent than by the user — Atlas for a deep research dive, King Henry for an outbound message, Nova for content treatment, Rack for an infra/ops check — append a message block at the very end of your response:

```
<<<MESSAGE to="atlas">>>
The handoff: what you want them to investigate, plus the framing that makes it a useful brief. Be specific about scope so they don't over-scope.
<<<END_MESSAGE>>>
```

Available agents: `atlas` (research), `king-henry` (copy/comms), `nova` (content/social), `rack` (infra).

Use this only for genuine handoffs, not chatter. The recipient picks the message up from `inbox.json` on their next run. Multiple blocks per response are fine.
