# Gaia

> A local-first macOS dashboard for orchestrating Claude Code sessions
> across named agent personas.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![macOS Sequoia+](https://img.shields.io/badge/macOS-Sequoia%2B-blue)](https://www.apple.com/macos/)
[![Built with Next.js 16](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)

Gaia turns a Claude Code subscription into a tiny in-house team you
chat with, schedule, and supervise from one screen. Each agent is a
folder on disk — a `CLAUDE.md` persona plus a stack of `.claude/skills/`
markdown files — and Gaia is the cockpit that runs them, watches them,
and stitches their work into projects, playbooks, and recurring tasks.
It runs entirely on your Mac. No accounts, no cloud, no per-token
billing beyond the Claude Pro/Max subscription you already pay for.

## Screenshots

See [`docs/screenshots/`](docs/screenshots/) for the full set.

- `docs/screenshots/overview.png` — Overview dashboard with workforce
  status and recent activity
- `docs/screenshots/agents.png` — Agents list with inline launch
  controls per persona
- `docs/screenshots/projects.png` — Projects board with milestones,
  kanban, and Plan-with-Claude wizard
- `docs/screenshots/schedule.png` — Cron schedule view
- `docs/screenshots/playbooks.png` — Playbook templates library
- `docs/screenshots/tasks.png` — Tasks view across the workforce

## What you get

- **10 agent personas** out of the box — Chief of Staff, Researcher,
  Engineer, Editor, Customer Success, Sales/BD, Designer, Data Analyst,
  Project Manager, Scriptwriter. Each ships with a starter `CLAUDE.md`
  persona and one default skill.
- **5 team bundles** — Content, Engineering, Research, Sales/BD, Exec
  Support. Pick a bundle on first run and Gaia scaffolds the right
  agents together.
- **15 playbook templates** spanning Productivity, Engineering,
  Research, Content, Sales, Customer Success, and Data.
- **Projects** with milestones, deadlines, a kanban board, recurring
  tasks, and a calendar view.
- **Scheduled runs** — cron jobs that fire skills automatically (daily
  inbox triage, weekly status digests, end-of-day journaling).
- **Plan-with-Claude wizard** — headlessly invokes Claude Code to turn
  a one-line goal into a structured project plan you can edit and
  apply.
- **Thermal monitoring widget** for Apple Silicon, powered by
  [`macmon`](https://github.com/vladkens/macmon).
- **Native macOS integration** — `osascript`-driven Terminal launches,
  native folder pickers, no Electron, no web wrapper.

## Philosophy

**Personas are folders.** An agent is just `agents/<slug>/CLAUDE.md`
plus a skills directory. Edit it in any text editor. Version it.
Diff it. The dashboard is a view onto the filesystem, not a database
of black-box bots.

**Skills are markdown.** A skill is a prompt with metadata. No DSL, no
graph, no chains. If you can write a prompt, you can write a skill.

**Local-first, always.** Everything lives in `app/data/gaia.db` (a
single SQLite file) and the `agents/` directory. Copy two paths and
you have a full backup. No sync service. No telemetry.

**macOS-native.** Terminal.app and iTerm2 are first-class. The folder
picker is the system picker. The thermal widget reads the same sensors
Activity Monitor reads.

**Human-in-the-loop.** Destructive actions queue for approval. You
decide what runs, what gets written, and what gets sent.

## Requirements

- **macOS 14+** (Sequoia recommended)
- **Node 20+** — `node --version` must print `v20.x.x` or newer
- **Claude Code CLI** — `npm install -g @anthropic-ai/claude-code`,
  then `claude login` once. Requires Claude Pro or Max.
- ~500 MB free disk space (mostly `node_modules`)
- A free TCP port — Gaia uses **7878** by default
- **Optional:** [`macmon`](https://github.com/vladkens/macmon)
  (`brew install macmon && macmon serve --install`) for the thermal
  monitoring widget on Apple Silicon

## Install

The full guide lives in [INSTALL.md](./INSTALL.md). The three-line
version:

```bash
gh repo clone pulsingjupiter/gaia
cd gaia && ./setup.sh
cd app && npm run dev    # → http://localhost:7878
```

`setup.sh` is idempotent. It checks your Node version, verifies the
Claude CLI is installed, runs `npm install`, scaffolds any missing
agent home directories, and creates the SQLite data directory.

## What it ISN'T

Setting expectations up front saves everyone time:

- **Not a framework for building agents from scratch.** If you want to
  define agent graphs, tools, and message routing yourself, look at
  LangGraph, AutoGen, or CrewAI.
- **Not an autonomous coding agent.** Gaia spawns Claude Code sessions
  in Terminal windows you watch and approve. If you want a heads-down
  coding loop, look at OpenHands or Cursor.
- **Not multi-user or cloud-hosted.** One user, one machine. If you
  need shared state across a team, pick a hosted product.
- **Not Windows or Linux.** It uses `osascript` to drive Terminal.app
  and the native macOS folder picker. A non-trivial chunk of the code
  would need to be rewritten to port.

## Tech stack

- **Next.js 16** with Turbopack (App Router, Node runtime)
- **React 19** + **Tailwind CSS v4**
- **better-sqlite3** for the local store (single file, no daemon)
- **node-cron** for scheduled tasks
- **chokidar** for filesystem watching
- **Claude Code CLI** as the agent runtime
- **macOS `osascript`** for Terminal.app / iTerm2 integration

## Status

Solo, MIT-licensed side project. No support contract, no SLA, no
roadmap promises. Built because the maintainer wanted a calm cockpit
for the agents already running on his laptop and didn't see one. If
that resonates, contributions are welcome — see
[CONTRIBUTING.md](./CONTRIBUTING.md). If you want guarantees, fork
it.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the quickstart, coding
conventions, and scope statement.

## Security

See [SECURITY.md](./SECURITY.md). The short version: **Gaia has no
authentication. Do not expose it to the public internet.** It is
intended for local-only personal use.

## License

MIT — see [LICENSE](./LICENSE). Do whatever you want with it.
