"use client";
/**
 * SettingsTab — project-scoped settings (name, color, icon, agent persona,
 * description, brief) + Archive button.
 *
 * Path is read-only because the project's path is the canonical identifier
 * for transcript discovery (Wave 1 design). Moving a project = create a new
 * one and archive the old.
 *
 * The Brief section is a separate form so saving the brief doesn't have to
 * touch the rest of the project. The brief is injected at the top of every
 * agent run scoped to this project (see server/agent-runner.ts).
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, FileText, GitBranch, Save, Search, Trash2, X } from "lucide-react";

import { cn } from "@/lib/cn";
import { parseRepoUrl } from "@/lib/repo-url";
import {
  PROJECT_ICON_OPTIONS,
} from "../icon-glyph";
import { AgentAvatar } from "@/components/shared/agent-avatar";
import { IconPicker } from "@/components/shared/icon-picker";
import type {
  ProjectRow,
  UseProjectDetail,
} from "@/lib/hooks/use-project-detail";

const COLOR_PRESETS = [
  "#5B5BD6", // accent purple
  "#10B981", // green
  "#F472B6", // pink
  "#F59E0B", // amber
  "#3B82F6", // blue
  "#EF4444", // red
  "#8B5CF6", // violet
  "#06B6D4", // cyan
  "#84CC16", // lime
  "#6B7280", // grey
];

type Props = {
  project: ProjectRow;
  update: UseProjectDetail["update"];
  archive: UseProjectDetail["archive"];
};

export function SettingsTab({ project, update, archive }: Props) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [color, setColor] = useState(project.color ?? COLOR_PRESETS[0]);
  const [icon, setIcon] = useState<string | null>(project.icon);
  const [agentName, setAgentName] = useState(project.agent_name ?? "");
  const [agentAvatar, setAgentAvatar] = useState<string | null>(
    project.agent_avatar,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [description, setDescription] = useState(project.description ?? "");
  const [brief, setBrief] = useState(project.brief_markdown ?? "");
  const [savingBrief, setSavingBrief] = useState(false);
  const [briefToast, setBriefToast] = useState<string | null>(null);
  const [repoUrl, setRepoUrl] = useState(project.repo_url ?? "");
  const [savingRepo, setSavingRepo] = useState(false);
  const [detectingRepo, setDetectingRepo] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [repoToast, setRepoToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [collaborative, setCollaborative] = useState(project.collaborative === 1);
  const [savingCollaboration, setSavingCollaboration] = useState(false);
  const [collaborationError, setCollaborationError] = useState<string | null>(null);

  // Keep state in sync if the project ref changes (e.g. external refresh).
  useEffect(() => {
    setName(project.name);
    setColor(project.color ?? COLOR_PRESETS[0]);
    setIcon(project.icon);
    setAgentName(project.agent_name ?? "");
    setAgentAvatar(project.agent_avatar);
    setDescription(project.description ?? "");
    setBrief(project.brief_markdown ?? "");
    setRepoUrl(project.repo_url ?? "");
    setRepoError(null);
    setCollaborative(project.collaborative === 1);
    setCollaborationError(null);
  }, [project]);

  const dirty =
    name.trim() !== project.name ||
    color !== (project.color ?? COLOR_PRESETS[0]) ||
    icon !== project.icon ||
    (agentName.trim() || null) !== (project.agent_name || null) ||
    agentAvatar !== project.agent_avatar ||
    (description.trim() || null) !== (project.description || null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty || !name.trim()) return;
    setSaving(true);
    const updated = await update({
      name: name.trim(),
      color,
      icon,
      agent_name: agentName.trim() || null,
      agent_avatar: agentAvatar,
      description: description.trim() || null,
    });
    setSaving(false);
    if (updated) {
      setToast("Settings saved");
      window.setTimeout(() => setToast(null), 2000);
    }
  }

  async function handleArchive() {
    const ok = await archive();
    if (ok) {
      router.push("/projects");
    }
  }

  const briefDirty =
    (brief.trim() || null) !== ((project.brief_markdown ?? "").trim() || null);

  async function handleSaveBrief(e: React.FormEvent) {
    e.preventDefault();
    if (!briefDirty) return;
    setSavingBrief(true);
    const updated = await update({
      brief_markdown: brief.trim() ? brief : null,
    });
    setSavingBrief(false);
    if (updated) {
      setBriefToast("Brief saved");
      window.setTimeout(() => setBriefToast(null), 2000);
    }
  }

  async function handleToggleCollaborative(checked: boolean) {
    setSavingCollaboration(true);
    setCollaborationError(null);
    const updated = await update({ collaborative: checked });
    setSavingCollaboration(false);
    if (updated) {
      setCollaborative(updated.collaborative === 1);
    } else {
      // Revert on failure
      setCollaborative(!checked);
      setCollaborationError("Failed to update setting. Is the repository URL set?");
    }
  }

  const [syncBusy, setSyncBusy] = useState<"pull" | "push" | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  async function handleSyncAction(action: "pull" | "push") {
    setSyncBusy(action);
    setSyncStatus(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/sync/${action}`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        setSyncStatus(`${action === "pull" ? "Pull" : "Push"} failed: ${data.error ?? res.statusText}`);
      } else if (action === "push" && data.no_changes) {
        setSyncStatus("No local changes to push.");
      } else {
        setSyncStatus(action === "pull" ? "Pulled — reload the page to see updated tasks." : "Pushed.");
      }
    } catch (err) {
      setSyncStatus(`${action} failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncBusy(null);
    }
  }

  const repoParsed = repoUrl.trim() ? parseRepoUrl(repoUrl) : null;
  const repoDirty =
    (repoParsed?.url ?? null) !== (project.repo_url ?? null) ||
    (!repoUrl.trim() && project.repo_url !== null);
  const repoInvalid = repoUrl.trim().length > 0 && !repoParsed;

  async function handleSaveRepo(e: React.FormEvent) {
    e.preventDefault();
    if (!repoDirty || savingRepo) return;
    if (repoInvalid) {
      setRepoError("Enter a valid repository URL.");
      return;
    }
    setSavingRepo(true);
    setRepoError(null);
    const updated = await update({
      repo_url: repoParsed?.url ?? null,
    });
    setSavingRepo(false);
    if (updated) {
      setRepoUrl(updated.repo_url ?? "");
      setRepoToast("Repository saved");
      window.setTimeout(() => setRepoToast(null), 2000);
    } else {
      setRepoError("Could not save repository.");
    }
  }

  async function handleDetectRepo() {
    setDetectingRepo(true);
    setRepoError(null);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(project.id)}/detect-repo`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(`POST detect-repo ${res.status}`);
      const data = (await res.json()) as { url: unknown };
      if (typeof data.url === "string" && data.url.trim()) {
        setRepoUrl(data.url);
        setRepoToast("Repository detected. Save to apply.");
        window.setTimeout(() => setRepoToast(null), 2500);
      } else {
        setRepoError("No origin remote found in .git/config.");
      }
    } catch (err) {
      setRepoError(err instanceof Error ? err.message : "Could not auto-detect repository.");
    } finally {
      setDetectingRepo(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <form onSubmit={handleSaveBrief} className="space-y-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-primary">
            <FileText size={14} /> Brief
          </h2>
          <p className="mt-1 text-[11px] text-muted">
            Markdown context that agents working on this project will read at
            the top of every prompt.
          </p>
        </div>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={Math.max(8, Math.min(24, brief.split("\n").length + 1))}
          placeholder={
            "No brief yet. Write a few paragraphs of context — what this project is, who's it for, key constraints. All agents working on it will read this."
          }
          className="w-full resize-y rounded-lg border border-strong bg-white px-3 py-2 font-mono text-xs leading-relaxed text-primary focus:outline-none"
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted">
            {brief.trim().length === 0
              ? "Empty — agent runs will skip the project-context block."
              : `${brief.trim().length.toLocaleString()} chars`}
          </span>
          <div className="flex items-center gap-2">
            {briefToast ? (
              <span className="rounded-md bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                {briefToast}
              </span>
            ) : null}
            <button
              type="submit"
              disabled={!briefDirty || savingBrief}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              <Save size={12} /> {savingBrief ? "Saving…" : "Save brief"}
            </button>
          </div>
        </div>
      </form>

      <hr className="border-subtle" />

      <div className="space-y-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-primary">
            Collaboration
          </h2>
        </div>
        <Field label="Sync project state to git repo">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="collaborative-toggle"
              checked={collaborative}
              disabled={!project.repo_url || savingCollaboration}
              onChange={(e) => handleToggleCollaborative(e.target.checked)}
              className="mr-2 h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
            />
            <label htmlFor="collaborative-toggle" className="text-sm text-primary">
              {savingCollaboration ? "Saving..." : "Enable git-based collaboration"}
            </label>
          </div>
          {!project.repo_url ? (
            <p className="mt-1 text-[11px] font-medium text-muted">
              Add a repository URL first.
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-muted">
              {collaborative
                ? "Milestones, tasks, and other project details are synced to the repo."
                : "When enabled, milestones, tasks, description, and brief will be mirrored to .gaia/* files inside the repo and synced via git."}
            </p>
          )}
          {collaborationError && (
            <p className="mt-1 text-[11px] font-medium text-status-error">
              {collaborationError}
            </p>
          )}
        </Field>

        {collaborative && (
          <div className="space-y-3 rounded-lg border border-strong bg-white p-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={syncBusy !== null}
                onClick={() => handleSyncAction("pull")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-strong bg-white px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-muted disabled:opacity-50"
              >
                {syncBusy === "pull" ? "Pulling…" : "Pull from git"}
              </button>
              <button
                type="button"
                disabled={syncBusy !== null}
                onClick={() => handleSyncAction("push")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-strong bg-white px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-muted disabled:opacity-50"
              >
                {syncBusy === "push" ? "Pushing…" : "Push to git"}
              </button>
            </div>
            <p className="text-[11px] text-muted">
              {syncStatus ?? "Pull updates from the repo or push your local changes."}
            </p>
          </div>
        )}
      </div>

      <hr className="border-subtle" />

      <form onSubmit={handleSaveRepo} className="space-y-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-primary">
            <GitBranch size={14} /> Repository
          </h2>
          <p className="mt-1 text-[11px] text-muted">
            Git remote used for project links and lightweight GitHub metadata.
          </p>
        </div>
        <Field label="Repository URL">
          <input
            type="text"
            value={repoUrl}
            onChange={(e) => {
              setRepoUrl(e.target.value);
              setRepoError(null);
            }}
            placeholder="https://github.com/owner/repo"
            className={cn(
              "w-full rounded-lg border bg-white px-3 py-1.5 text-sm text-primary focus:outline-none",
              repoInvalid ? "border-status-error" : "border-strong",
            )}
          />
          {repoInvalid || repoError ? (
            <p className="mt-1 text-[11px] font-medium text-status-error">
              {repoError ?? "Enter a valid repository URL."}
            </p>
          ) : null}
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleDetectRepo()}
              disabled={detectingRepo}
              className="inline-flex items-center gap-1.5 rounded-lg border border-strong bg-white px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-muted disabled:opacity-50"
            >
              <Search size={12} />
              {detectingRepo ? "Detecting…" : "Auto-detect from .git"}
            </button>
            <button
              type="button"
              onClick={() => {
                setRepoUrl("");
                setRepoError(null);
              }}
              disabled={!repoUrl.trim() && !project.repo_url}
              className="inline-flex items-center gap-1.5 rounded-lg border border-strong bg-white px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-muted disabled:opacity-50"
            >
              <Trash2 size={12} />
              Clear
            </button>
          </div>
          <div className="flex items-center gap-2">
            {repoToast ? (
              <span className="rounded-md bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                {repoToast}
              </span>
            ) : null}
            <button
              type="submit"
              disabled={!repoDirty || repoInvalid || savingRepo}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              <Save size={12} /> {savingRepo ? "Saving…" : "Save repository"}
            </button>
          </div>
        </div>
      </form>

      <hr className="border-subtle" />

      <form onSubmit={handleSave} className="space-y-6">
      <Field label="Name">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full rounded-lg border border-strong bg-white px-3 py-1.5 text-sm text-primary focus:outline-none"
        />
      </Field>

      <Field label="Path" help="Read-only — path is the project's canonical identifier.">
        <input
          type="text"
          value={project.path}
          disabled
          className="w-full cursor-not-allowed rounded-lg border border-subtle bg-surface-muted px-3 py-1.5 font-mono text-xs text-muted"
        />
        <p className="mt-1 text-[11px] text-muted">
          To move a project, create a new one and archive this one.
        </p>
      </Field>

      <Field label="Color">
        <div className="flex flex-wrap gap-2">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Use ${c}`}
              className={cn(
                "size-7 rounded-full border-2 transition",
                color === c
                  ? "border-primary scale-110"
                  : "border-transparent hover:scale-105",
              )}
              style={{ background: c }}
            />
          ))}
        </div>
      </Field>

      <Field label="Icon">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIcon(null)}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-xs",
              icon === null
                ? "border-accent bg-accent-soft text-accent"
                : "border-strong bg-white text-secondary hover:bg-surface-muted",
            )}
          >
            None
          </button>
          {PROJECT_ICON_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = icon === opt.name;
            return (
              <button
                key={opt.name}
                type="button"
                onClick={() => setIcon(opt.name)}
                aria-label={opt.name}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs",
                  selected
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-strong bg-white text-secondary hover:bg-surface-muted",
                )}
              >
                <Icon size={14} /> {opt.name}
              </button>
            );
          })}
        </div>
      </Field>

      <Field
        label="Agent avatar"
        help="Persona avatar shown in headers, cards, and session rows."
      >
        <div className="flex items-center gap-3">
          <AgentAvatar
            value={agentAvatar}
            name={agentName || name || project.name}
            size={44}
            accent={color}
          />
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="rounded-lg border border-strong bg-white px-2.5 py-1.5 text-xs font-medium text-secondary hover:bg-surface-muted"
          >
            Change…
          </button>
          {agentAvatar ? (
            <button
              type="button"
              onClick={() => setAgentAvatar(null)}
              className="text-[11px] font-medium text-muted hover:text-secondary hover:underline"
            >
              Use initials
            </button>
          ) : null}
        </div>
      </Field>

      <Field label="Agent persona name (optional)">
        <input
          type="text"
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
          placeholder="e.g. Atlas"
          className="w-full rounded-lg border border-strong bg-white px-3 py-1.5 text-sm text-primary focus:outline-none"
        />
      </Field>

      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="What does this project do?"
          className="w-full resize-y rounded-lg border border-strong bg-white px-3 py-1.5 text-sm text-primary focus:outline-none"
        />
      </Field>

      <div className="flex items-center justify-between border-t border-subtle pt-4">
        <button
          type="button"
          onClick={() => setConfirmArchive(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-status-error bg-white px-3 py-1.5 text-xs font-semibold text-status-error hover:bg-red-50"
        >
          <Archive size={12} /> Archive project
        </button>
        <button
          type="submit"
          disabled={!dirty || !name.trim() || saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          <Save size={12} /> {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      {toast ? (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white shadow-lg">
          {toast}
        </div>
      ) : null}

      <IconPicker
        open={pickerOpen}
        current={agentAvatar}
        name={agentName || name || project.name}
        accent={color}
        onSelect={(id) => {
          setAgentAvatar(id);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />

      {confirmArchive ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-4"
          onClick={() => setConfirmArchive(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-strong bg-white p-5 shadow-xl"
          >
            <div className="flex items-center justify-between pb-2">
              <h3 className="text-sm font-semibold text-primary">
                Archive project?
              </h3>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setConfirmArchive(false)}
                className="rounded-md p-1 text-muted hover:bg-surface-muted"
              >
                <X size={14} />
              </button>
            </div>
            <p className="text-xs text-secondary">
              This hides the project from the active list. You can restore it
              later by toggling{" "}
              <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[10px]">
                archived=0
              </code>{" "}
              in the database.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmArchive(false)}
                className="rounded-lg border border-strong bg-white px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleArchive}
                className="inline-flex items-center gap-1.5 rounded-lg bg-status-error px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
              >
                <Archive size={12} /> Archive
              </button>
            </div>
          </div>
        </div>
      ) : null}
      </form>
    </div>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
      {help ? (
        <span className="mt-1 block text-[11px] text-muted">{help}</span>
      ) : null}
    </label>
  );
}
