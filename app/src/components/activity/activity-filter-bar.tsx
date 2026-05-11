"use client";
/**
 * ActivityFilterBar — tabs (All / Runs / Sessions), multi-select project &
 * employee dropdowns, status checklist, date-range presets.
 *
 * The dropdowns are styled like the other filter pills used on the Sprint
 * and Playbooks pages.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ActivityFilters, ActivityTab, DatePreset } from "@/lib/hooks/use-activity-unified";
import type { ProjectRow } from "@/lib/hooks/use-projects";
import type { Employee } from "@/lib/types";

const TABS: { id: ActivityTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "runs", label: "Runs" },
  { id: "sessions", label: "Sessions" },
];

const STATUSES: { id: string; label: string }[] = [
  { id: "success", label: "Success" },
  { id: "error", label: "Error" },
  { id: "running", label: "Running" },
  { id: "active", label: "Active" },
  { id: "idle", label: "Idle" },
  { id: "ended", label: "Ended" },
];

const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "all", label: "All" },
];

export function ActivityFilterBar({
  filters,
  setFilters,
  projects,
  employees,
}: {
  filters: ActivityFilters;
  setFilters: (
    next: ActivityFilters | ((prev: ActivityFilters) => ActivityFilters),
  ) => void;
  projects: ProjectRow[];
  employees: Employee[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Tabs */}
      <div className="inline-flex rounded-lg border border-strong bg-white p-0.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setFilters((p) => ({ ...p, tab: t.id }))}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition",
              filters.tab === t.id
                ? "bg-accent-soft text-accent"
                : "text-secondary hover:bg-surface-muted",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <MultiSelect
        label="Project"
        items={projects.map((p) => ({ id: p.id, label: p.name }))}
        selected={filters.projectIds}
        onChange={(v) => setFilters((p) => ({ ...p, projectIds: v }))}
      />
      <MultiSelect
        label="Agent"
        items={employees.map((e) => ({ id: e.id, label: e.name }))}
        selected={filters.employeeIds}
        onChange={(v) => setFilters((p) => ({ ...p, employeeIds: v }))}
      />
      <MultiSelect
        label="Status"
        items={STATUSES}
        selected={filters.statuses}
        onChange={(v) => setFilters((p) => ({ ...p, statuses: v }))}
      />

      {/* Date preset */}
      <div className="inline-flex items-center gap-0.5 rounded-lg border border-strong bg-white p-0.5">
        {DATE_PRESETS.map((d) => (
          <button
            key={d.id}
            onClick={() => setFilters((p) => ({ ...p, date: d.id }))}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium",
              filters.date === d.id
                ? "bg-accent-soft text-accent"
                : "text-secondary hover:bg-surface-muted",
            )}
          >
            {d.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MultiSelect({
  label,
  items,
  selected,
  onChange,
}: {
  label: string;
  items: { id: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const display =
    selected.length === 0
      ? `All ${label.toLowerCase()}s`
      : selected.length === 1
        ? items.find((i) => i.id === selected[0])?.label ?? `1 ${label}`
        : `${selected.length} selected`;

  function toggle(id: string) {
    if (selected.includes(id)) onChange(selected.filter((s) => s !== id));
    else onChange([...selected, id]);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-strong bg-white px-3 py-1.5 text-xs font-medium",
          selected.length > 0
            ? "text-accent"
            : "text-secondary",
        )}
      >
        <span>
          {label}
          {selected.length > 0 ? `: ${display}` : ` · ${display}`}
        </span>
        <ChevronDown size={12} />
      </button>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+4px)] z-30 w-56 max-h-72 overflow-y-auto rounded-lg border border-subtle bg-white p-1 shadow-lg scroll-thin">
          {items.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted">
              No options
            </div>
          ) : (
            items.map((it) => {
              const on = selected.includes(it.id);
              return (
                <button
                  key={it.id}
                  onClick={() => toggle(it.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-surface-muted"
                >
                  <span className="truncate">{it.label}</span>
                  {on ? (
                    <Check size={12} className="text-accent" />
                  ) : null}
                </button>
              );
            })
          )}
          {selected.length > 0 ? (
            <button
              onClick={() => onChange([])}
              className="mt-0.5 block w-full rounded-md border-t border-subtle px-2 py-1.5 text-left text-[11px] text-muted hover:bg-surface-muted"
            >
              Clear
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
