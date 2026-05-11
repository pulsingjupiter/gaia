"use client";
/**
 * /projects — observe and orchestrate Claude Code sessions across projects.
 *
 * - Card grid (3/2/1 cols) of all auto-discovered + manual projects.
 * - Toolbar: search, status filter (All/Active/Idle/Archived), sort.
 * - Live updates via global `useSessionStream`: pulses cards as events arrive
 *   and patches their last_event_summary in place without refetching.
 * - "+ Add Project" opens a modal that POSTs to /api/projects.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { FolderOpen, Plus, Telescope, X } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { ProjectCard } from "@/components/projects/project-card";
import { AddProjectModal } from "@/components/projects/add-project-modal";
import { PlanWithClaudeModal } from "@/components/projects/plan-with-claude-modal";
import {
  ProjectsToolbar,
  type SortOrder,
  type StatusFilter,
} from "@/components/projects/projects-toolbar";
import { useProjectsWithStats } from "@/lib/hooks/use-projects";
import { useSessionStream } from "@/lib/hooks/use-session-stream";

function isActive(p: { stats: { active_count: number } }): boolean {
  return (p.stats.active_count ?? 0) > 0;
}

export default function ProjectsPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortOrder>("active");
  const [modalOpen, setModalOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [planProjectId, setPlanProjectId] = useState<string | null>(null);
  const [planProjectName, setPlanProjectName] = useState<string | undefined>(undefined);

  const includeArchived = status === "archived";
  const {
    projects,
    loading,
    error,
    refresh,
    archive,
    applySessionSignal,
  } = useProjectsWithStats({ includeArchived });
  const { events } = useSessionStream();

  // Track per-project pulse + summary from the SSE feed.
  const [pulseMap, setPulseMap] = useState<Record<string, number>>({});
  const [liveSummary, setLiveSummary] = useState<Record<string, string>>({});
  const lastIndexRef = useRef(0);

  useEffect(() => {
    if (events.length === lastIndexRef.current) return;
    const fresh = events.slice(lastIndexRef.current);
    lastIndexRef.current = events.length;

    for (const ev of fresh) {
      if (!ev.project_id) continue;
      setPulseMap((prev) => ({ ...prev, [ev.project_id]: ev.ts }));
      if (ev.summary) {
        setLiveSummary((prev) => ({ ...prev, [ev.project_id]: ev.summary as string }));
      }
      applySessionSignal(ev.project_id, { ts: ev.ts, summary: ev.summary });
    }
  }, [events, applySessionSignal]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = projects;
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.path.toLowerCase().includes(q),
      );
    }
    if (status === "active") list = list.filter(isActive);
    else if (status === "idle") list = list.filter((p) => !isActive(p) && !p.archived);
    else if (status === "archived") list = list.filter((p) => p.archived === 1);
    else list = list.filter((p) => p.archived === 0);

    const sorted = [...list];
    if (sort === "alpha") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "recent") {
      sorted.sort((a, b) => b.created_at - a.created_at);
    } else {
      // most active: active first, then by last_event_at desc, then sessions_count
      sorted.sort((a, b) => {
        const aActive = isActive(a) ? 1 : 0;
        const bActive = isActive(b) ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;
        const aLast = a.stats.last_event_at ?? 0;
        const bLast = b.stats.last_event_at ?? 0;
        if (aLast !== bLast) return bLast - aLast;
        return (b.stats.sessions_count ?? 0) - (a.stats.sessions_count ?? 0);
      });
    }
    return sorted;
  }, [projects, query, status, sort]);

  const showSkeleton = loading && projects.length === 0;
  const showEmpty = !loading && filtered.length === 0;

  return (
    <div className="px-6 py-6">
      <PageHeader
        title="Projects"
        subtitle="Observe and orchestrate Claude Code sessions across your work."
        right={
          <div className="inline-flex items-center gap-2">
            <button
              type="button"
              onClick={() => setScanOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-strong bg-white px-3 py-2 text-xs font-semibold text-secondary transition hover:bg-surface-muted"
            >
              <Telescope size={14} />
              Scan
            </button>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90"
            >
              <Plus size={14} />
              Add Project
            </button>
          </div>
        }
      />

      <div className="space-y-4">
        <ProjectsToolbar
          query={query}
          onQuery={setQuery}
          status={status}
          onStatus={setStatus}
          sort={sort}
          onSort={setSort}
        />
      </div>

      {error ? (
        <div className="mt-4 rounded-md border border-status-error/30 bg-status-error/10 px-3 py-2 text-xs text-status-error">
          {error}
        </div>
      ) : null}

      {showSkeleton ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <ProjectCardSkeleton key={i} />
          ))}
        </div>
      ) : showEmpty ? (
        <EmptyState
          query={query}
          onAdd={() => setModalOpen(true)}
        />
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              liveSummary={liveSummary[p.id]}
              pulseKey={pulseMap[p.id]}
              onArchive={async (id) => {
                const ok = await archive(id);
                if (ok) void refresh();
              }}
            />
          ))}
        </div>
      )}

      <AddProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => void refresh()}
        onPlanWithClaude={(p) => {
          setPlanProjectId(p.id);
          setPlanProjectName(p.name);
        }}
      />

      <PlanWithClaudeModal
        open={planProjectId !== null}
        projectId={planProjectId}
        projectName={planProjectName}
        onClose={() => setPlanProjectId(null)}
        onApplied={() => {
          void refresh();
        }}
      />

      <ScanModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onScanned={(msg) => {
          setToast(msg);
          window.setTimeout(() => setToast(null), 3500);
          void refresh();
        }}
      />

      {toast ? (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function ScanModal({
  open,
  onClose,
  onScanned,
}: {
  open: boolean;
  onClose: () => void;
  onScanned: (message: string) => void;
}) {
  const [baseDir, setBaseDir] = useState("~/Developer");
  const [submitting, setSubmitting] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setBaseDir("~/Developer");
      setSubmitting(false);
      setBrowsing(false);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleBrowse = async () => {
    if (browsing) return;
    setBrowsing(true);
    setError(null);
    try {
      const trimmed = baseDir.trim();
      const initial =
        trimmed && !trimmed.startsWith("~") ? trimmed : undefined;
      const res = await fetch("/api/system/pick-folder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          initial,
          prompt: "Choose folder to scan for projects",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        path?: string;
        cancelled?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? `Server returned ${res.status}`);
        return;
      }
      if (data.cancelled) return;
      if (typeof data.path === "string" && data.path) {
        setBaseDir(data.path);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBrowsing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // Server resolves "~/Developer" default itself when baseDir is omitted,
      // but if the user kept the literal "~/Developer" string we expand it here
      // so the absolute-path validator passes.
      const trimmed = baseDir.trim();
      const sendBaseDir = trimmed && !trimmed.startsWith("~") ? trimmed : undefined;
      const res = await fetch("/api/projects/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseDir: sendBaseDir }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        scanned?: number;
        added?: number;
        baseDir?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? `Server returned ${res.status}`);
        setSubmitting(false);
        return;
      }
      onScanned(
        `Scanned ${data.scanned ?? 0} dirs in ${data.baseDir ?? "?"} — added ${data.added ?? 0} project${data.added === 1 ? "" : "s"}`,
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="card-surface w-full max-w-md p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-primary">
              Scan for Projects
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Walks the chosen folder and registers every git repo it finds.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-surface-muted"
          >
            <X size={16} />
          </button>
        </div>

        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-1 flex items-center gap-1 text-[11px] font-medium text-secondary">
              Base directory
            </span>
            <div className="flex items-stretch gap-2">
              <input
                autoFocus
                value={baseDir}
                onChange={(e) => setBaseDir(e.target.value)}
                placeholder="/Users/you/Developer"
                className="w-full rounded-lg border border-strong bg-white px-3 py-2 font-mono text-xs outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => void handleBrowse()}
                disabled={browsing}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-strong bg-white px-2.5 py-2 text-xs font-medium text-secondary hover:bg-surface-muted disabled:opacity-60"
              >
                <FolderOpen size={12} />
                {browsing ? "Picking…" : "Browse…"}
              </button>
            </div>
            <span className="mt-1 block text-[10px] text-muted">
              Leave as `~/Developer` to use the default, or click Browse… to pick a folder.
            </span>
          </label>

          {error ? (
            <div className="rounded-md border border-status-error/30 bg-status-error/10 px-2.5 py-1.5 text-xs text-status-error">
              {error}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-strong bg-white px-3 py-2 text-xs font-medium text-secondary hover:bg-surface-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              <Telescope size={14} />
              {submitting ? "Scanning…" : "Scan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProjectCardSkeleton() {
  return (
    <div className="card-surface flex animate-pulse flex-col overflow-hidden p-0">
      <div className="h-[5px] w-full bg-surface-hover" />
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-surface-hover" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-32 rounded bg-surface-hover" />
            <div className="h-2.5 w-48 rounded bg-surface-hover" />
          </div>
        </div>
        <div className="h-3 w-24 rounded bg-surface-hover" />
        <div className="h-3 w-40 rounded bg-surface-hover" />
        <div className="mt-2 flex gap-1.5">
          <div className="h-4 w-16 rounded-full bg-surface-hover" />
          <div className="h-4 w-20 rounded-full bg-surface-hover" />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ query, onAdd }: { query: string; onAdd: () => void }) {
  return (
    <div className="card-surface mt-6 flex flex-col items-center justify-center gap-3 p-12 text-center">
      <div className="text-sm font-semibold text-primary">
        {query ? "No projects match your search." : "No projects yet."}
      </div>
      <p className="max-w-md text-xs text-secondary">
        {query
          ? "Try a different name or path fragment."
          : "Add a project to start observing Claude Code sessions."}
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
      >
        <Plus size={14} />
        Add Project
      </button>
    </div>
  );
}
