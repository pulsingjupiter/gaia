/**
 * POST /api/projects/[id]/assess
 *
 * Gaia AI Assess — auto-assesses a project to propose a description,
 * milestones, and tasks the user can review before saving. Read-only:
 * does NOT mutate the DB. Apply is a separate POST /assess/apply.
 *
 * Context gathered (token-budgeted):
 *  - Up to 30 top-level entries under `project.path` (skips node_modules,
 *    .git, .next, dist, build, .DS_Store, and obvious binaries by ext).
 *  - First 1 KB of each text file.
 *  - Last 5 sessions for the project (title, status, last 200 chars of
 *    summary).
 *  - Existing milestones + tasks (so the model avoids duplicating).
 */
import fs from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";

import {
  getProject,
  listAllTasks,
  listMilestones,
  listSessions,
  type SessionRow,
} from "@/server/db.ts";
import { extractJson, runPlanner } from "@/server/planner.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

const RAW_TRUNCATE = 16_000;
const MAX_ENTRIES = 30;
const HEAD_BYTES = 1024;
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".DS_Store",
  ".turbo",
  ".cache",
  "coverage",
  "out",
  ".vercel",
  ".idea",
  ".vscode",
]);
/** Extensions we treat as non-text and only summarise as "(binary)". */
const BINARY_EXTS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  ".tgz",
  ".bz2",
  ".7z",
  ".mp4",
  ".mov",
  ".mp3",
  ".wav",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".db",
  ".sqlite",
  ".sqlite3",
  ".bin",
  ".exe",
  ".dmg",
  ".pkg",
  ".class",
  ".jar",
]);

export type AssessProposalTask = {
  title: string;
  priority: "low" | "medium" | "high";
  milestone_idx: number | null;
};

export type AssessProposalMilestone = {
  title: string;
  due_at: string | null;
};

export type AssessProposal = {
  description: string;
  milestones: AssessProposalMilestone[];
  tasks: AssessProposalTask[];
};

type FileEntry =
  | { kind: "dir"; name: string }
  | { kind: "file"; name: string; head: string; binary: boolean };

function listProjectFiles(projectPath: string): FileEntry[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(projectPath, { withFileTypes: true });
  } catch {
    return [];
  }
  // Sort: directories first, then files; alphabetical within each.
  entries.sort((a, b) => {
    const da = a.isDirectory() ? 0 : 1;
    const db = b.isDirectory() ? 0 : 1;
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name);
  });

  const out: FileEntry[] = [];
  for (const ent of entries) {
    if (out.length >= MAX_ENTRIES) break;
    if (ent.name.startsWith(".") && SKIP_DIRS.has(ent.name)) continue;
    if (SKIP_DIRS.has(ent.name)) continue;
    if (ent.isDirectory()) {
      out.push({ kind: "dir", name: ent.name });
      continue;
    }
    if (!ent.isFile()) continue;
    const ext = path.extname(ent.name).toLowerCase();
    if (BINARY_EXTS.has(ext)) {
      out.push({ kind: "file", name: ent.name, head: "", binary: true });
      continue;
    }
    const abs = path.join(projectPath, ent.name);
    let head = "";
    let binary = false;
    try {
      const fd = fs.openSync(abs, "r");
      try {
        const buf = Buffer.alloc(HEAD_BYTES);
        const bytes = fs.readSync(fd, buf, 0, HEAD_BYTES, 0);
        const slice = buf.subarray(0, bytes);
        // crude binary detection — NUL byte in the head
        if (slice.includes(0)) {
          binary = true;
        } else {
          head = slice.toString("utf8");
        }
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      // ignore — file became unreadable
    }
    out.push({ kind: "file", name: ent.name, head, binary });
  }
  return out;
}

function summariseSession(s: SessionRow): string {
  const title = s.title?.trim() ?? "";
  const sum = s.last_event_summary?.trim() ?? "";
  const short = sum.length > 200 ? sum.slice(0, 200) + "…" : sum;
  const parts: string[] = [];
  parts.push(s.status);
  if (title) parts.push(`title="${title}"`);
  if (short) parts.push(`last="${short}"`);
  return parts.join("  ");
}

