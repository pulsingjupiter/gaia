"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AgentAvatar } from "@/components/shared/agent-avatar";
import { IconPicker } from "@/components/shared/icon-picker";
import {
  PrimaryButton,
  SectionPanel,
} from "@/components/settings/settings-shell";
import { useEmployees } from "@/components/employees/employees-context";
import type { ModelsSettings, UseSettings } from "@/lib/hooks/use-settings";
import type { Employee } from "@/lib/types";

const MODELS = [
  { id: "claude-haiku-4-5", label: "Haiku 4.5" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { id: "claude-opus-4-7", label: "Opus 4.7" },
];

/**
 * Per-agent fields fetched independently of the legacy useEmployees hook so we
 * don't have to thread `daily_cost_cap_usd` through the UI Employee shape.
 * Keys mirror the columns/decorations on `GET /api/employees`.
 */
type CapRow = {
  daily_cost_cap_usd: number | null;
  spend_today_usd: number;
};

function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

export function AgentsSection({
  employees,
  models,
  save,
  saving,
}: {
  employees: Employee[];
  models: ModelsSettings;
  save: UseSettings["save"];
  saving: boolean;
}) {
  const { update: updateEmployee } = useEmployees();
  const [perAgent, setPerAgent] = useState<Record<string, string>>(
    models.per_agent ?? {},
  );
  const [perCost, setPerCost] = useState<Record<string, number>>(
    models.per_agent_cost ?? {},
  );
  const [defaultModel, setDefaultModel] = useState(
    models.default_model ?? "claude-sonnet-4-6",
  );
  const [pickerOpenFor, setPickerOpenFor] = useState<string | null>(null);

  // Cap state: pulled from /api/employees directly so we get
  // `daily_cost_cap_usd` + `spend_today_usd` (which the legacy useEmployees
  // hook doesn't surface). Local edit buffer is `capDraft`; persisted value
  // mirror is `capCommitted`. We PATCH on blur/Enter rather than batching
  // with the Save button — feels more direct since each row is independent.
  const [capCommitted, setCapCommitted] = useState<Record<string, CapRow>>({});
  const [capDraft, setCapDraft] = useState<Record<string, string>>({});
  const [capSavingFor, setCapSavingFor] = useState<string | null>(null);

  const pickerEmployee = pickerOpenFor
    ? employees.find((e) => e.id === pickerOpenFor) ?? null
    : null;

  useEffect(() => {
    setPerAgent(models.per_agent ?? {});
    setPerCost(models.per_agent_cost ?? {});
    setDefaultModel(models.default_model ?? "claude-sonnet-4-6");
  }, [models]);

  // Hydrate cap rows from /api/employees. Refetch on window-focus so the
  // "Spent today" hint stays roughly fresh as runs complete.
  const refreshCaps = useCallback(async () => {
    try {
      const res = await fetch("/api/employees", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        employees: Array<{
          id: string;
          daily_cost_cap_usd: number | null;
          spend_today_usd?: number;
        }>;
      };
      const next: Record<string, CapRow> = {};
      for (const r of data.employees ?? []) {
        next[r.id] = {
          daily_cost_cap_usd: r.daily_cost_cap_usd ?? null,
          spend_today_usd: r.spend_today_usd ?? 0,
        };
      }
      setCapCommitted(next);
      // Seed the draft buffer for any agent we haven't started editing yet.
      setCapDraft((prev) => {
        const merged: Record<string, string> = { ...prev };
        for (const [id, row] of Object.entries(next)) {
          if (!(id in merged)) {
            merged[id] =
              row.daily_cost_cap_usd == null
                ? ""
                : String(row.daily_cost_cap_usd);
          }
        }
        return merged;
      });
    } catch {
      // ignore — non-critical
    }
  }, []);

  useEffect(() => {
    void refreshCaps();
    const onFocus = () => {
      void refreshCaps();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshCaps]);

  const saveCap = useCallback(
    async (employeeId: string, raw: string) => {
      const trimmed = raw.trim();
      const parsed: number | null = trimmed === "" ? null : Number(trimmed);
      if (parsed != null && (!Number.isFinite(parsed) || parsed < 0)) {
        // Invalid input — revert draft to last committed value.
        setCapDraft((prev) => ({
          ...prev,
          [employeeId]:
            capCommitted[employeeId]?.daily_cost_cap_usd == null
              ? ""
              : String(capCommitted[employeeId]!.daily_cost_cap_usd),
        }));
        return;
      }
      const current = capCommitted[employeeId]?.daily_cost_cap_usd ?? null;
      if (parsed === current) return; // no-op
      setCapSavingFor(employeeId);
      try {
        const res = await fetch(
          `/api/employees/${encodeURIComponent(employeeId)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ daily_cost_cap_usd: parsed }),
          },
        );
        if (!res.ok) throw new Error(`PATCH failed: ${res.status}`);
        await refreshCaps();
      } catch {
        // Revert on failure so the user sees the persisted value.
        await refreshCaps();
      } finally {
        setCapSavingFor(null);
      }
    },
    [capCommitted, refreshCaps],
  );

  const dirty = useMemo(() => {
    const a =
      JSON.stringify(perAgent) !== JSON.stringify(models.per_agent ?? {});
    const b =
      JSON.stringify(perCost) !== JSON.stringify(models.per_agent_cost ?? {});
    const c = defaultModel !== (models.default_model ?? "claude-sonnet-4-6");
    return a || b || c;
  }, [perAgent, perCost, defaultModel, models]);

  return (
    <SectionPanel
      title="Agents"
      description="Choose a model and per-run cost cap for each internal agent."
      footer={
        <>
          <span className="mr-auto text-[11px] text-muted">
            {dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <PrimaryButton
            disabled={!dirty || saving}
            onClick={() =>
              void save({
                models: {
                  default_model: defaultModel,
                  per_agent: perAgent,
                  per_agent_cost: perCost,
                },
              })
            }
          >
            {saving ? "Saving…" : "Save agents"}
          </PrimaryButton>
        </>
      }
    >
      <div className="mb-4 flex items-center gap-3">
        <span className="text-xs font-semibold text-primary">
          Default model
        </span>
        <select
          value={defaultModel}
          onChange={(e) => setDefaultModel(e.target.value)}
          className="rounded-lg border border-strong bg-white px-2 py-1 text-xs text-primary"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-muted">
          Used unless overridden below.
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-subtle">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface-muted text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Agent</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Avatar</th>
              <th className="px-3 py-2 font-medium">Default model</th>
              <th className="px-3 py-2 font-medium">Max cost / run (USD)</th>
              <th className="px-3 py-2 font-medium">Daily cap (USD)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-subtle">
            {employees.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-muted"
                >
                  Loading agents…
                </td>
              </tr>
            ) : (
              employees.map((e) => (
                <tr key={e.id}>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <AgentAvatar
                        value={e.avatar}
                        name={e.name}
                        size={22}
                        accent={e.accent}
                      />
                      <span className="font-medium text-primary">
                        {e.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-secondary">
                    {e.role}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <AgentAvatar
                        value={e.avatar}
                        name={e.name}
                        size={28}
                        accent={e.accent}
                      />
                      <button
                        type="button"
                        onClick={() => setPickerOpenFor(e.id)}
                        className="rounded-md border border-strong bg-white px-2 py-1 text-[11px] font-medium text-secondary hover:bg-surface-muted"
                      >
                        Change…
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <select
                      value={perAgent[e.id] ?? ""}
                      onChange={(ev) =>
                        setPerAgent((prev) => {
                          const next = { ...prev };
                          if (!ev.target.value) delete next[e.id];
                          else next[e.id] = ev.target.value;
                          return next;
                        })
                      }
                      className="rounded-md border border-strong bg-white px-2 py-1 text-xs"
                    >
                      <option value="">Use default</option>
                      {MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Unlimited"
                      value={perCost[e.id] ?? ""}
                      onChange={(ev) => {
                        const v = ev.target.value;
                        setPerCost((prev) => {
                          const next = { ...prev };
                          if (!v) delete next[e.id];
                          else next[e.id] = Number(v);
                          return next;
                        });
                      }}
                      className="w-28 rounded-md border border-strong bg-white px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    {(() => {
                      const cap = capCommitted[e.id]?.daily_cost_cap_usd ?? null;
                      const spent = capCommitted[e.id]?.spend_today_usd ?? 0;
                      const draftVal = capDraft[e.id] ?? "";
                      const isSaving = capSavingFor === e.id;
                      return (
                        <div className="flex flex-col gap-1">
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            placeholder="No cap"
                            value={draftVal}
                            disabled={isSaving}
                            onChange={(ev) =>
                              setCapDraft((prev) => ({
                                ...prev,
                                [e.id]: ev.target.value,
                              }))
                            }
                            onBlur={() => void saveCap(e.id, draftVal)}
                            onKeyDown={(ev) => {
                              if (ev.key === "Enter") {
                                ev.currentTarget.blur();
                              }
                            }}
                            className="w-28 rounded-md border border-strong bg-white px-2 py-1 text-xs disabled:opacity-50"
                          />
                          <span className="text-[10px] text-muted">
                            {cap == null
                              ? `Spent today: ${fmtUsd(spent)} (no cap)`
                              : `Spent today: ${fmtUsd(spent)} / ${fmtUsd(cap)} cap`}
                          </span>
                        </div>
                      );
                    })()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <IconPicker
        open={pickerEmployee !== null}
        current={pickerEmployee?.avatar ?? null}
        name={pickerEmployee?.name ?? "Agent"}
        accent={pickerEmployee?.accent}
        onSelect={(id) => {
          if (pickerEmployee) {
            void updateEmployee(pickerEmployee.id, { avatar: id });
          }
          setPickerOpenFor(null);
        }}
        onClose={() => setPickerOpenFor(null)}
        title="Choose an avatar"
      />
    </SectionPanel>
  );
}
