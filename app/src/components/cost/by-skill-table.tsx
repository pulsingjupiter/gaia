"use client";
/**
 * BySkillTable — top 10 skills by cost, mirrors ByAgentTable. Skills are
 * raw strings from `runs.skill` (e.g. "chat", "research-deep-dive"). No
 * row navigation — there's no per-skill detail page yet.
 */
import type { CostBySkill } from "@/lib/hooks/use-cost-stats";

function fmtCost(n: number): string {
  if (n >= 100) return `$${n.toFixed(2)}`;
  if (n >= 10) return `$${n.toFixed(2)}`;
  if (n >= 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

function fmtDuration(ms: number): string {
  if (ms === 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function prettifySkill(skill: string): string {
  return skill
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function BySkillTable({ rows }: { rows: CostBySkill[] }) {
  return (
    <div className="card-surface overflow-hidden">
      <div className="flex items-baseline justify-between border-b border-subtle px-4 py-3">
        <div className="text-sm font-semibold text-primary">
          By Skill
        </div>
        <div className="text-[11px] text-muted">Top 10</div>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs text-muted">
          No skill activity in this window.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-muted">
              <th className="px-4 py-2 font-semibold">Skill</th>
              <th className="px-4 py-2 text-right font-semibold">Runs</th>
              <th className="px-4 py-2 text-right font-semibold">Cost</th>
              <th className="px-4 py-2 text-right font-semibold">Avg dur.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.skill}
                className="border-t border-subtle"
              >
                <td className="px-4 py-2.5">
                  <div className="text-[13px] font-medium text-primary">
                    {prettifySkill(r.skill)}
                  </div>
                  <div className="font-mono text-[10px] text-muted">
                    {r.skill}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-secondary">
                  {r.runs.toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-primary">
                  {fmtCost(r.cost_usd)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-secondary">
                  {fmtDuration(r.avg_duration_ms)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