function composeAssessPrompt(args: {
  name: string;
  description: string | null;
  projectPath: string;
  files: FileEntry[];
  sessions: SessionRow[];
  existingMilestoneNames: string[];
  existingTaskTitles: string[];
}): string {
  const fileLines: string[] = [];
  for (const f of args.files) {
    if (f.kind === "dir") {
      fileLines.push(`- ${f.name}/  (directory)`);
      continue;
    }
    if (f.binary) {
      fileLines.push(`- ${f.name}  (binary)`);
      continue;
    }
    const head = f.head
      .replace(/\r/g, "")
      .split("\n")
      .slice(0, 20)
      .join("\n")
      .trim();
    fileLines.push(`- ${f.name}\n\`\`\`\n${head}\n\`\`\``);
  }
  const sessionLines =
    args.sessions.length === 0
      ? "(no recent sessions)"
      : args.sessions
          .slice(0, 5)
          .map((s, i) => `${i + 1}. ${summariseSession(s)}`)
          .join("\n");

  const msNames =
    args.existingMilestoneNames.length === 0
      ? "(none)"
      : args.existingMilestoneNames.map((n) => `"${n}"`).join(", ");
  const taskSamples =
    args.existingTaskTitles.length === 0
      ? "(none)"
      : args.existingTaskTitles
          .slice(0, 10)
          .map((t) => `"${t}"`)
          .join(", ");

  return [
    `You are an expert project assessor. Read the project context and propose a 1-2 sentence description, a few milestones, and a handful of starter tasks for the user to review.`,
    ``,
    `# Project`,
    `- Name: ${args.name}`,
    `- Path: ${args.projectPath}`,
    `- Current description: ${args.description ?? "(none)"}`,
    `- Existing milestones (AVOID duplicating): ${msNames}`,
    `- Existing task samples (AVOID duplicating): ${taskSamples}`,
    ``,
    `# Top-level files / directories`,
    fileLines.length > 0 ? fileLines.join("\n") : "(empty / unreadable directory)",
    ``,
    `# Recent sessions (most recent first)`,
    sessionLines,
    ``,
    `# Output requirements`,
    `Respond with VALID JSON ONLY. No prose, no markdown fences. Schema:`,
    `{`,
    `  "description": string,           // 1-2 sentence project description`,
    `  "milestones": [                   // 2-5 milestones, ordered earliest first`,
    `    { "title": string, "due_at": string | null }   // due_at is ISO YYYY-MM-DD or null`,
    `  ],`,
    `  "tasks": [                        // 3-10 starter tasks`,
    `    {`,
    `      "title": string,`,
    `      "priority": "low" | "medium" | "high",`,
    `      "milestone_idx": number | null    // 0-based index into milestones, or null`,
    `    }`,
    `  ]`,
    `}`,
    ``,
    `Rules:`,
    `- Do NOT duplicate existing milestones or task titles listed above.`,
    `- If the project looks empty, propose discovery/scaffolding tasks.`,
    `- Keep titles short and action-oriented.`,
    `- Start your response with \`{\`.`,
  ].join("\n");
}

const STRICT_PREAMBLE =
  "Your previous response was not valid JSON. Respond with VALID JSON ONLY, matching the exact schema given. Do not include any text before or after the JSON object. Do not wrap it in markdown code fences. Start your response with `{`.\n\n";

function normalisePriority(v: unknown): "low" | "medium" | "high" {
  if (v === "low" || v === "medium" || v === "high") return v;
  return "medium";
}

function normaliseIsoDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (!Number.isFinite(d.getTime())) return null;
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function validateAssessProposal(raw: unknown): AssessProposal | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const description =
    typeof obj.description === "string" ? obj.description.trim() : "";
  const milestonesRaw = Array.isArray(obj.milestones) ? obj.milestones : [];
  const milestones: AssessProposalMilestone[] = [];
  for (const mRaw of milestonesRaw) {
    if (!mRaw || typeof mRaw !== "object") continue;
    const m = mRaw as Record<string, unknown>;
    const title = typeof m.title === "string" ? m.title.trim() : "";
    if (!title) continue;
    milestones.push({
      title,
      due_at: normaliseIsoDate(m.due_at),
    });
  }
  const tasksRaw = Array.isArray(obj.tasks) ? obj.tasks : [];
  const tasks: AssessProposalTask[] = [];
  for (const tRaw of tasksRaw) {
    if (!tRaw || typeof tRaw !== "object") continue;
    const t = tRaw as Record<string, unknown>;
    const title = typeof t.title === "string" ? t.title.trim() : "";
    if (!title) continue;
    let milestoneIdx: number | null = null;
    if (typeof t.milestone_idx === "number" && Number.isInteger(t.milestone_idx)) {
      if (t.milestone_idx >= 0 && t.milestone_idx < milestones.length) {
        milestoneIdx = t.milestone_idx;
      }
    }
    tasks.push({
      title,
      priority: normalisePriority(t.priority),
      milestone_idx: milestoneIdx,
    });
  }
  if (!description && milestones.length === 0 && tasks.length === 0) return null;
  return { description, milestones, tasks };
}

export async function POST(
  _request: NextRequest,
  ctx: RouteCtx,
): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  const project = getProject(id);
  if (!project) {
    return Response.json({ error: "project not found" }, { status: 404 });
  }

  const files = listProjectFiles(project.path);
  const sessions = listSessions({ project_id: id, limit: 5 });
  const existingMilestones = listMilestones({ project_id: id });
  const existingTasks = listAllTasks({ project_id: id });

  const prompt = composeAssessPrompt({
    name: project.name,
    description: project.description,
    projectPath: project.path,
    files,
    sessions,
    existingMilestoneNames: existingMilestones.map((m) => m.name),
    existingTaskTitles: existingTasks.map((t) => t.title),
  });

  // Use the project's working directory so the planner's relative-path
  // operations (if any) land in the right place. Fall back to a temp dir
  // if the project path is unreadable.
  let cwd = project.path;
  try {
    fs.accessSync(cwd, fs.constants.R_OK);
  } catch {
    cwd = process.cwd();
  }

  const first = await runPlanner(prompt, cwd);
  if (first.kind === "missing") {
    return Response.json(
      { error: `${first.cli} CLI not found`, install_hint: first.installHint },
      { status: 503 },
    );
  }
  if (first.kind === "timeout") {
    return Response.json(
      { error: "Assess timed out. Try again or simplify the project." },
      { status: 504 },
    );
  }
  if (first.kind === "empty") {
    return Response.json(
      {
        error: `${first.cli} returned no output. Make sure you're logged in to the ${first.cli} CLI.`,
      },
      { status: 500 },
    );
  }
  if (first.kind === "error") {
    return Response.json(
      { error: `${first.cli} failed: ${first.message}` },
      { status: 500 },
    );
  }

  let proposal = validateAssessProposal(extractJson(first.stdout));
  let combinedRaw = first.stdout;

  if (!proposal) {
    const second = await runPlanner(`${STRICT_PREAMBLE}${prompt}`, cwd, first.cli);
    if (second.kind === "ok") {
      combinedRaw = `${first.stdout}\n--- retry ---\n${second.stdout}`;
      proposal = validateAssessProposal(extractJson(second.stdout));
    } else if (second.kind === "timeout") {
      return Response.json(
        { error: "Assess timed out on retry." },
        { status: 504 },
      );
    } else if (second.kind === "missing") {
      return Response.json(
        { error: `${second.cli} CLI not found`, install_hint: second.installHint },
        { status: 503 },
      );
    }
  }

  if (!proposal) {
    return Response.json({
      ok: false,
      error: `Could not parse assessment from ${first.cli}'s response`,
      raw: combinedRaw.slice(0, RAW_TRUNCATE),
    });
  }

  return Response.json({
    ok: true,
    proposal,
    raw: combinedRaw.slice(0, RAW_TRUNCATE),
  });
}
