/**
 * GET /api/cost
 *
 * Aggregates spend from the `runs` table and returns the dashboard payload
 * for `/cost`. Drives the KPI strip, daily-spend chart, by-agent and
 * by-skill tables, plus a vs-previous-period trend chip.
 *
 * Query:
 *   period      = today | 7d | 30d | all   (default 7d)
 *   employee_id = optional filter
 *   group_by    = agent | skill | day      (default agent — informational
 *                                            only; all three groupings are
 *                                            always returned in the payload)
 *
 * All aggregation runs in SQL (SUM / COUNT / AVG / GROUP BY). Day buckets
 * are computed in Asia/Singapore via `started_at + 8h` so the calendar
 * matches the operator's wall clock.
 *
 * 60s in-memory cache keyed on the full querystring — hot dashboard polls
 * (the page refreshes every 30s) hit the cache rather than re-scanning the
 * runs table on every request.
 */
import type { NextRequest } from "next/server";

import {
  getDb,
  listEmployees,
  type EmployeeRow,
} from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const CHART_DAYS = 30;
const CACHE_TTL_MS = 60_000;
const TOP_SKILLS = 10;

type Period = "today" | "7d" | "30d" | "all";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CostTotals = {
  runs: number;
  cost_usd: number;
  duration_ms: number;
  success: number;
  error: number;
};

export type CostByAgent = {
  employee_id: string;
  name: string;
  role: string;
  avatar_emoji: string | null;
  accent_color: string | null;
  runs: number;
  cost_usd: number;
  avg_duration_ms: number;
  success_rate: number;
};

export type CostBySkill = {
  skill: string;
  runs: number;
  cost_usd: number;
  avg_duration_ms: number;
};

export type CostByDay = {
  date: string; // YYYY-MM-DD (Asia/Singapore)
  runs: number;
  cost_usd: number;
};

export type CostStatsResponse = {
  period: { from: string; to: string; label: string };
  totals: CostTotals;
  by_agent: CostByAgent[];
  by_skill: CostBySkill[];
  by_day: CostByDay[];
  trend: {
    vs_previous_period: {
      delta_pct: number;
      direction: "up" | "down" | "flat";
    };
  };
};

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

type CacheEntry = { payload: CostStatsResponse; expires_at: number };
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): CostStatsResponse | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires_at) {
    cache.delete(key);
    return null;
  }
  return entry.payload;
}

function cacheSet(key: string, payload: CostStatsResponse): void {
  cache.set(key, { payload, expires_at: Date.now() + CACHE_TTL_MS });
}

// ---------------------------------------------------------------------------
// Period math
// ---------------------------------------------------------------------------

function startOfTodaySGT(now: number): number {
  // Floor `now` to midnight in Asia/Singapore (UTC+8, no DST).
  const shifted = now + SGT_OFFSET_MS;
  const dayStart = Math.floor(shifted / DAY_MS) * DAY_MS;
  return dayStart - SGT_OFFSET_MS;
}

function periodWindow(
  period: Period,
  now: number,
): { from: number; to: number; label: string } {
  const to = now;
  if (period === "today") {
    return { from: startOfTodaySGT(now), to, label: "Today" };
  }
  if (period === "7d") {
    return { from: now - 7 * DAY_MS, to, label: "Last 7 days" };
  }
  if (period === "30d") {
    return { from: now - 30 * DAY_MS, to, label: "Last 30 days" };
  }
  return { from: 0, to, label: "All time" };
}

