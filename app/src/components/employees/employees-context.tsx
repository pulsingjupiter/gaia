"use client";
/**
 * EmployeesProvider — thin context wrapper around the API-backed
 * `useEmployees` hook (Wave 2B). Kept so legacy callers that import
 * `useEmployees` from this module continue to work.
 *
 * The single source of truth is `/api/employees` via the hook in
 * `@/lib/hooks/use-employees`. Mutations go through the API and update
 * local state on success.
 */
import { createContext, useContext, useMemo } from "react";
import type { Employee } from "@/lib/types";
import { useEmployees as useEmployeesHook } from "@/lib/hooks/use-employees";

type Ctx = {
  employees: Employee[];
  /**
   * `opts.template_id` (Feature A) — when set, the server scaffolds the
   * agent dir from a preset template (`lib/agent-templates.ts`).
   */
  add: (
    e: Omit<Employee, "id" | "slug" | "initials">,
    opts?: { template_id?: string | null },
  ) => void;
  update: (id: string, patch: Partial<Employee>) => void;
  remove: (id: string) => void;
  /** Re-fetch /api/employees. Used after team apply (Feature B). */
  refresh: () => void;
  hydrated: boolean;
  loading: boolean;
  error: string | null;
};

const EmployeesContext = createContext<Ctx | null>(null);

export function EmployeesProvider({ children }: { children: React.ReactNode }) {
  const api = useEmployeesHook();

  const value = useMemo<Ctx>(
    () => ({
      employees: api.employees,
      add: (e, opts) => {
        void api.add(e, opts);
      },
      update: (id, patch) => {
        void api.update(id, patch);
      },
      remove: (id) => {
        void api.remove(id);
      },
      refresh: () => {
        void api.refresh();
      },
      hydrated: api.hydrated,
      loading: api.loading,
      error: api.error,
    }),
    [api],
  );

  return (
    <EmployeesContext.Provider value={value}>
      {children}
    </EmployeesContext.Provider>
  );
}

export function useEmployees() {
  const ctx = useContext(EmployeesContext);
  if (!ctx) throw new Error("useEmployees must be used within EmployeesProvider");
  return ctx;
}
