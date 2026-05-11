"use client";
import { useState } from "react";
import Link from "next/link";
import { MoreHorizontal, Plus, Trash2, Pencil, Loader2 } from "lucide-react";
import { AgentAvatar } from "@/components/shared/agent-avatar";
import { StatusPill } from "@/components/ui/status-pill";
import { useEmployees } from "@/components/employees/employees-context";
import { EmployeeModal } from "@/components/employees/employee-modal";
import type { Employee } from "@/lib/types";

export function WorkforcePanel() {
  const { employees: allEmployees, remove, loading } = useEmployees();
  // Hide internal pseudo-agents (e.g. 'system') from the management UI; they
  // remain in useEmployees() for FK joins + avatar rendering elsewhere.
  const employees = allEmployees.filter((e) => !e.internalOnly);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleRemove = (e: Employee) => {
    if (!window.confirm(`Remove ${e.name}?`)) return;
    setBusyId(e.id);
    setMenuOpen(null);
    remove(e.id);
    // Optimistic UI: clear busy state after a short tick.
    setTimeout(() => setBusyId(null), 400);
  };

  return (
    <div className="card-surface p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="section-header">Gaia Workforce</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90"
          >
            <Plus size={12} /> Add Agent
          </button>
          <Link
            href="/agents"
            className="text-[11px] font-medium text-accent hover:underline"
          >
            View team →
          </Link>
        </div>
      </div>

      {loading && employees.length === 0 ? (
        <div className="mt-4 flex items-center justify-center gap-2 py-6 text-xs text-muted">
          <Loader2 size={14} className="animate-spin" />
          Loading workforce…
        </div>
      ) : null}

      <ul className="mt-3 flex flex-col">
        {employees.map((e) => (
          <li
            key={e.id}
            className="group relative flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-muted"
          >
            <AgentAvatar value={e.avatar} name={e.name} size={40} accent={e.accent} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-primary">
                {e.name}
              </div>
              <div className="truncate text-[11px] text-muted">
                {e.role}
              </div>
            </div>
            <StatusPill status={e.status} />
            <button
              onClick={() => setMenuOpen(menuOpen === e.id ? null : e.id)}
              className="ml-1 rounded-md p-1 text-muted opacity-0 transition group-hover:opacity-100 hover:bg-white"
              aria-label="More"
              disabled={busyId === e.id}
            >
              {busyId === e.id ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <MoreHorizontal size={14} />
              )}
            </button>
            {menuOpen === e.id ? (
              <div
                className="absolute right-2 top-10 z-10 w-32 rounded-lg border border-subtle bg-white py-1 shadow-lg"
                onMouseLeave={() => setMenuOpen(null)}
              >
                <button
                  onClick={() => {
                    setEditing(e);
                    setModalOpen(true);
                    setMenuOpen(null);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-secondary hover:bg-surface-muted"
                >
                  <Pencil size={12} /> Edit
                </button>
                <button
                  onClick={() => handleRemove(e)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-status-error hover:bg-surface-muted"
                >
                  <Trash2 size={12} /> Remove
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <EmployeeModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        employee={editing}
      />
    </div>
  );
}
