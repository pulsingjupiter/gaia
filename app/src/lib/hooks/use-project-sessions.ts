"use client";
/**
 * useProjectSessions — list of Claude Code sessions filtered to one project.
 *
 * - Fetches `/api/sessions?project_id=` on mount.
 * - Polls every 6s.
 * - Subscribes to `useSessionStream`. When a session event arrives whose
 *   project_id matches, we trigger a quick refresh (cheap, since the API is
 *   small and uses no-store).
 *
 * The hook does NOT mutate per-row state from SSE because the row schema
 * (last_event_summary, num_messages, total_cost, etc.) is computed
 * server-side; cheaper to re-fetch than to recompute client-side.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { Session } from "@/lib/types";
import { useSessionStream } from "./use-session-stream";

export type SessionStatus = Session["status"];

export type SessionRow = Session;

export type UseProjectSessions = {
  sessions: SessionRow[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const POLL_MS = 6000;

export function useProjectSessions(
  projectId: string | null | undefined,
): UseProjectSessions {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const stream = useSessionStream();
  const lastStreamTsRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setSessions([]);
      setLoading(false);
      return;
    }
    try {
      const params = new URLSearchParams();
      params.set("project_id", projectId);
      params.set("limit", "200");
      const res = await fetch(`/api/sessions?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`GET /api/sessions ${res.status}`);
      const data = (await res.json()) as { sessions: SessionRow[] };
      if (!mounted.current) return;
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [projectId]);

  // Initial fetch + interval polling.
  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => {
      mounted.current = false;
      window.clearInterval(id);
    };
  }, [refresh]);

  // SSE-driven refresh: when a relevant event arrives, re-fetch.
  useEffect(() => {
    if (!projectId) return;
    if (stream.lastEventAt === null) return;
    if (lastStreamTsRef.current === stream.lastEventAt) return;
    lastStreamTsRef.current = stream.lastEventAt;
    // Cheap heuristic: only refresh if any recent event matches our project.
    const recent = stream.events.slice(-10);
    if (!recent.some((e) => e.project_id === projectId)) return;
    void refresh();
  }, [projectId, stream.events, stream.lastEventAt, refresh]);

  return { sessions, loading, error, refresh };
}
