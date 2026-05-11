"use client";
/**
 * ByAgentTable — rows sorted by cost desc. Clicking a row navigates to
 * `/agents/<id>` with the History tab pre-selected (`?tab=history`).
 */
import { useRouter } from "next/navigation";
import { AgentAvatar } from "@/components/shared/agent-avatar";
import type { CostByAgent } from "@/lib/hooks/use-cost-stats";

function fmtCost(n: number): string {
  if (n >= 100) return `$${n.toFixed(2)}`;
  if (n >= 10) return `$${n.toFixed(2)}`;
  if (n >= 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

function fmtRate(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function ByAgentTable({ rows }: { rows: CostByAgent[] }) {
  const router = useRouter();

  return (
    <div className="card-surface overflow-hidden">
      <div className="flex items-baseline justify-between border-b border-subtle px-4 py-3">
        <div className="text-sm font-semibold text-primary">
          By Agent
        </div>
        <div className="text-[11px] text-muted">
          Sorted by cost
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs text-muted">
          No agent activity in this window.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-muted">
              <th className="px-4 py-2 font-semibold">Agent</th>
              <th className="px-4 py-2 text-right font-semibold">Runs</th>
              <th className="px-4 py-2 text-right font-semibold">Cost</th>
              <th className="px-4 py-2 text-right font-semibold">Avg / run</th>
              <th className="px-4 py-2 text-right font-semibold">Success</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.employee_id}
                onClick={() =>
                  router.push(
                    `/agents/${encodeURIComponent(r.employee_id)}?tab=history`,
                  )
                }
                className="cursor-pointer border-t border-subtle transition hover:bg-surface-muted"
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <AgentAvatar
                      value={r.avatar_emoji}
                      name={r.name}
                      size={28}
                      accent={r.accent_color ?? undefined}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold text-primary">
                        {r.name}
                      </div>
                      <div className="truncate text-[11px] text-muted">
                        {r.role}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-secondary">
                  {r.runs.toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-primary">
                  {fmtCost(r.cost_usd)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-secondary">
                  {r.runs > 0 ? fmtCost(r.cost_usd / r.runs) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-secondary">
                  {fmtRate(r.success_rate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