/** Format a unix-ms timestamp as YYYY-MM-DD in Asia/Singapore. */
function ymdSGT(ms: number): string {
  const shifted = new Date(ms + SGT_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// SQL aggregation
// ---------------------------------------------------------------------------

type WhereClause = { sql: string; params: unknown[] };

function buildWhere(
  from: number,
  to: number,
  employeeId: string | null,
): WhereClause {
  const where: string[] = ["started_at >= ?", "started_at <= ?"];
  const params: unknown[] = [from, to];
  if (employeeId) {
    where.push("employee_id = ?");
    params.push(employeeId);
  }
  return { sql: `WHERE ${where.join(" AND ")}`, params };
}

function aggregateTotals(where: WhereClause): CostTotals {
  const row = getDb()
    .prepare(
      `SELECT
         COUNT(*) AS runs,
         COALESCE(SUM(cost_usd), 0) AS cost_usd,
         COALESCE(SUM(duration_ms), 0) AS duration_ms,
         SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success,
         SUM(CASE WHEN status = 'error'   THEN 1 ELSE 0 END) AS error
       FROM runs ${where.sql}`,
    )
    .get(...where.params) as {
    runs: number;
    cost_usd: number;
    duration_ms: number;
    success: number | null;
    error: number | null;
  };
  return {
    runs: row.runs ?? 0,
    cost_usd: Number((row.cost_usd ?? 0).toFixed(6)),
    duration_ms: row.duration_ms ?? 0,
    success: row.success ?? 0,
    error: row.error ?? 0,
  };
}

function aggregateByAgent(
  where: WhereClause,
  employees: EmployeeRow[],
): CostByAgent[] {
  const rows = getDb()
    .prepare(
      `SELECT
         employee_id,
         COUNT(*) AS runs,
         COALESCE(SUM(cost_usd), 0) AS cost_usd,
         COALESCE(AVG(duration_ms), 0) AS avg_duration_ms,
         SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success,
         SUM(CASE WHEN status IN ('success','error') THEN 1 ELSE 0 END) AS finished
       FROM runs ${where.sql}
       GROUP BY employee_id`,
    )
    .all(...where.params) as Array<{
    employee_id: string;
    runs: number;
    cost_usd: number;
    avg_duration_ms: number;
    success: number | null;
    finished: number | null;
  }>;

  const empById = new Map(employees.map((e) => [e.id, e]));
  const out: CostByAgent[] = rows.map((r) => {
    const emp = empById.get(r.employee_id);
    const finished = r.finished ?? 0;
    const success = r.success ?? 0;
    return {
      employee_id: r.employee_id,
      name: emp?.name ?? r.employee_id,
      role: emp?.role ?? "",
      avatar_emoji: emp?.avatar_emoji ?? null,
      accent_color: emp?.accent_color ?? null,
      runs: r.runs,
      cost_usd: Number(r.cost_usd.toFixed(6)),
      avg_duration_ms: Math.round(r.avg_duration_ms ?? 0),
      success_rate: finished > 0 ? Number((success / finished).toFixed(4)) : 0,
    };
  });
  out.sort((a, b) => b.cost_usd - a.cost_usd);
  return out;
}

function aggregateBySkill(where: WhereClause): CostBySkill[] {
  const rows = getDb()
    .prepare(
      `SELECT
         skill,
         COUNT(*) AS runs,
         COALESCE(SUM(cost_usd), 0) AS cost_usd,
         COALESCE(AVG(duration_ms), 0) AS avg_duration_ms
       FROM runs ${where.sql}
       GROUP BY skill
       ORDER BY cost_usd DESC
       LIMIT ?`,
    )
    .all(...where.params, TOP_SKILLS) as Array<{
    skill: string;
    runs: number;
    cost_usd: number;
    avg_duration_ms: number;
  }>;
  return rows.map((r) => ({
    skill: r.skill,
    runs: r.runs,
    cost_usd: Number(r.cost_usd.toFixed(6)),
    avg_duration_ms: Math.round(r.avg_duration_ms ?? 0),
  }));
}

/**
 * Daily series for the chart — last `CHART_DAYS` days regardless of the
 * selected period, so the chart always shows trend context. Buckets in
 * Asia/Singapore by adding 8h before flooring to YYYY-MM-DD.
 */
function aggregateByDay(employeeId: string | null, now: number): CostByDay[] {
  const earliestMs = startOfTodaySGT(now) - (CHART_DAYS - 1) * DAY_MS;
  const where: string[] = ["started_at >= ?"];
  const params: unknown[] = [earliestMs];
  if (employeeId) {
    where.push("employee_id = ?");
    params.push(employeeId);
  }

  const rows = getDb()
    .prepare(
      `SELECT
         strftime('%Y-%m-%d', (started_at + ${SGT_OFFSET_MS}) / 1000, 'unixepoch') AS date,
         COUNT(*) AS runs,
         COALESCE(SUM(cost_usd), 0) AS cost_usd
       FROM runs
       WHERE ${where.join(" AND ")}
       GROUP BY date
       ORDER BY date ASC`,
    )
    .all(...params) as Array<{
    date: string;
    runs: number;
    cost_usd: number;
  }>;

  // Backfill empty days so the chart has a continuous x-axis.
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const out: CostByDay[] = [];
  for (let i = CHART_DAYS - 1; i >= 0; i--) {
    const ts = now - i * DAY_MS;
    const date = ymdSGT(ts);
    const r = byDate.get(date);
    out.push({
      date,
      runs: r?.runs ?? 0,
      cost_usd: r ? Number(r.cost_usd.toFixed(6)) : 0,
    });
  }
  return out;
}

function previousPeriodCost(
  fromMs: number,
  toMs: number,
  employeeId: string | null,
): number {
  // Mirror the current window onto the immediately preceding span.
  const span = toMs - fromMs;
  if (span <= 0) return 0;
  const prevFrom = fromMs - span;
  const prevTo = fromMs - 1;
  const where = buildWhere(prevFrom, prevTo, employeeId);
  const row = getDb()
    .prepare(`SELECT COALESCE(SUM(cost_usd), 0) AS cost FROM runs ${where.sql}`)
    .get(...where.params) as { cost: number };
  return row.cost ?? 0;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

function parsePeriod(raw: string | null): Period {
  if (raw === "today" || raw === "7d" || raw === "30d" || raw === "all") {
    return raw;
  }
  return "7d";
}

export async function GET(request: NextRequest): Promise<Response> {
  ensureSeeded();
  const sp = request.nextUrl.searchParams;
  const period = parsePeriod(sp.get("period"));
  const employeeId = sp.get("employee_id") || null;
  // group_by is accepted but informational — payload always carries all three
  // groupings. We still echo it through cache key for response consistency.
  const groupBy = sp.get("group_by") ?? "agent";

  const cacheKey = `${period}|${employeeId ?? ""}|${groupBy}`;
  const cached = cacheGet(cacheKey);
  if (cached) return Response.json(cached);

  const now = Date.now();
  const window = periodWindow(period, now);
  const where = buildWhere(window.from, window.to, employeeId);

  const totals = aggregateTotals(where);
  const byAgent = aggregateByAgent(where, listEmployees());
  const bySkill = aggregateBySkill(where);
  const byDay = aggregateByDay(employeeId, now);

  // Trend vs the previous identical-length window. "all" has no prior window
  // so we report a flat trend.
  let deltaPct = 0;
  let direction: "up" | "down" | "flat" = "flat";
  if (period !== "all") {
    const prevCost = previousPeriodCost(window.from, window.to, employeeId);
    if (prevCost > 0) {
      deltaPct = Number(
        (((totals.cost_usd - prevCost) / prevCost) * 100).toFixed(1),
      );
      if (deltaPct > 0.5) direction = "up";
      else if (deltaPct < -0.5) direction = "down";
      else direction = "flat";
    } else if (totals.cost_usd > 0) {
      deltaPct = 100;
      direction = "up";
    }
  }

  const payload: CostStatsResponse = {
    period: {
      from: new Date(window.from).toISOString(),
      to: new Date(window.to).toISOString(),
      label: window.label,
    },
    totals,
    by_agent: byAgent,
    by_skill: bySkill,
    by_day: byDay,
    trend: {
      vs_previous_period: { delta_pct: deltaPct, direction },
    },
  };

  cacheSet(cacheKey, payload);
  return Response.json(payload);
}
