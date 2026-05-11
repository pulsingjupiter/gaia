# Gaia — `app/`

This directory contains the **Next.js 16 application** that powers
Gaia's web dashboard. It is the only runtime component — everything
Gaia knows lives in a single SQLite file under `app/data/`.

If you landed here first, start with the repo-root `README.md` for the
user-facing pitch, then `INSTALL.md` for the one-time setup. This file
is the contributor entry point.

---

## Quick start

```bash
npm install
npm run dev
# → http://localhost:7878
```

Assumes prereqs from the root `setup.sh` are satisfied (Node 20+, npm
10+, Claude Code CLI, macOS 12+).

---

## Architecture

- **Next.js 16** App Router with **Turbopack**, **React 19**, **TypeScript** strict.
- **Tailwind v4** with CSS-vars-based theme tokens (`src/app/globals.css`).
- **Server-side SQLite** via `better-sqlite3`. Single DB file at
  `app/data/gaia.db`. Auto-created on first request via the boot-time
  migration in `src/server/db.ts` (idempotent).
- **In-process cron scheduler** via `node-cron` (`src/server/cron.ts`) —
  scheduled tasks run inside the Next.js process.
- **Terminal driver** — agent launches shell out to Terminal.app or
  iTerm2 via `osascript` (`src/server/osascript.ts`). macOS only.

---

## Directory layout

| Path | Purpose |
|------|---------|
| `src/app/` | Next.js App Router pages and `/api` route handlers |
| `src/components/` | UI components grouped by feature (agents, sprint, projects, …) |
| `src/server/` | Server-only modules (DB, cron, agent runner, scaffolding, osascript) |
| `src/lib/` | Shared client-safe code — types, helpers, constants, templates |
| `src/lib/hooks/` | `use-*` React hooks that wrap the `/api` endpoints |
| `public/` | Static assets (favicon, avatar SVGs) |
| `data/` | SQLite database lives here at runtime; gitignored |
| `scripts/` | One-off maintenance scripts |

---

## Key conventions

- **TypeScript strict**; no `any` — fix the type, don't silence it.
- API routes use `export const runtime = "nodejs"` and
  `export const dynamic = "force-dynamic"` so they always run on Node
  (needed for `better-sqlite3` + `osascript`) and never cache.
- All path manipulation for agent dirs goes through
  `src/server/agent-scaffold.ts`; all Terminal / Finder driving goes
  through `src/server/osascript.ts`. Don't shell out ad-hoc — these are
  the path-safe wrappers.
- DB access is server-only — never import `src/server/db.ts` from a
  client component.

---

## Available scripts

| Script | What it does |
|--------|--------------|
| `npm run dev` | Start the prod dashboard on port `7878` against `app/data/` and `agents/` |
| `npm run dev:test` | Parallel test instance on port `9898` against `app/data-test/` and `agents-test/` — runs side by side with prod |
| `npm run dev:test:fresh` | Same as `dev:test` but wipes `data-test/` first (`GAIA_FRESH=1`) |
| `npm run build` | Production build via Turbopack |
| `npm run start` | Run the production build on port `7878` |
| `npm run start:test` | Run production build on port `9898` with the test env |
| `npm run start:test:fresh` | Production test start with a wiped DB |

---

## Database

SQLite, single file. Boot-time migration in `src/server/db.ts` is
idempotent — first request creates the DB, applies the schema, and (in
prod mode) seeds sample agents. Back up `app/data/gaia.db` and you've
backed up the whole system.

To reset:

```bash
rm app/data/gaia.db*   # stop dev server first
```

---

## Environment variables

| Var | Default | Purpose |
|-----|---------|---------|
| `GAIA_DATA_DIR` | `./data` | Where the SQLite DB lives |
| `GAIA_AGENTS_DIR` | `../agents` (resolved from `app/`) | Root of agent persona folders |
| `GAIA_DIST_DIR` | `.next` | Next.js build output dir — used to isolate prod vs test |
| `GAIA_SKIP_SEED` | unset | If set, skip the boot-time sample seed |
| `GAIA_TEST_MODE` | unset | Marks the instance as test (affects banner, seeding) |
| `GAIA_FRESH` | unset | If set, wipe `GAIA_DATA_DIR` before boot |
| `GAIA_CLAUDE_BIN` | `claude` | Override the Claude Code CLI path used by launches |
| `GAIA_MACMON_PORT` | unset | Optional macmon companion process port for thermal/cost telemetry |

---

## Testing / typecheck

There is no test suite yet. The current minimum bar before opening a PR:

```bash
npx tsc --noEmit
```

Must pass clean. Add tests when you touch code that warrants them — no
blanket coverage requirement.

---

## See also

- `../README.md` — user-facing project overview
- `../INSTALL.md` — end-to-end install guide
- `../CONTRIBUTING.md` — contribution workflow
