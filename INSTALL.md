# Installing Gaia

A clean, end-to-end install guide for Gaia — your local AI workforce
dashboard. Written for two audiences at once:

- **You, the human.** Read top-to-bottom. Should take ~10 minutes if Node
  and Claude Code are already installed; ~20 minutes if you're starting
  fresh.
- **Claude Code on your Mac.** Skip to **Quick install** for the
  copy-pasteable flow. Anyone you're sharing this with can hand this
  file to their Claude Code on their Mac with the prompt at the end.

---

## 1. What Gaia is

Gaia is a calm, local cockpit for an AI workforce. It runs on your Mac —
no cloud, no extra accounts, no per-token billing. You give Gaia five
specialized agents (research, writing, planning, project work, ops),
each backed by your existing Claude Code subscription, and Gaia
orchestrates them.

The dashboard at `http://localhost:7878` lets you:

- Launch a Claude Code session for any agent in a single click (Gaia
  drives Terminal.app or iTerm2 via `osascript`).
- See every recent run, what it cost, and what it produced.
- Schedule recurring tasks (cron-style) — daily inbox triage, weekly
  status digests, end-of-day journaling.
- Browse files agents have produced and projects they've touched.
- Approve or skip destructive actions (file writes, external sends)
  before they happen.

Everything Gaia knows lives in a single SQLite file at
`app/data/gaia.db`. Back up that file and you've backed up the whole
system.

**macOS only.** Gaia uses AppleScript (`osascript`) to drive Terminal /
iTerm2. It will not run as-is on Linux or Windows.

---

## 2. What you'll see when it's running

After `npm run dev` and opening `localhost:7878`:

