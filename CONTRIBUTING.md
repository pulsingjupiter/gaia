# Contributing to Gaia

Thanks for the interest. Gaia is a small, opinionated project; PRs are
welcome but please read the scope statement at the bottom before
opening a large change.

## Quickstart

```bash
gh repo clone adrianlee2026-glitch/gaia
cd gaia
./setup.sh
cd app
npm run dev          # http://localhost:7878
```

To verify a clean build before pushing:

```bash
cd app
npx tsc --noEmit
npm run build
```

See [INSTALL.md](./INSTALL.md) for the full first-time setup, including
Claude Code CLI install and optional `macmon` for thermal monitoring.

## Project structure

- `app/` — Next.js 16 dashboard (App Router, React 19, Tailwind v4,
  better-sqlite3).
- `agents/` — per-agent home directories: `CLAUDE.md` persona +
  `.claude/skills/` definitions. Treat each agent folder as a self-
  contained persona spec.
- `setup.sh` — idempotent first-run bootstrap.
- `INSTALL.md` — user-facing install guide.

## Coding conventions

- TypeScript with explicit types. Avoid `any`; prefer `unknown` plus a
  narrowing check.
- API routes in `app/src/app/api/**` must set
  `export const runtime = "nodejs"` and
  `export const dynamic = "force-dynamic"`.
- Match existing style: minimal comments, no commented-out code, named
  functions over inline arrows for exported handlers.
- React Server Components by default; mark client files with
  `"use client"` only when you actually need state, effects, or
  browser APIs.
- The `app/` Next.js version is non-standard — read the relevant guide
  in `app/node_modules/next/dist/docs/` before reaching for APIs from
  your training data.

## Pull requests

- Open against `main`.
- Include a clear description of the change and the motivation.
- For UI changes, include before/after screenshots.
- Run `npx tsc --noEmit` from `app/` before pushing. PRs with type
  errors will be sent back.
- Keep PRs scoped — one logical change per PR.

## Issues

**Bug reports** should include:

- macOS version (`sw_vers -productVersion`)
- Node version (`node --version`)
- Reproduction steps, expected vs. actual behaviour
- Relevant log output from `app/` or the Terminal window Gaia spawned

**Feature requests** should describe the use case and the workflow you
want to enable, not just the feature. Why does the current shape fall
short?

## Scope

Gaia is intentionally narrow:

- **macOS-only.** It uses `osascript` to drive Terminal.app / iTerm2.
- **Local-first.** No cloud sync, no multi-user, no auth.
- **Claude Code-dependent.** The agent runtime is the Claude Code CLI.
- **Opinionated.** Personas are folders, skills are markdown, runs are
  subprocesses.

PRs that conflict with these constraints (e.g. "add cloud sync",
"port to Windows", "swap in a different LLM provider") will likely be
declined. Fork is fine.

## License

By contributing, you agree your contributions will be released under
the [MIT License](./LICENSE).
