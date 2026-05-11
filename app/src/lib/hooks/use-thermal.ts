"use client";
/**
 * useThermal — polls GET /api/system/thermal every 5 seconds for live SoC
 * temperatures, power, and RAM usage from macmon.
 *
 * Returns the last known payload (or null until first response) plus a loading
 * flag and an error string. When macmon isn't reachable the route still
 * returns a structured `{ available: false }` payload, so consumers should
 * branch on `data.available` rather than `error`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type ThermalPressure = "Nominal" | "Moderate" | "Heavy" | "Unknown";

export type ThermalOk = {
  available: true;
  cpu_temp_c: number;
  gpu_temp_c: number;
  cpu_usage_pct: number;
  gpu_usage_pct: number;
  power_w: number;
  ram_usage_gb: number;
  ram_total_gb: number;
  chip_name: string;
  thermal_pressure: ThermalPressure;
  timestamp: string;
};

export type ThermalUnavailable = {
  available: false;
  install_hint: string;
  reason: string;
};

export type ThermalPayload = ThermalOk | ThermalUnavailable;

export type UseThermal = {
  data: ThermalPayload | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const POLL_MS = 5_000;

export function useThermal(): UseThermal {
  const [data, setData] = useState<ThermalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/system/thermal", { cache: "no-store" });
      if (!res.ok) throw new Error(`GET /api/system/thermal ${res.status}`);
      const payload = (await res.json()) as ThermalPayload;
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
    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => {
      mounted.current = false;
      window.clearInterval(id);
    };
  }, [refresh]);

  return useMemo(
    () => ({ data, loading, error, refresh }),
    [data, loading, error, refresh],
  );
}