- **Overview** — KPI strip (today's runs, costs, pending approvals),
  task grid, workforce panel, schedule strip, activity rail.
- **Agents** — one card per agent (king-henry, professor-adrian, atlas,
  nova, rack). Each card has inline controls: `[New]`, `[Continue]`,
  and a `[v]` menu. Clicking `New` opens Terminal.app at the agent's
  home directory and starts `claude` — the persona auto-loads.
- **Projects** — a list of registered project directories. Click
  **Scan** and browse to a folder like `~/Developer` to auto-register
  every Git repo inside as a project. Or click **Add Project** to add
  a single folder.
- **Schedule** — cron-style task list. Each task pairs an agent +
  skill + cron expression.
- **Inbox** — agent-to-user messages and pending approvals.
- **Activity** — full run history with cost, duration, and output.
- **Files** — files agents have written, browsable.
- **Settings** — Profile, Agents (per-agent model overrides + cost
  caps), Projects, Terminal preference, Hooks, Data, About.

A small **amber Setup banner** appears at the top whenever something is
missing (e.g. Claude CLI not found, an agent dir is missing, the data
dir isn't writable). Each row has an **Open Terminal** button that
opens Terminal.app pre-filled with the fix command. Hit **Re-check** to
dismiss once everything is green.

---

## 3. Prerequisites

Run each `Verify` command in your terminal. If it fails, follow the
**Install** instructions for that row.

| Requirement | Verify | Install |
|------|------|------|
| **macOS 12+** | `sw_vers` | Built-in. Apple Silicon or Intel both fine. |
| **Node.js 20 or 22** | `node --version` (must print `v20.x` or `v22.x`) | `brew install node@20` (recommended) or via [nvm](https://github.com/nvm-sh/nvm): `nvm install 22 && nvm use 22`. Or download from [nodejs.org](https://nodejs.org/). |
| **npm 10+** | `npm --version` | Ships with Node — no separate install. |
| **Claude Code CLI** | `claude --version` | `npm install -g @anthropic-ai/claude-code`. Then run `claude` once to authenticate via your Claude Pro / Max subscription (browser OAuth). |
| **Bash** (built-in) | `bash --version` | Already installed on every Mac. |

**Optional**:

- **Homebrew** (only if you don't have Node yet) — install from
  [brew.sh](https://brew.sh). One-line installer.
- **iTerm2** (only if you prefer it over Terminal.app) —
  `brew install --cask iterm2`. Gaia auto-detects which terminal to
  use; you can switch in **Settings → Terminal**.

> If you'd rather not install Homebrew, install Node and Claude Code
> via the [nodejs.org](https://nodejs.org/) installer and `npm`. Both
> paths are equally good.

---

## 4. Quick install (5 steps)

```bash
# 1. Unzip the bundle to a permanent local location.
#    Replace the path below if your zip is somewhere else.
unzip ~/Downloads/gaia-fresh-2026-05-10.zip -d ~/Developer

# 2. Move into the project root.
cd ~/Developer/gaia

# 3. Run the setup script. Idempotent — safe to re-run.
chmod +x setup.sh
./setup.sh

# 4. Start the dashboard.
cd app && npm run dev

# 5. Open the dashboard in your browser.
open http://localhost:7878
```

**Important:** unzip somewhere local like `~/Developer/`,
`~/code/`, or `~/Projects/`. **Do not put it under iCloud Drive** —
see "Why not iCloud" below.

That's it. The first request to the dashboard creates the SQLite
database (~2s) and seeds it with sample agents. Subsequent loads are
fast.

---

## 5. First-run walkthrough

1. **`./setup.sh`** verifies prereqs, runs `npm install` inside `app/`
   (~1–2 minutes the first time), and ensures all five agent home
   directories exist with their persona files. The script is
   idempotent — safe to re-run anytime.

2. **`npm run dev`** starts Next.js on port `7878`. You'll see
   `Ready in <ms>` in the terminal.

3. **First page load** triggers a one-time DB seed. It takes ~2–3
   seconds. Subsequent loads are <1 second.

4. **Setup banner.** If anything's missing (Claude CLI not found, data
   dir not writable, an agent dir absent), the amber banner shows it.
   Each row has an **Open Terminal** button — click it and Terminal
   opens with the fix pre-filled. Hit **Re-check** after fixing.

5. **Try an agent.** Visit **Agents**, find a card (e.g. king-henry),
   click **`[New]`**. Terminal.app opens, runs `cd agents/king-henry &&
   claude`, and Claude Code auto-loads the agent's persona from
   `agents/king-henry/CLAUDE.md`. Type a question. Quit when done.

6. **Add a project.** Visit **Projects**, click **Scan**, and browse to
   `~/Developer` (or wherever you keep code). Gaia walks the tree and
   registers every `.git` repo as a project. Or click **Add Project**
   for a single folder.

7. **Look at scheduled tasks.** Visit **Schedule**. Sample tasks are
   seeded; each pairs an agent + skill + cron expression. Edit, delete,
   or run them on demand.

> First time you click **Open Terminal** or **Browse**, macOS will pop
> a permission prompt asking to control "Terminal" or "Finder". Click
> **Allow**. If you accidentally click Deny, fix it via
> **System Settings → Privacy & Security → Automation → Node** and
> re-enable the toggles.

---

## 6. Why not iCloud Drive

Do **not** install Gaia under
`~/Library/Mobile Documents/com~apple~CloudDocs/` (the iCloud Drive
mirror). It causes:

- **Massive Turbopack cold-compile slowdowns** — observed 46 s vs <5 s
  on a local SSD. iCloud's file-evict / re-download cycle thrashes
  Next.js's incremental cache.
- **Random `EBUSY` / file-lock errors** during `npm install`,
  `next dev`, and SQLite writes. iCloud holds locks while it
  decides whether to upload a file.
- **Pointless upload bandwidth** — every file write replicates to
  iCloud servers you'll never look at.

Recommendation: keep Gaia under `~/Developer/` or `~/code/` or anywhere
**not** synced by iCloud, Dropbox, OneDrive, or Google Drive.

---

## 7. Architecture cheat sheet

- **Next.js 16** App Router with Turbopack, **React 19**, **Tailwind v4**.
- **SQLite** via `better-sqlite3`. Single DB file at `app/data/gaia.db`.
  Auto-created on first request. Back up that file and you have
  everything.
- **Agent personas** live as folders under `agents/<slug>/`. Each has:
  - `CLAUDE.md` — the persona prompt Claude Code auto-loads.
  - `inbox.json` — message queue (other agents and the system write here).
  - `.claude/skills/<skill>/SKILL.md` — runnable skill definitions.
  - Launching an agent runs `cd agents/<slug> && claude` so Claude Code
    picks up the persona automatically.
- **Test instance.** `npm run dev:test` runs a parallel blank-slate Gaia
  on port `9898` with isolated `agents-test/` and `data-test/` dirs.
  Both can run side by side without interfering — useful for
  experimenting without touching your real workforce.
- **Cron tasks** run in-process via `node-cron`. The Schedule page is
  the source of truth.
- **Terminal driver.** Gaia uses `osascript` to open Terminal.app or
  iTerm2 with the right `cd` + command. macOS-only.

---

## 8. Common tasks

| Task | How |
|------|------|
| Start the prod dashboard | `cd app && npm run dev` (port `7878`) |
| Start the test dashboard | `cd app && npm run dev:test` (port `9898`) |
| Start a fresh blank test | `cd app && npm run dev:test:fresh` (wipes `data-test/`) |
| Launch an agent | Agents page → click `[New]` on the card |
| Resume the last session | Agents page → click `[Continue]` on the card |
| Add a single project | Projects page → **Add Project** → Browse to folder |
| Auto-discover projects | Projects page → **Scan** → Browse to `~/Developer` (or similar) |
| Reset the prod DB | Stop server → `rm app/data/gaia.db*` → restart |
| Reset the test DB | `rm -rf app/data-test/*` (or use `dev:test:fresh`) |
| Re-run setup | `./setup.sh` from the project root (idempotent) |
| Switch terminal app | Settings → Terminal → choose Terminal.app or iTerm2 |
| Stop the server | `Ctrl+C` in the terminal running `npm run dev` |

---

## 9. Troubleshooting

| Symptom | Cause & fix |
|---------|-------------|
| `claude: command not found` | Claude Code CLI not installed or not on PATH. `npm install -g @anthropic-ai/claude-code`, then `claude` once to log in. Re-run `./setup.sh`. |
| `"No conversation found to continue"` when clicking **Continue** | Fresh agent — no prior session. Click **`[New]`** instead. |
| Setup banner: "Missing agent dirs" | Run `./setup.sh` from the project root. Or click the banner's **Open Terminal** button. |
| Port 7878 already in use | Another instance running. `lsof -nP -iTCP:7878 -sTCP:LISTEN` to see PID, then `kill <PID>`. Or change the port in `app/package.json` (`"dev": "next dev -p <new-port>"`). |
| Port 9898 already in use | Same fix as above for the test instance. |
| `database is locked` errors | Don't run `next dev` and `next start` against the same DB at the same time. Use port `9898` (`npm run dev:test`) for a second instance. |
| First page load is slow (>10 s) | Turbopack cold compile + DB seed. Subsequent loads are sub-second. If it stays slow, check that you're not running from iCloud Drive. |
| Browser folder-picker doesn't open | First time only, macOS prompts for Terminal / Finder automation permission. Click **Allow**. If you clicked **Deny**: System Settings → Privacy & Security → Automation → toggle Node back on. |
| Login items / Background Items prompt at startup | Not from Gaia — Gaia installs no login items. Likely Claude Code CLI's first-run prompt; safe to allow. |
| `setup.sh: Permission denied` | The script lost its execute bit during unzip. `chmod +x setup.sh` then re-run. |
| `npm install` fails on `better-sqlite3` | Native module — needs Xcode Command Line Tools. `xcode-select --install`, accept the prompt, then `cd app && rm -rf node_modules package-lock.json && npm install`. |
| Node version error from setup.sh | Need Node 20+. `nvm install 22 && nvm use 22` (or upgrade via Homebrew / nodejs.org). |
| Agent runs hang | Check the **Activity** page → run detail → **Cancel**. If a Claude Code window is stuck, close it manually. |

---

## 10. What's NOT in this bundle

This zip is a clean source tree — no caches, no personal data:

- **No SQLite database.** `app/data/` is empty; the DB is created on
  first request and seeded with sample data.
- **No build cache.** `.next/` and `.next-test/` are absent; `next dev`
  will create them on first run.
- **No `node_modules`.** `setup.sh` (or `npm install`) creates them.
- **No git history.** This is a snapshot, not a clone.
- **No personal session transcripts, inboxes, or runtime data.**
  Agent inboxes are reset to empty `[]`.
- **No `.env` / secrets.** Gaia doesn't need any — your Claude Pro / Max
  subscription auth is handled by the Claude Code CLI itself.

---

## 11. Paste-ready prompt for Claude Code

If you have Claude Code running in the unzipped folder and want Claude
to do the install for you, copy the block below into a fresh Claude
Code session:

```text
Read INSTALL.md in this directory and install Gaia for me on this Mac.
Walk through the Prerequisites section first and tell me which items I
already have vs need to install. Stop and ask me before installing
anything system-wide that requires sudo or that pulls in Homebrew /
Node if I don't already have them. Once prerequisites are green, run
through the 5-step Quick install. Tell me when http://localhost:7878
is ready in my browser, and flag any error or warning along the way.
Do not modify INSTALL.md or any other file in the bundle.
```

---

## 12. Credits

Built by Adrian Lee. For questions, ask Adrian.
