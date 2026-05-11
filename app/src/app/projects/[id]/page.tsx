"use client";
/**
 * /projects/[id] — single-project detail page with 4 tabs.
 *
 * Tab routing: We use internal `useState` (not URL routes) for the four
 * tabs because the `/projects/[id]/sessions/[sid]` segment is its own page
 * (Wave 2C) and would conflict with a `/projects/[id]/sessions` route here.
 * Clicking a session row navigates away to that page.
 *
 * The "Edit" button in the header simply scrolls + activates the Settings
 * tab — it's the same form, no separate modal.
 */
import { use, useState } from "react";
import { ListTodo, Settings as SettingsIcon, FileText, Activity, Loader2 } from "lucide-react";

import { cn } from "@/lib/cn";
import { useProjectDetail } from "@/lib/hooks/use-project-detail";
import { ProjectHeader } from "@/components/projects/detail/project-header";
import { SessionsTab } from "@/components/projects/detail/sessions-tab";
import { BacklogTab } from "@/components/projects/detail/backlog-tab";
import { FilesTab } from "@/components/projects/detail/files-tab";
import { SettingsTab } from "@/components/projects/detail/settings-tab";

type TabId = "sessions" | "backlog" | "files" | "settings";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "sessions", label: "Sessions", icon: Activity },
  { id: "backlog", label: "Backlog", icon: ListTodo },
  { id: "files", label: "Files", icon: FileText },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const detail = useProjectDetail(id);
  const [tab, setTab] = useState<TabId>("sessions");
  const [archiveConfirm, setArchiveConfirm] = useState(false);

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
        {tab === "sessions" ? (
          <SessionsTab
            projectId={project.id}
            project={{
              name: project.name,
              color: project.color,
              agent_name: project.agent_name,
              agent_avatar: project.agent_avatar,
            }}
          />
        ) : tab === "backlog" ? (
          <BacklogTab projectId={project.id} />
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
