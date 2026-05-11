"use client";
/**
 * Settings tab — name, role, accent, avatar, default model, max-cost-per-run.
 *
 * Writes:
 * - name / role / accent_color / avatar_emoji  → PATCH /api/employees/[id]
 * - default model                              → PATCH /api/settings { models: { per_agent: { [id]: model } } }
 * - max cost per run                           → PATCH /api/settings { models: { per_agent_cost: { [id]: usd } } }
 *
 * Why not store model + cost on the employees table? The DB schema has no
 * per-agent model or cost columns, and the existing settings.models surface
 * already supports `per_agent` (Record<string, string>) and `per_agent_cost`
 * (Record<string, number>) maps — see `app/src/lib/hooks/use-settings.ts`.
 * Keeping orchestration config in settings means agent rows stay focused on
 * identity, and a parallel agent owning sprint/schedule pages can read both.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import type { EmployeeRow } from "@/lib/hooks/use-employees";
import { useEmployees } from "@/components/employees/employees-context";
import { useSettings } from "@/lib/hooks/use-settings";
import { uiStatus } from "@/lib/hooks/use-employees";
import { AgentAvatar } from "@/components/shared/agent-avatar";
import { IconPicker } from "@/components/shared/icon-picker";

const ACCENT_OPTIONS = [
  { name: "Indigo", value: "#5B5BD6" },
  { name: "Pink", value: "#F472B6" },
  { name: "Green", value: "#10B981" },
  { name: "Amber", value: "#F59E0B" },
  { name: "Blue", value: "#3B82F6" },
  { name: "Violet", value: "#8B5CF6" },
  { name: "Teal", value: "#14B8A6" },
  { name: "Slate", value: "#64748B" },
];

const MODEL_OPTIONS = [
  { value: "", label: "Inherit from global default" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "claude-opus-4-7", label: "Claude Opus 4.7" },
];

export function AgentSettingsTab({
  employee,
  onSaved,
}: {
  employee: EmployeeRow;
  onSaved?: () => void;
}) {
  const { update } = useEmployees();
  const { settings, save: saveSettings, saving: settingsSaving } = useSettings();

  const [name, setName] = useState(employee.name);
  const [role, setRole] = useState(employee.role);
  const [accent, setAccent] = useState(employee.accent_color ?? ACCENT_OPTIONS[0].value);
  const [avatar, setAvatar] = useState<string | null>(employee.avatar_emoji ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [model, setModel] = useState<string>("");
  const [maxCost, setMaxCost] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Re-sync local state whenever the employee row OR settings load/refresh.
  useEffect(() => {
    setName(employee.name);
    setRole(employee.role);
    setAccent(employee.accent_color ?? ACCENT_OPTIONS[0].value);
    setAvatar(employee.avatar_emoji ?? null);
  }, [employee]);

  useEffect(() => {
    if (!settings) return;
    const perAgent = settings.models?.per_agent ?? {};
    const perAgentCost = settings.models?.per_agent_cost ?? {};
    setModel(typeof perAgent[employee.id] === "string" ? perAgent[employee.id] : "");
    const c = perAgentCost[employee.id];
    setMaxCost(typeof c === "number" && Number.isFinite(c) ? String(c) : "");
  }, [settings, employee.id]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      // 1. Employee row (name / role / accent / avatar). Status preserved.
      await update(employee.id, {
        name: name.trim() || employee.name,
        role: role.trim() || employee.role,
        status: uiStatus(employee.status),
        accent,
        avatar,
      });

      // 2. Per-agent model + max-cost in settings.models (merged server-side).
      const baseModels = settings?.models ?? {
        default_model: "claude-sonnet-4-6",
        per_agent: {},
        per_agent_cost: {},
      };
      const nextPerAgent = { ...(baseModels.per_agent ?? {}) };
      if (model) nextPerAgent[employee.id] = model;
      else delete nextPerAgent[employee.id];

      const nextPerCost: Record<string, number> = {
        ...(baseModels.per_agent_cost ?? {}),
      };
      const trimmed = maxCost.trim();
      if (trimmed === "") {
        delete nextPerCost[employee.id];
      } else {
        const n = Number(trimmed);
        if (!Number.isFinite(n) || n < 0) {
          throw new Error("Max cost must be a non-negative number.");
        }
        nextPerCost[employee.id] = n;
      }

      await saveSettings({
        models: {
          ...baseModels,
          per_agent: nextPerAgent,
          per_agent_cost: nextPerCost,
        },
      });

      setSavedAt(Date.now());
      onSaved?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || settingsSaving;

  return (
    <form onSubmit={onSave} className="card-surface space-y-5 p-6">
      <div>
        <label className="text-xs font-medium text-secondary">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-strong bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          required
        />
      </div>

      <div>
        <label className="text-xs font-medium text-secondary">Role</label>
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="mt-1 w-full rounded-lg border border-strong bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          placeholder="e.g. Copywriter"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-secondary">Avatar</label>
        <div className="mt-1 flex items-center gap-3">
          <AgentAvatar value={avatar} name={name || "?"} size={44} accent={accent} />
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="rounded-lg border border-strong bg-white px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-muted"
          >
            Choose…
          </button>
          {avatar ? (
            <button
              type="button"
              onClick={() => setAvatar(null)}
              className="text-[11px] font-medium text-muted hover:underline"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-secondary">Accent</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {ACCENT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setAccent(opt.value)}
              className="size-8 rounded-full border-2 transition"
              style={{
                background: opt.value,
                borderColor: accent === opt.value ? "#111827" : "transparent",
              }}
              aria-label={opt.name}
              title={opt.name}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-secondary">
            Default model
          </label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="mt-1 w-full rounded-lg border border-strong bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m.value || "inherit"} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-muted">
            Stored under <code>settings.models.per_agent.{employee.id}</code>.
          </p>
        </div>
        <div>
          <label className="text-xs font-medium text-secondary">
            Max cost per run (USD)
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={maxCost}
            onChange={(e) => setMaxCost(e.target.value)}
            placeholder="e.g. 0.50"
            className="mt-1 w-full rounded-lg border border-strong bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <p className="mt-1 text-[10px] text-muted">
            Leave blank for no cap. Stored under{" "}
            <code>settings.models.per_agent_cost.{employee.id}</code>.
          </p>
        </div>
      </div>

      {errorMsg ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {errorMsg}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-3 pt-2">
        {savedAt ? (
          <span className="text-[11px] text-muted">Saved.</span>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : null}
          Save changes
        </button>
      </div>

      <IconPicker
        open={pickerOpen}
        current={avatar}
        name={name || "Agent"}
        accent={accent}
        onSelect={(id) => {
          setAvatar(id);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
        title="Choose an avatar"
      />
    </form>
  );
}
