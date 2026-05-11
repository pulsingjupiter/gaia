"use client";
/**
 * useCostStats — wraps GET /api/cost.
 *
 * Returns the full aggregation payload, the active period selector, and a
 * setter that swaps period without dropping the prior payload (so the UI
 * doesn't flash empty between transitions). Polls every 30s while mounted.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type CostPeriod = "today" | "7d" | "30d" | "all";

export type CostTotals = {
  runs: number;
  cost_usd: number;
  duration_ms: number;
  success: number;
  error: number;
};

export type CostByAgent = {
  employee_id: string;
  name: string;
  role: string;
  avatar_emoji: string | null;
  accent_color: string | null;
  runs: number;
  cost_usd: number;
  avg_duration_ms: number;
  success_rate: number;
};

export type CostBySkill = {
  skill: string;
  runs: number;
  cost_usd: number;
  avg_duration_ms: number;
};

export type CostByDay = {
  date: string;
  runs: number;
  cost_usd: number;
};

export type CostStats = {
  period: { from: string; to: string; label: string };
  totals: CostTotals;
  by_agent: CostByAgent[];
  by_skill: CostBySkill[];
  by_day: CostByDay[];
  trend: {
    vs_previous_period: {
      delta_pct: number;
      direction: "up" | "down" | "flat";
    };
  };
};

export type UseCostStats = {
  stats: CostStats | null;
  loading: boolean;
  error: string | null;
  period: CostPeriod;
  setPeriod: (p: CostPeriod) => void;
  refresh: () => Promise<void>;
};

const POLL_MS = 30_000;

export function useCostStats(initial: CostPeriod = "7d"): UseCostStats {
  const [period, setPeriodState] = useState<CostPeriod>(initial);
  const [stats, setStats] = useState<CostStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);
  const periodRef = useRef(period);
  periodRef.current = period;

  const fetchFor = useCallback(async (p: CostPeriod) => {
    try {
      const res = await fetch(`/api/cost?period=${encodeURIComponent(p)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`GET /api/cost ${res.status}`);
      const data = (await res.json()) as CostStats;
      // Drop the response if the user has since switched periods or unmounted.
      if (cancelled.current || periodRef.current !== p) return;
      setStats(data);
      setError(null);
    } catch (err) {
      if (cancelled.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!cancelled.current) setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    await fetchFor(periodRef.current);
  }, [fetchFor]);

  useEffect(() => {
    cancelled.current = false;
    void fetchFor(period);
    const id = setInterval(() => {
      void fetchFor(periodRef.current);
    }, POLL_MS);
    return () => {
      cancelled.current = true;
      clearInterval(id);
    };
  }, [period, fetchFor]);

  const setPeriod = useCallback((p: CostPeriod) => {
    setPeriodState((prev) => {
      if (prev === p) return prev;
      setLoading(true);
      return p;
    });
  }, []);

  return { stats, loading, error, period, setPeriod, refresh };
}
