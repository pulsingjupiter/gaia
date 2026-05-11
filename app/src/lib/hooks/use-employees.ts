"use client";
/**
 * useEmployees — fetch-backed employee state with optimistic updates.
 *
 * Replaces the localStorage-only mock. On mount: hydrate from a small
 * localStorage cache (instant render), then GET /api/employees and reconcile.
 *
 * Exposes the same Employee shape the existing UI uses, so legacy callers
 * (Workforce panel, sidebar, activity feed, etc.) keep working without
 * changes. The DB row shape (`EmployeeRow` from the API) is mapped to
 * the UI `Employee` shape inside this module — keep that mapping local.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Employee, EmployeeStatus } from "@/lib/types";

// ---- Types matching Wave 2A's API ----
export type EmployeeRow = {
  id: string;
  name: string;
  role: string;
  status: "idle" | "running" | "error";
  accent_color: string | null;
  avatar_emoji: string | null;
  agent_dir: string;
  created_at: number;
  /**
   * Wave 2B: rows with internal_only=1 (e.g. the 'system' pseudo-agent that
   * owns session-ended notifications) are present for FK joins + avatar
   * rendering but should be hidden from agent-management UIs.
   */
  internal_only?: 0 | 1;
};

const CACHE_KEY = "gaia.employees.cache";
const DEFAULT_ACCENT = "#5B5BD6";

// ---- Helpers ----
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || name
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function uiStatus(s: EmployeeRow["status"]): EmployeeStatus {
  // Map DB status onto the legacy 3-state UI pill.
  // - 'idle' → Online (agent is ready/awaiting work)
  // - 'running' → Busy (agent is actively working)
  // - 'error' → Idle (agent is parked; failure surfaced elsewhere)
  if (s === "running") return "Busy";
  if (s === "error") return "Idle";
  return "Online";
}

function dbStatus(s: EmployeeStatus): EmployeeRow["status"] {
  if (s === "Busy") return "running";
  if (s === "Idle") return "error";
  return "idle";
}

function rowToEmployee(row: EmployeeRow): Employee {
  return {
    id: row.id,
    slug: slugify(row.name) || row.id,
    name: row.name,
    role: row.role,
    status: uiStatus(row.status),
    accent: row.accent_color ?? DEFAULT_ACCENT,
    initials: initialsOf(row.name),
    handle: `@${slugify(row.name) || row.id}`,
    avatar: row.avatar_emoji ?? null,
    internalOnly: row.internal_only === 1,
  };
}

function rowsToEmployees(rows: EmployeeRow[]): Employee[] {
  return rows.map(rowToEmployee);
}

// ---- Hook ----
export type UseEmployees = {
  employees: Employee[];
  loading: boolean;
  error: string | null;
  hydrated: boolean;
  refresh: () => Promise<void>;
  add: (
    e: Omit<Employee, "id" | "slug" | "initials">,
    opts?: { template_id?: string | null },
  ) => Promise<Employee | null>;
  update: (id: string, patch: Partial<Employee>) => Promise<Employee | null>;
  remove: (id: string) => Promise<boolean>;
};

export function useEmployees(): UseEmployees {
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const initialFetchDone = useRef(false);

  // Hydrate from localStorage cache for instant first paint.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as EmployeeRow[];
        if (Array.isArray(cached)) setRows(cached);
      }
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  // Persist cache whenever rows change (after hydration).
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(rows));
    } catch {
      // ignore
    }
  }, [rows, hydrated]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/employees", { cache: "no-store" });
      if (!res.ok) throw new Error(`GET /api/employees ${res.status}`);
      const data = (await res.json()) as { employees: EmployeeRow[] };
      setRows(data.employees ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch.
  useEffect(() => {
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;
    void refresh();
  }, [refresh]);

  const add: UseEmployees["add"] = useCallback(async (input, opts) => {
    try {
      const body: Record<string, unknown> = {
        name: input.name,
        role: input.role,
        status: dbStatus(input.status),
        accent_color: input.accent,
      };
      if (input.avatar !== undefined) body.avatar_emoji = input.avatar;
      if (opts?.template_id) body.template_id = opts.template_id;
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`POST /api/employees ${res.status}`);
      const data = (await res.json()) as { employee: EmployeeRow };
      setRows((prev) => [...prev, data.employee]);
      return rowToEmployee(data.employee);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, []);

  const update: UseEmployees["update"] = useCallback(async (id, patch) => {
    try {
      const body: Record<string, unknown> = {};
      if (patch.name !== undefined) body.name = patch.name;
      if (patch.role !== undefined) body.role = patch.role;
      if (patch.status !== undefined) body.status = dbStatus(patch.status);
      if (patch.accent !== undefined) body.accent_color = patch.accent;
      if (patch.avatar !== undefined) body.avatar_emoji = patch.avatar;
      const res = await fetch(`/api/employees/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`PATCH /api/employees/${id} ${res.status}`);
      const data = (await res.json()) as { employee: EmployeeRow };
      setRows((prev) =>
        prev.map((r) => (r.id === id ? data.employee : r)),
      );
      return rowToEmployee(data.employee);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, []);

  const remove: UseEmployees["remove"] = useCallback(async (id) => {
    try {
      const res = await fetch(`/api/employees/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`DELETE /api/employees/${id} ${res.status}`);
      setRows((prev) => prev.filter((r) => r.id !== id));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }, []);

  return {
    employees: rowsToEmployees(rows),
    loading,
    error,
    hydrated,
    refresh,
    add,
    update,
    remove,
  };
}

// Re-exported helpers in case other modules need them.
export { rowToEmployee, rowsToEmployees, uiStatus, dbStatus };
