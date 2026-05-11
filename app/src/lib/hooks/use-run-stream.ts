"use client";
/**
 * useRunStream — subscribe to a single run's SSE feed.
 *
 * Opens EventSource on /api/runs/[id]/stream. Returns the running list of
 * events (in arrival order), terminal status, accumulated assistant text,
 * cost, duration and whether the run is done. Closes the SSE on unmount or
 * once the 'done' event arrives.
 */
import { useEffect, useRef, useState } from "react";

export type RunEventType =
  | "system"
  | "assistant_text"
  | "tool_use"
  | "tool_result"
  | "result"
  | "error"
  | "done";

export type RunEvent = {
  type: RunEventType;
  ts: number;
  payload: any;
};

export type RunStreamState = {
  events: RunEvent[];
  status: "running" | "success" | "error" | "idle";
  result_summary: string | null;
  cost: number;
  durationMs: number | null;
  error: string | null;
  done: boolean;
};

const INITIAL: RunStreamState = {
  events: [],
  status: "idle",
  result_summary: null,
  cost: 0,
  durationMs: null,
  error: null,
  done: false,
};

export function useRunStream(runId: string | null | undefined): RunStreamState {
  const [state, setState] = useState<RunStreamState>(INITIAL);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!runId) {
      setState(INITIAL);
      return;
    }
    setState({ ...INITIAL, status: "running" });
    seqRef.current = 0;
    let cancelled = false;
    let es: EventSource | null = null;

    const push = (ev: RunEvent) => {
      if (cancelled) return;
      setState((prev) => {
        const next: RunStreamState = { ...prev, events: [...prev.events, ev] };
        if (ev.type === "result") {
          if (typeof ev.payload?.cost_usd === "number") next.cost = ev.payload.cost_usd;
          if (typeof ev.payload?.duration_ms === "number")
            next.durationMs = ev.payload.duration_ms;
          if (typeof ev.payload?.result === "string")
            next.result_summary = ev.payload.result;
          if (ev.payload?.status === "error") {
            next.status = "error";
            next.error = ev.payload?.result ?? "Run errored";
          } else if (ev.payload?.status === "success") {
            next.status = "success";
          }
        } else if (ev.type === "error") {
          next.error =
            ev.payload?.stderr ??
            ev.payload?.spawn_error ??
            ev.payload?.error ??
            (typeof ev.payload === "string" ? ev.payload : null);
        } else if (ev.type === "done") {
          next.done = true;
          if (ev.payload?.status === "error") next.status = "error";
          else if (ev.payload?.status === "success") next.status = "success";
        }
        return next;
      });
    };

    try {
      es = new EventSource(`/api/runs/${encodeURIComponent(runId)}/stream`);

      const types: RunEventType[] = [
        "system",
        "assistant_text",
        "tool_use",
        "tool_result",
        "result",
        "error",
        "done",
      ];

      for (const t of types) {
        es.addEventListener(t, (raw) => {
          if (cancelled) return;
          let parsed: any;
          try {
            parsed = JSON.parse((raw as MessageEvent).data);
          } catch {
            return;
          }
          push({
            type: t,
            ts: typeof parsed?.ts === "number" ? parsed.ts : Date.now(),
            payload: parsed?.payload ?? parsed,
          });
          if (t === "done" && es) {
            es.close();
            es = null;
          }
        });
      }

      // Fallback for unnamed messages.
      es.onmessage = (raw) => {
        if (cancelled) return;
        try {
          const parsed = JSON.parse(raw.data);
          if (parsed?.type) {
            push({
              type: parsed.type,
              ts: typeof parsed?.ts === "number" ? parsed.ts : Date.now(),
              payload: parsed?.payload ?? parsed,
            });
            if (parsed.type === "done" && es) {
              es.close();
              es = null;
            }
          }
        } catch {
          // ignore
        }
      };

      es.onerror = () => {
        // Browsers auto-reconnect on transient errors; do nothing.
      };
    } catch (err) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      }));
    }

    return () => {
      cancelled = true;
      if (es) es.close();
    };
  }, [runId]);

  return state;
}
