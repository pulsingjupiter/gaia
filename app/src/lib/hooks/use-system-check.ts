"use client";
/**
 * useSystemCheck — fetches /api/system-check and exposes a dismissable flag.
 *
 * The endpoint itself caches for 30s, so the hook can poll cheaply. The
 * `dismissed` flag is persisted in localStorage under
 * `gaia.first-run-dismissed` so the banner stays hidden across navigations
 * within the same session — but a hard reload or new tab clears it as
 * expected (it's not session-scoped on purpose: once you dismiss, it's
 * sticky until the user clears storage).
 */
import { useCallback, useEffect, useState } from "react";

export type SystemCheck = {
  name: string;
  ok: boolean;
  message: string;
  /**
   * Multi-runtime MVP: `warn`-severity checks (optional jules/codex CLIs)
   * surface in the banner but never flip the aggregate `ok` to false.
   * Existing required checks omit the field — read as "error".
   */
  severity?: "error" | "warn";
};

export type SystemCheckPayload = {
  ok: boolean;
  checks: SystemCheck[];
  checked_at: string;
};

export type UseSystemCheck = {
  ok: boolean;
  checks: SystemCheck[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  dismissed: boolean;
  dismiss: () => void;
};

const STORAGE_KEY = "gaia.first-run-dismissed";
const CACHE_TTL_MS = 30_000;

let inMemoryCache: { at: number; data: SystemCheckPayload } | null = null;

function readDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, "1");
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore quota / privacy-mode errors
  }
}

export function useSystemCheck(): UseSystemCheck {
  const [data, setData] = useState<SystemCheckPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const fetchOnce = useCallback(async (force: boolean): Promise<void> => {
    const now = Date.now();
    if (!force && inMemoryCache && now - inMemoryCache.at < CACHE_TTL_MS) {
      setData(inMemoryCache.data);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/system-check", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`GET /api/system-check ${res.status}`);
      const payload = (await res.json()) as SystemCheckPayload;
      inMemoryCache = { at: now, data: payload };
      setData(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setDismissed(readDismissed());
    void fetchOnce(false);
  }, [fetchOnce]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchOnce(true);
  }, [fetchOnce]);

  const dismiss = useCallback(() => {
    writeDismissed(true);
    setDismissed(true);
  }, []);

  return {
    ok: data?.ok ?? true,
    checks: data?.checks ?? [],
    loading,
    error,
    refresh,
    dismissed,
    dismiss,
  };
}
