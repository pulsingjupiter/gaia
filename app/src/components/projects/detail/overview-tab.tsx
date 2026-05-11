"use client";
/**
 * OverviewTab — default landing surface for /projects/[id]. Renders a
 * description block (inline-editable), the existing status strip wrapped in
 * a "STATUS" section, a two-column rail (Active Milestones / Recent
 * Activity), a Quick Actions row, and a muted Details footer.
 *
 * Composes existing hooks (`useMilestones`, `useProjectSessions`,
 * `useEmployees`) rather than introducing new data sources. The launch
 * popover targets `/api/agents/[id]/launch` with a `cwd` override so the
 * Claude Code session is pinned to the project root regardless of which
 * agent persona is selected.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  ChevronRight,
  FileText,
  Pencil,
  Plus,
  Play,
  Sparkles,
} from "lucide-react";

import { cn } from "@/lib/cn";
import { useMilestones, type MilestoneRow } from "@/lib/hooks/use-milestones";
import { useProjectSessions } from "@/lib/hooks/use-project-sessions";
import type { SessionRow } from "@/lib/hooks/use-project-sessions";
import { useEmployees } from "@/components/employees/employees-context";
import { AgentAvatar } from "@/components/shared/agent-avatar";
import { ProjectStatusStrip } from "./status-strip";
import type {
  ProjectRow,
  UseProjectDetail,
} from "@/lib/hooks/use-project-detail";
import type { Employee } from "@/lib/types";
import { relativeTime } from "./format";

type Props = {
  project: ProjectRow;
  update: UseProjectDetail["update"];
  onPlanWithClaude: () => void;
  onAddTask: () => void;
  onSwitchTab: (tab: "milestones" | "sessions") => void;
};

type Tone = {
  dot: string;
  bg: string;
  fg: string;
  label: string;
};

function urgencyTone(m: MilestoneRow): Tone {
  if (m.due_date == null) {
    return { dot: "#10B981", bg: "#D1FAE5", fg: "#047857", label: "No due date" };
  }
  const diff = m.due_date - Date.now();
  if (diff < 0) return { dot: "#EF4444", bg: "#FEE2E2", fg: "#B91C1C", label: "Overdue" };
  if (diff <= 7 * 86_400_000) {
    return { dot: "#F59E0B", bg: "#FEF3C7", fg: "#B45309", label: "Due soon" };
  }
  return { dot: "#10B981", bg: "#D1FAE5", fg: "#047857", label: "On track" };
}

function formatDueChip(ms: number | null): string {
  if (ms == null) return "No due date";
  const d = new Date(ms);
  const diff = ms - Date.now();
  const dayMs = 86_400_000;
  if (diff < -dayMs)
    return `Overdue ${Math.abs(Math.floor(diff / dayMs))}d`;
  if (diff < 0) return `Due today`;
  if (diff < dayMs) return `Due today`;
  if (diff < 2 * dayMs) return `Due tomorrow`;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

function formatAbsoluteDate(ms: number | null | undefined): string {
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatUpdated(ms: number | null | undefined): string {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 2 * 86_400_000) return "yesterday";
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return formatAbsoluteDate(ms);
}

export function OverviewTab({
  project,
  update,
  onPlanWithClaude,
  onAddTask,
  onSwitchTab,
}: Props) {
  const { milestones, loading: milestonesLoading } = useMilestones(project.id);
  const { sessions, loading: sessionsLoading } = useProjectSessions(project.id);

  const activeMilestones = useMemo(() => {
    return milestones
      .filter((m) => m.status === "active")
      .sort((a, b) => {
        const da = a.due_date ?? Number.POSITIVE_INFINITY;
        const db = b.due_date ?? Number.POSITIVE_INFINITY;
        return da - db;
      })
      .slice(0, 3);
  }, [milestones]);

  const recentSessions = useMemo(
    () => sessions.slice(0, 5),
    [sessions],
  );

  const [taskCounts, setTaskCounts] = useState<
    Record<string, { total: number; done: number }>
  >({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/tasks?project_id=${encodeURIComponent(project.id)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          tasks: Array<{ milestone_id: string | null; status: string }>;
        };
        if (cancelled) return;
        const map: Record<string, { total: number; done: number }> = {};
        for (const t of data.tasks ?? []) {
          if (!t.milestone_id) continue;
          const cur = map[t.milestone_id] ?? { total: 0, done: 0 };
          cur.total += 1;
          if (t.status === "done") cur.done += 1;
          map[t.milestone_id] = cur;
        }
        setTaskCounts(map);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id, milestones]);

  return (
    <div className="space-y-6">
      <DescriptionBlock project={project} update={update} />

      <section>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Status
        </h3>
        <ProjectStatusStrip projectId={project.id} />
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ActiveMilestonesCard
          loading={milestonesLoading && milestones.length === 0}
          milestones={activeMilestones}
          counts={taskCounts}
          projectId={project.id}
          onAdd={() => onSwitchTab("milestones")}
        />

        <RecentActivityCard
          loading={sessionsLoading && sessions.length === 0}
          sessions={recentSessions}
          project={project}
          onSwitchSessions={() => onSwitchTab("sessions")}
        />
      </div>

      <QuickActions
        project={project}
        onPlanWithClaude={onPlanWithClaude}
        onAddTask={onAddTask}
      />

      <DetailsFooter project={project} />
    </div>
  );
}

// ── Section A — Description ─────────────────────────────────────────────

function DescriptionBlock({
  project,
  update,
}: {
  project: ProjectRow;
  update: UseProjectDetail["update"];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.description ?? "");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(project.description ?? "");
      setErrorMsg(null);
    }
  }, [project.description, editing]);

  useEffect(() => {
    if (editing && taRef.current) {
      taRef.current.focus();
      const len = taRef.current.value.length;
      taRef.current.setSelectionRange(len, len);
    }
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setEditing(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  async function handleSave() {
    setSaving(true);
    setErrorMsg(null);
    const next = draft.trim() ? draft : null;
    const result = await update({ description: next });
    setSaving(false);
    if (result) {
      setEditing(false);
    } else {
      setErrorMsg("Could not save — please try again.");
    }
  }

  const description = project.description?.trim() ?? "";

  if (editing) {
    return (
      <section className="card-surface px-4 py-3.5">
        <div className="mb-2 flex items-center gap-2">
          <FileText size={14} className="text-secondary" />
          <h3 className="text-sm font-semibold text-primary">Description</h3>
        </div>
        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={Math.max(4, Math.min(12, draft.split("\n").length + 1))}
          placeholder="What is this project for? Who is it for? What does done look like?"
          className="w-full resize-y rounded-lg border border-strong bg-white px-3 py-2 text-sm leading-relaxed text-primary focus:outline-none"
        />
        {errorMsg ? (
          <p className="mt-2 text-[11px] font-medium text-status-error">
            {errorMsg}
          </p>
        ) : null}
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
            className="rounded-lg border border-strong bg-white px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </section>
    );
  }

  if (!description) {
    return (
      <section className="card-surface px-4 py-5">
        <div className="mb-2 flex items-center gap-2">
          <FileText size={14} className="text-secondary" />
          <h3 className="text-sm font-semibold text-primary">Description</h3>
        </div>
        <p className="text-sm text-secondary">
          Give agents and collaborators context for this project — what it&apos;s
          for, who it&apos;s for, what done looks like.
        </p>
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-strong bg-white px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-muted"
          >
            <Plus size={12} /> Add description
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="card-surface px-4 py-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-secondary" />
          <h3 className="text-sm font-semibold text-primary">Description</h3>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1 rounded-md border border-strong bg-white px-2 py-1 text-[11px] font-medium text-secondary hover:bg-surface-muted"
        >
          <Pencil size={11} /> Edit
        </button>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-secondary">
        {description}
      </p>
    </section>
  );
}

// ── Section C left — Active Milestones ──────────────────────────────────

function ActiveMilestonesCard({
  loading,
  milestones,
  counts,
  projectId,
  onAdd,
}: {
  loading: boolean;
  milestones: MilestoneRow[];
  counts: Record<string, { total: number; done: number }>;
  projectId: string;
  onAdd: () => void;
}) {
  return (
    <section className="card-surface px-4 py-3.5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Active Milestones
        </h3>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
        >
          All milestones <ChevronRight size={11} />
        </button>
      </div>
      {loading ? (
        <p className="py-4 text-xs text-muted">Loading milestones…</p>
      ) : milestones.length === 0 ? (
        <div className="py-3 text-center">
          <p className="text-xs text-muted">No active milestones yet.</p>
          <button
            type="button"
            onClick={onAdd}
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
          >
            <Plus size={11} /> Add a milestone
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {milestones.map((m) => {
            const tone = urgencyTone(m);
            const c = counts[m.id] ?? { total: 0, done: 0 };
            const progress =
              c.total > 0 ? Math.max(2, Math.round((c.done / c.total) * 100)) : 0;
            return (
              <li key={m.id}>
                <Link
                  href={`/tasks?project=${encodeURIComponent(projectId)}&milestone=${encodeURIComponent(m.id)}`}
                  className="block rounded-lg border border-subtle px-3 py-2 hover:bg-surface-muted"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: tone.dot }}
                    />
                    <span className="truncate text-sm font-medium text-primary">
                      {m.name}
                    </span>
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{ background: tone.bg, color: tone.fg }}
                    >
                      {m.due_date != null ? <Calendar size={10} /> : null}
                      {formatDueChip(m.due_date)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted">
                    <div className="h-1.5 w-32 overflow-hidden rounded-full bg-surface-muted">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: c.total > 0 ? `${progress}%` : "0%",
                          background: tone.dot,
                        }}
                      />
                    </div>
                    <span>
                      <span className="font-semibold text-secondary">
                        {c.done}
                      </span>
                      /{c.total}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ── Section C right — Recent Activity ───────────────────────────────────

function RecentActivityCard({
  loading,
  sessions,
  project,
  onSwitchSessions,
}: {
  loading: boolean;
  sessions: SessionRow[];
  project: ProjectRow;
  onSwitchSessions: () => void;
}) {
  const accent = project.color ?? "#5B5BD6";
  const avatarName = project.agent_name ?? project.name;
  return (
    <section className="card-surface px-4 py-3.5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Recent Activity
        </h3>
        <button
          type="button"
          onClick={onSwitchSessions}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
        >
          Full history <ChevronRight size={11} />
        </button>
      </div>
      {loading ? (
        <p className="py-4 text-xs text-muted">Loading sessions…</p>
      ) : sessions.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted">
          No recent sessions. Launch an agent to get started.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link
                href={`/projects/${project.id}/sessions/${s.id}`}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-muted"
              >
                <AgentAvatar
                  value={project.agent_avatar}
                  name={avatarName}
                  size={20}
                  accent={accent}
                />
                <span className="shrink-0 text-[11px] font-medium text-muted">
                  {relativeTime(s.last_event_at)}
                </span>
                <span className="text-muted">—</span>
                <span className="truncate text-xs text-secondary">
                  {summariseSession(s, project.agent_name)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function summariseSession(s: SessionRow, agentName: string | null): string {
  const persona = agentName?.trim() ? agentName.trim() : "Agent";
  const title = s.title?.trim();
  if (title) return `${persona} — ${title}`;
  const summary = s.last_event_summary?.trim();
  if (summary) return `${persona} — ${summary}`;
  if (s.last_tool && s.last_file) {
    return `${persona} — ${s.last_tool}: ${s.last_file}`;
  }
  if (s.last_tool) return `${persona} — ${s.last_tool}`;
  return `${persona} — session ${s.id.slice(0, 8)}…`;
}

// ── Section D — Quick Actions ────────────────────────────────────────────

function QuickActions({
  project,
  onPlanWithClaude,
  onAddTask,
}: {
  project: ProjectRow;
  onPlanWithClaude: () => void;
  onAddTask: () => void;
}) {
  return (
    <section className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onPlanWithClaude}
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
      >
        <Sparkles size={12} /> Plan with Claude
      </button>
      <LaunchAgentHerePicker project={project} />
      <button
        type="button"
        onClick={onAddTask}
        className="inline-flex items-center gap-1.5 rounded-lg border border-strong bg-white px-3 py-2 text-xs font-medium text-secondary hover:bg-surface-muted"
      >
        <Plus size={12} /> Add Task
      </button>
    </section>
  );
}

function LaunchAgentHerePicker({ project }: { project: ProjectRow }) {
  const { employees } = useEmployees();
  const visibleAgents = useMemo(
    () => employees.filter((e) => !e.internalOnly),
    [employees],
  );
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function launch(agent: Employee) {
    if (busyId) return;
    setBusyId(agent.id);
    setError(false);
    setFeedback(`Opening Terminal for ${agent.name}…`);
    setOpen(false);
    try {
      const res = await fetch(
        `/api/agents/${encodeURIComponent(agent.id)}/launch`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode: "open",
            terminal: "Terminal",
            cwd: project.path,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || data.ok === false) {
        setError(true);
        setFeedback(data.error ?? "Launch failed");
      } else {
        setFeedback(`Launched ${agent.name} in ${project.name}`);
      }
    } catch (err) {
      setError(true);
      setFeedback(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
      window.setTimeout(() => {
        setFeedback(null);
        setError(false);
      }, 2400);
    }
  }

  return (
    <div ref={wrapRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busyId !== null}
        className="inline-flex items-center gap-1.5 rounded-lg border border-strong bg-white px-3 py-2 text-xs font-medium text-secondary hover:bg-surface-muted disabled:opacity-60"
      >
        <Play size={12} /> Launch agent here
      </button>
      {feedback ? (
        <span
          aria-live="polite"
          className={cn(
            "ml-2 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold",
            error
              ? "bg-red-50 text-status-error"
              : "bg-accent-soft text-accent",
          )}
        >
          {feedback}
        </span>
      ) : null}
      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-20 mt-1.5 max-h-72 min-w-[260px] overflow-y-auto rounded-lg border border-subtle bg-white py-1 shadow-lg"
        >
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            Launch in {project.path}
          </div>
          {visibleAgents.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted">
              No agents available.
            </div>
          ) : (
            visibleAgents.map((a) => (
              <button
                key={a.id}
                type="button"
                role="menuitem"
                onClick={() => void launch(a)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-primary hover:bg-surface-hover"
              >
                <AgentAvatar
                  value={a.avatar ?? null}
                  name={a.name}
                  size={20}
                  accent={a.accent}
                />
                <span className="flex-1 truncate">{a.name}</span>
                <span className="truncate text-[10px] text-muted">
                  {a.role}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── Section E — Details footer ───────────────────────────────────────────

function DetailsFooter({ project }: { project: ProjectRow }) {
  const color = project.color ?? "#5B5BD6";
  return (
    <section className="pt-2">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
        Details
      </h3>
      <dl className="space-y-1 text-[11px] text-muted">
        <Row label="Path">
          <span className="font-mono text-[11px] text-secondary">
            {project.path}
          </span>
        </Row>
        {project.agent_name ? (
          <Row label="Owner">
            <span className="text-secondary">{project.agent_name}</span>
          </Row>
        ) : null}
        <Row label="Created">
          <span className="text-secondary">
            {formatAbsoluteDate(project.created_at)}
          </span>
          <span className="text-muted"> · Last updated: </span>
          <span className="text-secondary">
            {formatUpdated(project.updated_at)}
          </span>
        </Row>
        <Row label="Color">
          <span className="inline-flex items-center gap-1.5 text-secondary">
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ background: color }}
            />
            {color}
          </span>
          {project.icon ? (
            <>
              <span className="text-muted"> · Icon: </span>
              <span className="text-secondary">{project.icon}</span>
            </>
          ) : null}
        </Row>
      </dl>
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <dt className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="flex-1">{children}</dd>
    </div>
  );
}
