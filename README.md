# Gaia

Gaia is a calm cockpit for an AI workforce that runs on your Mac. Five
specialized agents — backed by the Claude Code CLI — handle research,
writing, planning, project work, and ops. You chat with them, give them
projects, schedule recurring tasks, and watch their activity from a single
dashboard. Everything lives locally: a SQLite database, a few hundred
megabytes of agent state, and the standard Claude Code subscription you
already pay for. No extra accounts, no cloud, no per-token billing.

## Requirements

- macOS (Apple Silicon or Intel)
- **Node.js 20 or newer** — `node --version` should print `v20.x.x` or higher
- **Claude Code CLI** — install with `npm install -g @anthropic-ai/claude-code`
  - Requires a Claude Pro or Max subscription
  - Sign in once: run `claude` and follow the browser prompt
- ~500 MB free disk space (mostly `node_modules`)
- A free TCP port — Gaia uses **7878** by default

## Setup

From the project root:

```bash
chmod +x setup.sh
./setup.sh
```

The script is idempotent — safe to re-run. It:

1. Verifies Node 20+ and the Claude Code CLI
2. Runs `npm install` inside `app/`
3. Scaffolds the five agent home directories under `agents/` if any are
   missing
4. Creates the SQLite data directory at `app/data/`

When it finishes:

```bash
cd app && npm run dev
```

Then open **<http://localhost:7878>**.

### Test instance — blank-slate onboarding

Need to experience first-run onboarding without disturbing your real
workforce? Start a parallel "test" instance from the same `app/`
directory:

```bash
npm run dev:test     # port 9898, blank DB, empty agents dir
```

`npm run dev` and `npm run dev:test` are independent: each has its own
SQLite at `data-test/gaia.db`, its own `agents-test/<slug>/` folders,
and its own cron scheduler. The test instance skips the default-agent
seed so the Agents page lands you on "Add your first agent" — exactly
what a brand-new user sees. Both instances can run side by side.

## First open

You'll land on the Overview page. The sidebar lists Playbooks, Agents,
Sprint, Projects, Docs, Schedule, Inbox, Activity, Files, and Settings.

If anything is missing on your machine — Claude CLI not installed, an
agent directory absent, the data dir not writable — a small amber banner
appears at the top with a one-line remedy for each issue. Hit **Re-check**
after fixing things, or dismiss the banner once everything is green.

## The five agents

| Slug | Role |
|------|------|
| `king-henry` | Decides, prioritizes, and unblocks. The chief-of-staff. |
| `professor-adrian` | Research and conceptual briefs. Plans before doing. |
| `atlas` | Long-range planning, project decomposition, milestones. |
| `nova` | Drafts copy, comms, customer replies, marketing material. |
| `rack` | Operational tasks — files, schedules, the boring useful stuff. |

Each agent has a home directory at `agents/<slug>/` containing a
`CLAUDE.md` persona and a `.claude/skills/` folder with skill definitions.
Edit the persona to change voice; add a skill to give the agent a new
capability.

## Daily usage

- **Chat with an agent** — open Conversations (Inbox) and pick a thread,
  or start a new one with the `+` button.
- **Run a skill** — visit the agent's profile and click **Run now** on a
  skill, or kick off the same skill via Schedule for a recurring run.
- **Resume an external session** — if you have an existing Claude Code
  session in a project directory, Gaia can resume it from the Sessions
  panel.
- **Approvals** — destructive actions (file writes, external calls) wait
  in the Approvals queue. The sidebar Inbox badge counts pending items.

## Configuration

Settings is split into four sub-pages:

- **Profile** — your name, email, timezone, greeting style
- **Agents** — per-agent model override and optional cost cap
- **Appearance** — light / dark / system, plus your terminal preference
  (Terminal, iTerm2, or copy-to-clipboard)
- **Hooks** — point Gaia at custom shell hooks that fire on lifecycle
  events (run start/end, approval needed)

## Scheduled tasks

The Schedule page lists cron-style tasks. Each task pairs an agent with a
skill and a cron expression. Use it for daily inbox triage, weekly status
digests, end-of-day journaling — anything you'd otherwise forget to
trigger by hand. Tasks run in-process via `node-cron`; deleting a task
removes the next firing immediately.

## Backing up your data

Everything Gaia knows lives in **`app/data/gaia.db`**. Copy that single
file (along with its `-shm` / `-wal` siblings if present) and you have a
full backup: chats, runs, settings, projects, scheduled tasks. Restore by
dropping the file back into `app/data/`.

To start fresh, quit the dev server and delete `gaia.db`. It will be
recreated on the next request.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `claude: command not found` | `npm install -g @anthropic-ai/claude-code`, then re-run `./setup.sh` |
| Port 7878 already in use | `kill $(lsof -ti :7878)` then `npm run dev` again |
| First-run banner says agent dir missing | `./setup.sh` (it re-scaffolds anything absent) |
| DB looks corrupted / weird errors on startup | Stop the server, delete `app/data/gaia.db*`, restart. You lose chat history but everything else regenerates. |
| Setup script aborts on Node check | Install Node 20+ via [nodejs.org](https://nodejs.org/) or `nvm install 20` |
| Agent runs hang | Check the Activity page; cancel from the run detail view |

## Project layout

```
Agent Site/
├── setup.sh                ← onboarding script
├── README.md               ← you are here
├── agents/                 ← per-agent CLAUDE.md, skills, inbox
│   ├── king-henry/
│   ├── professor-adrian/
│   ├── atlas/
│   ├── nova/
│   ├── rack/
│   ├── _system/            ← system-generated messages
│   └── _shared/files/      ← drop files here for any agent
└── app/                    ← Next.js app (the dashboard)
    ├── src/
    │   ├── app/            ← routes (App Router) + API
    │   ├── components/     ← UI
    │   ├── lib/            ← hooks, utilities
    │   └── server/         ← DB layer + agent runner
    ├── scripts/            ← scaffold-agents.ts, smoke-test.ts
    ├── data/               ← gaia.db (gitignored)
    └── package.json
```

## Tech stack

- **Next.js 16** (App Router, Node runtime for API routes)
- **React 19** + **Tailwind CSS v4**
- **better-sqlite3** for the local store
- **node-cron** for scheduled tasks
- **chokidar** for file watching
- **Claude Code CLI** as the agent runtime

## License

MIT — do whatever you want with it.
