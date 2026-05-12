"use client";
/**
 * useVersionCheck — fetches /api/system/version once on mount and polls every
 * 30 minutes. Powers the sidebar "Update available" chip.
 *
 * The endpoint itself caches the remote GitHub lookup for 10 minutes, so the
 * client poll cadence (30 min) is plenty conservative on rate limits. Call
 * `refresh()` to force a fresh remote read via `?refresh=1`.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type VersionPayload = {
  current: string;
  currentFull: string;
  latest: string | null;
  latestFull: string | null;
  behind: number | null;
  upToDate: boolean;
  checkedAt: string;
  repo: string;
  error?: string;
};

export type UseVersionCheck = {
  data: VersionPayload | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const POLL_MS = 30 * 60 * 1000; // 30 minutes

export function useVersionCheck(): UseVersionCheck {
  const [data, setData] = useState<VersionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const fetchOnce = useCallback(async (force: boolean): Promise<void> => {
    try {
      const url = force
        ? "/api/system/version?refresh=1"
        : "/api/system/version";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`GET /api/system/version ${res.status}`);
      const payload = (await res.json()) as VersionPayload;
      if (!mounted.current) return;
      setData(payload);
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void fetchOnce(false);
    const id = window.setInterval(() => {
      void fetchOnce(false);
    }, POLL_MS);
    return () => {
      mounted.current = false;
      window.clearInterval(id);
    };
  }, [fetchOnce]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchOnce(true);
  }, [fetchOnce]);

  return { data, loading, error, refresh };
}
