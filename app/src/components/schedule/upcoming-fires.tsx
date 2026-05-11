"use client";
/**
 * UpcomingFires — chronological preview of the next time each enabled cron
 * task will fire, scoped to the next 24 hours.
 *
 * The cron parser here is deliberately small. node-cron is server-side and
 * we only need a UI preview, so we manually compute "next fire" for the
 * presets the picker emits plus a couple of obvious shapes:
 *
 *   - Every N minutes               */ /* /N * * * *
 *   - Hourly                        0 * * * *
 *   - Every N hours                 M */ /* /N * * *
 *   - Daily at H[:M]                M H * * *
 *   - Weekdays at H[:M]             M H * * 1-5
 *   - Weekly on day D at H[:M]      M H * * D       (D = 0..6)
 *
 * Anything else falls through to `null` and the row shows "Custom" with the
 * raw cron string so users still know the task is scheduled — we just don't
 * promise a countdown.
 */
import { useEffect, useState } from "react";
import { AgentAvatar } from "@/components/shared/agent-avatar";
import { useEmployees } from "@/components/employees/employees-context";
import type { ScheduledRunRow } from "@/lib/hooks/use-scheduled-runs";
import type { Employee } from "@/lib/types";

export type UpcomingFiresProps = {
  runs: ScheduledRunRow[];
};

const HORIZON_MS = 24 * 60 * 60 * 1000;
const TICK_MS = 30_000;

function titleFor(run: ScheduledRunRow): string {
  return (run.human_label && run.human_label.trim()) || run.id;
}

export function UpcomingFires({ runs }: UpcomingFiresProps) {
  const { employees } = useEmployees();
  const [now, setNow] = useState(() => Date.now());

  // Re-tick every 30s so the "fires in" labels stay fresh without a refetch.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const employeeById = new Map(employees.map((e) => [e.id, e]));

  const enabled = runs.filter(
    (t) =>
      t.enabled === 1 &&
      typeof t.schedule_cron === "string" &&
      t.schedule_cron.trim() !== "",
  );

  type RowData = {
    run: ScheduledRunRow;
    employee: Employee | undefined;
    nextFire: number | null;
    deltaMs: number | null;
  };

  const rows: RowData[] = enabled.map((run) => {
    const next = computeNextFire(run.schedule_cron ?? "", now);
    return {
      run,
      employee: run.employee_id
        ? employeeById.get(run.employee_id)
        : undefined,
      nextFire: next,
      deltaMs: next === null ? null : next - now,
    };
  });

  // Order: known next-fires (within horizon) first, ascending; then "Custom"
  // rows at the bottom; rows beyond the 24h horizon are dropped.
  const dated = rows
    .filter((r) => r.deltaMs !== null && r.deltaMs <= HORIZON_MS)
    .sort((a, b) => (a.deltaMs ?? 0) - (b.deltaMs ?? 0));
  const custom = rows.filter((r) => r.deltaMs === null);

  if (enabled.length === 0) {
    return (
      <div className="card-surface px-4 py-8 text-center">
        <div className="text-sm font-medium text-primary">
          No upcoming fires
        </div>
        <p className="mt-1 text-xs text-muted">
          Enable a scheduled task above to start autonomy.
        </p>
      </div>
    );
  }

  if (dated.length === 0 && custom.length === 0) {
    return (
      <div className="card-surface px-4 py-8 text-center text-xs text-muted">
        No tasks fire in the next 24 hours.
      </div>
    );
  }

  return (
    <div className="card-surface divide-y divide-subtle overflow-hidden">
      {dated.map(({ run, employee, deltaMs }) => (
        <Row
          key={run.id}
          run={run}
          employee={employee}
          deltaLabel={deltaMs === null ? null : formatDelta(deltaMs)}
        />
      ))}
      {custom.map(({ run, employee }) => (
        <Row
          key={run.id}
          run={run}
          employee={employee}
          deltaLabel={null}
          customLabel="Custom"
        />
      ))}
    </div>
  );
}

