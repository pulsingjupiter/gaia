# Skill: draft-email

## When to use
Run this when the user wants you to draft a single outbound email and queue it for their approval before sending. Input is a recipient + a subject (or topic) + an intent. Output is a polished draft AND an approval block — every time.

## Inputs
Free-form prose is fine. At minimum, infer:
- **Recipient** — name and/or email address.
- **Subject or topic** — what the email is about.
- **Intent** — what the user wants the email to accomplish (confirm a meeting, decline politely, ask for a status update, etc.).

If any of these is unclear, pick the most reasonable interpretation and proceed — note the assumption in one line at the top of your reply (`Assumed: ...`). Do not stall asking clarifying questions; the approval step gives the user a chance to skip if you guessed wrong.

## What you produce

A two-part Markdown response:

1. **Draft preview** — a section titled `## Draft` containing:
   - `**To:** <recipient>`
   - `**Subject:** <subject>`
   - blank line
   - the email body (≤ 6 short sentences in the user's voice — direct, friendly, no corporate fluff)

2. **Approval block** at the very end of the response (mandatory — this skill always emits exactly one):

```
<<<APPROVAL>>>
action_type: send_email
title: Send email to <recipient> — <one-line topic>
body: |
  To: <recipient>
  Subject: <subject>

  <full email body, multi-line>
<<<END_APPROVAL>>>
```

The `body:` content under `body: |` MUST be indented (2 spaces) so the parser captures it as a multi-line block. Match the draft preview exactly — don't re-write it for the approval block.

## Constraints
- Always emit exactly one approval block. This is the skill's contract.
- Never invent contact info beyond what the user gave (if no email address is provided, use the name as-is — `mom@example.com` or just `Mom`).
- No subject line gimmicks (no `[URGENT]`, no clickbait). Plain English.
- Body ≤ 120 words unless the user explicitly asks for longer.
- Sign off the way the user does: first name only, no formal closer, no auto-signature block.

## Example output shape

```
## Draft

**To:** mom@example.com
**Subject:** Lunch tomorrow

Hey Mom — just confirming 12pm at the usual spot tomorrow. Let me know if anything changes.

— [your name]

<<<APPROVAL>>>
action_type: send_email
title: Send email to mom@example.com — confirm lunch tomorrow
body: |
  To: mom@example.com
  Subject: Lunch tomorrow

  Hey Mom — just confirming 12pm at the usual spot tomorrow. Let me know if anything changes.

  — [your name]
<<<END_APPROVAL>>>
```

## Messaging another agent

If drafting the email surfaces a real handoff — Atlas for a fact you need to anchor the body, Gaia for a tricky strategic framing, Rack for an infra status the email reports on, Nova for a parallel social post — append a message block at the very end of your response (after the approval block):

```
<<<MESSAGE to="atlas">>>
Quick handoff: what you want them to do and the email context that triggered it.
<<<END_MESSAGE>>>
```

Available agents: `atlas` (research), `nova` (content/social), `gaia` (architecture), `rack` (infra).

Use this only for genuine handoffs, not chatter. The recipient picks the message up from `inbox.json` on their next run. Multiple blocks per response are fine.
