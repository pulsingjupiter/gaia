# Gaia / AI Workforce Platform — Prototype

A clickable Next.js UI prototype. Fidelity-focused mock — no backend, mock data only.

## Run

```bash
cd "/Users/adrian/Library/Mobile Documents/com~apple~CloudDocs/AI/Agent Site/app"
npm install
npm run dev
```

Open [http://localhost:7878](http://localhost:7878).

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS v4 (CSS-vars based theme tokens)
- lucide-react icons
- @dnd-kit/core for kanban drag-drop
- Plus Jakarta Sans via `next/font`
- shadcn/ui was *not* installed — we hand-rolled a small set of UI primitives because Tailwind v4 + Next 16 + shadcn defaults are still flaky (the spec-aligned look is fully reproducible without it).

## Pages

| Route | What |
|------|------|
| `/` | Overview — KPI strip, tasks grid, workforce CRUD panel, schedule strip, activity / conversations / quick actions rail |
| `/playbooks` | 12-card playbook grid + filter bar + category tabs + pagination |
| `/playbooks/[slug]` | Agent detail (radial capability map + about / skills / tools / activity rail). Every card on the list routes here. |
| `/sprint` | KPI strip + Board / Timeline / Calendar tabs + 4-column @dnd-kit kanban |
| `/schedule` | Week grid (7 days × 13 hour rows) with all-day band + right rail (overview / upcoming / calendar sync) |
| `/conversations` | Conv-list + Slack-style chat (incl. progress and result embedded cards) + context rail |
| `/backlog`, `/docs`, `/activity`, `/files`, `/settings` | Stubs with shared "Coming soon" empty state |

## What's mocked

- Employees seeded from `src/lib/mock/employees.ts` and persisted to `localStorage` under key `gaia.employees.v1` via `useLocalStorageState`. The Workforce panel on Overview offers Add / Edit / Remove. Sidebar avatar cluster, conversations list, schedule, activity feed all read from the same context.
- Playbooks, sprint tasks, schedule events, conversations, activity entries — all static mock data in `src/lib/mock/*`.

## What's stubbed

- `/backlog`, `/docs`, `/activity`, `/files`, `/settings` are deliberate placeholders.
- Search inputs, filter dropdowns, and tab states are non-functional except where it matters (kanban DnD, employee CRUD, conversation selection, category tabs visual state).
- Send / Star / Share / "+ New X" buttons are visual-only.

## Notable design decisions

- Per-agent accent colours are stored on the employee record and propagate to every avatar on every page.
- The radial capability map is hand-drawn SVG (10 nodes at 36° spacing, cubic Bézier connectors) — no chart library.
- Tailwind v4 `@theme inline` block exposes the design tokens as CSS vars so the same palette drives both inline styles and Tailwind utilities.
