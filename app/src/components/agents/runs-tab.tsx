"use client";
/**
 * Recent Runs tab — table of the last 20 runs for this agent. Click a row
 * to open the LiveRunDrawer. Mirrors the columns the user already sees on
 * the Activity feed.
 */
import { useState } from "react";

import type { RunRow } from "@/lib/hooks/use-agent-detail";
import { LiveRunDrawer } from "@/components/shared/live-run-drawer";
import { cn } from "@/lib/cn";

const STATUS_PILL: Record<RunRow["status"], string> = {
  pending: "bg-slate-100 text-slate-600",
  running: "bg-amber-50 text-amber-700",
  success: "bg-emerald-50 text-emerald-700",
  error: "bg-red-50 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
};

function fmtTime(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return "—";
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDuration(ms: number | null): string {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}m ${r}s`;
}

function fmtCost(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return "$0.00";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

export function RunsTab({ runs }: { runs: RunRow[] }) {
  const [drawerRunId, setDrawerRunId] = useState<string | null>(null);

  if (runs.length === 0) {
    return (
      <div className="card-surface p-8 text-center text-sm text-muted">
        No runs yet for this agent.
      </div>
    );
  }

  return (
    <>
      <div className="card-surface overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface-muted text-[10px] uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-2 font-semibold">Started</th>
              <th className="px-4 py-2 font-semibold">Skill</th>
              <th className="px-4 py-2 font-semibold">Status</th>
              <th className="px-4 py-2 font-semibold">Duration</th>
              <th className="px-4 py-2 text-right font-semibold">Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-subtle">
            {runs.map((r) => (
              <tr
                key={r.id}
                onClick={() => setDrawerRunId(r.id)}
                className="cursor-pointer transition hover:bg-surface-muted"
              >
                <td className="px-4 py-2.5 text-secondary">
                  {fmtTime(r.started_at)}
                </td>
                <td className="px-4 py-2.5 font-medium text-primary">
                  {r.skill}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
                      STATUS_PILL[r.status],
                    )}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-secondary">
                  {fmtDuration(r.duration_ms)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-[11px] text-secondary">
                  {fmtCost(r.cost_usd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <LiveRunDrawer
        runId={drawerRunId}
        open={drawerRunId !== null}
        onClose={() => setDrawerRunId(null)}
      />
    </>
  );
}
