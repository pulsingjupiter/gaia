"use client";
/**
 * ActivityKpiStrip — five KPI cards sitting under the Activity page header.
 *
 * Pulls aggregate run stats from `/api/runs?stats=1` (re-fetched every 15s)
 * and overlays the live "Active Now" count from sessions.
 */
import { useEffect, useState } from "react";

type RunStats = {
  total: number;
  success: number;
  error: number;
  running: number;
  avg_duration_ms: number;
  total_cost_usd: number;
  runs_today: number;
  success_rate: number;
};

type SessionRow = { id: string; status: "active" | "idle" | "ended" };

const POLL_MS = 15_000;

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

function formatCost(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

export function ActivityKpiStrip({ activeNow }: { activeNow: number }) {
  const [stats, setStats] = useState<RunStats | null>(null);
  const [costToday, setCostToday] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const fromIso = todayStart.toISOString();

    async function load() {
      try {
        const [allRes, todayRes] = await Promise.all([
          fetch("/api/runs?stats=1", { cache: "no-store" }),
          fetch(`/api/runs?stats=1&from=${encodeURIComponent(fromIso)}`, {
            cache: "no-store",
          }),
        ]);
        if (!cancelled && allRes.ok) {
          const data = (await allRes.json()) as { stats: RunStats };
          setStats(data.stats ?? null);
        }
        if (!cancelled && todayRes.ok) {
          const data = (await todayRes.json()) as { stats: RunStats };
          setCostToday(data.stats?.total_cost_usd ?? 0);
        }
      } catch {
        // ignore
      }
    }
    void load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const items = [
    {
      label: "Today's Events",
      value: stats ? String(stats.runs_today) : "—",
    },
    {
      label: "Active Now",
      value: String(activeNow),
      chip: activeNow > 0 ? "live" : undefined,
      chipColor: "#10B981",
    },
    {
      label: "Success Rate",
      value: stats ? `${Math.round(stats.success_rate * 100)}%` : "—",
      chip: stats && stats.error > 0 ? `${stats.error} err` : undefined,
      chipColor: "#EF4444",
    },
    {
      label: "Cost Today",
      value: formatCost(costToday),
    },
    {
      label: "Avg Duration",
      value: stats ? formatDuration(stats.avg_duration_ms) : "—",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {items.map((it) => (
        <div key={it.label} className="card-surface p-3">
          <div className="section-header text-[10px]">{it.label}</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[22px] font-bold text-primary">
              {it.value}
            </span>
            {it.chip ? (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                style={{
                  background: `${it.chipColor}1A`,
                  color: it.chipColor,
                }}
              >
                {it.chip}
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
