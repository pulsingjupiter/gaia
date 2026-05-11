/**
 * POST /api/projects/[id]/plan
 *
 * Composes a project-planning prompt from the wizard inputs and runs it
 * through a headless `claude -p` invocation (the same CLI the agent runner
 * uses, but one-shot — no streaming, no SQLite event log). Tries lenient
 * JSON extraction first; on failure, retries once with a strict
 * "respond ONLY with JSON" preamble.
 *
 * The user input is passed to the CLI via stdin (and CLI flag `--prompt-stdin`
 * is achieved by piping into stdin and using `-p -`). Args carry only the
 * flags themselves so shell metacharacters in the goal/scope/etc can never
 * land in the argv.
 */
import { spawn } from "node:child_process";
import type { NextRequest } from "next/server";

import {
  getEmployee,
  getProject,
  listAllTasks,
  listMilestones,
  type EmployeeRow,
  type MilestoneRow,
  type ProjectRow,
  type TaskRow,
} from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

const CLAUDE_BIN = process.env.GAIA_CLAUDE_BIN ?? "claude";
const TIMEOUT_MS = 120_000;
const RAW_TRUNCATE = 16_000;

type DetailLevel = "milestones" | "balanced" | "detailed";
type DateFirmness = "hard" | "aspirational" | "none";

type PlanBody = {
  goal?: unknown;
  target_date?: unknown;
  date_firmness?: unknown;
  must_have?: unknown;
  out_of_scope?: unknown;
  team_agent_ids?: unknown;
  include_human?: unknown;
  detail_level?: unknown;
};

type ProposalTask = {
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high";
  assignee_id: string | null;
  due_date: string | null;
};

type ProposalMilestone = {
  name: string;
  description: string;
  due_date: string | null;
  tasks: ProposalTask[];
};

export type PlanProposal = {
  milestones: ProposalMilestone[];
  rationale: string;
};

function badRequest(msg: string): Response {
  return Response.json({ error: msg }, { status: 400 });
}

function isDetailLevel(v: unknown): v is DetailLevel {
  return v === "milestones" || v === "balanced" || v === "detailed";
}

function isDateFirmness(v: unknown): v is DateFirmness {
  return v === "hard" || v === "aspirational" || v === "none";
}

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

type PromptArgs = {
  project: ProjectRow;
  goal: string;
  targetDate: string | null;
  dateFirmness: DateFirmness;
  mustHave: string;
  outOfScope: string;
  team: EmployeeRow[];
  includeHuman: boolean;
  detailLevel: DetailLevel;
  existingMilestones: MilestoneRow[];
  existingTasks: TaskRow[];
};

