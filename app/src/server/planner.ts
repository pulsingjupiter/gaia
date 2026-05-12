/**
 * Headless planner CLI helper.
 *
 * Resolves the user's `default_llm_cli` setting (claude/codex/gemini) and
 * shells out to the corresponding binary in a one-shot, text-out fashion.
 * The prompt is passed via argv (NOT a shell command string) so shell
 * metacharacters in the prompt cannot be reinterpreted.
 *
 * - claude  → `claude -p <prompt> --tools "" --output-format text --no-session-persistence`
 *             Tools disabled — we only want a JSON text response.
 * - codex   → `codex exec --skip-git-repo-check --output-last-message <tmp> <prompt>`
 *             OpenAI's `codex` CLI runs autonomously and writes a final
 *             message to a file (stdout is event JSON). We read that file.
 * - gemini  → `gemini -p <prompt> -o text`  (observed working on the user's
 *             machine; `-o text` keeps the output plain.)
 *
 * `env` is restricted to a minimal allowlist so we don't leak arbitrary
 * shell vars into the child process.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { getDefaultLlmCli } from "@/server/db.ts";
import type { PlannerCli } from "@/lib/types.ts";

const TIMEOUT_MS = 120_000;

const CLAUDE_BIN = process.env.GAIA_CLAUDE_BIN ?? "claude";
const CODEX_BIN = process.env.GAIA_CODEX_BIN ?? "codex";
const GEMINI_BIN = process.env.GAIA_GEMINI_BIN ?? "gemini";

const ENV_ALLOWLIST = [
  "HOME",
  "PATH",
  "USER",
  "LOGNAME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "SHELL",
  "TMPDIR",
  // Anthropic
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_MODEL",
  "CLAUDE_CONFIG_DIR",
  // OpenAI / Codex
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  // Google / Gemini
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GCP_PROJECT_ID",
  // Cloud
  "AWS_REGION",
  "AWS_PROFILE",
] as const;

function buildEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ENV_ALLOWLIST) {
    const v = process.env[k];
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export type PlannerRunResult =
  | { kind: "ok"; stdout: string; cli: PlannerCli }
  | { kind: "timeout"; cli: PlannerCli }
  | { kind: "missing"; cli: PlannerCli; installHint: string }
  | { kind: "empty"; cli: PlannerCli }
  | { kind: "error"; cli: PlannerCli; message: string };

type SpawnSpec = {
  bin: string;
  args: string[];
  /** When set, read this file after the process exits and use its
   * contents as stdout (codex needs this; stdout is event JSON). */
  outputFile?: string;
};

function specFor(cli: PlannerCli, prompt: string): SpawnSpec {
  if (cli === "claude") {
    return {
      bin: CLAUDE_BIN,
      args: [
        "-p",
        prompt,
        "--tools",
        "",
        "--output-format",
        "text",
        "--no-session-persistence",
      ],
    };
  }
  if (cli === "gemini") {
    return {
      bin: GEMINI_BIN,
      args: ["-p", prompt, "-o", "text"],
    };
  }
  // codex
  const tmp = path.join(
    os.tmpdir(),
    `gaia-codex-${randomUUID()}.txt`,
  );
  return {
    bin: CODEX_BIN,
    args: [
      "exec",
      "--skip-git-repo-check",
      "--output-last-message",
      tmp,
      prompt,
    ],
    outputFile: tmp,
  };
}

function installHintFor(cli: PlannerCli): string {
  if (cli === "claude") {
    return "Install Claude Code: npm install -g @anthropic-ai/claude-code (or change your default planner CLI in Settings).";
  }
  if (cli === "codex") {
    return "Install the codex CLI (https://github.com/openai/codex), or change your default planner CLI in Settings.";
  }
  return "Install the gemini CLI (https://github.com/google-gemini/gemini-cli), or change your default planner CLI in Settings.";
}

/**
 * Run the configured default planner CLI with `prompt`. Returns a tagged
 * union result. The caller decides what HTTP status maps to each kind.
 */
export function runPlanner(
  prompt: string,
  cwd: string,
  overrideCli?: PlannerCli,
): Promise<PlannerRunResult> {
  const cli = overrideCli ?? getDefaultLlmCli();
  const spec = specFor(cli, prompt);
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(spec.bin, spec.args, {
        cwd,
        env: buildEnv() as NodeJS.ProcessEnv,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === "ENOENT") {
        resolve({ kind: "missing", cli, installHint: installHintFor(cli) });
        return;
      }
      resolve({
        kind: "error",
        cli,
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    let stdout = "";
    let stderr = "";
    let finished = false;

    const cleanup = () => {
      if (spec.outputFile) {
        try {
          fs.unlinkSync(spec.outputFile);
        } catch {
          // ignore
        }
      }
    };

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      cleanup();
      resolve({ kind: "timeout", cli });
    }, TIMEOUT_MS);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (c: string) => {
      stdout += c;
    });
    child.stderr?.on("data", (c: string) => {
      stderr += c;
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      cleanup();
      if (err.code === "ENOENT") {
        resolve({ kind: "missing", cli, installHint: installHintFor(cli) });
        return;
      }
      resolve({ kind: "error", cli, message: err.message });
    });

    child.on("close", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);

      // If the CLI writes its final message to a file (codex), prefer that
      // over stdout (which is event JSON for codex).
      let effective = stdout;
      if (spec.outputFile) {
        try {
          const buf = fs.readFileSync(spec.outputFile, "utf8");
          if (buf.trim()) effective = buf;
        } catch {
          // fall back to stdout
        }
      }
      cleanup();

      if (code !== 0 && !effective.trim()) {
        if (!stderr.trim()) {
          resolve({ kind: "empty", cli });
          return;
        }
        resolve({
          kind: "error",
          cli,
          message: stderr.trim().slice(0, 2000),
        });
        return;
      }
      if (!effective.trim()) {
        resolve({ kind: "empty", cli });
        return;
      }
      resolve({ kind: "ok", stdout: effective, cli });
    });
  });
}

/**
 * Lenient JSON extraction. Tries:
 *  1. Direct parse of the trimmed string.
 *  2. Strip ``` fences (json or plain) then parse.
 *  3. Find the outermost balanced `{...}` block in the output and parse.
 * Returns the parsed object, or null on failure.
 *
 * Shared between Plan with Gaia and Gaia AI Assess so we never drift apart.
 */
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  // 1) direct
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }
  // 2) fenced
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      // continue
    }
  }
  // 3) outermost balanced object
  const start = trimmed.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        const slice = trimmed.slice(start, i + 1);
        try {
          return JSON.parse(slice);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
