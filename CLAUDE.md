# Gaia

You are working inside the Gaia project root — a Next.js dashboard that orchestrates Claude Code sessions across named agent personas.

## Quick facts

- **App lives under** `app/` (Next.js 16 + Turbopack, React 19, Tailwind v4, SQLite via better-sqlite3).
- **Agent personas** live under `agents/<slug>/` — each has a `CLAUDE.md` (the persona) and `.claude/skills/<skill>/SKILL.md` (the playbooks).
- **Dashboard**: `cd app && npm run dev` → http://localhost:7878
- **Test dashboard** (isolated DB + agents): `cd app && npm run dev:test` → http://localhost:9898
- **Setup**: `./setup.sh` from repo root (idempotent — checks prereqs, npm install, scaffolds agents).

## When you make changes

- Match the existing TypeScript style: explicit types, no `any`, server routes use `runtime = "nodejs"` and `dynamic = "force-dynamic"`.
- Database queries go through helpers in `app/src/server/db.ts`. Schema is in there too.
- File-system writes to agent dirs should use the path-safe helpers in `app/src/server/agent-scaffold.ts`.
- Adding a new API route: read `app/AGENTS.md` first — Next.js 16 has breaking changes from older versions.

## When the user runs into trouble

- Setup banner on the dashboard surfaces unmet prereqs with "Open Terminal" remediation buttons.
- For partner / new-machine installs, see `INSTALL.md` at repo root — covers prereqs, troubleshooting, and a paste-ready prompt for Claude Code to do the install.
