"use client";
/**
 * useActivityFeed — global activity stream.
 *
 * 1. On mount: GET /api/runs?limit=20 to seed history (one entry per run,
 *    using its terminal status).
 * 2. Open EventSource to /api/runs/stream and merge incoming events.
 * 3. Keep at most 50 entries, newest-first.
 *
 * Each entry is a self-describing UI line. The hook also exposes a
 * `pulse` flag that flips on every new SSE event so consumers can
 * animate without re-rendering the whole list.
 */
import { useEffect, useRef, useState } from "react";

export type ActivityKind =
  | "started"
  | "tool_use"
  | "message"
  | "done"
  | "error";

export type ActivityEntry = {
  /** Stable per-event id (run_id + timestamp + index). */
  id: string;
  run_id: string;
  employee_id: string | null;
  kind: ActivityKind;
  summary: string;
  ts: number;
};

type RunRow = {
  id: string;
  employee_id: string;
  skill: string;
  input: string | null;
  status: "pending" | "running" | "success" | "error" | "cancelled";
  started_at: number;
  ended_at: number | null;
  cost_usd: number;
  duration_ms: number | null;
  result_summary: string | null;
  error: string | null;
};

const MAX_ENTRIES = 50;

function trim(s: string, n = 80): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function entryFromRunRow(r: RunRow): ActivityEntry | null {
  const base = {
    run_id: r.id,
    employee_id: r.employee_id,
    ts: r.ended_at ?? r.started_at,
  };
  if (r.status === "running" || r.status === "pending") {
    return {
      ...base,
      id: `${r.id}:started`,
      kind: "started",
      summary: `Started ${r.skill}`,
    };
  }
  if (r.status === "success") {
    const cost =
      r.cost_usd > 0 ? ` · $${r.cost_usd.toFixed(4)}` : "";
    const dur =
      r.duration_ms != null ? ` · ${Math.round(r.duration_ms / 1000)}s` : "";
    return {
      ...base,
      id: `${r.id}:done`,
      kind: "done",
      summary: `${r.skill} complete${cost}${dur}`,
    };
  }
  if (r.status === "error") {
    return {
      ...base,
      id: `${r.id}:error`,
      kind: "error",
      summary: trim(r.error ?? `${r.skill} failed`),
    };
  }
  return null;
}

function summaryFromEvent(
  type: string,
  payload: any,
): { kind: ActivityKind; summary: string } | null {
  if (type === "system") {
    if (payload?.event === "started") {
      return { kind: "started", summary: "Run started" };
    }
    // Skip stream_event partials and noise.
    return null;
  }
  if (type === "assistant_text") {
    const text = typeof payload?.text === "string" ? payload.text : "";
    if (!text.trim()) return null;
    return { kind: "message", summary: trim(text, 80) };
  }
  if (type === "tool_use") {
    const name = payload?.name ?? "tool";
    return { kind: "tool_use", summary: `Used ${name}` };
  }
  if (type === "tool_result") {
    return null; // tool_use already covers it for the feed
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
      return { kind: "error", summary: trim(payload?.result ?? "Run errored") };
    }
    return { kind: "done", summary: `Completed${cost}${dur}` };
  }
  if (type === "error") {
    const msg =
      typeof payload?.stderr === "string"
        ? payload.stderr
        : typeof payload?.spawn_error === "string"
          ? payload.spawn_error
          : typeof payload?.error === "string"
            ? payload.error
            : JSON.stringify(payload).slice(0, 80);
    return { kind: "error", summary: trim(msg) };
  }
  if (type === "done") {
    return null; // result event already added a 'done' entry
  }
  return null;
}

export function useActivityFeed() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [pulse, setPulse] = useState(0);
  const [connected, setConnected] = useState(false);
  const seqRef = useRef(0);
  // Track run_id -> employee_id learned from history so SSE entries can
  // back-fill the employee_id (the SSE payload doesn't always carry it).
  const employeeForRun = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;

    // 1) Seed from history.
    (async () => {
      try {
        const res = await fetch("/api/runs?limit=20", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { runs?: RunRow[] };
        const runs = data.runs ?? [];
        if (cancelled) return;
        const seeded: ActivityEntry[] = [];
        for (const r of runs) {
          employeeForRun.current.set(r.id, r.employee_id);
          const e = entryFromRunRow(r);
          if (e) seeded.push(e);
        }
        // newest first
        seeded.sort((a, b) => b.ts - a.ts);
        setEntries(seeded.slice(0, MAX_ENTRIES));
      } catch {
        // ignore — SSE will still populate
      }
    })();

    // 2) Live stream.
    try {
      es = new EventSource("/api/runs/stream");
      es.onopen = () => setConnected(true);
      es.onerror = () => setConnected(false);

      const handler = (type: string) => (raw: MessageEvent) => {
        if (cancelled) return;
        let parsed: any;
        try {
          parsed = JSON.parse(raw.data);
        } catch {
          return;
        }
        const runId: string | undefined = parsed?.run_id;
        const ts: number = typeof parsed?.ts === "number" ? parsed.ts : Date.now();
        const payload = parsed?.payload;
        if (!runId) return;
        // Track started → record employee if present in payload.
        if (
          type === "system" &&
          payload?.event === "started" &&
          typeof parsed?.employee_id === "string"
        ) {
          employeeForRun.current.set(runId, parsed.employee_id);
        }
        const mapped = summaryFromEvent(type, payload);
        if (!mapped) return;
        const empId = employeeForRun.current.get(runId) ?? null;
        const id = `${runId}:${ts}:${seqRef.current++}`;
        setEntries((prev) => {
          const next = [
            { id, run_id: runId, employee_id: empId, kind: mapped.kind, summary: mapped.summary, ts },
            ...prev,
          ];
          return next.slice(0, MAX_ENTRIES);
        });
        setPulse((p) => p + 1);
      };

      // The SSE protocol fires named events via addEventListener.
      const types = [
        "system",
        "assistant_text",
        "tool_use",
        "tool_result",
        "result",
        "error",
        "done",
      ] as const;
      for (const t of types) {
        es.addEventListener(t, handler(t));
      }
      // Default 'message' fallback if the server uses unnamed events.
      es.onmessage = (raw) => {
        if (cancelled) return;
        try {
          const parsed = JSON.parse(raw.data);
          if (parsed?.type) handler(parsed.type)(raw);
        } catch {
          // ignore
        }
      };
    } catch {
      // EventSource construction failed — silent.
    }

    return () => {
      cancelled = true;
      if (es) es.close();
    };
  }, []);

  return { entries, pulse, connected };
}
