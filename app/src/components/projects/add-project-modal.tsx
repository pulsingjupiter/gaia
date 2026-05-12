"use client";
/**
 * AddProjectModal — manual project creation form.
 *
 * Validates name + path on the client (path must be absolute) and surfaces
 * server validation errors inline (e.g., "path does not exist"). On success
 * the parent's `onCreated` is fired and the modal is closed.
 */
import { useEffect, useState } from "react";
import { Dices, FolderOpen, Sparkles, X } from "lucide-react";
import { PROJECT_ICON_OPTIONS } from "./icon-glyph";
import { cn } from "@/lib/cn";
import { AgentAvatar } from "@/components/shared/agent-avatar";
import { IconPicker } from "@/components/shared/icon-picker";
import { PRESET_AVATARS } from "@/lib/avatars";
import type { CreateProjectInput, ProjectRow } from "@/lib/hooks/use-projects";

function pickRandomAvatarId(exclude?: string | null): string {
  // Random preset avatar — used to seed the picker on modal open and to
  // power the "re-roll" button. Avoids returning the same id twice.
  const candidates = PRESET_AVATARS.filter((a) => a.id !== exclude);
  const pool = candidates.length > 0 ? candidates : PRESET_AVATARS;
  return pool[Math.floor(Math.random() * pool.length)]!.id;
}

const PALETTE = [
  "#5B5BD6",
  "#10B981",
  "#F472B6",
  "#F59E0B",
  "#3B82F6",
  "#EF4444",
  "#8B5CF6",
  "#06B6D4",
];

type Props = {
  open: boolean;
  onClose: () => void;
  /**
   * Called after a successful create. The parent should refresh its list.
   * The modal posts to the API directly so server errors can be surfaced
   * inline (the hook-level `add()` swallows error text).
   */
  onCreated: (project: ProjectRow) => void;
  /**
   * Called when the user picks "Plan with Gaia" on the post-create
   * confirmation screen. The parent should open the wizard for `project.id`.
   * When omitted, the post-create prompt's "Plan now" button is hidden.
   */
  onPlanWithClaude?: (project: ProjectRow) => void;
};

