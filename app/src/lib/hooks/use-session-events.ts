"use client";
/**
 * useSessionEvents — subscribe to the global SSE feed at /api/sessions/stream
 * and surface only the events for one specific session id.
 *
 * Wave 1 emits per-session payloads on the global bus; the route filters
 * client-side. Each frame's `data` JSON has shape
 *   { session_id, project_id, ts, summary, payload }
 * where `payload` is usually a ParsedEvent (or a status delta — we forward
 * everything to the consumer for the header-counters/refresh path, but
 * `liveEvents` only includes those that look transcript-shaped).
 */
import { useEffect, useRef, useState } from "react";

import type { ParsedEvent } from "./use-session-transcript";

export type SessionStreamFrame = {
  type: string;
  session_id: string;
  project_id: string;
  ts: number;
  summary?: string;
  payload?: unknown;
};

export type UseSessionEvents = {
  liveEvents: ParsedEvent[];
  lastFrame: SessionStreamFrame | null;
  connected: boolean;
};

/** Coerce a stream payload into a ParsedEvent if it has the right shape. */
function asParsedEvent(payload: unknown, fallbackTs: number): ParsedEvent | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const role = p.role;
  if (role !== "user" && role !== "assistant" && role !== "system" && role !== "tool") {
    return null;
  }
  const ts = typeof p.ts === "number" ? p.ts : fallbackTs;
  const ev: ParsedEvent = { ts, role };
  if (typeof p.text === "string") ev.text = p.text;
  if (typeof p.tool_name === "string") ev.tool_name = p.tool_name;
  if (p.tool_input !== undefined) ev.tool_input = p.tool_input;
  if (typeof p.tool_result_preview === "string")
    ev.tool_result_preview = p.tool_result_preview;
  if (typeof p.cost === "number") ev.cost = p.cost;
  if (typeof p.type === "string") ev.type = p.type;
  return ev;
}

const STREAM_EVENT_TYPES = [
  "session:start",
  "session:assistant_text",
  "session:user_text",
  "session:tool_use",
  "session:tool_result",
  "session:system",
  "session:status",
  "session:end",
  "session:any",
];

export function useSessionEvents(id: string | null | undefined): UseSessionEvents {
  const [liveEvents, setLiveEvents] = useState<ParsedEvent[]>([]);
  const [lastFrame, setLastFrame] = useState<SessionStreamFrame | null>(null);
  const [connected, setConnected] = useState(false);
  const sessionIdRef = useRef(id);

  // Reset state when the session id changes.
  useEffect(() => {
    sessionIdRef.current = id;
    setLiveEvents([]);
    setLastFrame(null);
    setConnected(false);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const es = new EventSource(`/api/sessions/stream`);

    const onFrame = (raw: MessageEvent) => {
      if (cancelled) return;
      let parsed: SessionStreamFrame | null = null;
      try {
        const data = JSON.parse(raw.data) as Partial<SessionStreamFrame>;
        if (typeof data.session_id !== "string") return;
        parsed = {
          type: raw.type || "session:any",
          session_id: data.session_id,
          project_id: data.project_id ?? "",
          ts: typeof data.ts === "number" ? data.ts : Date.now(),
          summary: typeof data.summary === "string" ? data.summary : undefined,
          payload: data.payload,
        };
      } catch {
        return;
      }
      if (!parsed || parsed.session_id !== sessionIdRef.current) return;
      setLastFrame(parsed);
      const ev = asParsedEvent(parsed.payload, parsed.ts);
      if (ev) {
        setLiveEvents((prev) => [...prev, ev]);
      }
    };

    es.addEventListener("open", () => {
      if (!cancelled) setConnected(true);
    });
    es.addEventListener("error", () => {
      if (!cancelled) setConnected(false);
    });

    for (const t of STREAM_EVENT_TYPES) {
      es.addEventListener(t, onFrame as EventListener);
    }
    es.onmessage = onFrame;

    return () => {
      cancelled = true;
      try {
        es.close();
      } catch {
        // ignore
      }
    };
  }, [id]);

  return { liveEvents, lastFrame, connected };
}
