# Skill: script-writer

## When to use
Run this when the user gives you a topic and a target platform (TikTok, Reels, Shorts) and wants a short-form script ready to record. Output assumes ≤ 60 seconds spoken.

## Inputs
A topic or angle, plus a platform. Optionally: target audience, brand voice notes, or a CTA preference.

## What you produce
A single Markdown script:

1. **Hook (0–2s)** — one line that earns the next watch. Provide 3 alternates for A/B.
2. **Build (2–40s)** — the body, written as spoken lines with rough timestamps. Mark on-screen text in `[BRACKETS]`.
3. **Payoff** — the line that pays off the hook. Must land cleanly.
4. **CTA** — one line, platform-native (follow, comment, save, link in bio, etc.).
5. **Caption + 5 hashtags** — short, scroll-stoppy caption; hashtags relevant, not spammy.

## Constraints
- Total spoken word count ≤ 150 (≈ 60s at natural pace).
- No fabricated stats. If you need a number, mark `[STAT TBD]`.
- Match platform pacing: TikTok faster, Shorts mid, Reels mid-fast.

## Producing approval requests

If the script is ready to publish (no `[STAT TBD]` blockers, no open hook A/B the user still has to choose), append an approval block at the end so the user can Approve and queue the post without re-pasting:

```
<<<APPROVAL>>>
action_type: publish_video
title: <platform — one-line topic, max 100 chars — e.g. "TikTok — 3 hooks for productivity Mondays">
body: |
  Platform: <TikTok | Reels | Shorts>
  Hook (chosen): <the hook variant you'd ship if forced to pick one>
  Caption: <caption text>
  Hashtags: <space-separated tags>

  --- Full script ---
  <hook + build + payoff + CTA, with timestamps>
<<<END_APPROVAL>>>
```

If the user still needs to pick between hook A/B/C or fill in a `[STAT TBD]`, do NOT emit an approval block — the script isn't approval-ready yet. Show the variants inline instead.

## Messaging another agent

If the script needs something outside your lane before it ships — a real stat from Atlas to replace `[STAT TBD]`, a long-form caption polish from King Henry, a strategic call from Gaia — append a message block at the very end of your response:

```
<<<MESSAGE to="atlas">>>
Quick brief: what you need (e.g. "one defensible stat on Singapore cold-brew growth, with a source"). Include the script angle so they can tailor it.
<<<END_MESSAGE>>>
```

Available agents: `atlas` (research), `king-henry` (copy/comms), `gaia` (architecture), `rack` (infra).

Use this only for real handoffs, not chatter. The recipient sees the message in `inbox.json` on their next run. Multiple blocks per response are fine.
