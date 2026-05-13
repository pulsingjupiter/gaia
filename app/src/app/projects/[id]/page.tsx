"use client";
/**
 * /projects/[id] — single-project detail page with 6 tabs.
 *
 * Tab routing: persisted to `?tab=overview|milestones|tasks|sessions|files|settings`
 * via `router.replace` so deep-links and reloads keep the user in place. The
 * `/projects/[id]/sessions/[sid]` segment is its own page (Wave 2C); clicking
 * a session row navigates away to that page.
 *
 * Overview is the default landing surface — it composes the status strip,
 * description editor, active milestones, recent sessions, and quick actions
 * into one rail so a fresh visit doesn't require tab-hunting.
 *
 * The "Edit" button in the header switches to the Settings tab.
 */
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Flag, ListTodo, Settings as SettingsIcon, FileText, Activity, Layout, Loader2 } from "lucide-react";

import { cn } from "@/lib/cn";
import { useProjectDetail } from "@/lib/hooks/use-project-detail";
import { useProjects } from "@/lib/hooks/use-projects";
import { useEmployees } from "@/components/employees/employees-context";
import { ProjectHeader } from "@/components/projects/detail/project-header";
import { OverviewTab } from "@/components/projects/detail/overview-tab";
import { SessionsTab } from "@/components/projects/detail/sessions-tab";
import { MilestonesTab } from "@/components/projects/detail/milestones-tab";
import { BacklogTab } from "@/components/projects/detail/backlog-tab";
import { FilesTab } from "@/components/projects/detail/files-tab";
import { SettingsTab } from "@/components/projects/detail/settings-tab";
import { PlanWithClaudeModal } from "@/components/projects/plan-with-claude-modal";
import { GaiaAiAssessModal } from "@/components/projects/gaia-ai-assess-modal";
import { AddTaskModal } from "@/components/tasks/add-task-modal";

type TabId =
  | "overview"
  | "milestones"
  | "backlog"
  | "sessions"
  | "files"
  | "settings";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: Layout },
  { id: "milestones", label: "Milestones", icon: Flag },
  { id: "backlog", label: "Tasks", icon: ListTodo },
  { id: "sessions", label: "Sessions", icon: Activity },
  { id: "files", label: "Files", icon: FileText },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

const VALID_TABS = new Set<TabId>(TABS.map((t) => t.id));

