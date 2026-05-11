"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, MoreHorizontal, Search, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { AgentAvatar } from "@/components/shared/agent-avatar";
import { AddPlaybookModal } from "@/components/playbooks/add-playbook-modal";
import { usePlaybooks, type PlaybookEntry } from "@/lib/hooks/use-playbooks";

const PAGE_CAP = 50;

export default function PlaybooksPage() {
  const { playbooks, loading, refresh } = usePlaybooks();
  const [query, setQuery] = useState("");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);

  const agentOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of playbooks) {
      if (!seen.has(p.agent_id)) seen.set(p.agent_id, p.agent_name);
    }
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [playbooks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return playbooks.filter((p) => {
      if (agentFilter !== "all" && p.agent_id !== agentFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.agent_name.toLowerCase().includes(q)
      );
    });
  }, [playbooks, query, agentFilter]);

  const visible = filtered.slice(0, PAGE_CAP);
  const overflow = Math.max(0, filtered.length - visible.length);

  return (
    <div className="px-6 py-6">
      <PageHeader
        title="Playbooks"
        subtitle="Reusable workflows your agents can run."
        right={
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
          >
            + Add Playbook
          </button>
        }
      />

      <AddPlaybookModal
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={() => {
          void refresh();
        }}
      />

      {!loading && playbooks.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <FilterBar
            query={query}
            setQuery={setQuery}
            agentFilter={agentFilter}
            setAgentFilter={setAgentFilter}
            agentOptions={agentOptions}
          />

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((p) => (
              <PlaybookCard key={p.id} playbook={p} />
            ))}
          </div>

          {visible.length === 0 ? (
            <p className="mt-6 text-center text-xs text-muted">
              No playbooks match these filters.
            </p>
          ) : null}

          <div className="mt-6 flex items-center justify-between text-xs text-muted">
            <span>
              {filtered.length === 0
                ? "0 playbooks"
                : `Showing ${visible.length} of ${filtered.length} ${
                    filtered.length === 1 ? "playbook" : "playbooks"
                  }`}
            </span>
            {overflow > 0 ? (
              <span>{overflow} more not shown — narrow the filter.</span>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function FilterBar({
  query,
  setQuery,
  agentFilter,
  setAgentFilter,
  agentOptions,
}: {
  query: string;
  setQuery: (v: string) => void;
  agentFilter: string;
  setAgentFilter: (v: string) => void;
  agentOptions: { id: string; name: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[220px] flex-1">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search playbooks…"
          className="w-full rounded-lg border border-strong bg-white py-2 pl-8 pr-3 text-xs outline-none focus:border-accent"
        />
      </div>
      <div className="relative">
        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="appearance-none rounded-lg border border-strong bg-white py-2 pl-3 pr-8 text-xs font-medium text-secondary outline-none hover:bg-surface-muted focus:border-accent"
        >
          <option value="all">All agents</option>
          {agentOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <ChevronDown
          size={12}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted"
        />
      </div>
    </div>
  );
}

function PlaybookCard({ playbook }: { playbook: PlaybookEntry }) {
  const accentSoft = `${playbook.agent_accent}1A`; // ~10% alpha hex suffix
  return (
    <Link
      href={`/agents/${playbook.agent_id}#skill-${playbook.name}`}
      className="card-surface group flex flex-col p-4 transition hover:border-accent hover:shadow-sm"
    >
      <div className="flex items-start justify-between">
        <div
          className="flex size-10 items-center justify-center rounded-xl"
          style={{ background: accentSoft }}
        >
          <Sparkles size={18} color={playbook.agent_accent} />
        </div>
        <button
          type="button"
          onClick={(e) => e.preventDefault()}
          className="rounded-md p-1 text-muted opacity-0 transition hover:bg-surface-muted group-hover:opacity-100"
        >
          <MoreHorizontal size={16} />
        </button>
      </div>
      <div className="mt-3 text-[15px] font-semibold text-primary">
        {playbook.name}
      </div>
      <p className="mt-1 line-clamp-2 text-xs text-secondary">
        {playbook.description || "No description."}
      </p>
      <span
        className="mt-3 inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold"
        style={{ background: accentSoft, color: playbook.agent_accent }}
      >
        {playbook.category}
      </span>
      <div className="mt-4 flex items-center justify-between border-t border-subtle pt-3">
        <div className="flex items-center gap-2">
          <AgentAvatar
            value={playbook.agent_avatar}
            name={playbook.agent_name}
            accent={playbook.agent_accent}
            size={20}
          />
          <span className="text-xs text-secondary">
            {playbook.agent_name}
          </span>
        </div>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="mt-10 flex justify-center">
      <div className="card-surface flex max-w-md flex-col items-center gap-3 p-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft">
          <Sparkles size={22} className="text-accent" />
        </div>
        <div className="text-base font-semibold text-primary">
          No playbooks yet
        </div>
        <p className="text-sm text-secondary">
          Playbooks are skills your agents can run. Add an agent first, then
          give it skills.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/agents"
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
          >
            + Add your first agent
          </Link>
          <Link
            href="/docs/getting-started"
            className="inline-flex items-center gap-1.5 rounded-lg border border-strong bg-white px-3 py-2 text-xs font-semibold text-secondary hover:bg-surface-muted"
          >
            Read the docs →
          </Link>
        </div>
      </div>
    </div>
  );
}
