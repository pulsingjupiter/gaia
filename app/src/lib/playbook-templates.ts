/**
 * PLAYBOOK_TEMPLATES — 15 preset playbooks for the "+ Add Playbook" picker.
 *
 * Each template is a structured SKILL.md draft: the same shape POST
 * /api/employees/[id]/skills accepts via the `{ name, slug, when_to_use,
 * inputs, output, defaults }` body. The modal pre-fills the form with the
 * fields below; the server composes the final SKILL.md via `composeSkillMd`.
 *
 * Categories mirror common usage clusters so the picker can group by section.
 * `recommended_owner_template_ids` references ids in `lib/agent-templates.ts`
 * — when an existing agent's id matches one of these, the owner picker
 * surfaces it under a "Recommended" heading.
 */

export type PlaybookCategory =
  | "Productivity"
  | "Engineering"
  | "Research"
  | "Content"
  | "Sales"
  | "Customer"
  | "Data"
  | "Ops";

export type PlaybookTemplate = {
  id: string;
  name: string;
  short_pitch: string;
  category: PlaybookCategory;
  recommended_owner_template_ids: string[];
  skill: {
    slug: string;
    when_to_use: string;
    inputs: string;
    output: string;
    defaults: string;
  };
};

export const PLAYBOOK_TEMPLATES: PlaybookTemplate[] = [
  {
    id: "inbox-triage",
    name: "Inbox Triage",
    short_pitch: "Clear a stack of unread mail with action labels and rationale.",
    category: "Productivity",
    recommended_owner_template_ids: ["chief-of-staff"],
    skill: {
      slug: "inbox-triage",
      when_to_use:
        "Run this when the user wants to clear a stack of unread emails or hand off a triage pass. Input is access to an inbox snapshot or a paste of subject lines + senders. Output is a triaged list with action labels and 1-line rationale per message.",
      inputs: `Free-form is fine. At minimum, infer:
- **Source** — paste, inbox URL, mailbox export.
- **Time window** — default to the last 24h if not specified.
- **Priorities** — if the user named senders or topics that always escalate, surface those first.

If any of these is unclear, pick the most reasonable interpretation and proceed — note the assumption in one line at the top (\`Assumed: ...\`).`,
      output: `A single Markdown table:

| From | Subject | Action | Rationale |
|---|---|---|---|

Action is one of: **Reply now**, **Reply later**, **Delegate**, **Archive**, **Flag for me**.

Below the table, surface anything that needs the user's attention immediately in a \`## Flagged\` section.`,
      defaults: `- Treat marketing newsletters as Archive unless the user has opted in.
- Treat anything from leadership, customers, or anyone with "urgent" in the subject as Flag for me.
- Don't draft replies in this skill — that's \`draft-email\`'s job. Link by reference.
- If the inbox is > 50 messages, do a coarse pass first (Archive obvious cruft), then a detailed pass on the remainder.`,
    },
  },
  {
    id: "draft-email",
    name: "Draft Email",
    short_pitch: "One ask, one paragraph, no calendar links by default.",
    category: "Productivity",
    recommended_owner_template_ids: ["chief-of-staff", "sales-bd"],
    skill: {
      slug: "draft-email",
      when_to_use:
        "Run this when the user wants an email drafted — outbound, reply, or internal note. Output is always: a subject line + body + a one-line note explaining the ask and the tone you chose.",
      inputs: `Pull from the user's prompt:
- **Recipient** — name + relationship (cold prospect, customer, colleague, internal exec).
- **Goal** — the one outcome this email needs to drive.
- **Context** — prior thread, mutual connection, anything that earns the reader's attention.
- **Tone** — defaults to direct + warm; switch to formal if the recipient is exec-level or unknown.

If goal or recipient is missing, ask once. If only tone is missing, pick direct + warm and note it.`,
      output: `\`\`\`
Subject: <≤ 7 words, lowercase, no "Quick question">

<body — one or two short paragraphs, one clear ask>

— <signature placeholder>
\`\`\`

Below the draft, add a single line: \`Ask: <the one thing you want them to do>\` so the user can sanity-check before sending.`,
      defaults: `- ≤ 120 words for cold outbound; ≤ 200 for warm replies; longer only if the original was long.
- One ask per email. If there are two, write two emails.
- No P.S. unless it earns its place. No calendar links in first-touch.
- Don't fake personalisation. If you have no real signal, say so and propose a different angle.`,
    },
  },
  {
    id: "standup-summary",
    name: "Standup Summary",
    short_pitch: "Raw standup notes in, shipped/in-flight/blocked/risks out.",
    category: "Productivity",
    recommended_owner_template_ids: ["project-manager"],
    skill: {
      slug: "standup-summary",
      when_to_use:
        "Run this when the user dumps raw standup notes — Slack thread, async updates, meeting transcript — and wants a clean digest. Output is always: shipped, in-flight, blocked, risks, notable changes.",
      inputs: `- The raw notes — pasted text, transcript, or bullet points.
- Optional: the sprint/week label and the names of the team so you can attribute lines correctly.

If owners aren't obvious, attribute by the speaker tag in the source. If a line has no owner, surface it under \`## Unattributed\` rather than guess.`,
      output: `\`\`\`
## Shipped (since last)
- <name>: <what shipped> (<one-line outcome>)

## In flight (this week)
- <name>: <what>, target: <date>

## Blocked
- <name>: <what's blocked>, blocker: <who/what>, unblock by: <date>

## Risks
- 🟡 / 🔴  <risk> — <impact> — <mitigation owner>

## Notable changes
- <scope changes, new asks, surprises>
\`\`\``,
      defaults: `- Every line has an owner. No "we" or "someone".
- Blocked items without an unblock-by date get one assigned — propose 48h if unsure.
- Risks get a colour. Green isn't listed (no news = good news).
- Keep the whole digest under 25 lines. Trim relentlessly.
- Don't backfill an update from a missing teammate — call them out under \`## No update\`.`,
    },
  },
  {
    id: "weekly-status-report",
    name: "Weekly Status Report",
    short_pitch: "Shipped vs. slipped, one page, no manufactured urgency.",
    category: "Productivity",
    recommended_owner_template_ids: ["project-manager", "chief-of-staff"],
    skill: {
      slug: "weekly-status-report",
      when_to_use:
        "Run this when the user wants a 1-page weekly digest for stakeholders — investors, leadership, or the broader team. Output covers what shipped, what slipped, what's next, and what's at risk.",
      inputs: `- The week's raw material — standups, PR list, doc updates, customer wins/losses.
- Optional: the prior week's report so you can flag deltas (carry-overs, repeat slips).
- Optional: the audience (investor / leadership / team) — this changes the level of detail, not the structure.

If the audience isn't specified, write for leadership: focused on outcomes, not activity.`,
      output: `\`\`\`
# Week of <YYYY-MM-DD>

## Headline
<one sentence — the single most important thing about this week>

## Shipped
- <what shipped> — <impact in one line>

## Slipped
- <what slipped> — <new ETA + reason>

## Next week
- <top 3 priorities, with owners>

## Risks
- 🟡 / 🔴  <risk> — <mitigation>

## Metrics (if tracked)
| Metric | This week | Last week | Δ |
|---|---|---|---|
\`\`\``,
      defaults: `- Cap the whole report at one printed page (~400 words).
- Lead with the headline — readers should know the week from the first sentence.
- "Slipped" is honest, not a euphemism. If something didn't ship, say so with the new ETA.
- Don't manufacture risks to look thorough. An empty Risks section is fine.
- If a carry-over slips two weeks in a row, flag it 🔴 regardless of size.`,
    },
  },
  {
    id: "meeting-prep",
    name: "Meeting Prep",
    short_pitch: "Agenda, attendee notes, and the one decision the meeting must produce.",
    category: "Productivity",
    recommended_owner_template_ids: ["chief-of-staff"],
    skill: {
      slug: "meeting-prep",
      when_to_use:
        "Run this when the user has an upcoming meeting and wants a brief before walking in. Output is a 1-page prep doc covering goal, agenda, attendees, and the decision the meeting must produce.",
      inputs: `- Meeting title, time, and attendees.
- The calendar invite body or prior thread, if available.
- Optional: prior meeting notes with the same attendees so you can carry context forward.

If the goal isn't stated explicitly, infer it from the invite title + thread and put your inference at the top as \`Goal (inferred): ...\`.`,
      output: `\`\`\`
# <Meeting title> — <date, time>

## Goal
<one sentence — the decision or outcome this meeting must produce>

## Attendees
- <name, role> — <one line: what they care about, what they'll push for>

## Agenda (target: <duration>)
1. <topic> — <minutes>
2. <topic> — <minutes>

## Open questions
- <questions the user should be ready to answer>

## Recommended position
<the user's pre-committed stance going in, with reasoning in 1–2 lines>
\`\`\``,
      defaults: `- One decision per meeting. If there are two, propose splitting into two meetings.
- Keep attendee notes to one line each — this is prep, not a dossier.
- The "Recommended position" is opinionated. Don't punt with "depends on discussion."
- If the meeting has no clear goal, flag it and propose three options for what it could decide.`,
    },
  },
  {
    id: "one-on-one-prep",
    name: "1:1 Prep",
    short_pitch: "Talking points, carry-overs, and one question worth asking.",
    category: "Productivity",
    recommended_owner_template_ids: ["chief-of-staff"],
    skill: {
      slug: "one-on-one-prep",
      when_to_use:
        "Run this when the user has a 1:1 coming up — with a report, peer, or manager — and wants a structured agenda. Output prioritises listening over broadcasting.",
      inputs: `- The other person's name + relationship (report, peer, manager).
- Notes from the prior 1:1 if available — carry-overs are the single most important input.
- Recent context: what they've shipped, what's been hard, anything they brought up in chat.

If you have no prior context, ask the user for one sentence on what's been on the other person's plate.`,
      output: `\`\`\`
# 1:1 with <name> — <date>

## Their stuff first (60% of the meeting)
- <prompt to open with — usually "what's on your mind?">

## Carry-overs
- <item from last 1:1 + status>

## My agenda (only if there's time)
- <topic> — <why it matters now>

## One good question
<the single question worth asking if there's a lull — about their career, the team, or the work>

## Notes for after
- <what you want to remember to write down post-meeting>
\`\`\``,
      defaults: `- Their agenda comes first. The user's items are a backup, not the main course.
- Carry-overs are sacred — if you skipped on something last time, lead with the update.
- Don't propose status-update topics for a 1:1. Status belongs in standup or Slack.
- The "one good question" is genuinely good — not generic ("how are you?"). Pull from career, scope, recent friction.`,
    },
  },
  {
    id: "code-review",
    name: "Code Review",
    short_pitch: "Real issues, no bikeshedding, file:line citations.",
    category: "Engineering",
    recommended_owner_template_ids: ["engineer"],
    skill: {
      slug: "code-review",
      when_to_use:
        "Run this when the user shares a diff, PR, file, or branch and wants a review. Goal is to surface real issues — bugs, complexity smells, missing tests — without bikeshedding style or naming.",
      inputs: `- The diff, file, or PR URL.
- Optional: the change's intent (often inferrable from the diff itself).
- Optional: the user's confidence level — "smoke test for bugs" vs. "deep review before merge".

If intent isn't clear and the diff is non-trivial, ask once. Otherwise infer and note the inferred intent at the top of the review.`,
      output: `\`\`\`
## TL;DR
<1–2 lines: ship it / needs changes / blocked>

## Blocking issues
- [path/file.ts:LN] <issue>: <why it's blocking + suggested fix>

## Nits (non-blocking)
- [path/file.ts:LN] <suggestion>

## Test gaps
- <what's not covered + the test you'd write>

## Notes
<design observations, follow-ups, anything that doesn't fit above>
\`\`\``,
      defaults: `- Distinguish blocking from nits. If everything's a nit, lead with "Ship it."
- Reference exact file:line for every comment.
- Skip style nits the linter would catch — assume the user runs one.
- If the diff lacks tests for non-trivial logic, that's blocking.
- Don't rewrite the diff. Suggest the fix; let the author implement it.`,
    },
  },
  {
    id: "bug-triage",
    name: "Bug Triage",
    short_pitch: "Severity, owner, repro — turn a bug report into a ticket.",
    category: "Engineering",
    recommended_owner_template_ids: ["engineer"],
    skill: {
      slug: "bug-triage",
      when_to_use:
        "Run this when the user dumps a bug report (customer ticket, Slack message, error log) and wants it converted into a triaged ticket. Output classifies severity, proposes an owner, and surfaces what's missing for a repro.",
      inputs: `- The bug report — raw text, screenshot, stack trace, or thread.
- Optional: the product surface and the team layout so you can route to the right owner.

If the repro steps are missing, that's a finding — flag it and draft the question to send back to the reporter.`,
      output: `\`\`\`
## Summary
<one line: what's broken, who's affected>

## Severity
**P0** (data loss / outage) · **P1** (broken core flow) · **P2** (degraded UX) · **P3** (cosmetic)
Pick one and justify in a sentence.

## Repro
1. <step>
2. <step>

## Missing info
- <what the reporter didn't include + the question to ask>

## Suggested owner
<team or person + why>

## Adjacent risk
<other surfaces likely affected by the same root cause, if any>
\`\`\``,
      defaults: `- Severity is opinionated. "P1/P2" is not a valid answer — pick one.
- Repro steps come from the source. If the source is vague, the steps section is "Not yet reproducible" and the missing-info block carries the question.
- Suggested owner is a team or person, never "TBD".
- If the same bug has been triaged before, surface it as "Possible duplicate of <id>".`,
    },
  },
  {
    id: "research-deep-dive",
    name: "Research Deep-Dive",
    short_pitch: "Sourced brief: summary, detail, confidence ratings, open gaps.",
    category: "Research",
    recommended_owner_template_ids: ["researcher"],
    skill: {
      slug: "research-deep-dive",
      when_to_use:
        "Run this when the user wants a sourced briefing on a topic, person, company, technology, or claim. Output is always two layers: a 1-page summary and a longer detail section.",
      inputs: `- The question or topic — free-form prose is fine.
- Optional: depth ("quick scan" vs. "go deep"), audience, and any sources to prefer.

If the question is vague, restate it explicitly at the top of the brief — the user can correct your framing in one line.`,
      output: `\`\`\`
## Question
<the question as you understood it, plus any reframing>

## Summary (1 page)
- 3–5 bullets of headline findings, each with a confidence rating.

## Detail
### Finding 1: <headline>
<paragraph + inline citations>

### Finding 2: <headline>
…

## Open questions
- <gaps you couldn't close + why>
\`\`\``,
      defaults: `- Cite inline. No bibliography at the bottom unless explicitly requested.
- Use \`[High]\` / \`[Med]\` / \`[Low]\` confidence tags on every claim that isn't directly quoted.
- If the topic is older than a year, note recency explicitly.
- If a claim contradicts itself across sources, surface both and pick a side with reasoning.
- If you can't close a gap in 3 searches, stop and report it — don't confabulate.`,
    },
  },
  {
    id: "competitive-analysis",
    name: "Competitive Analysis",
    short_pitch: "Feature matrix + positioning gaps for a named set of competitors.",
    category: "Research",
    recommended_owner_template_ids: ["researcher", "sales-bd"],
    skill: {
      slug: "competitive-analysis",
      when_to_use:
        "Run this when the user names a set of competitors (or a market) and wants a side-by-side. Output is a feature matrix + positioning notes + a section on where the user's product can wedge in.",
      inputs: `- The user's product, in one line.
- The competitor list — by name, URL, or category ("everyone in the X space").
- Optional: the dimensions to compare (pricing, target customer, feature set, GTM, brand voice).

If the dimensions aren't specified, pick 5 that matter most for this market and note the choice at the top.`,
      output: `\`\`\`
## Matrix
| Competitor | Positioning | Pricing | Target customer | <dim 4> | <dim 5> |
|---|---|---|---|---|---|

## Where they win
- <competitor>: <the thing they're genuinely better at>

## Where they're weak
- <competitor>: <the gap you can credibly attack>

## Recommended wedge
<one paragraph: where the user's product should plant its flag, and why>

## Open questions
- <things you couldn't verify — pricing tiers, customer logos, etc.>
\`\`\``,
      defaults: `- Cite every non-obvious claim with a link. "Their pricing starts at $X" needs a source.
- Don't soften competitor strengths to flatter the user. If a competitor is better, say so.
- The wedge is one paragraph, opinionated. "Could go many ways" is not a wedge.
- If a competitor has pivoted recently, flag it — old positioning is misleading.`,
    },
  },
  {
    id: "metric-summary",
    name: "Metric Summary",
    short_pitch: "Headline, delta, method, caveats — with the SQL.",
    category: "Data",
    recommended_owner_template_ids: ["data-analyst"],
    skill: {
      slug: "metric-summary",
      when_to_use:
        "Run this when the user asks for a status read on a metric (or set of metrics) — weekly review, board update, \"how are we doing on X\". Output is always: headline, delta, method, caveats.",
      inputs: `- The metric(s) — name and time window.
- Optional: dataset / table, comparison period, any filters.

If the metric has multiple definitions in the org (e.g. "active users"), pick one and name it explicitly. Don't compute against an ambiguous definition.`,
      output: `\`\`\`
## Headline
<the one-line takeaway: "X is up Y% week-over-week" / "flat" / "down">

## Numbers
| Metric | This period | Prior period | Δ | Δ% |
|---|---|---|---|---|
| <metric> | <val> | <val> | <abs> | <pct> |

## Method
- Window: <YYYY-MM-DD → YYYY-MM-DD>
- Dataset: <table / source>
- Filters: <any>
- Dedupe rule: <if relevant>

## Caveats
- <data freshness, known issues, sampling, etc.>

\`\`\`sql
-- the query you ran
\`\`\`
\`\`\``,
      defaults: `- Always include the SQL.
- If multiple definitions of the metric exist in the org, name which one you used.
- Round to 3 significant figures unless precision matters.
- Flag any movement > 20% with a one-line "likely cause" guess.
- Time window goes in the same line as the number. "MRR = $X as of YYYY-MM-DD".`,
    },
  },
  {
    id: "customer-reply",
    name: "Customer Reply",
    short_pitch: "Warm, accurate, classification + draft + approval block.",
    category: "Customer",
    recommended_owner_template_ids: ["customer-success"],
    skill: {
      slug: "customer-reply",
      when_to_use:
        "Run this when the user wants a customer-facing reply drafted — support ticket, email, chat. Output is always: a one-line classification + a polished draft + an approval block the user can send as-is.",
      inputs: `- The customer message. Full text or paraphrase is fine.
- Optional: customer name, plan, account context, prior thread.

If the message is ambiguous (could be a bug or a question), pick the more likely classification and note the alternative at the bottom.`,
      output: `\`\`\`
## Classification
Type: <bug / question / billing / feature-request / churn-signal / other>
Urgency: <P0 / P1 / P2>
Confidence: <High / Med / Low>

## Draft
<the reply in full, in your voice>

<<<APPROVAL>>>
action_type: send_reply
title: Reply to <customer> — <one-line topic>
body: |
  <the reply body, indented 2 spaces>
<<<END_APPROVAL>>>
\`\`\``,
      defaults: `- Acknowledge the issue in sentence 1. Don't bury it.
- End with a clear next step for the customer or yourself.
- For bugs: request a repro if missing; never promise a fix timeline you can't keep.
- For churn signals: flag in the classification block and route up.
- Sign off with first name only. No "hope you're having a great day!" filler.`,
    },
  },
  {
    id: "edit-pass",
    name: "Edit Pass",
    short_pitch: "Full line edit. Revised draft + major changes + cut list.",
    category: "Content",
    recommended_owner_template_ids: ["editor"],
    skill: {
      slug: "edit-pass",
      when_to_use:
        "Run this when the user gives you a draft — email, landing page, post, doc — and wants it tightened. Default depth: a full line edit, not just proofreading.",
      inputs: `- The draft. Free-form.
- Optional: the audience, the goal of the piece, any voice notes ("keep it casual", "match this past post").

If the goal of the piece isn't clear, ask once. An edit that doesn't know what the piece is for ends up just changing words.`,
      output: `\`\`\`
## Revised draft
<the rewritten copy in full, in the same format as the original>

## Major changes
- <2–5 bullets explaining structural or voice-level changes>

## Cut list
- "<exact phrase removed>" — why
- "<exact phrase removed>" — why
\`\`\``,
      defaults: `- Preserve the writer's voice; sharpen, don't replace.
- Cut adverbs and hedges aggressively ("just", "really", "very").
- Headlines: propose 2 alternatives at the top if the original is weak; otherwise leave alone.
- Don't reorganise without flagging it — structural moves need consent.
- No corporate hedge words ("leverage", "synergize", "best-in-class"). Strike them on sight.`,
    },
  },
  {
    id: "script-hook",
    name: "Script Hook",
    short_pitch: "5 hook options + a beat-by-beat short-form script with B-roll.",
    category: "Content",
    recommended_owner_template_ids: ["scriptwriter"],
    skill: {
      slug: "script-hook",
      when_to_use:
        "Run this when the user wants a short-form video script (TikTok / Reels / Shorts / Twitter video). Output is always: 5 hook options + a full script with beats + B-roll + a CTA.",
      inputs: `- The topic or angle.
- Optional: length target, platform, audience, prior scripts to match voice.

If the platform isn't specified, default to TikTok-length (~45s) and write hooks that work without sound.`,
      output: `\`\`\`
## Hook options
1. <hook> (<why it works in 4 words>)
2. …
5. …
**Pick:** <#>

## Script (<target length>)
[0:00] HOOK: <line>  [B-roll: <visual>]
[0:03] BEAT: <line>  [B-roll: <visual>]
[0:08] TENSION: <line>  [B-roll: <visual>]
[0:20] PAYOFF: <line>  [B-roll: <visual>]
[0:25] CTA: <line>  [B-roll: <visual>]

## Notes
- Tone: <one line>
- Pacing: <cuts per 10s, target>
- Anything that needs filming new: <list>
\`\`\``,
      defaults: `- Hooks are ≤ 8 words. No questions ("Did you know…") unless paired with a visual surprise.
- One idea per script. If a second idea sneaks in, cut it.
- CTAs are concrete ("link in bio for the template", not "let me know what you think").
- Match the user's prior scripts' voice when given examples — don't impose a generic creator voice.
- No "smash that subscribe button". Ever.`,
    },
  },
  {
    id: "prospect-research",
    name: "Prospect Research",
    short_pitch: "1-page dossier + a first-touch draft with a real wedge.",
    category: "Sales",
    recommended_owner_template_ids: ["sales-bd"],
    skill: {
      slug: "prospect-research",
      when_to_use:
        "Run this when the user names a prospect (person or company) and wants a brief before reaching out. Output is a 1-page dossier + a draft first-touch email.",
      inputs: `- Prospect name (person + company, or just one).
- Optional: the wedge — what you're selling, what you think they need.

If you can't find a real recent signal (funding, hire, launch, post) in three searches, stop researching and report the gap instead of padding the dossier.`,
      output: `\`\`\`
## Prospect
- Person: <name, title, tenure, prior roles>
- Company: <what they do in one line, size, stage>
- Recent signals: <funding, hires, launches, posts — anything that gives a hook>

## Wedge
<the one reason this prospect should care, in 1 sentence>

## Draft first-touch
Subject: <lowercase, ≤ 6 words>

<email body, ≤ 80 words, one ask>

— <signature>

<<<APPROVAL>>>
action_type: send_email
title: Outbound to <person> at <company>
body: |
  To: <email>
  Subject: <subject>

  <body, indented 2 spaces>

  — <name>
<<<END_APPROVAL>>>
\`\`\``,
      defaults: `- If you can't find a real signal in the research, say so and propose a different wedge — don't fake it.
- Outbound asks for a 15-minute call by default; switch to "interested in a demo?" only when the prospect is qualified.
- No calendar links in first-touch.
- Subject lines lowercase, ≤ 6 words, never "Quick question".
- One ask per email. If there are two, draft two emails.`,
    },
  },
];

const PLAYBOOK_INDEX: Map<string, PlaybookTemplate> = new Map(
  PLAYBOOK_TEMPLATES.map((t) => [t.id, t]),
);

export function getPlaybookTemplateById(
  id: string,
): PlaybookTemplate | undefined {
  return PLAYBOOK_INDEX.get(id);
}
