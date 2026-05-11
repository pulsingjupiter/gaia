/**
 * Doc content lives here as TypeScript constants — no MDX, no filesystem
 * reads, no markdown library. The renderer in `components/docs/markdown.tsx`
 * supports the small subset of markdown the bodies actually use: headings
 * (## / ###), paragraphs, ordered + unordered lists, fenced code blocks,
 * inline `code`, **bold**, and links.
 *
 * Each `body` is plain markdown. Reading time is computed from the word
 * count at ~250 wpm.
 */

export interface Doc {
  slug: string;
  title: string;
  description: string;
  /** lucide icon name, looked up in `components/docs/icon.tsx`. */
  icon: string;
  body: string;
}

export const DOCS: Doc[] = [
  {
    slug: "getting-started",
    title: "Getting Started",
    description: "What Gaia is, the agents you start with, and where to click first.",
    icon: "Rocket",
    body: `# Welcome to Gaia

Gaia is an AI workforce dashboard. It is **not** a Claude Code replacement — it sits alongside Claude Code and gives you one place to launch agents, watch what they're doing, schedule recurring work, and approve anything that needs a human in the loop.

## The mental model

Three concepts to internalize:

- **Personas** live in each agent's \`CLAUDE.md\` file. They define who the agent is, how it talks, and what it cares about. Stable.
- **Skills** live in \`agents/<slug>/.claude/skills/<skill>/SKILL.md\`. They are repeatable playbooks the agent can invoke when relevant. Composable.
- **Runs** are individual invocations — one prompt, one result. **Sessions** are conversations that thread runs together with the \`--resume <session-id>\` flag.

You'll see all three on every agent's detail page: the persona at the top, the skill list as editable tabs, and the run history below.

## Your starting roster

Gaia ships with five internal agents. You can rename, retrain, or retire any of them:

- **King Henry** — copywriting, taglines, marketing voice.
- **Professor Adrian** — meta architect; the agent that helps you design other agents.
- **Atlas** — research and competitive intelligence.
- **Nova** — content production and social posts.
- **Rack** — DevOps, deploy scripts, infra hygiene.

Each agent has a default skill or two. Skills can be edited inline from the agent's Skills tab, or directly on disk — both paths sync.

## Run vs. Conversations

Two ways to talk to an agent:

1. **Quick Run** — a one-shot invocation. Fire-and-forget. Best when you have a self-contained ask ("write 3 hero variants for X"). Result lands in the run history and as a notification.
2. **Conversations** — multi-turn chat. The session persists, and the agent remembers prior turns. Best when you're refining, iterating, or need the agent to ask clarifying questions.

A reasonable first 10 minutes:

1. Open **Conversations**, pick **King Henry**, ask for three taglines for an imaginary product. See how a chat thread feels.
2. Open **/agents**, click **Atlas**, hit **Quick Run** on \`research-deep-dive\`, give it a topic, watch the result come back as a notification.
3. Visit **/schedule** and skim the cron presets — you don't need to set one up yet, just see what's possible.

That's the whole loop: launch, observe, iterate. Everything else in Gaia is plumbing around those three primitives.

The dev server runs on **port 7878**. Bookmark \`http://localhost:7878\`.`,
  },
  {
    slug: "the-team",
    title: "The Team",
    description: "Meet your five agents, their default skills, and how to grow the roster.",
    icon: "Users",
    body: `# The Team

Your starting roster is five agents. Each one has a persona file (\`CLAUDE.md\`), at least one skill, and a dedicated detail page at \`/agents/<id>\`.

## King Henry — Copywriting

Default skills: \`headline-generator\`, \`tagline-rewrite\`. King Henry is the agent you reach for when something needs to be **said**, not built. Marketing copy, naming, voice consistency, CTA tuning. He's tuned to be opinionated about clarity and to push back on jargon.

## Professor Adrian — Architect / Meta

Default skill: \`design-new-agent\`. The Professor is the agent who helps you design other agents. Use him when you want to spin up a new persona, prune an existing one, or rewrite a skill from scratch. He thinks about scopes, inputs, and the trade-off between specialist and generalist agents.

## Atlas — Research

Default skill: \`research-deep-dive\`. Atlas does long-form research — competitive landscapes, technology comparisons, evidence gathering. Strong at citing sources and structuring the result so the next agent (or you) can act on it.

## Nova — Content & Social

Default skills: \`social-thread\`, \`weekly-newsletter\`. Nova writes the public-facing stuff: tweets, threads, LinkedIn, newsletters. She works well downstream of Atlas — research-in, content-out.

## Rack — DevOps / Infra

Default skill: \`deploy-checklist\`. Rack handles the boring-but-critical: deploy scripts, environment variables, Docker, log triage, CI failures. Quick Run him when something is on fire.

## How to launch them

Every agent card has three doors:

- **Open in Terminal** — drops you into a fresh Claude Code session in the agent's directory. Best for long, exploratory work.
- **Continue** — resumes the most recent session via \`--resume <session-id>\`. Same context, picks up where you left off.
- **Quick Run** — one-shot from the dashboard. Great for fire-and-forget asks; the result lands as a notification.

## Adding a new skill

Skills are markdown files. The fastest path:

1. Open the agent's detail page → **Skills** tab.
2. Click **New Skill**, give it a slug, and paste a SKILL.md.
3. Save. The file is written to \`agents/<slug>/.claude/skills/<new-slug>/SKILL.md\` and is immediately available to that agent.

You can also edit on disk directly — the dashboard re-reads on render, so both paths stay in sync.

## Adding a new agent

Click **Add Agent** in the top-right of \`/agents\`. The modal asks for a name, role, color, and avatar. Behind the scenes Gaia creates \`agents/<slug>/\` with a starter \`CLAUDE.md\` and an empty \`.claude/skills/\` directory. From there it's the same flow — add a skill, run, iterate.

A reasonable team size is **3 to 7 agents**. More than that and the personas blur together; fewer and you end up overloading one with too many roles.`,
  },
  {
    slug: "scheduling",
    title: "Scheduling & Autonomy",
    description: "Cron tasks, cadence trade-offs, and human-in-the-loop approvals.",
    icon: "Clock",
    body: `# Scheduling & Autonomy

Most agents earn their keep on a schedule, not on demand. Gaia's scheduler turns any agent + skill combination into a recurring cron task — daily research, hourly inbox triage, weekly reports — without writing any glue code.

## What a cron task is

A cron task is a saved row that says **"run agent X with prompt Y on schedule Z."** When the cron fires, Gaia does three things:

1. Invokes the agent with the prompt.
2. Saves the result to \`agents/_shared/files/\` (so other agents and you can read it).
3. Emits a notification into the System inbox in Conversations.

If the prompt is wrapped in approval markers (see the Skills doc), the result also creates an approval row that surfaces on the System thread for you to accept or skip.

## Creating a task

Open \`/schedule\` and click **New Task**. The modal asks for:

- **Agent** — who runs it.
- **Skill** (optional) — pre-fills the prompt with the skill's default invocation.
- **Prompt** — what to actually run.
- **Schedule** — pick a preset (Every 5 min / Hourly / Daily 9am / Weekly Mon 9am) or type a custom cron expression.

You can edit or delete a task from its row in the schedule list. Delete is a two-step inline confirm — first click arms it, second click commits, blur cancels.

## The cadence trade-off

This is the single most important decision you'll make per task:

- **Every minute** — maximally responsive, but you'll burn through API credits and accumulate noise. Reserve for tight feedback loops you're actively watching.
- **Every 5–15 minutes** — sensible for "watch this and tell me if anything changed."
- **Hourly** — a strong default for most ongoing monitoring.
- **Daily** — reports, summaries, anything where freshness inside a day doesn't matter.
- **Weekly** — strategic recurring work; reviews, sweeps, audits.

A useful sanity check: if you wouldn't read the result more than once a day, don't run the task more than once a day.

## Human-in-the-loop with approvals

Full autonomy is rarely what you want. The sweet spot is **agent does 95%, you approve the last 5%.**

Wrap any decision in approval markers inside the agent's prompt or skill:

\`\`\`
<<<APPROVAL>>>
Send this email to the customer? Subject: "..." Body: "..."
<<<END_APPROVAL>>>
\`\`\`

When the run completes, the marked block becomes an approval row. It shows up:

- In the **System** thread inside Conversations, with **Approve** / **Skip** buttons.
- In the agent's own thread, scoped to that agent.
- Pinned at the top of the chat panel until acted on.

Approve and the agent's downstream action runs. Skip and it's dismissed. Either way, the decision is logged.

This pattern lets you set aggressive cadences (every 15 minutes) without losing oversight — the agent does the heavy lifting on its own, you just say yes or no.`,
  },
  {
    slug: "how-to-add-skills",
    title: "Adding & Editing Skills",
    description: "Write skills as markdown, edit inline or on disk, and use the marker conventions.",
    icon: "Wrench",
    body: `# Adding & Editing Skills

A **skill** is a small, focused playbook the agent can invoke. It's a single markdown file. Skills are how you turn an agent from a generalist chat partner into a specialist that ships consistent output.

## Where skills live

Each skill is one file:

\`\`\`
agents/<slug>/.claude/skills/<skill-slug>/SKILL.md
\`\`\`

For example, Atlas's research skill lives at \`agents/atlas/.claude/skills/research-deep-dive/SKILL.md\`. The directory name **is** the skill slug — that's what shows up in the dashboard and in Quick Run.

## Two ways to edit

Both paths read and write the same file, so you can move freely between them:

1. **Skills tab on \`/agents/<id>\`** — click into a skill and edit it in the inline editor. Save persists to disk. This is the fast path.
2. **On disk directly** — open the SKILL.md in your editor of choice. The dashboard re-reads on next render, so changes show up immediately.

If you're in flow with another tool (VS Code, Cursor) the on-disk path is friendlier. If you're triaging from the dashboard, the inline editor is faster.

## Conventions

A good SKILL.md has four sections, in this order:

- **Name** — a one-line title, mirroring the slug.
- **When to use** — the trigger conditions. The agent reads this to decide whether to invoke the skill at all, so be specific. "When the user asks for marketing copy" is better than "for writing tasks."
- **Inputs** — what information the skill needs to do its job. List them so the agent can ask for missing inputs before starting.
- **Expected output** — the shape of the result. Bullets, JSON, prose, headings — whatever it is, name it.

Keep skills under ~200 lines. If a skill grows past that, it's probably two skills.

## The approval marker

When a skill makes a decision a human should sign off on, wrap it:

\`\`\`
<<<APPROVAL>>>
Send this draft to the user? <draft body here>
<<<END_APPROVAL>>>
\`\`\`

At run time, anything between the markers is parsed out as an approval row and surfaced in the System inbox with **Approve** / **Skip** buttons. Use it for outbound communication, irreversible operations (deploys, deletes), or anything where the cost of a wrong call is high.

## The inter-agent message marker

**Coming soon.** A second marker pair will let one agent hand off work directly to another:

\`\`\`
<<<HANDOFF agent="nova">>>
Turn this research into a Twitter thread.
<<<END_HANDOFF>>>
\`\`\`

When this ships, an Atlas → Nova chain ("Atlas researches, Nova writes the thread") will be a single skill invocation instead of two manual steps. Track the changelog for the rollout date.

## Iterating on a skill

The honest workflow:

1. Write a v1 SKILL.md. Don't over-engineer.
2. Run it three or four times on real prompts.
3. Notice what's wrong — wrong tone, missing context, format off.
4. Edit the skill. Run again.

After ~5 iterations you'll have a skill that's reliably good. That's the whole loop.`,
  },
  {
    slug: "architecture",
    title: "Architecture",
    description: "Stack, data model, the two run paths, and where everything lives on disk.",
    icon: "Layers",
    body: `# Architecture

Gaia is intentionally small. Less moving parts means fewer things to debug and more time spent on the agents themselves.

## Stack

- **Next.js 16** (App Router) — the dashboard, API routes, and SSE streams.
- **Tailwind v4** — styling. CSS variables in \`globals.css\` for the design tokens.
- **SQLite** via \`better-sqlite3\` — the database. One file at \`app/data/gaia.db\`. Synchronous, fast, no daemon.
- **Claude Code CLI** — the runtime that actually executes agents. Gaia shells out to it.

The whole thing runs on **port 7878**. No Postgres, no Redis, no Docker. \`npm run dev\` and you're up.

## Data model

The SQLite schema covers eleven tables, each with a single clear job:

- **employees** — the agents (id, slug, name, role, color, avatar, persona path).
- **runs** — every agent invocation (one row per run; status, started_at, completed_at, cost).
- **run_events** — the streamed events inside a run (text deltas, tool calls, results).
- **messages** — chat messages and notifications inside threads.
- **projects** — the external Claude Code projects Gaia observes.
- **sessions** — Claude Code sessions, both internal runs and external observations.
- **tasks** — cron task definitions (agent_id, prompt, schedule, last_fired_at).
- **approvals** — pending approval rows extracted from \`<<<APPROVAL>>>\` blocks.
- **settings** — global key/value config (LLM defaults, autonomy toggles).
- **thread_sessions** — junction table linking conversation threads to sessions.
- **migrations** — schema version tracking.

Read the schema in \`app/src/server/db.ts\` for the full DDL. Every table has an integer \`created_at\` (ms epoch) and an indexed \`updated_at\`.

## The two run paths

Gaia tracks two distinct flavors of agent activity:

1. **Internal runs** — initiated through the dashboard (Quick Run, Conversations, scheduled task). Gaia controls the lifecycle: spawns the Claude Code subprocess, captures stdout/stderr, parses events, writes rows. Full visibility.
2. **External observation** — Claude Code sessions you started yourself in the terminal. Gaia watches the project directory at \`~/.claude/projects/\` and ingests session JSONL files as they're written. Less control, but lets you see the work you do outside the dashboard right alongside the agent runs.

Both paths land in the same \`runs\` and \`sessions\` tables. The \`source\` column distinguishes them.

## Session continuity

Every session has a stable \`session_id\`. The Claude Code CLI accepts \`--resume <session-id>\` and rehydrates the full conversation context. Gaia's **Continue** button just shells out with that flag. This is why you can close the dashboard, come back tomorrow, and pick up exactly where you left off.

## Where things live on disk

- \`agents/<slug>/CLAUDE.md\` — the persona for one agent.
- \`agents/<slug>/.claude/skills/<skill>/SKILL.md\` — that agent's skills.
- \`agents/_shared/files/\` — outputs from runs and scheduled tasks; readable by any agent.
- \`app/data/gaia.db\` — the SQLite database. Back this up.
- \`app/src/app/api/\` — the Next.js API routes.
- \`app/src/server/\` — the server-only modules (db, runner, watchers, seed).
- \`~/.claude/projects/\` — Claude Code's own project store; Gaia reads this for external sessions.

If you're looking for something, start in \`app/src/server/\` for backend logic and \`app/src/app/\` for routes and pages.`,
  },
  {
    slug: "morning-briefing",
    title: "Morning Briefing",
    description: "Five staggered cron tasks that fill your inbox before you're at your desk.",
    icon: "Sunrise",
    body: `# Morning Briefing

The canonical autonomy pattern: a handful of agents on staggered crons that leave short notes in your inbox before you sit down. Open your Mac, find five briefs waiting.

## The five default tasks

- **Atlas — Daily research** (\`0 9 * * *\`) — top topics in solo-founder Twitter, Hacker News, and Indie Hackers; five highlights with links.
- **King Henry — Inbox triage** (\`15 9 * * *\`) — surfaces urgent pending items; says so plainly when nothing's there.
- **Rack — Daily infra check** (\`30 9 * * *\`) — routine health check, flags anomalies only.
- **Nova — Daily content idea** (\`45 9 * * *\`) — one fresh sub-60-second video idea tied to today's research.
- **Professor Adrian — Architecture review** (\`0 10 * * *\`) — three architecture call-outs ranked by leverage.

Click **Set up your morning briefing** on \`/schedule\` to create all five at once.

## Why disabled by default

Each task lands with \`enabled = 0\`. Agents cost money — review the prompts and cadences first, then toggle on. The cron scheduler picks up changes on its next 30-second sync.

## Customizing

Each task is just a row in the \`tasks\` table. From \`/schedule\` you can:

- Edit the cron string (research at 7 AM, architecture review weekly).
- Rewrite the prompt to match your sources.
- Reassign the agent (give Atlas's slot to King Henry if you prefer the voice).

## Enable / disable

The leftmost column on each scheduled row is a toggle. Flip it to start firing; flip it back to pause. State is per-task — you can run two and leave three off.

## Cost expectation

Roughly **$1–3 per day** if all five fire — depends on the skills the agents invoke. Research and architecture review are the heavier ones; inbox triage and the infra check are usually cheap.

## Where the results land

Two places, every fire:

1. The agent's own thread under **Conversations** — full transcript.
2. The **Files** page — each result is also written to \`agents/_shared/files/\` so other agents can read it on their next run.

Set it up on Sunday, leave it for a week, see whether the morning inbox earns its keep.`,
  },
];

export function getDoc(slug: string): Doc | undefined {
  return DOCS.find((d) => d.slug === slug);
}

/** Word count → reading time in minutes (rounded up, min 1). */
export function readingTimeMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 250));
}

/** First non-heading paragraph in a markdown body. Used for snippets / search. */
export function firstParagraph(body: string): string {
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("```")) continue;
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) continue;
    return trimmed;
  }
  return "";
}

/** All H2 (## ) headings in order, paired with a slug for anchor links. */
export function extractHeadings(body: string): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = [];
  const seen = new Set<string>();
  for (const line of body.split(/\r?\n/)) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const text = m[1].trim();
    let id = text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
    if (!id) continue;
    let unique = id;
    let n = 2;
    while (seen.has(unique)) {
      unique = `${id}-${n++}`;
    }
    seen.add(unique);
    out.push({ id: unique, text });
  }
  return out;
}
