#!/usr/bin/env bash
# Gaia setup script.
#
# Idempotent — safe to re-run. Verifies prereqs, installs deps, scaffolds
# agent home directories, and gets the project ready for `npm run dev`.
#
# Usage:
#   chmod +x setup.sh
#   ./setup.sh

set -euo pipefail

# --- helpers -----------------------------------------------------------------

# These ANSI escapes are written explicitly (not via echo -e) so the script
# behaves the same in /bin/bash and other POSIX shells.
ESC=$(printf '\033')
BOLD="${ESC}[1m"
DIM="${ESC}[2m"
RED="${ESC}[31m"
GREEN="${ESC}[32m"
YELLOW="${ESC}[33m"
BLUE="${ESC}[34m"
RESET="${ESC}[0m"

ok()   { printf "  %s✓%s %s\n" "$GREEN" "$RESET" "$*"; }
info() { printf "  %s•%s %s\n" "$BLUE"  "$RESET" "$*"; }
warn() { printf "  %s!%s %s\n" "$YELLOW" "$RESET" "$*"; }
fail() { printf "  %sx%s %s\n" "$RED"   "$RESET" "$*"; }

die() {
  fail "$*"
  printf "\n%sSetup aborted.%s See the message above and re-run after fixing it.\n" "$BOLD" "$RESET"
  exit 1
}

section() {
  printf "\n%s%s%s\n" "$BOLD" "$1" "$RESET"
}

# --- 0. resolve paths --------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
APP_DIR="$PROJECT_ROOT/app"
AGENTS_DIR="$PROJECT_ROOT/agents"
DATA_DIR="$APP_DIR/data"

AGENTS=("king-henry" "professor-adrian" "atlas" "nova" "rack")

# --- 1. welcome --------------------------------------------------------------

cat <<BANNER

${BOLD}Gaia — Setup${RESET}
${DIM}Your AI workforce, running locally on your Mac.${RESET}

Project root: ${PROJECT_ROOT}

BANNER

# --- 2. prereq checks --------------------------------------------------------

section "1/6  Checking prerequisites"

# Node.js >= 20
if ! command -v node >/dev/null 2>&1; then
  die "Node.js not found. Install Node 20+ (https://nodejs.org/) and re-run."
fi

NODE_VERSION_RAW="$(node --version)"          # e.g. v20.11.1
NODE_MAJOR="${NODE_VERSION_RAW#v}"            # strip leading v
NODE_MAJOR="${NODE_MAJOR%%.*}"                # take major
if ! [[ "$NODE_MAJOR" =~ ^[0-9]+$ ]] || [ "$NODE_MAJOR" -lt 20 ]; then
  die "Node.js 20+ required. Found $NODE_VERSION_RAW. Upgrade via nvm or https://nodejs.org/."
fi
ok "Node.js $NODE_VERSION_RAW (>= 20)"

# npm
if ! command -v npm >/dev/null 2>&1; then
  die "npm not found. It usually ships with Node.js — re-install Node from https://nodejs.org/."
fi
ok "npm $(npm --version)"

# Claude Code CLI — search PATH; do NOT hardcode Adrian's path.
CLAUDE_BIN=""
if command -v claude >/dev/null 2>&1; then
  CLAUDE_BIN="$(command -v claude)"
fi

if [ -z "$CLAUDE_BIN" ]; then
  fail "Claude Code CLI not found on PATH."
  cat <<MSG

  Install it with:

      ${BOLD}npm install -g @anthropic-ai/claude-code${RESET}

  Then sign in once with ${BOLD}claude${RESET} (it will open a browser).
  After install, re-run this script.

MSG
  exit 1
fi

# Confirm it actually runs (catches broken symlinks / quarantined binaries).
if ! CLAUDE_VERSION="$("$CLAUDE_BIN" --version 2>/dev/null)"; then
  die "Found 'claude' at $CLAUDE_BIN but it failed to run. Try: $CLAUDE_BIN --version"
fi
ok "Claude Code CLI: $CLAUDE_VERSION (${DIM}$CLAUDE_BIN${RESET})"

# macmon — optional, powers the Overview thermal widget. Non-blocking.
if ! command -v macmon >/dev/null 2>&1; then
  info "Optional: install macmon for thermal monitoring → brew install macmon && macmon serve --install"
elif ! curl -s --max-time 1 http://127.0.0.1:9090/json >/dev/null 2>&1; then
  info "macmon installed but not serving — run: macmon serve --install"
else
  ok "macmon serving on http://127.0.0.1:9090"
fi

# --- 3. install app deps -----------------------------------------------------

section "2/6  Installing app dependencies"

if [ ! -d "$APP_DIR" ]; then
  die "Expected app directory at $APP_DIR — is the project structure intact?"
fi

if [ ! -f "$APP_DIR/package.json" ]; then
  die "Missing $APP_DIR/package.json — is the project structure intact?"
fi

if [ -d "$APP_DIR/node_modules" ] && [ -f "$APP_DIR/node_modules/.package-lock.json" ]; then
  info "node_modules already populated — skipping (delete app/node_modules to force re-install)"
else
  info "Running npm install (this can take a minute or two)..."
  ( cd "$APP_DIR" && npm install --no-fund --no-audit )
fi
ok "App dependencies installed"

# --- 4. agent dirs -----------------------------------------------------------

section "3/6  Verifying agent home directories"

mkdir -p "$AGENTS_DIR"

NEED_SCAFFOLD=0
for slug in "${AGENTS[@]}"; do
  if [ -f "$AGENTS_DIR/$slug/CLAUDE.md" ]; then
    ok "agents/$slug/CLAUDE.md"
  else
    warn "agents/$slug/CLAUDE.md missing — will scaffold"
    NEED_SCAFFOLD=1
  fi
done

if [ "$NEED_SCAFFOLD" -eq 1 ]; then
  if [ ! -f "$APP_DIR/scripts/scaffold-agents.ts" ]; then
    die "Missing $APP_DIR/scripts/scaffold-agents.ts — cannot scaffold agents."
  fi
  info "Running scaffold-agents.ts..."
  ( cd "$APP_DIR" && node --experimental-strip-types scripts/scaffold-agents.ts )
  ok "Agent directories scaffolded"
fi

# System agent dir (used by the notifier / system messages)
mkdir -p "$AGENTS_DIR/_system"
ok "agents/_system/ ready"

# --- 5. data dir -------------------------------------------------------------

section "4/6  Preparing data directory"

mkdir -p "$DATA_DIR"
if [ ! -w "$DATA_DIR" ]; then
  die "Data dir $DATA_DIR is not writable. Check permissions."
fi
ok "$DATA_DIR is writable"

if [ -f "$DATA_DIR/gaia.db" ]; then
  ok "Existing gaia.db detected — leaving it alone"
else
  info "No DB yet — will be created automatically on first request"
fi

# --- 6. final summary --------------------------------------------------------

section "5/6  All checks passed"

ok "Node $NODE_VERSION_RAW"
ok "Claude CLI at $CLAUDE_BIN"
ok "App dependencies installed"
ok "Agents scaffolded (${#AGENTS[@]} of them)"
ok "Data dir writable"

section "6/6  Next step"

cat <<NEXT

  ${BOLD}cd app && npm run dev${RESET}

  Then open ${BOLD}http://localhost:7878${RESET} in your browser.

  ${DIM}If port 7878 is already in use:${RESET}
      kill \$(lsof -ti :7878) && cd app && npm run dev

  ${DIM}To re-run this script later:${RESET}
      ./setup.sh   ${DIM}(it's idempotent)${RESET}

NEXT
