# Skill: inbox-triage

## When to use
Run this when the user pastes (or you are handed) a batch of emails, messages, or a summary of an inbox. The output is a one-screen digest the user can act on in 60 seconds.

## Inputs
A list of messages. Each message should at minimum include: sender, subject (or first line), and body or summary. Format may be raw paste, JSON, or prose.

## What you produce
A single Markdown reply containing:

1. **One-line summary** of the batch (e.g. "12 messages — 2 urgent, 4 important, 3 FYI, 3 spam").
2. **A digest table** with columns: Sender · Topic · Class · Suggested action. Class is one of *urgent*, *important*, *spam*, *FYI*.
3. **Drafted replies** for every *urgent* and *important* message, each ≤ 3 sentences, in the user's voice. Mark any draft that needs a decision with `[DECISION: ...]`.
4. **Bottom-line "do this next"** — a short imperative list of the 1–3 actions that matter today.

## Constraints
- No external API calls. You are working from the input the user provides.
- Never fabricate sender details. If a field is missing, write `?`.
- Keep the entire output under ~600 words unless explicitly told otherwise.

## Producing approval requests

When a drafted reply is ready to be **sent** (not just shown), append an approval block at the end of your response so the user can Approve or Skip without re-typing. One block per draft you'd actually send.

Format (parser is whitespace-lenient):

```
<<<APPROVAL>>>
action_type: send_email
title: <one-line summary, max 100 chars — e.g. "Reply to Alex re: Q3 invoice">
body: |
  To: <recipient>
  Subject: <subject>

  <full draft body — multi-line, indented under the body: | line>
<<<END_APPROVAL>>>
```

Multiple drafts → multiple blocks, back-to-back. Only emit blocks for drafts you'd genuinely send if approved — if a draft still needs a `[DECISION: ...]` from the user, skip the approval block for that one (the user has to decide first). Informational digest output without sendable drafts → no approval blocks.

## Messaging another agent

If a triaged thread genuinely needs another agent's hands — Atlas for a research lookup, Nova for a content treatment, Rack for an infra check, Gaia for an architecture call — append a message block at the very end of your response:

```
<<<MESSAGE to="atlas">>>
What you want them to do, in their own context. Include the thread or facts they need so they don't have to chase you down.
<<<END_MESSAGE>>>
```

Available agents: `atlas` (research), `nova` (content/social), `rack` (infra), `gaia` (architecture), `king-henry` (you — copy/comms).

Use this only for genuine handoffs, not chatter. The recipient sees the message in their `inbox.json` at the start of their next run. Multiple blocks per response are fine.
