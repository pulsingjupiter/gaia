"use client";
/**
 * useSessionTranscript — paginated fetch of /api/sessions/[id]/transcript.
 *
 * V1 strategy: load the latest `limit` events on mount (from = max(0,total-limit)
 * computed by the server when from is omitted? No — server defaults from=0).
 * To keep the surface simple we fetch `from=0&limit=large` for short
 * transcripts (<= MAX_INITIAL) and a tail window for larger ones.
 *
 * For V1 we just fetch the head with `limit` (200 by default) and expose
 * `loadEarlier()` which fetches the next earlier window. With Wave 1's
 * transcripts (54 sessions, mostly short) this is fine.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type ParsedRole = "user" | "assistant" | "system" | "tool";

export type ParsedEvent = {
  ts: number;
  role: ParsedRole;
  text?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_result_preview?: string;
  cost?: number;
  type?: string;
};

export type UseSessionTranscript = {
  events: ParsedEvent[];
  total: number;
  loading: boolean;
  error: string | null;
  /** Append events that arrived from the live stream (de-duped by ts+role+text). */
  appendLive: (incoming: ParsedEvent[]) => void;
  /** Pull older events from before the current window. No-op if all loaded. */
  loadEarlier: () => Promise<void>;
  /** Re-fetch the initial window (e.g. after resume). */
  refresh: () => Promise<void>;
};

const DEFAULT_LIMIT = 200;

function dedupeKey(e: ParsedEvent): string {
  // ts is not always unique (envelope events may share timestamp). Combine
  // ts + role + tool_name + first 80 chars of text for a stable key.
  const t = e.text ? e.text.slice(0, 80) : "";
  return `${e.ts}|${e.role}|${e.tool_name ?? ""}|${t}`;
}

export function useSessionTranscript(
  id: string | null | undefined,
  opts: { limit?: number } = {},
): UseSessionTranscript {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const [events, setEvents] = useState<ParsedEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  // The lowest `from` we have already fetched. Initially Number.POSITIVE_INFINITY.
  const lowestLoadedFromRef = useRef<number>(Number.POSITIVE_INFINITY);

  const fetchWindow = useCallback(
    async (from: number, take: number): Promise<{ events: ParsedEvent[]; total: number } | null> => {
      if (!id) return null;
      const url = `/api/sessions/${encodeURIComponent(id)}/transcript?from=${from}&limit=${take}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`GET ${url} ${res.status}`);
      return (await res.json()) as { events: ParsedEvent[]; total: number };
    },
    [id],
  );

  const refresh = useCallback(async () => {
    if (!id) {
      setEvents([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Probe with from=0 first to learn `total`, then fetch the tail window
      // so the user sees the most recent events on landing.
      const probe = await fetchWindow(0, 1);
      if (!probe) return;
      const totalEvents = probe.total;
      const from = Math.max(0, totalEvents - limit);
      const tail = await fetchWindow(from, limit);
      if (!mounted.current || !tail) return;
      setEvents(tail.events);
      setTotal(tail.total);
      lowestLoadedFromRef.current = from;
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [id, limit, fetchWindow]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  const loadEarlier = useCallback(async () => {
    if (!id) return;
    const lowest = lowestLoadedFromRef.current;
    if (!Number.isFinite(lowest) || lowest <= 0) return;
    const take = limit;
    const from = Math.max(0, lowest - take);
    if (from === lowest) return;
    try {
      const win = await fetchWindow(from, lowest - from);
      if (!mounted.current || !win) return;
      setEvents((prev) => {
        const seen = new Set(prev.map(dedupeKey));
        const earlier = win.events.filter((e) => !seen.has(dedupeKey(e)));
        return [...earlier, ...prev];
      });
      setTotal(win.total);
      lowestLoadedFromRef.current = from;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [id, limit, fetchWindow]);

  const appendLive = useCallback((incoming: ParsedEvent[]) => {
    if (!incoming.length) return;
    setEvents((prev) => {
      const seen = new Set(prev.map(dedupeKey));
      const fresh = incoming.filter((e) => !seen.has(dedupeKey(e)));
      if (!fresh.length) return prev;
      return [...prev, ...fresh];
    });
    setTotal((prev) => prev + incoming.length);
  }, []);

  return { events, total, loading, error, appendLive, loadEarlier, refresh };
}
