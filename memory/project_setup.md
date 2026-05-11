---
name: Agent Site — Project Setup
description: Initial project context, purpose, stack, and start date
type: project
---

Project name: Agent Site
Start date: 2026-05-03

Purpose: Adrian's personal AI agent command center. Currently running two tools side by side — AgentOS (control) and Agent Dashboard (observability). Long-term vision is to merge both into one unified dashboard that no one has built yet.

**Installed tools (as of 2026-05-04):**
- Claude Squad — `brew install claude-squad`, run from any git repo as `claude-squad`
- Pixel Agents — VS Code extension `pablodelucca.pixel-agents` v1.3.0, bottom panel
- AgentOS — `npm install -g @saadnvd1/agent-os`, start with `agent-os start`, runs at `http://localhost:3011`
- Agent Dashboard — cloned at `~/Claude-Code-Agent-Monitor`, start with `npm run dev`, runs at `http://localhost:5173`. Extended with prompt-sending box + auto Conversation tab switch.

**Tech stack:** Node.js, React, SQLite, WebSockets (Agent Dashboard); Next.js, Hono, node-pty, xterm.js (AgentOS)

**Why:** Building toward a unified AI agent control + observability platform.
**How to apply:** Use this as baseline context when starting any session on this project.