function composePrompt(a: PromptArgs): string {
  const milestoneNames =
    a.existingMilestones.length === 0
      ? "none"
      : a.existingMilestones.map((m) => `"${m.name}"`).join(", ");
  const sampleTitles = a.existingTasks
    .slice(0, 5)
    .map((t) => `"${t.title}"`)
    .join(", ");
  const taskSampleLine =
    a.existingTasks.length === 0
      ? "0 tasks"
      : `${a.existingTasks.length} tasks, sample titles: ${sampleTitles}`;

  const teamLines: string[] = [];
  for (const e of a.team) {
    teamLines.push(`- ${e.id}: ${e.name} (${e.role})`);
  }
  if (a.includeHuman) {
    teamLines.push(`- adrian: Adrian (you, the human)`);
  }
  const teamBlock = teamLines.length > 0 ? teamLines.join("\n") : "(no team specified)";

  const detailGuidance =
    a.detailLevel === "milestones"
      ? "milestones: produce 5-7 milestones, no tasks per milestone (empty tasks arrays)."
      : a.detailLevel === "detailed"
        ? "detailed: produce 6-10 milestones with 5-10 tasks each (40-80 total tasks)."
        : "balanced: produce 4-6 milestones with 3-6 tasks each (15-30 total tasks).";

  const targetDateLine =
    a.targetDate && a.targetDate.trim()
      ? `${a.targetDate}  (${a.dateFirmness})`
      : `no specific date  (${a.dateFirmness})`;

  return [
    `You are an expert project planner. Output a structured JSON plan for the following project.`,
    ``,
    `# Project context`,
    `- Name: ${a.project.name}`,
    `- Description: ${a.project.description ?? "(none)"}`,
    `- Working directory: ${a.project.path}`,
    `- Existing milestones (avoid duplicating): ${milestoneNames}`,
    `- Existing tasks (avoid duplicating): ${taskSampleLine}`,
    `- Today: ${todayIso()}`,
    ``,
    `# User intent`,
    `- Goal: ${a.goal}`,
    `- Target date: ${targetDateLine}`,
    `- Must include: ${a.mustHave}`,
    `- Explicitly out of scope: ${a.outOfScope.trim() ? a.outOfScope : "(none specified)"}`,
    ``,
    `# Available team (use these IDs in \`assignee_id\`)`,
    teamBlock,
    ``,
    `# Output requirements`,
    `- Output ONLY valid JSON matching this exact schema. No prose, no markdown fences, no commentary before or after.`,
    `- Detail level: ${a.detailLevel}`,
    `  - ${detailGuidance}`,
    `- Tasks must reference an \`assignee_id\` from the team list above when an agent fits; if no clear fit, omit the field.`,
    `- \`due_date\` is ISO format YYYY-MM-DD. Spread milestone due_dates evenly between today and the target_date (or 60 days from today if no target).`,
    `- Priority must be one of: low, medium, high.`,
    ``,
    `# Schema`,
    `{`,
    `  "milestones": [`,
    `    {`,
    `      "name": string,`,
    `      "description": string,`,
    `      "due_date": string | null,`,
    `      "tasks": [`,
    `        {`,
    `          "title": string,`,
    `          "description": string | null,`,
    `          "priority": "low" | "medium" | "high",`,
    `          "assignee_id": string | null`,
    `        }`,
    `      ]`,
    `    }`,
    `  ],`,
    `  "rationale": string`,
    `}`,
  ].join("\n");
}

const STRICT_PREAMBLE = [
  `Your previous response was not valid JSON. Respond with VALID JSON ONLY, matching the exact schema given. Do not include any text before or after the JSON object. Do not wrap it in markdown code fences. Start your response with \`{\`.`,
  ``,
].join("\n");

type ClaudeRunResult =
  | { kind: "ok"; stdout: string }
  | { kind: "timeout" }
  | { kind: "missing" }
  | { kind: "empty" }
  | { kind: "error"; message: string };

/**
 * Run `claude -p` and read its stdout. The user prompt is passed as a single
 * argv string — but it's NOT interpreted by a shell here (we use `spawn` with
 * argv array, not `exec` with a command string), so shell metacharacters in
 * the prompt are safe. We do NOT use stdin because the CLI's `-p` flag
 * expects the prompt inline as an argument.
 *
 * Tools are disabled via `--tools ""` (per `claude --help`: 'Use "" to
 * disable all tools'). This route only needs Claude to emit JSON text — it
 * must NEVER run bash, edit files, or fetch URLs. We previously used
 * `--dangerously-skip-permissions` which is unsafe and unnecessary for a
 * text-only response.
 *
 * `env` is restricted to a minimal allowlist so we don't leak arbitrary
 * shell vars into the Claude process.
 */
const CLAUDE_ENV_ALLOWLIST = [
  "HOME",
  "PATH",
  "USER",
  "LOGNAME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "SHELL",
  "TMPDIR",
  // Anthropic auth / config
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_MODEL",
  "CLAUDE_CONFIG_DIR",
  // Cloud provider auth (Bedrock/Vertex) — pass through if set
  "AWS_REGION",
  "AWS_PROFILE",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GCP_PROJECT_ID",
] as const;

function buildClaudeEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of CLAUDE_ENV_ALLOWLIST) {
    const v = process.env[k];
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function runClaude(prompt: string, cwd: string): Promise<ClaudeRunResult> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(
        CLAUDE_BIN,
        [
          "-p",
          prompt,
          // Disable all built-in tools — this route only wants a JSON text
          // response. Per `claude --help`: '--tools ... Use "" to disable
          // all tools, "default" to use all tools'.
          "--tools",
          "",
          // Force plain text output (we parse JSON out of stdout ourselves)
          // and skip session persistence so the plan call doesn't pollute
          // ~/.claude/projects/ with a transcript per run.
          "--output-format",
          "text",
          "--no-session-persistence",
        ],
        {
          cwd,
          env: buildClaudeEnv() as NodeJS.ProcessEnv,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === "ENOENT") {
        resolve({ kind: "missing" });
        return;
      }
      resolve({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    let stdout = "";
    let stderr = "";
    let finished = false;

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      resolve({ kind: "timeout" });
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
      if (err.code === "ENOENT") {
        resolve({ kind: "missing" });
        return;
      }
      resolve({ kind: "error", message: err.message });
    });

    child.on("close", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (code !== 0 && !stdout.trim()) {
        if (!stderr.trim()) {
          resolve({ kind: "empty" });
          return;
        }
        resolve({
          kind: "error",
          message: stderr.trim().slice(0, 2000),
        });
        return;
      }
      if (!stdout.trim()) {
        resolve({ kind: "empty" });
        return;
      }
      resolve({ kind: "ok", stdout });
    });
  });
}

/**
 * Lenient JSON extraction. Tries:
 *  1. Direct parse of the trimmed string.
 *  2. Strip ``` fences (json or plain) then parse.
 *  3. Find the outermost balanced `{...}` block in the output and parse.
 * Returns the parsed object, or null on failure.
 */
function extractJson(raw: string): unknown {
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

function normalisePriority(v: unknown): "low" | "medium" | "high" {
  if (v === "low" || v === "medium" || v === "high") return v;
  return "medium";
}

function normaliseIsoDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  // Accept "YYYY-MM-DD" or anything Date-parseable.
  const d = new Date(trimmed);
  if (!Number.isFinite(d.getTime())) return null;
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Validate + coerce the parsed JSON into our PlanProposal shape. Returns null
 * if the structure isn't recognisable as a plan (no milestones array, or
 * milestones lack names).
 */
function validateProposal(raw: unknown): PlanProposal | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const milestonesRaw = obj.milestones;
  if (!Array.isArray(milestonesRaw)) return null;
  const milestones: ProposalMilestone[] = [];
  for (const mRaw of milestonesRaw) {
    if (!mRaw || typeof mRaw !== "object") continue;
    const m = mRaw as Record<string, unknown>;
    if (typeof m.name !== "string" || !m.name.trim()) continue;
    const tasksRaw = Array.isArray(m.tasks) ? m.tasks : [];
    const tasks: ProposalTask[] = [];
    for (const tRaw of tasksRaw) {
      if (!tRaw || typeof tRaw !== "object") continue;
      const t = tRaw as Record<string, unknown>;
      if (typeof t.title !== "string" || !t.title.trim()) continue;
      const description =
        typeof t.description === "string" ? t.description : null;
      const assignee_id =
        typeof t.assignee_id === "string" && t.assignee_id.trim()
          ? t.assignee_id.trim()
          : null;
      tasks.push({
        title: t.title.trim(),
        description,
        priority: normalisePriority(t.priority),
        assignee_id,
        due_date: normaliseIsoDate(t.due_date),
      });
    }
    milestones.push({
      name: m.name.trim(),
      description:
        typeof m.description === "string" ? m.description.trim() : "",
      due_date: normaliseIsoDate(m.due_date),
      tasks,
    });
  }
  if (milestones.length === 0) return null;
  const rationale =
    typeof obj.rationale === "string" ? obj.rationale : "";
  return { milestones, rationale };
}

