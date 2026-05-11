"use client";
/**
 * /agents — list page. The single source of truth for "manage my AI workforce".
 *
 * Lives alongside /playbooks (which keeps the playbook concept distinct).
 * Reuses the existing employees-context + employee-modal so create/edit
 * flows match every other surface that touches an agent.
 */
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Users } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { EmployeeModal } from "@/components/employees/employee-modal";
import { AddTeamModal } from "@/components/employees/add-team-modal";
import { useEmployees } from "@/components/employees/employees-context";
import type { Employee } from "@/lib/types";
import { AgentCard } from "@/components/agents/agent-card";

type SortMode = "newest" | "alpha";

type AgentStats = {
  runs: number;
  avgCostUsd: number;
};

type RunLite = {
  employee_id: string;
  cost_usd: number;
};

const RUNS_FETCH_LIMIT = 500;

export default function AgentsPage() {
  const { employees, remove, refresh } = useEmployees();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("newest");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [statsByAgent, setStatsByAgent] = useState<Record<string, AgentStats>>({});

  // Visible workforce: hide the system pseudo-agent and any archived rows.
  const visible = useMemo(() => {
    return employees.filter((e) => e.id !== "system" && !e.internalOnly);
  }, [employees]);

  // Filter + sort.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = visible;
    if (q) {
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) || e.role.toLowerCase().includes(q),
      );
    }
    if (sort === "alpha") {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    }
    // 'newest' falls back to the natural order from /api/employees, which is
    // ordered by created_at ASC. We invert for "newest first".
    if (sort === "newest") {
      list = [...list].reverse();
    }
    return list;
  }, [visible, query, sort]);

  // One global runs fetch → bucket per agent. Avoids N+1 fetches per card.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/runs?limit=${RUNS_FETCH_LIMIT}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { runs?: RunLite[] };
        if (cancelled) return;
        const buckets: Record<string, { count: number; total: number }> = {};
        for (const r of data.runs ?? []) {
          const b = (buckets[r.employee_id] ??= { count: 0, total: 0 });
          b.count += 1;
          b.total += Number.isFinite(r.cost_usd) ? r.cost_usd : 0;
        }
        const out: Record<string, AgentStats> = {};
        for (const [id, b] of Object.entries(buckets)) {
          out[id] = {
            runs: b.count,
            avgCostUsd: b.count > 0 ? b.total / b.count : 0,
          };
        }
        setStatsByAgent(out);
      } catch {
        // ignore — cards just show 0/0.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (e: Employee) => {
    setEditing(e);
    setModalOpen(true);
  };

  const handleArchive = (e: Employee) => {
    if (typeof window === "undefined") return;
    const ok = window.confirm(
      `Archive ${e.name}? They will be hidden from the active list.`,
    );
    if (ok) remove(e.id);
  };

  return (
    <div className="px-6 py-6">
      <PageHeader
        title="Agents"
        subtitle="Your AI workforce. Name them, give them avatars, define their personas."
        right={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTeamModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-strong bg-white px-3 py-2 text-xs font-semibold text-secondary hover:bg-surface-muted"
            >
              <Users size={14} />
              Add Team
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
            >
              <Plus size={14} />
              Add Agent
            </button>
          </div>
        }
      />

      <div className="mb-5 flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or role…"
            className="w-full rounded-lg border border-strong bg-white py-2 pl-8 pr-3 text-sm outline-none placeholder:text-muted focus:border-accent"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          className="rounded-lg border border-strong bg-white px-3 py-2 text-xs font-medium text-secondary outline-none focus:border-accent"
          aria-label="Sort agents"
        >
          <option value="newest">Newest</option>
          <option value="alpha">Alphabetical</option>
        </select>
      </div>

      {shown.length === 0 ? (
        <div className="card-surface flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <p className="text-sm font-semibold text-primary">
            No agents yet.
          </p>
          <p className="text-xs text-secondary">
            Add your first agent to start.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
          >
            <Plus size={14} />
            Add Agent
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((e) => (
            <AgentCard
              key={e.id}
              employee={e}
              stats={statsByAgent[e.id] ?? { runs: 0, avgCostUsd: 0 }}
              onEdit={() => openEdit(e)}
              onArchive={() => handleArchive(e)}
            />
          ))}
        </div>
      )}

      <EmployeeModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        employee={editing}
      />
      <AddTeamModal
        open={teamModalOpen}
        onOpenChange={setTeamModalOpen}
        onApplied={() => {
          // Refresh the list so newly scaffolded agents appear immediately.
          refresh();
        }}
      />
    </div>
  );
}