function Row({
  run,
  employee,
  deltaLabel,
  customLabel,
}: {
  run: ScheduledRunRow;
  employee: Employee | undefined;
  deltaLabel: string | null;
  customLabel?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      {employee ? (
        <AgentAvatar
          value={employee.avatar}
          name={employee.name}
          size={26}
          accent={employee.accent}
        />
      ) : (
        <div className="size-[26px] shrink-0 rounded-full bg-surface-muted" />
      )}
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-xs font-semibold text-primary">
          {titleFor(run)}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted">
          <span className="truncate">{employee?.name ?? "—"}</span>
          {run.skill ? (
            <>
              <span aria-hidden>•</span>
              <span className="truncate">{run.skill}</span>
            </>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {deltaLabel ? (
          <span className="text-[11px] font-semibold text-secondary">
            {deltaLabel}
          </span>
        ) : customLabel ? (
          <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted">
            {customLabel}
          </span>
        ) : null}
        <span className="font-mono text-[10px] text-muted">
          {run.schedule_cron ?? ""}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cron → next-fire (UI-only, supports the preset set + a few obvious shapes)
// ---------------------------------------------------------------------------

/**
 * Returns the next fire timestamp (ms since epoch) at or after `now`, or
 * `null` if the expression isn't one we recognize.
 */
export function computeNextFire(expr: string, now: number): number | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, dom, mon, dow] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];

  // Only handle the unbounded-month, unbounded-day-of-month patterns the
  // preset picker emits — anything tighter falls through to "Custom".
  if (mon !== "*") return null;
  if (dom !== "*") return null;

  // Every N minutes — */N * * * *
  const minStep = parseStep(min);
  if (minStep !== null && hour === "*" && dow === "*") {
    return nextMinuteStep(now, minStep);
  }

  // Hourly variants — "M * * * *" with M a literal minute.
  if (/^\d+$/.test(min) && hour === "*" && dow === "*") {
    return nextHourlyAtMinute(now, Number(min));
  }

  // Every N hours at minute M — "M */N * * *"
  if (/^\d+$/.test(min) && dow === "*") {
    const hourStep = parseStep(hour);
    if (hourStep !== null) {
      return nextHourStep(now, Number(min), hourStep);
    }
  }

  // Specific time-of-day patterns — "M H * * <dow>"
  if (/^\d+$/.test(min) && /^\d+$/.test(hour)) {
    const m = Number(min);
    const h = Number(hour);
    if (dow === "*") return nextDailyAt(now, h, m);
    if (dow === "1-5") return nextWeekdayAt(now, h, m);
    if (/^[0-6]$/.test(dow)) return nextWeeklyAt(now, h, m, Number(dow));
  }

  return null;
}

function parseStep(seg: string): number | null {
  const m = /^\*\/(\d+)$/.exec(seg);
  if (m) {
    const n = Number(m[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (seg === "*") return 1;
  return null;
}

function nextMinuteStep(now: number, step: number): number {
  const d = new Date(now);
  d.setSeconds(0, 0);
  // Advance until the minute is divisible by step and the moment is > now.
  // (We start from "current minute" — if that's already a match but in the
  // past relative to `now`, we'll bump forward below.)
  while (d.getMinutes() % step !== 0 || d.getTime() <= now) {
    d.setMinutes(d.getMinutes() + 1);
  }
  return d.getTime();
}

function nextHourlyAtMinute(now: number, min: number): number {
  const d = new Date(now);
  d.setSeconds(0, 0);
  d.setMinutes(min);
  if (d.getTime() <= now) {
    d.setHours(d.getHours() + 1);
  }
  return d.getTime();
}

function nextHourStep(now: number, min: number, step: number): number {
  const d = new Date(now);
  d.setSeconds(0, 0);
  d.setMinutes(min);
  // Roll forward until the hour aligns with the step AND the moment is > now.
  while (d.getHours() % step !== 0 || d.getTime() <= now) {
    d.setHours(d.getHours() + 1);
    d.setMinutes(min);
  }
  return d.getTime();
}

function nextDailyAt(now: number, h: number, m: number): number {
  const d = new Date(now);
  d.setSeconds(0, 0);
  d.setHours(h, m);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function nextWeekdayAt(now: number, h: number, m: number): number {
  const d = new Date(now);
  d.setSeconds(0, 0);
  d.setHours(h, m);
  // Walk forward up to 7 days until we land on Mon–Fri AND in the future.
  for (let i = 0; i < 7; i++) {
    const dayOfWeek = d.getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5 && d.getTime() > now) {
      return d.getTime();
    }
    d.setDate(d.getDate() + 1);
    d.setHours(h, m, 0, 0);
  }
  return d.getTime();
}

function nextWeeklyAt(now: number, h: number, m: number, dow: number): number {
  const d = new Date(now);
  d.setSeconds(0, 0);
  d.setHours(h, m);
  for (let i = 0; i < 8; i++) {
    if (d.getDay() === dow && d.getTime() > now) return d.getTime();
    d.setDate(d.getDate() + 1);
    d.setHours(h, m, 0, 0);
  }
  return d.getTime();
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatDelta(ms: number): string {
  if (ms <= 0) return "now";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `in ${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `in ${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min - hr * 60;
  if (hr < 24) {
    if (remMin === 0) return `in ${hr}h`;
    return `in ${hr}h ${remMin}m`;
  }
  const days = Math.floor(hr / 24);
  return `in ${days}d`;
}
