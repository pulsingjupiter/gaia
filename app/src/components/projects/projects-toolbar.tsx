"use client";
/**
 * ProjectsToolbar — search input, status filter, sort dropdown.
 *
 * Pure controlled component — owns no state. The parent owns `query`,
 * `status`, `sort` and passes setters in.
 */
import { ChevronDown, Search } from "lucide-react";

export type StatusFilter = "all" | "active" | "idle" | "archived";
export type SortOrder = "active" | "recent" | "alpha";

export const STATUS_LABELS: Record<StatusFilter, string> = {
  all: "All",
  active: "Active",
  idle: "Idle",
  archived: "Archived",
};

export const SORT_LABELS: Record<SortOrder, string> = {
  active: "Most active",
  recent: "Recently created",
  alpha: "Alphabetical",
};

type Props = {
  query: string;
  onQuery: (q: string) => void;
  status: StatusFilter;
  onStatus: (s: StatusFilter) => void;
  sort: SortOrder;
  onSort: (s: SortOrder) => void;
};

export function ProjectsToolbar({
  query,
  onQuery,
  status,
  onStatus,
  sort,
  onSort,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[220px] flex-1">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search projects by name or path…"
          className="w-full rounded-lg border border-strong bg-white py-2 pl-8 pr-3 text-xs outline-none focus:border-accent"
        />
      </div>

      <SelectShell
        value={status}
        labels={STATUS_LABELS}
        onChange={(v) => onStatus(v as StatusFilter)}
        prefix="Status:"
      />
      <SelectShell
        value={sort}
        labels={SORT_LABELS}
        onChange={(v) => onSort(v as SortOrder)}
        prefix="Sort:"
      />
    </div>
  );
}

function SelectShell<T extends string>({
  value,
  labels,
  onChange,
  prefix,
}: {
  value: T;
  labels: Record<T, string>;
  onChange: (v: T) => void;
  prefix: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="appearance-none rounded-lg border border-strong bg-white py-2 pl-3 pr-7 text-xs font-medium text-secondary hover:bg-surface-muted focus:border-accent focus:outline-none"
      >
        {(Object.entries(labels) as Array<[T, string]>).map(([k, label]) => (
          <option key={k} value={k}>
            {prefix} {label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={12}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted"
      />
    </div>
  );
}
