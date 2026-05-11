/**
 * GET  /api/runs?employee_id=&limit=     → { runs: RunRow[] }
 * GET  /api/runs?stats=1&from=&to=&employee_id=
 *                                         → { stats: RunStats }
 *      If stats=1 is combined with list params, the response includes both
 *      `runs` and `stats` keys.
 * POST /api/runs                          → start a run, returns { run_id } 202
 *
 * Wave 2A. Stats mode added in Wave 1 (this commit).
 */
import type { NextRequest } from "next/server";

import { listRuns, getRunStats, type RunStatsFilters } from "@/server/db.ts";
import { startRun } from "@/server/agent-runner.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badRequest(msg: string): Response {
  return Response.json({ error: msg }, { status: 400 });
}

function parseDate(raw: string | null, label: string): Date | undefined | Response {
  if (!raw) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    return badRequest(`${label} must be a valid ISO date`);
  }
  return d;
}

export async function GET(request: NextRequest): Promise<Response> {
  ensureSeeded();
  const sp = request.nextUrl.searchParams;
  const employee_id = sp.get("employee_id") ?? undefined;
  const wantsStats = sp.get("stats") === "1";
  // The list portion is requested when stats is not set, OR when an explicit
  // list-shaped param (limit) is also provided alongside stats.
  const wantsList = !wantsStats || sp.has("limit");

  const out: Record<string, unknown> = {};

  if (wantsList) {
    const limitRaw = sp.get("limit");
    let limit = 20;
    if (limitRaw !== null) {
      const n = Number(limitRaw);
      if (!Number.isFinite(n) || n <= 0) return badRequest("limit must be positive");
      limit = Math.min(500, Math.floor(n));
    }
    out.runs = listRuns({ employee_id, limit });
  }

  if (wantsStats) {
    const fromResult = parseDate(sp.get("from"), "from");
    if (fromResult instanceof Response) return fromResult;
    const toResult = parseDate(sp.get("to"), "to");
    if (toResult instanceof Response) return toResult;
    const filters: RunStatsFilters = {};
    if (fromResult) filters.from = fromResult;
    if (toResult) filters.to = toResult;
    if (employee_id) filters.employee_id = employee_id;
    out.stats = getRunStats(filters);
  }

  return Response.json(out);
}

type StartBody = {
  employee_id?: string;
  skill?: string;
  input?: string | null;
  thread_id?: string | null;
  project_id?: string | null;
};

export async function POST(request: Request): Promise<Response> {
  ensureSeeded();
  let body: StartBody;
  try {
    body = (await request.json()) as StartBody;
  } catch {
    return badRequest("invalid JSON body");
  }
  if (!body || typeof body !== "object") return badRequest("body must be object");
  if (typeof body.employee_id !== "string" || !body.employee_id.trim()) {
    return badRequest("employee_id (string) required");
  }
  if (typeof body.skill !== "string" || !body.skill.trim()) {
    return badRequest("skill (string) required");
  }
  if (
    body.input !== undefined &&
    body.input !== null &&
    typeof body.input !== "string"
  ) {
    return badRequest("input must be string|null");
  }
  if (
    body.thread_id !== undefined &&
    body.thread_id !== null &&
    typeof body.thread_id !== "string"
  ) {
    return badRequest("thread_id must be string|null");
  }
  if (
    body.project_id !== undefined &&
    body.project_id !== null &&
    typeof body.project_id !== "string"
  ) {
    return badRequest("project_id must be string|null");
  }

  try {
    const { runId } = await startRun({
      employeeId: body.employee_id,
      skill: body.skill,
      input: body.input ?? null,
      threadId: body.thread_id ?? null,
      projectId: body.project_id ?? null,
    });
    return Response.json({ run_id: runId }, { status: 202 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 400 });
  }
}
