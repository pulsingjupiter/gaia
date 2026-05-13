"use client";
/**
 * useSessionDetail — fetch a single session row from /api/sessions/[id].
 *
 * Returns the row, loading state, error, and a refresh helper. We intentionally
 * keep this hook stupid: header counters/cost/status update via the live SSE
 * hook, and we only re-pull the detail row when something explicitly changes
 * (resume button, prompt sent, or the consumer calls refresh()).
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { Session } from "@/lib/types";

export type SessionStatus = Session["status"];

export type SessionRow = Session;

export type UseSessionDetail = {
  session: SessionRow | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useSessionDetail(id: string | null | undefined): UseSessionDetail {
  const [session, setSession] = useState<SessionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!id) {
      setSession(null);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`GET /api/sessions/${id} ${res.status}`);
      const data = (await res.json()) as { session: SessionRow };
      if (!mounted.current) return;
      setSession(data.session);
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  return { session, loading, error, refresh };
}
