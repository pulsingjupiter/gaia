"use client";
/**
 * useActivityUnified — single chronological feed across:
 *   • Agent runs (in-Gaia invocations) from /api/runs + /api/runs/stream
 *   • Claude Code sessions (external transcripts) from /api/sessions + /api/sessions/stream
 *
 * Wave 2D (Activity page).
 *
 * Design notes:
 * 1. On mount: parallel-fetch /api/runs?limit=100 and /api/sessions?limit=100
 *    to seed history. Each row is mapped to the unified `ActivityEntry`.
 * 2. Two EventSource streams are opened side-by-side. New events are
 *    converted to `ActivityEntry` and prepended (newest first).
 * 3. The list is capped at 200 entries; older rows fall off.
 * 4. Filters live inside the hook so callers can flip them without round-
 *    tripping through React state higher up the tree.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ---- Types ----

export type ActivityKind = "run" | "session_event";

export type ActivityEntryRun = {
  kind: "run";
  /** Stable id: run_id + ":" + ts. */
  id: string;
  ts: number;
  /** The underlying run id — used by the LiveRunDrawer. */
  run_id: string;
  employee_id: string | null;
  project_id: null;
  /** Lower-case verb buckets we render: started/done/error/tool/message. */
  type: "started" | "done" | "error" | "tool" | "message";
  /** Status of the run as a whole at the moment of this entry. */
  status: "running" | "success" | "error" | null;
  summary: string;
  cost?: number;
  duration?: number;
  raw: unknown;
};

export type ActivityEntrySession = {
  kind: "session_event";
  id: string;
  ts: number;
  run_id: null;
  employee_id: null;
  project_id: string;
  /** SSE event type tail e.g. 'start', 'tool_use', 'end', 'assistant_text'. */
  type: string;
  /** Mapped session status when known. */
  status: "active" | "idle" | "ended" | null;
  /** The session id this event belongs to — used to deep-link. */
  session_id: string;
  summary: string;
  cost?: number;
  duration?: number;
  raw: unknown;
};

export type ActivityEntry = ActivityEntryRun | ActivityEntrySession;

export type ActivityTab = "all" | "runs" | "sessions";
export type DatePreset = "today" | "7d" | "30d" | "all";

export type ActivityFilters = {
  tab: ActivityTab;
  /** Selected project ids. Empty = all. */
  projectIds: string[];
  /** Selected employee ids. Empty = all. */
  employeeIds: string[];
  /** Status whitelist. Empty = all. */
  statuses: string[];
  date: DatePreset;
};

export type UseActivityUnified = {
  entries: ActivityEntry[];
  loading: boolean;
  connected: boolean;
  filters: ActivityFilters;
  setFilters: (
    next: ActivityFilters | ((prev: ActivityFilters) => ActivityFilters),
  ) => void;
};

// ---- Internal types from API ----

type RunRow = {
  id: string;
  employee_id: string;
  skill: string;
  status: "pending" | "running" | "success" | "error" | "cancelled";
  started_at: number;
  ended_at: number | null;
  cost_usd: number;
  duration_ms: number | null;
  result_summary: string | null;
  error: string | null;
};

type SessionRow = {
  id: string;
  project_id: string;
  status: "active" | "idle" | "ended";
  started_at: number;
  last_event_at: number;
  ended_at: number | null;
  total_cost_usd: number;
  num_messages: number;
  num_tool_uses: number;
  last_event_type: string | null;
  last_event_summary: string | null;
  last_tool: string | null;
  title: string | null;
};

const MAX_ENTRIES = 200;

const DEFAULT_FILTERS: ActivityFilters = {
  tab: "all",
  projectIds: [],
  employeeIds: [],
  statuses: [],
  date: "7d",
};

// ---- Helpers ----

function trim(s: string, n = 100): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function entryFromRunRow(r: RunRow): ActivityEntryRun {
  const ts = r.ended_at ?? r.started_at;
  let type: ActivityEntryRun["type"] = "started";
  let status: ActivityEntryRun["status"] = "running";
  let summary = `Started ${r.skill}`;
  if (r.status === "success") {
    type = "done";
    status = "success";
    const cost = r.cost_usd > 0 ? ` · $${r.cost_usd.toFixed(4)}` : "";
    const dur =
      r.duration_ms != null ? ` · ${Math.round(r.duration_ms / 1000)}s` : "";
    summary = `${r.skill} complete${cost}${dur}`;
  } else if (r.status === "error" || r.status === "cancelled") {
    type = "error";
    status = "error";
    summary = trim(r.error ?? `${r.skill} ${r.status}`);
  } else {
    type = "started";
    status = "running";
    summary = `Started ${r.skill}`;
  }
  return {
    kind: "run",
    id: `${r.id}:${ts}`,
    ts,
    run_id: r.id,
    employee_id: r.employee_id,
    project_id: null,
    type,
    status,
    summary,
    cost: r.cost_usd ?? 0,
    duration: r.duration_ms ?? undefined,
    raw: r,
  };
}

