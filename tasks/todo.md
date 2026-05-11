# Agent Site — Task Tracker

> Canonical source. Update this file for pending work. Mark items [x] as done immediately. Add new items at the bottom of the relevant section.

## In Progress

## App & UI

## Backend & Data

## Integrations

## Research & Analysis
- [ ] Analyse the feature gap between AgentOS and Agent Dashboard — identify exactly what needs to be built to unify them into one tool

## Completed
- [x] Agents card — inline `[▶ New] [↻ Continue] [⌄]` launch trio (new `inline` variant in `agent-launch-button.tsx`); fixes "no conversation found" UX trap on fresh deploys
- [x] Setup banner — per-check "Open Terminal" button (`/api/system/open-terminal`) that opens Terminal.app with the remediation command (`./setup.sh`, `chmod`, npm install) for non-CLI users
- [x] Projects page — "Scan" button + scan modal (`/api/projects/scan`) to auto-register `.git` repos under a base dir (default `~/Developer`)
- [x] Add Project modal — "Browse…" native folder picker (`/api/system/pick-folder` via osascript `choose folder`); auto-fills name from basename
- [x] Refactored osascript helpers to `app/src/server/osascript.ts` (shared by 3 routes)
- [x] Files page — wire `Upload` button (POST /api/files multipart, 25MB cap, refuses overwrite, hidden file input, multi-select)
- [x] Sprint header — drop visual-only date prev/next chevrons; drop "All Teams" / "All Playbooks" / "Filter" inert pills; surface "Coming in V5" tooltip on Timeline + Calendar tabs
- [x] Conversations right rail — replace mock Active Playbooks / Memory Snapshot / Files & Outputs cards with explicit "Coming in V5" placeholders + Files page link
- [x] Agents Profile tab — relabel "Edit on disk:" / "Editing on disk:" to "Path on disk:" since edits are inline
- [x] Conversations ResultCard — drop inert "View Full Report" / "Add to Sprint" CTAs
- [x] V4 Schedule UI — wire Edit/Delete on cron task rows (`/api/tasks/[id]` PATCH+DELETE, modal edit mode, inline 2-step delete confirm)
- [x] Rename user-facing "Employee" → "Agent" across Gaia UI; wire Conversations right-rail "View Agent" button to `/playbooks/<agent-id>`
- [x] Avatar foundation (Wave 1) — 10 DiceBear `adventurer` SVGs in `app/public/avatars/agents/`, registry at `app/src/lib/avatars.ts`, `<AgentAvatar />` and `<IconPicker />` in `app/src/components/shared/`
- [x] Overview "Recent Sessions" widget — last 5 sessions across all projects with one-click Resume (`app/src/components/overview/recent-sessions.tsx`, `app/src/lib/hooks/use-recent-sessions.ts`)
- [x] Activity timeline — per-row Resume button on session rows (`app/src/components/activity/activity-timeline.tsx`)
- [x] Wave 2A — API routes + boot-time seed (`app/src/app/api/**`, `app/src/server/seed.ts`)
- [x] Wave 2B — `/projects/[id]` detail page with Sessions / Backlog / Files / Settings tabs (`app/src/app/projects/[id]/{page,layout}.tsx`, `app/src/components/projects/detail/**`, `use-project-{detail,sessions,backlog,files}.ts`)
- [x] Wave 1 (3-wave Gaia build) — backlog/files/settings APIs, run stats, tasks schema columns + settings table, demo files in `agents/_shared/files/`