export function AddProjectModal({
  open,
  onClose,
  onCreated,
  onPlanWithClaude,
}: Props) {
  const [name, setName] = useState("");
  const [pathStr, setPathStr] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [icon, setIcon] = useState<string>("Code");
  // `agentAvatar` is the agent persona avatar (preset id) — separate from
  // `icon` (the project's identity glyph). Both can coexist.
  const [agentAvatar, setAgentAvatar] = useState<string | null>(() =>
    pickRandomAvatarId(),
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [createdProject, setCreatedProject] = useState<ProjectRow | null>(null);

  useEffect(() => {
    if (!open) {
      setName("");
      setPathStr("");
      setColor(PALETTE[0]);
      setIcon("Code");
      setAgentName("");
      setDescription("");
      setError(null);
      setSubmitting(false);
      setPickerOpen(false);
      setBrowsing(false);
      setCreatedProject(null);
    } else {
      // Re-roll a random adventurer each time the modal opens so users
      // discover the preset roster.
      setAgentAvatar(pickRandomAvatarId());
    }
  }, [open]);

  // Esc to close.
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
      const initial = pathStr.trim() || undefined;
      const res = await fetch("/api/system/pick-folder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initial }),
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
        setPathStr(data.path);
        if (!name.trim()) {
          const basename = data.path.split("/").filter(Boolean).pop() ?? "";
          if (basename) setName(basename);
        }
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
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!pathStr.trim() || !pathStr.startsWith("/")) {
      setError("Path must be an absolute path (start with /).");
      return;
    }
    setSubmitting(true);
    try {
      const body: CreateProjectInput = {
        name: name.trim(),
        path: pathStr.trim(),
        color,
        icon,
        agent_name: agentName.trim() || undefined,
        agent_avatar: agentAvatar ?? undefined,
        description: description.trim() || undefined,
      };
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? `Server returned ${res.status}`);
        setSubmitting(false);
        return;
      }
      const data = (await res.json()) as { project: ProjectRow };
      onCreated(data.project);
      // Don't close yet — show the post-create "Plan with Gaia now?" prompt
      // so the user has the option to jump straight into the wizard for the
      // freshly-created project. The parent's project list has already been
      // refreshed via `onCreated`.
      setCreatedProject(data.project);
      setSubmitting(false);
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
              {createdProject ? "Project created" : "Add Project"}
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              {createdProject
                ? "Want to draft a plan for it right now?"
                : "Tell Gaia where to watch for Claude Code sessions."}
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

        {createdProject ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-subtle bg-surface-muted px-3 py-2 text-xs text-secondary">
              <strong>{createdProject.name}</strong> is ready. You can plan it
              with Claude now, or add tasks manually later.
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-strong bg-white px-3 py-2 text-xs font-medium text-secondary hover:bg-surface-muted"
              >
                Skip — I&apos;ll add tasks myself
              </button>
              {onPlanWithClaude ? (
                <button
                  type="button"
                  onClick={() => {
                    const p = createdProject;
                    onClose();
                    onPlanWithClaude(p);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
                >
                  <Sparkles size={12} />
                  Plan with Gaia now
                </button>
              ) : null}
            </div>
          </div>
        ) : (
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <Field label="Name" required>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Project"
              className="w-full rounded-lg border border-strong bg-white px-3 py-2 text-xs outline-none focus:border-accent"
            />
          </Field>

          <Field
            label="Path"
            required
            hint="absolute path, e.g. /Users/you/code/myproject"
          >
            <div className="flex items-stretch gap-2">
              <input
                value={pathStr}
                onChange={(e) => setPathStr(e.target.value)}
                placeholder="/Users/you/code/project"
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
          </Field>

          <Field label="Color">
            <div className="flex flex-wrap gap-1.5">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Pick color ${c}`}
                  onClick={() => setColor(c)}
                  className={cn(
                    "size-6 rounded-full border-2 transition",
                    color === c
                      ? "border-primary"
                      : "border-transparent hover:scale-110",
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
          </Field>

          <Field label="Icon">
            <div className="flex flex-wrap gap-1.5">
              {PROJECT_ICON_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const selected = icon === opt.name;
                return (
                  <button
                    key={opt.name}
                    type="button"
                    aria-label={opt.name}
                    onClick={() => setIcon(opt.name)}
                    className={cn(
                      "inline-flex size-8 items-center justify-center rounded-lg border transition",
                      selected
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-strong bg-white text-secondary hover:bg-surface-muted",
                    )}
                  >
                    <Icon size={14} />
                  </button>
                );
              })}
            </div>
          </Field>

          <Field
            label="Agent avatar"
            hint="Persona avatar for the agent that owns this project."
          >
            <div className="flex items-center gap-2">
              <AgentAvatar
                value={agentAvatar}
                name={name || "Agent"}
                size={36}
                accent={color}
              />
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="rounded-lg border border-strong bg-white px-2.5 py-1.5 text-xs font-medium text-secondary hover:bg-surface-muted"
              >
                Choose…
              </button>
              <button
                type="button"
                onClick={() => setAgentAvatar(pickRandomAvatarId(agentAvatar))}
                title="Re-roll a random preset"
                aria-label="Re-roll avatar"
                className="inline-flex items-center gap-1 rounded-lg border border-strong bg-white px-2 py-1.5 text-xs font-medium text-secondary hover:bg-surface-muted"
              >
                <Dices size={12} />
                Re-roll
              </button>
            </div>
          </Field>

          <Field label="Agent name (optional)">
            <input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="e.g. Atlas"
              className="w-full rounded-lg border border-strong bg-white px-3 py-2 text-xs outline-none focus:border-accent"
            />
          </Field>

          <Field label="Description (optional)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-strong bg-white px-3 py-2 text-xs outline-none focus:border-accent"
            />
          </Field>

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
              {submitting ? "Adding…" : "Add Project"}
            </button>
          </div>
        </form>
        )}
      </div>

      <IconPicker
        open={pickerOpen}
        current={agentAvatar}
        name={name || "Agent"}
        accent={color}
        onSelect={(id) => {
          setAgentAvatar(id);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-[11px] font-medium text-secondary">
        {label}
        {required ? <span className="text-status-error">*</span> : null}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-[10px] text-muted">{hint}</span>
      ) : null}
    </label>
  );
}