function entryFromSessionRow(s: SessionRow): ActivityEntrySession {
  const ts = s.last_event_at ?? s.started_at;
  const summary =
    s.last_event_summary ??
    (s.last_tool ? `Tool: ${s.last_tool}` : s.status === "active" ? "Active" : "Idle");
  return {
    kind: "session_event",
    id: `${s.id}:${ts}`,
    ts,
    run_id: null,
    employee_id: null,
    project_id: s.project_id,
    type: s.last_event_type ?? "session",
    status: s.status,
    session_id: s.id,
    summary: trim(summary),
    cost: s.total_cost_usd,
    raw: s,
  };
}

function summaryFromRunEvent(
  type: string,
  payload: any,
): { kind: ActivityEntryRun["type"]; summary: string; status: ActivityEntryRun["status"] } | null {
  if (type === "system") {
    if (payload?.event === "started") {
      return { kind: "started", summary: "Run started", status: "running" };
    }
    return null;
  }
  if (type === "assistant_text") {
    const text = typeof payload?.text === "string" ? payload.text : "";
    if (!text.trim()) return null;
    return { kind: "message", summary: trim(text, 100), status: "running" };
  }
  if (type === "tool_use") {
    const name = payload?.name ?? "tool";
    return { kind: "tool", summary: `Used ${name}`, status: "running" };
  }
  if (type === "tool_result") {
    return null;
  }
  if (type === "result") {
    const cost =
      typeof payload?.cost_usd === "number" && payload.cost_usd > 0
        ? ` · $${payload.cost_usd.toFixed(4)}`
        : "";
    const dur =
      typeof payload?.duration_ms === "number"
        ? ` · ${Math.round(payload.duration_ms / 1000)}s`
        : "";
    if (payload?.status === "error") {
      return { kind: "error", summary: trim(payload?.result ?? "Run errored"), status: "error" };
    }
    return { kind: "done", summary: `Completed${cost}${dur}`, status: "success" };
  }
  if (type === "error") {
    const msg =
      typeof payload?.stderr === "string"
        ? payload.stderr
        : typeof payload?.spawn_error === "string"
          ? payload.spawn_error
          : typeof payload?.error === "string"
            ? payload.error
            : "Run errored";
    return { kind: "error", summary: trim(msg), status: "error" };
  }
  return null;
}

function dateBoundary(preset: DatePreset): number | null {
  const now = Date.now();
  if (preset === "today") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (preset === "7d") return now - 7 * 24 * 60 * 60 * 1000;
  if (preset === "30d") return now - 30 * 24 * 60 * 60 * 1000;
  return null;
}

function applyFilters(
  entries: ActivityEntry[],
  filters: ActivityFilters,
): ActivityEntry[] {
  const cutoff = dateBoundary(filters.date);
  return entries.filter((e) => {
    if (cutoff != null && e.ts < cutoff) return false;
    if (filters.tab === "runs" && e.kind !== "run") return false;
    if (filters.tab === "sessions" && e.kind !== "session_event") return false;
    if (filters.projectIds.length > 0) {
      if (e.kind === "run") return false;
      if (!filters.projectIds.includes(e.project_id)) return false;
    }
    if (filters.employeeIds.length > 0) {
      if (e.kind !== "run") return false;
      if (!e.employee_id || !filters.employeeIds.includes(e.employee_id)) return false;
    }
    if (filters.statuses.length > 0) {
      const s = e.status ?? "";
      if (!filters.statuses.includes(s)) return false;
    }
    return true;
  });
}

// ---- Hook ----

