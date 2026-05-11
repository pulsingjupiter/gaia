"use client";
/**
 * useSessionStream — global SSE subscriber for /api/sessions/stream.
 *
 * Each frame from the server is shaped:
 *   event: <type>     // e.g. "session:any" or a specific session event type
 *   data: { session_id, project_id, ts, summary, payload }
 *
 * The hook keeps the last 100 events (newest last), reports connection state,
 * and tears down the EventSource cleanly on unmount.
 *
 * Designed to be called at most once per page (e.g. by `/projects` and
 * `/activity` independently). Callers can derive per-project filtering off
 * the returned events list — we do not maintain per-project subscriptions
 * server-side.
 */
import { useEffect, useRef, useState } from "react";

export type SessionStreamEvent = {
  type: string;
  session_id: string;
  project_id: string;
  ts: number;
  summary: string | null;
  payload: unknown;
};

export type UseSessionStream = {
  events: SessionStreamEvent[];
  connected: boolean;
  lastEventAt: number | null;
};

const MAX_EVENTS = 100;

// All event names emitted by the server as a SessionBusPayload. We listen to
// each individually because EventSource only fires `onmessage` when no
// `event:` field is provided.
const KNOWN_EVENT_TYPES = [
  "session:any",
  "session:start",
  "session:assistant_text",
  "session:tool_use",
  "session:tool_result",
  "session:end",
  "session:error",
];

export function useSessionStream(): UseSessionStream {
  const [events, setEvents] = useState<SessionStreamEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    let es: EventSource | null = null;

    const push = (type: string, raw: MessageEvent) => {
      if (cancelled) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.data);
      } catch {
        return;
      }
      const data = parsed as Partial<SessionStreamEvent> | null;
      if (!data || typeof data.session_id !== "string") return;
      const ts = typeof data.ts === "number" ? data.ts : Date.now();
      // Dedup: same session+ts+type usually means session:any + specific
      // event for the same record. Keep both (caller may want either) but
      // use a key to avoid re-pushing on listener cross-fire.
      const key = `${type}|${data.session_id}|${ts}`;
      if (seenRef.current.has(key)) return;
      seenRef.current.add(key);
      // Trim seen set occasionally so it doesn't grow forever.
      if (seenRef.current.size > MAX_EVENTS * 4) {
        const arr = Array.from(seenRef.current);
        seenRef.current = new Set(arr.slice(arr.length - MAX_EVENTS * 2));
      }

      const ev: SessionStreamEvent = {
        type,
        session_id: data.session_id,
        project_id: typeof data.project_id === "string" ? data.project_id : "",
        ts,
        summary: typeof data.summary === "string" ? data.summary : null,
        payload: (data as { payload?: unknown }).payload ?? null,
      };
      setEvents((prev) => {
        const next = [...prev, ev];
        return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
      });
      setLastEventAt(ts);
    };

    try {
      es = new EventSource("/api/sessions/stream");
      es.onopen = () => {
        if (!cancelled) setConnected(true);
      };
      es.onerror = () => {
        // EventSource auto-reconnects; surface the in-between state.
        if (!cancelled) setConnected(false);
      };
      for (const t of KNOWN_EVENT_TYPES) {
        es.addEventListener(t, (raw) => push(t, raw as MessageEvent));
      }
      // Fallback for unnamed messages.
      es.onmessage = (raw) => push("message", raw);
    } catch {
      setConnected(false);
    }

    return () => {
      cancelled = true;
      setConnected(false);
      if (es) es.close();
    };
  }, []);

  return { events, connected, lastEventAt };
}