function parseTab(raw: string | null): TabId {
  if (raw === "tasks") return "backlog";
  if (raw && (VALID_TABS as Set<string>).has(raw)) return raw as TabId;
  return "overview";
}

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get("tab") ?? null;
  const tab = parseTab(tabParam);

  const detail = useProjectDetail(id);
  const { projects } = useProjects();
  const { employees } = useEmployees();
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [planNonce, setPlanNonce] = useState(0);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [assessOpen, setAssessOpen] = useState(false);

  const setTab = useCallback(
    (next: TabId) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (next === "overview") params.delete("tab");
      else params.set("tab", next === "backlog" ? "tasks" : next);
      const qs = params.toString();
      router.replace(qs ? `/projects/${id}?${qs}` : `/projects/${id}`, {
        scroll: false,
      });
    },
    [router, searchParams, id],
  );

  // Keep the URL canonical: if someone lands on `?tab=overview`, strip it so
  // the default surface uses the cleanest URL. Skip when already clean.
  useEffect(() => {
    if (tabParam === "overview") {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.delete("tab");
      const qs = params.toString();
      router.replace(qs ? `/projects/${id}?${qs}` : `/projects/${id}`, {
        scroll: false,
      });
    }
  }, [tabParam, router, searchParams, id]);

  const projectsForModal = useMemo(
    () => projects.filter((p) => p.archived === 0),
    [projects],
  );

  if (detail.loading && !detail.project) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-xs text-muted">
        <Loader2 size={16} className="mr-2 animate-spin" />
        Loading project…
      </div>
    );
  }

  if (detail.error || !detail.project) {
    return (
      <div className="px-6 py-6">
        <div className="card-surface p-8 text-center">
          <h2 className="text-lg font-semibold text-primary">
            Project not found
          </h2>
          <p className="mt-2 text-sm text-secondary">
            {detail.error ?? `No project with id '${id}'.`}
          </p>
        </div>
      </div>
    );
  }

  const project = detail.project;

  return (
    <div className="px-6 py-6">
      <ProjectHeader
        project={project}
        stats={detail.stats}
        onEdit={() => setTab("settings")}
        onArchive={() => setArchiveConfirm(true)}
        onPlanWithClaude={() => setPlanOpen(true)}
        onAssess={() => setAssessOpen(true)}
      />

      <div className="border-b border-subtle">
        <div className="flex gap-6">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 pb-2 text-sm transition",
                  active
                    ? "border-b-2 border-accent font-semibold text-accent"
                    : "text-secondary hover:text-primary",
                )}
              >
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5">
        {tab === "overview" ? (
          <OverviewTab
            key={`o-${planNonce}`}
            project={project}
            update={detail.update}
            onPlanWithClaude={() => setPlanOpen(true)}
            onAddTask={() => setAddTaskOpen(true)}
            onAssess={() => setAssessOpen(true)}
            onSwitchTab={(next) => setTab(next)}
          />
        ) : tab === "sessions" ? (
          <SessionsTab
            projectId={project.id}
            project={{
              name: project.name,
              color: project.color,
              agent_name: project.agent_name,
              agent_avatar: project.agent_avatar,
            }}
          />
        ) : tab === "milestones" ? (
          <MilestonesTab
            key={`m-${planNonce}`}
            projectId={project.id}
            onPlanWithClaude={() => setPlanOpen(true)}
          />
        ) : tab === "backlog" ? (
          <BacklogTab
            key={`b-${planNonce}`}
            projectId={project.id}
            onPlanWithClaude={() => setPlanOpen(true)}
          />
        ) : tab === "files" ? (
          <FilesTab />
        ) : (
          <SettingsTab
            project={project}
            update={detail.update}
            archive={detail.archive}
          />
        )}
      </div>

      <PlanWithClaudeModal
        open={planOpen}
        projectId={project.id}
        projectName={project.name}
        onClose={() => setPlanOpen(false)}
        onApplied={() => {
          setPlanNonce((n) => n + 1);
          setTab("milestones");
        }}
      />

      <GaiaAiAssessModal
        open={assessOpen}
        projectId={project.id}
        projectName={project.name}
        onClose={() => setAssessOpen(false)}
        onApplied={() => {
          setAssessOpen(false);
          setPlanNonce((n) => n + 1);
          // Pull a fresh project row so the updated description is visible.
          void detail.refresh();
        }}
      />

      <AddTaskModal
        open={addTaskOpen}
        projects={projectsForModal}
        employees={employees}
        defaultProjectId={project.id}
        onClose={() => setAddTaskOpen(false)}
        onCreated={() => {
          setAddTaskOpen(false);
          setPlanNonce((n) => n + 1);
        }}
      />

      {archiveConfirm ? (
        <ConfirmArchive
          name={project.name}
          onCancel={() => setArchiveConfirm(false)}
          onConfirm={async () => {
            const ok = await detail.archive();
            if (ok && typeof window !== "undefined") {
              window.location.href = "/projects";
            }
          }}
        />
      ) : null}
    </div>
  );
}

function ConfirmArchive({
  name,
  onCancel,
  onConfirm,
}: {
  name: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-4"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-strong bg-white p-5 shadow-xl"
      >
        <h3 className="text-sm font-semibold text-primary">
          Archive “{name}”?
        </h3>
        <p className="mt-2 text-xs text-secondary">
          The project will be hidden from the active list. Sessions and tasks
          remain in the database.
        </p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-strong bg-white px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-status-error px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            Archive
          </button>
        </div>
      </div>
    </div>
  );
}