export function useActivityUnified(): UseActivityUnified {
  const [allEntries, setAllEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [runsConnected, setRunsConnected] = useState(false);
  const [sessionsConnected, setSessionsConnected] = useState(false);
  const [filters, setFiltersState] = useState<ActivityFilters>(DEFAULT_FILTERS);

  // Track run_id -> employee_id learned from history so SSE entries can
  // back-fill the employee. The runs SSE payloads do not always carry it.
  const employeeForRun = useRef<Map<string, string>>(new Map());
  // Dedup key set so SSE replays / overlap with seed don't double-count.
  const seenIds = useRef<Set<string>>(new Set());
  const seqRef = useRef(0);

  const insert = useCallback((entry: ActivityEntry) => {
    if (seenIds.current.has(entry.id)) return;
    seenIds.current.add(entry.id);
    if (seenIds.current.size > MAX_ENTRIES * 4) {
      const arr = Array.from(seenIds.current);
      seenIds.current = new Set(arr.slice(arr.length - MAX_ENTRIES * 2));
    }
    setAllEntries((prev) => {
      const next = [entry, ...prev];
      next.sort((a, b) => b.ts - a.ts);
      return next.slice(0, MAX_ENTRIES);
    });
  }, []);

  // Initial fetch (parallel).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [runsRes, sessionsRes] = await Promise.all([
          fetch("/api/runs?limit=100", { cache: "no-store" }),
          fetch("/api/sessions?limit=100", { cache: "no-store" }),
        ]);
        if (cancelled) return;
        const seeded: ActivityEntry[] = [];
        if (runsRes.ok) {
          const data = (await runsRes.json()) as { runs?: RunRow[] };
          for (const r of data.runs ?? []) {
            employeeForRun.current.set(r.id, r.employee_id);
            const e = entryFromRunRow(r);
            seenIds.current.add(e.id);
            seeded.push(e);
          }
        }
        if (sessionsRes.ok) {
          const data = (await sessionsRes.json()) as { sessions?: SessionRow[] };
          for (const s of data.sessions ?? []) {
            const e = entryFromSessionRow(s);
            seenIds.current.add(e.id);
            seeded.push(e);
          }
        }
        seeded.sort((a, b) => b.ts - a.ts);
        if (cancelled) return;
        setAllEntries(seeded.slice(0, MAX_ENTRIES));
      } catch {
        // ignore — SSE will populate
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Runs SSE.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/runs/stream");
      es.onopen = () => !cancelled && setRunsConnected(true);
      es.onerror = () => !cancelled && setRunsConnected(false);

      const onEvt = (type: string) => (raw: MessageEvent) => {
        if (cancelled) return;
        let parsed: any;
        try {
          parsed = JSON.parse(raw.data);
        } catch {
          return;
        }
        const runId: string | undefined = parsed?.run_id;
        if (!runId) return;
        const ts: number = typeof parsed?.ts === "number" ? parsed.ts : Date.now();
        const payload = parsed?.payload;
        if (
          type === "system" &&
          payload?.event === "started" &&
          typeof parsed?.employee_id === "string"
        ) {
          employeeForRun.current.set(runId, parsed.employee_id);
        }
        const mapped = summaryFromRunEvent(type, payload);
        if (!mapped) return;
        const empId = employeeForRun.current.get(runId) ?? null;
        const id = `${runId}:${ts}:${seqRef.current++}`;
        insert({
          kind: "run",
          id,
          ts,
          run_id: runId,
          employee_id: empId,
          project_id: null,
          type: mapped.kind,
          status: mapped.status,
          summary: mapped.summary,
          cost: typeof payload?.cost_usd === "number" ? payload.cost_usd : undefined,
          duration:
            typeof payload?.duration_ms === "number" ? payload.duration_ms : undefined,
          raw: parsed,
        });
      };

      const types = [
        "system",
        "assistant_text",
        "tool_use",
        "tool_result",
        "result",
        "error",
        "done",
      ] as const;
      for (const t of types) es.addEventListener(t, onEvt(t));
      es.onmessage = (raw) => {
        if (cancelled) return;
        try {
          const parsed = JSON.parse(raw.data);
          if (parsed?.type) onEvt(parsed.type)(raw);
        } catch {
          // ignore
        }
      };
    } catch {
      // EventSource construction failed
    }
    return () => {
      cancelled = true;
      if (es) es.close();
    };
  }, [insert]);

  // Sessions SSE.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/sessions/stream");
      es.onopen = () => !cancelled && setSessionsConnected(true);
      es.onerror = () => !cancelled && setSessionsConnected(false);

      const onEvt = (type: string) => (raw: MessageEvent) => {
        if (cancelled) return;
        let parsed: any;
        try {
          parsed = JSON.parse(raw.data);
        } catch {
          return;
        }
        if (typeof parsed?.session_id !== "string") return;
        const ts: number = typeof parsed?.ts === "number" ? parsed.ts : Date.now();
        const projectId =
          typeof parsed?.project_id === "string" ? parsed.project_id : "";
        const summary =
          typeof parsed?.summary === "string" && parsed.summary.length > 0
            ? parsed.summary
            : type.replace(/^session:/, "");
        // Map event subtype to a status hint.
        let status: ActivityEntrySession["status"] = null;
        if (type === "session:start") status = "active";
        else if (type === "session:end") status = "ended";
        else if (type === "session:error") status = "ended";
        else if (type === "session:any" || type === "session:assistant_text") status = "active";

        const id = `${parsed.session_id}:${ts}:${seqRef.current++}`;
        insert({
          kind: "session_event",
          id,
          ts,
          run_id: null,
          employee_id: null,
          project_id: projectId,
          type: type.replace(/^session:/, ""),
          status,
          session_id: parsed.session_id,
          summary: trim(summary),
          raw: parsed,
        });
      };

      const types = [
        "session:any",
        "session:start",
        "session:assistant_text",
        "session:tool_use",
        "session:tool_result",
        "session:end",
        "session:error",
      ] as const;
      for (const t of types) es.addEventListener(t, onEvt(t));
      es.onmessage = (raw) => onEvt("message")(raw as MessageEvent);
    } catch {
      // ignore
    }
    return () => {
      cancelled = true;
      if (es) es.close();
    };
  }, [insert]);

  const setFilters: UseActivityUnified["setFilters"] = useCallback((next) => {
    setFiltersState((prev) => (typeof next === "function" ? next(prev) : next));
  }, []);

  const filtered = useMemo(() => applyFilters(allEntries, filters), [allEntries, filters]);

  return {
    entries: filtered,
    loading,
    connected: runsConnected || sessionsConnected,
    filters,
    setFilters,
  };
}
