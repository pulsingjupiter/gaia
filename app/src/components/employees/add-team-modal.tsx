"use client";
/**
 * AddTeamModal — Feature B.
 *
 * Two-step flow:
 *   1. Pick a team tile (5 options) → reveals a preview.
 *   2. Preview shows each agent (avatar + name + role) with a toggle.
 *      Already-existing agents are pre-disabled and flagged.
 *   3. "Create team" POSTs to /api/teams/apply with the kept ids.
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Loader2, Users } from "lucide-react";

import { AgentAvatar } from "@/components/shared/agent-avatar";
import {
  AGENT_TEMPLATES,
  getTemplateById,
  type AgentTemplate,
} from "@/lib/agent-templates";
import { AGENT_TEAMS, type AgentTeam } from "@/lib/agent-teams";
import { useEmployees } from "@/components/employees/employees-context";

type ApplyResult = {
  created: Array<{ id: string; name: string }>;
  skipped: Array<{ template_id: string; reason: string; message?: string }>;
};

export function AddTeamModal({
  open,
  onOpenChange,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApplied?: (result: ApplyResult) => void;
}) {
  const { employees } = useEmployees();
  const [team, setTeam] = useState<AgentTeam | null>(null);
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build a set of existing slugs so the preview can mark conflicts. We
  // match by `id` (template_id === employee_id for templated agents) AND by
  // case-insensitive `name` to catch hand-created duplicates.
  const existingIds = useMemo(() => {
    const set = new Set<string>();
    for (const e of employees) {
      set.add(e.id);
      set.add(e.name.toLowerCase());
    }
    return set;
  }, [employees]);

  useEffect(() => {
    if (!open) return;
    setTeam(null);
    setKept(new Set());
    setError(null);
    setSubmitting(false);
  }, [open]);

  if (!open) return null;

  const handlePickTeam = (t: AgentTeam) => {
    setTeam(t);
    // Pre-select every template that doesn't already conflict.
    const next = new Set<string>();
    for (const tid of t.template_ids) {
      const tpl = getTemplateById(tid);
      if (!tpl) continue;
      const conflicts =
        existingIds.has(tpl.id) || existingIds.has(tpl.name.toLowerCase());
      if (!conflicts) next.add(tid);
    }
    setKept(next);
  };

  const toggleTemplate = (tid: string, disabled: boolean) => {
    if (disabled) return;
    setKept((prev) => {
      const next = new Set(prev);
      if (next.has(tid)) next.delete(tid);
      else next.add(tid);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!team) return;
    if (kept.size === 0) {
      setError("Pick at least one agent to create.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/teams/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          team_id: team.id,
          include_template_ids: Array.from(kept),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as
        | (ApplyResult & { error?: string })
        | { error?: string };
      if (!res.ok) {
        setError(
          (data as { error?: string }).error ?? `HTTP ${res.status}`,
        );
        setSubmitting(false);
        return;
      }
      onApplied?.(data as ApplyResult);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => !submitting && onOpenChange(false)}
    >
      <div
        className="card-surface w-full max-w-3xl p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {team === null ? (
          <TeamPicker
            onPick={handlePickTeam}
            onCancel={() => onOpenChange(false)}
          />
        ) : (
          <TeamPreview
            team={team}
            kept={kept}
            existingIds={existingIds}
            onToggle={toggleTemplate}
            onBack={() => {
              setTeam(null);
              setKept(new Set());
              setError(null);
            }}
            onSubmit={handleSubmit}
            onCancel={() => onOpenChange(false)}
            submitting={submitting}
            error={error}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — pick a team
// ---------------------------------------------------------------------------

function TeamPicker({
  onPick,
  onCancel,
}: {
  onPick: (t: AgentTeam) => void;
  onCancel: () => void;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Users size={16} className="text-accent" />
            <h2 className="text-lg font-semibold text-primary">Add Team</h2>
          </div>
          <p className="mt-1 text-sm text-muted">
            Spin up a pre-built bundle of agents that work together. You can
            tweak who's included on the next step.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-strong px-2 py-1 text-xs font-medium text-secondary hover:bg-surface-muted"
        >
          Cancel
        </button>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {AGENT_TEAMS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t)}
            className="group flex h-full flex-col gap-3 rounded-lg border border-subtle bg-white p-4 text-left transition hover:border-accent hover:shadow-sm"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              {t.name}
              <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                {t.template_ids.length} agents
              </span>
            </div>
            <p className="text-[11px] leading-snug text-secondary">
              {t.description}
            </p>
            <div className="mt-1 flex -space-x-2">
              {t.template_ids.map((tid) => {
                const tpl = getTemplateById(tid);
                if (!tpl) return null;
                return (
                  <div
                    key={tid}
                    className="rounded-full ring-2 ring-white"
                    title={`${tpl.name} — ${tpl.role}`}
                  >
                    <AgentAvatar
                      value={tpl.avatar_id}
                      name={tpl.name}
                      size={28}
                      accent={tpl.accent}
                    />
                  </div>
                );
              })}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — preview + per-agent toggles
// ---------------------------------------------------------------------------

function TeamPreview({
  team,
  kept,
  existingIds,
  onToggle,
  onBack,
  onSubmit,
  onCancel,
  submitting,
  error,
}: {
  team: AgentTeam;
  kept: Set<string>;
  existingIds: Set<string>;
  onToggle: (tid: string, disabled: boolean) => void;
  onBack: () => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const rows = team.template_ids
    .map((tid): { tpl: AgentTemplate; conflicts: boolean } | null => {
      const tpl = getTemplateById(tid);
      if (!tpl) return null;
      const conflicts =
        existingIds.has(tpl.id) || existingIds.has(tpl.name.toLowerCase());
      return { tpl, conflicts };
    })
    .filter((r): r is { tpl: AgentTemplate; conflicts: boolean } => r !== null);

  const keptCount = rows.filter((r) => !r.conflicts && kept.has(r.tpl.id)).length;

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={onBack}
            disabled={submitting}
            className="inline-flex items-center gap-1 rounded-md border border-strong bg-white px-2 py-1 text-[11px] font-medium text-secondary hover:bg-surface-muted disabled:opacity-60"
          >
            <ChevronLeft size={12} />
            Pick different team
          </button>
          <h2 className="mt-3 text-lg font-semibold text-primary">
            {team.name}
          </h2>
          <p className="mt-1 text-sm text-muted">{team.description}</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-lg border border-strong px-2 py-1 text-xs font-medium text-secondary hover:bg-surface-muted disabled:opacity-60"
        >
          Cancel
        </button>
      </div>

      <div className="mt-5 flex flex-col gap-2">
        {rows.map(({ tpl, conflicts }) => {
          const checked = !conflicts && kept.has(tpl.id);
          return (
            <label
              key={tpl.id}
              className={
                "flex cursor-pointer items-center gap-3 rounded-lg border border-subtle bg-white p-3 transition " +
                (conflicts
                  ? "cursor-not-allowed opacity-60"
                  : "hover:border-accent")
              }
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={conflicts || submitting}
                onChange={() => onToggle(tpl.id, conflicts || submitting)}
                className="size-4 accent-accent"
              />
              <AgentAvatar
                value={tpl.avatar_id}
                name={tpl.name}
                size={36}
                accent={tpl.accent}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-primary">
                    {tpl.name}
                  </span>
                  {conflicts ? (
                    <span className="rounded-full bg-status-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-status-warning">
                      Already exists
                    </span>
                  ) : null}
                </div>
                <div className="truncate text-[11px] text-secondary">
                  {tpl.role}
                </div>
                <p className="mt-0.5 line-clamp-1 text-[11px] text-muted">
                  {tpl.short_pitch}
                </p>
              </div>
            </label>
          );
        })}
      </div>

      {error ? (
        <div className="mt-3 rounded-md border border-status-error/40 bg-status-error/10 px-3 py-2 text-[11px] text-status-error">
          {error}
        </div>
      ) : null}

      <div className="mt-5 flex items-center justify-between">
        <div className="text-[11px] text-muted">
          {keptCount} of {rows.length} agent{rows.length === 1 ? "" : "s"} will be
          created
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-lg border border-strong px-3 py-2 text-sm font-medium text-secondary hover:bg-surface-muted disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting || keptCount === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Users size={14} />
            )}
            {submitting ? "Creating…" : `Create team (${keptCount})`}
          </button>
        </div>
      </div>
    </div>
  );
}
