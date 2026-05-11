---
name: Agent Site — Unified Dashboard Vision
description: Adrian's insight that no one has combined AgentOS (control) + Agent Dashboard (observability) into one tool — potential product opportunity
type: project
---

Adrian identified a clear gap in the Claude Code ecosystem: every existing tool is either a control panel OR an observability dashboard, never both in one interface.

**The vision:** A single unified dashboard that combines:
- AgentOS's session management (start/stop agents, multi-project, browser UI, mobile access)
- Agent Dashboard's intelligence (cost tracking, token usage, tool call history, real-time session analytics)

**Current state (as of 2026-05-04):**
- AgentOS running at `http://localhost:3011` — control layer
- Agent Dashboard (hoangsonww fork) running at `http://localhost:5173` — intelligence layer
- Both already connected via Claude Code hooks in `~/.claude/settings.json`
- Agent Dashboard already extended with: prompt-sending box, auto-switch to Conversation tab on send

**Why:** No one in the open source ecosystem has built this combination. Multiple projects solve each half separately. Adrian is closer than anyone to having a working unified version.

**How to apply:** When working on Agent Site, frame all dashboard work toward this unified vision. Features to prioritize: start new session from dashboard UI, stop/kill sessions, inline conversation view.
