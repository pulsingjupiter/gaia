# Agent Site — Lessons (Mistakes to Never Repeat)

> Read this at the start of every session before touching any code or config. After any correction, append the pattern here immediately.

## Supabase

## App / Frontend

### Next.js App Router — root layout providers
- Conditionally rendering a Provider in the root `layout.tsx` (e.g. `{cond ? <Provider>{children}</Provider> : children}`) breaks client-side navigation. App Router caches the root layout segment and does not re-mount it when only the pathname changes — pages that mount later will render against a tree without the provider and throw. Always wrap children in providers unconditionally; conditionally render only the visible chrome inside the provider.

## Backend

## Hosting

## Tooling

### Claude Squad
- Must be run from a **git repo** — will not work in folders without `.git`
- Must be run from **Terminal.app or iTerm2**, not from within Claude Code's built-in terminal — the TUI fails to render in Claude Code's terminal
- `ctrl+b d` detaches from an agent pane back to the main list

### Pixel Agents (VS Code extension)
- Registers in the **bottom panel** (not the sidebar activity bar) — look for it next to Terminal/Output/Problems tabs
- Or open via `Cmd+Shift+P` → `Pixel Agents: Show Panel`

### Agent Dashboard (Claude Code Agent Monitor)
- Cloned at `~/Claude-Code-Agent-Monitor`, start with `cd ~/Claude-Code-Agent-Monitor && npm run dev`
- Runs at `http://localhost:5173` (frontend) and `http://localhost:4820` (backend)
- Hooks installed into `~/.claude/settings.json` — auto-captures all Claude Code sessions
- Extended with prompt-sending box (`POST /api/sessions/:id/send-prompt`) — uses `tmux send-keys` to route to correct agent
- Conversation tab already auto-polls every 3s — just needs to be mounted (visited once) to start polling
- On successful prompt send, dashboard auto-switches to Conversation tab

### AgentOS
- Install: `npm install -g @saadnvd1/agent-os && agent-os install && agent-os start`
- Runs at `http://localhost:3011`
- Requires `tmux` and `ripgrep` (auto-installed by `agent-os install`)
- The terminal pane IS the Claude Code session — type prompts directly into it
- No observability (costs, token usage) — pair with Agent Dashboard for that

## Ecosystem Insight
- No existing tool combines AgentOS-style control with Agent Dashboard-style observability — this is the gap Adrian is building toward
