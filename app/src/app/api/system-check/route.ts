/**
 * GET /api/system-check
 *   → {
 *       ok: boolean,
 *       checks: { name, ok, message }[],
 *       checked_at: string,  // ISO timestamp
 *     }
 *
 * Read-only health check the dashboard uses to nudge new users when the
 * environment isn't fully set up. Aggregated `ok = checks.every(c => c.ok)`.
 *
 * Cached in-process for 30 seconds so the first-run banner — which polls on
 * mount and on Re-check — doesn't run filesystem probes on every navigation.
 */
import { execSync } from "node:child_process";
import { accessSync, constants as fsConstants, existsSync } from "node:fs";
import path from "node:path";

import { PATHS } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Check = {
  name: string;
  ok: boolean;
  message: string;
};

type SystemCheckResult = {
  ok: boolean;
  checks: Check[];
  checked_at: string;
};

const CACHE_TTL_MS = 30_000;
let cached: { at: number; result: SystemCheckResult } | null = null;

const REQUIRED_AGENTS = [
  "king-henry",
  "gaia",
  "atlas",
  "nova",
  "rack",
] as const;

function checkClaudeCli(): Check {
  // Use POSIX `command -v` via `sh` so we honor the user's PATH and shell
  // profile loaders aren't needed. Don't hardcode any specific path.
  try {
    const out = execSync("command -v claude", {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
      shell: "/bin/sh",
    }).trim();
    if (!out) {
      return {
        name: "claude_cli_available",
        ok: false,
        message:
          "Claude Code CLI not found on PATH. Install with: npm install -g @anthropic-ai/claude-code",
      };
    }
    return {
      name: "claude_cli_available",
      ok: true,
      message: `Claude Code CLI found at ${out}`,
    };
  } catch {
    return {
      name: "claude_cli_available",
      ok: false,
      message:
        "Claude Code CLI not found on PATH. Install with: npm install -g @anthropic-ai/claude-code",
    };
  }
}

function checkAgentsScaffolded(): Check {
  const missing: string[] = [];
  for (const slug of REQUIRED_AGENTS) {
    const claudeMd = path.join(PATHS.agentsDir, slug, "CLAUDE.md");
    if (!existsSync(claudeMd)) missing.push(slug);
  }
  if (missing.length === 0) {
    return {
      name: "agents_scaffolded",
      ok: true,
      message: `All ${REQUIRED_AGENTS.length} agent directories present`,
    };
  }
  return {
    name: "agents_scaffolded",
    ok: false,
    message: `Missing agent dirs: ${missing.join(", ")}. Run ./setup.sh to scaffold.`,
  };
}

function checkDbInitialized(): Check {
  if (existsSync(PATHS.dbPath)) {
    return {
      name: "db_initialized",
      ok: true,
      message: "gaia.db exists",
    };
  }
  return {
    name: "db_initialized",
    ok: false,
    message:
      "gaia.db not yet created. It will be initialized on first request — try refreshing.",
  };
}

function checkDataDirWritable(): Check {
  try {
    accessSync(PATHS.dataDir, fsConstants.W_OK);
    return {
      name: "data_dir_writable",
      ok: true,
      message: `${PATHS.dataDir} is writable`,
    };
  } catch {
    return {
      name: "data_dir_writable",
      ok: false,
      message: `${PATHS.dataDir} is not writable. Check permissions: chmod -R u+w ${PATHS.dataDir}`,
    };
  }
}

function runChecks(): SystemCheckResult {
  const checks: Check[] = [
    checkClaudeCli(),
    checkAgentsScaffolded(),
    checkDbInitialized(),
    checkDataDirWritable(),
  ];
  return {
    ok: checks.every((c) => c.ok),
    checks,
    checked_at: new Date().toISOString(),
  };
}

export async function GET(): Promise<Response> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return Response.json(cached.result);
  }
  const result = runChecks();
  cached = { at: now, result };
  return Response.json(result);
}