export async function POST(
  request: NextRequest,
  ctx: RouteCtx,
): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  const project = getProject(id);
  if (!project) {
    return Response.json({ error: "project not found" }, { status: 404 });
  }

  let body: PlanBody;
  try {
    body = (await request.json()) as PlanBody;
  } catch {
    return badRequest("invalid JSON body");
  }

  if (typeof body.goal !== "string" || body.goal.trim().length < 10) {
    return badRequest("goal (string, ≥10 chars) required");
  }
  if (typeof body.must_have !== "string" || body.must_have.trim().length < 10) {
    return badRequest("must_have (string, ≥10 chars) required");
  }
  if (!isDateFirmness(body.date_firmness)) {
    return badRequest("date_firmness must be 'hard'|'aspirational'|'none'");
  }
  if (!isDetailLevel(body.detail_level)) {
    return badRequest("detail_level must be 'milestones'|'balanced'|'detailed'");
  }
  if (!Array.isArray(body.team_agent_ids)) {
    return badRequest("team_agent_ids must be string[]");
  }
  const teamIds: string[] = [];
  for (const v of body.team_agent_ids) {
    if (typeof v !== "string" || !v.trim()) {
      return badRequest("team_agent_ids must be string[]");
    }
    teamIds.push(v.trim());
  }
  const includeHuman = body.include_human === true;
  if (teamIds.length === 0 && !includeHuman) {
    return badRequest("at least one team member (agent or human) required");
  }
  let targetDate: string | null = null;
  if (
    body.target_date !== undefined &&
    body.target_date !== null &&
    body.target_date !== ""
  ) {
    if (typeof body.target_date !== "string") {
      return badRequest("target_date must be string|null");
    }
    targetDate = body.target_date.trim() || null;
  }
  const outOfScope =
    typeof body.out_of_scope === "string" ? body.out_of_scope.trim() : "";

  const teamEmployees: EmployeeRow[] = [];
  for (const tid of teamIds) {
    const e = getEmployee(tid);
    if (e) teamEmployees.push(e);
  }

  const existingMilestones = listMilestones({ project_id: id });
  const existingTasks = listAllTasks({ project_id: id });

  const basePrompt = composePrompt({
    project,
    goal: body.goal.trim(),
    targetDate,
    dateFirmness: body.date_firmness,
    mustHave: body.must_have.trim(),
    outOfScope,
    team: teamEmployees,
    includeHuman,
    detailLevel: body.detail_level,
    existingMilestones,
    existingTasks,
  });

  const cwd = project.path;

  // First attempt — lenient prompt.
  const first = await runClaude(basePrompt, cwd);
  if (first.kind === "missing") {
    return Response.json(
      {
        error: "claude CLI not found",
        install_hint:
          "Install Claude Code: npm install -g @anthropic-ai/claude-code",
      },
      { status: 500 },
    );
  }
  if (first.kind === "timeout") {
    return Response.json(
      {
        error: "Plan generation timed out. Try again or simplify the input.",
      },
      { status: 504 },
    );
  }
  if (first.kind === "empty") {
    return Response.json(
      {
        error:
          "Claude returned no output. Make sure you're logged in (run: claude login).",
      },
      { status: 500 },
    );
  }
  if (first.kind === "error") {
    return Response.json(
      { error: `claude failed: ${first.message}` },
      { status: 500 },
    );
  }

  let proposal = validateProposal(extractJson(first.stdout));
  let combinedRaw = first.stdout;

  if (!proposal) {
    const strictPrompt = `${STRICT_PREAMBLE}${basePrompt}`;
    const second = await runClaude(strictPrompt, cwd);
    if (second.kind === "ok") {
      combinedRaw = `${first.stdout}\n--- retry ---\n${second.stdout}`;
      proposal = validateProposal(extractJson(second.stdout));
    } else if (second.kind === "timeout") {
      return Response.json(
        {
          error: "Plan generation timed out on retry. Try again or simplify the input.",
        },
        { status: 504 },
      );
    } else if (second.kind === "missing") {
      return Response.json(
        {
          error: "claude CLI not found",
          install_hint:
            "Install Claude Code: npm install -g @anthropic-ai/claude-code",
        },
        { status: 500 },
      );
    }
  }

  if (!proposal) {
    return Response.json({
      ok: false,
      error: "Could not parse plan from Claude's response",
      raw: combinedRaw.slice(0, RAW_TRUNCATE),
    });
  }

  return Response.json({
    ok: true,
    proposal,
    raw: combinedRaw.slice(0, RAW_TRUNCATE),
  });
}
