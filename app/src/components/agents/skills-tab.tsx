"use client";
/**
 * Skills tab — list, create, edit, delete the agent's per-skill SKILL.md
 * files (under agents/<id>/.claude/skills/<slug>/SKILL.md).
 *
 * Behaviour:
 *  - "+ Add Skill" reveals an inline form (name + body) above the list.
 *  - Click any skill row to expand inline into an editor (textarea + save +
 *    cancel + delete-with-confirm) — the editor lazily fetches the full body
 *    via getSkill() since the list endpoint only returns a 200-char preview.
 *  - Delete uses the same two-step pattern as the cron task row: first click
 *    primes a 5s confirm window; second click commits.
 *  - The 'system' pseudo-agent is read-only — no Add button, no row
 *    interaction. (The server also enforces this with a 400.)
 */
import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import type { SkillDetail, SkillEntry } from "@/lib/hooks/use-agent-detail";
import { AddSkillModal } from "@/components/employees/add-skill-modal";

const MAX_NAME_CHARS = 50;
const MAX_BODY_CHARS = 5000;
const DELETE_CONFIRM_MS = 5000;

type Props = {
  skills: SkillEntry[];
  agentId: string;
  getSkill: (slug: string) => Promise<SkillDetail>;
  /** Legacy raw-body create path (still used by the inline AddSkillForm). */
  addSkill: (input: { name: string; body: string }) => Promise<void>;
  saveSkill: (slug: string, body: string) => Promise<void>;
  deleteSkill: (slug: string) => Promise<void>;
  /**
   * Re-fetches the agent detail bundle (incl. skills). The new
   * AddSkillModal POSTs directly and then calls this — keeps the modal
   * decoupled from the hook's `addSkill` overload.
   */
  refresh?: () => Promise<void> | void;
};

export function SkillsTab({
  skills,
  agentId,
  getSkill,
  addSkill,
  saveSkill,
  deleteSkill,
  refresh,
}: Props) {
  // Modal-driven create flow (Feature C). `addSkill` (legacy raw body)
  // stays available for callers that prefer the inline form, but the
  // primary entry point is now the structured-fields modal.
  const [modalOpen, setModalOpen] = useState(false);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const isSystem = agentId === "system";
  const existingSlugSet = new Set(skills.map((s) => s.slug));
  // Touch addSkill so the unused-vars lint doesn't trip; the inline form
  // (kept exported below) is the consumer.
  void addSkill;

  return (
    <div className="space-y-4">
      {!isSystem ? (
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted">
            {skills.length} skill{skills.length === 1 ? "" : "s"}
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90"
          >
            <Plus size={12} />
            Add Skill
          </button>
        </div>
      ) : null}

      <AddSkillModal
        open={modalOpen && !isSystem}
        onOpenChange={setModalOpen}
        agentId={agentId}
        existingSlugs={existingSlugSet}
        onCreated={() => {
          void refresh?.();
        }}
      />

      {skills.length === 0 && !modalOpen ? (
        <div className="card-surface flex flex-col items-center justify-center gap-2 p-8 text-center">
          <Sparkles size={20} className="text-muted" />
          <p className="text-sm font-semibold text-primary">
            No skills yet.
          </p>
          <p className="text-xs text-secondary">
            {isSystem
              ? "The system agent has no editable skills."
              : "Click \"Add Skill\" to give this agent a new capability."}
          </p>
        </div>
      ) : null}

      {skills.length > 0 ? (
        <div className="flex flex-col gap-2">
          {skills.map((s) => (
            <SkillRow
              key={s.slug}
              skill={s}
              expanded={openSlug === s.slug}
              onToggle={() =>
                setOpenSlug((cur) => (cur === s.slug ? null : s.slug))
              }
              readOnly={isSystem}
              getSkill={getSkill}
              saveSkill={saveSkill}
              deleteSkill={async (slug) => {
                await deleteSkill(slug);
                if (openSlug === slug) setOpenSlug(null);
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add-skill form
// ---------------------------------------------------------------------------

function slugifyClient(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function AddSkillForm({
  existingSlugs,
  onCreate,
  onCancel,
}: {
  existingSlugs: Set<string>;
  onCreate: (input: { name: string; body: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const slug = slugifyClient(name);
  const slugTaken = slug && existingSlugs.has(slug);

  const submit = async () => {
    setErrorMsg(null);
    if (name.trim().length < 1) {
      setErrorMsg("Name is required.");
      return;
    }
    if (name.length > MAX_NAME_CHARS) {
      setErrorMsg(`Name too long (${name.length}/${MAX_NAME_CHARS}).`);
      return;
    }
    if (!slug) {
      setErrorMsg("Name must contain at least one alphanumeric character.");
      return;
    }
    if (slugTaken) {
      setErrorMsg(`A skill with slug '${slug}' already exists.`);
      return;
    }
    if (body.length < 1) {
      setErrorMsg("Body is required.");
      return;
    }
    if (body.length > MAX_BODY_CHARS) {
      setErrorMsg(`Body too long (${body.length}/${MAX_BODY_CHARS}).`);
      return;
    }
    setSubmitting(true);
    try {
      await onCreate({ name: name.trim(), body });
      setName("");
      setBody("");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card-surface flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Sparkles size={14} className="text-accent" />
        New skill
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-medium text-secondary">
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={submitting}
          maxLength={MAX_NAME_CHARS + 8}
          placeholder="e.g. Inbox triage"
          className="rounded-md border border-subtle bg-white px-2.5 py-1.5 text-sm text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-60"
        />
        {slug ? (
          <div className="text-[10px] text-muted">
            Folder:{" "}
            <code className="font-mono">{slug}/SKILL.md</code>
            {slugTaken ? (
              <span className="ml-2 text-status-error">
                (already exists)
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-medium text-secondary">
          Body (SKILL.md)
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={submitting}
          spellCheck={false}
          className="min-h-[160px] w-full resize-y rounded-md border border-subtle bg-surface-muted/50 p-3 font-mono text-[12px] leading-relaxed text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-60"
        />
        <div className="text-[10px] text-muted">
          <span
            className={
              body.length > MAX_BODY_CHARS
                ? "font-semibold text-status-error"
                : ""
            }
          >
            {body.length}
          </span>{" "}
          / {MAX_BODY_CHARS} chars
        </div>
      </div>
      {errorMsg ? (
        <div className="flex items-center gap-1.5 text-[11px] text-status-error">
          <AlertCircle size={12} />
          {errorMsg}
        </div>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="inline-flex items-center gap-1 rounded-md border border-strong bg-white px-2.5 py-1 text-[11px] font-medium text-secondary hover:bg-surface-muted disabled:opacity-60"
        >
          <X size={12} />
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Plus size={12} />
          )}
          {submitting ? "Creating…" : "Create skill"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-skill row (read-summary collapse + inline edit expand)
// ---------------------------------------------------------------------------

function SkillRow({
  skill,
  expanded,
  onToggle,
  readOnly,
  getSkill,
  saveSkill,
  deleteSkill,
}: {
  skill: SkillEntry;
  expanded: boolean;
  onToggle: () => void;
  readOnly: boolean;
  getSkill: (slug: string) => Promise<SkillDetail>;
  saveSkill: (slug: string, body: string) => Promise<void>;
  deleteSkill: (slug: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLoadedSlugRef = useRef<string | null>(null);

  // Lazily fetch the full body the first time the row is expanded. We key
  // off the slug so collapse/re-expand of the same row keeps the local
  // draft, but expanding a *different* row still pulls fresh data.
  useEffect(() => {
    if (!expanded) return;
    if (lastLoadedSlugRef.current === skill.slug && draft !== null) return;
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);
    getSkill(skill.slug)
      .then((detail) => {
        if (cancelled) return;
        setDraft(detail.body);
        lastLoadedSlugRef.current = skill.slug;
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMsg(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, skill.slug, getSkill, draft]);

  // Clear any pending delete-confirm timer on unmount.
  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const handleSave = async () => {
    if (draft === null) return;
    setErrorMsg(null);
    if (draft.length < 1) {
      setErrorMsg("Body cannot be empty.");
      return;
    }
    if (draft.length > MAX_BODY_CHARS) {
      setErrorMsg(`Body too long (${draft.length}/${MAX_BODY_CHARS}).`);
      return;
    }
    setSaving(true);
    try {
      await saveSkill(skill.slug, draft);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = async () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      confirmTimerRef.current = setTimeout(() => {
        setConfirmingDelete(false);
        confirmTimerRef.current = null;
      }, DELETE_CONFIRM_MS);
      return;
    }
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
    setConfirmingDelete(false);
    setDeleting(true);
    setErrorMsg(null);
    try {
      await deleteSkill(skill.slug);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setDeleting(false);
    }
  };

  return (
    <div className="card-surface overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-surface-muted/50"
      >
        <div className="flex min-w-0 items-start gap-2">
          {expanded ? (
            <ChevronDown size={14} className="mt-0.5 text-muted" />
          ) : (
            <ChevronRight size={14} className="mt-0.5 text-muted" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-primary">
                {skill.name}
              </span>
              <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                Skill
              </span>
            </div>
            {!expanded && skill.preview ? (
              <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-secondary">
                {skill.preview}
              </p>
            ) : null}
            {!expanded ? (
              <code className="mt-1 block truncate font-mono text-[10px] text-muted">
                {skill.path}
              </code>
            ) : null}
          </div>
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-subtle bg-surface-muted/30 px-4 py-3">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted">
              <Loader2 size={12} className="animate-spin" />
              Loading SKILL.md…
            </div>
          ) : draft !== null ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={saving || deleting || readOnly}
                spellCheck={false}
                className="min-h-[200px] w-full resize-y rounded-md border border-subtle bg-white p-3 font-mono text-[12px] leading-relaxed text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-60"
              />
              <div className="flex flex-wrap items-center justify-between gap-3 text-[11px]">
                <div className="text-muted">
                  <span
                    className={
                      draft.length > MAX_BODY_CHARS
                        ? "font-semibold text-status-error"
                        : ""
                    }
                  >
                    {draft.length}
                  </span>{" "}
                  / {MAX_BODY_CHARS} chars
                </div>
                {errorMsg ? (
                  <div className="flex items-center gap-1.5 text-status-error">
                    <AlertCircle size={12} />
                    {errorMsg}
                  </div>
                ) : null}
                {!readOnly ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDeleteClick}
                      onBlur={() => {
                        if (confirmTimerRef.current) {
                          clearTimeout(confirmTimerRef.current);
                          confirmTimerRef.current = null;
                        }
                        setConfirmingDelete(false);
                      }}
                      disabled={saving || deleting}
                      title={
                        confirmingDelete
                          ? `Confirm delete '${skill.name}'`
                          : "Delete skill"
                      }
                      className={
                        confirmingDelete
                          ? "inline-flex items-center gap-1 rounded-md bg-status-error/15 px-2.5 py-1 text-[11px] font-semibold text-status-error hover:bg-status-error/25"
                          : "inline-flex items-center gap-1 rounded-md border border-strong bg-white px-2.5 py-1 text-[11px] font-medium text-status-error hover:bg-status-error/10"
                      }
                    >
                      {deleting ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Trash2 size={12} />
                      )}
                      {deleting
                        ? "Deleting…"
                        : confirmingDelete
                          ? "Confirm delete"
                          : "Delete skill"}
                    </button>
                    <button
                      type="button"
                      onClick={onToggle}
                      disabled={saving || deleting}
                      className="inline-flex items-center gap-1 rounded-md border border-strong bg-white px-2.5 py-1 text-[11px] font-medium text-secondary hover:bg-surface-muted disabled:opacity-60"
                    >
                      <X size={12} />
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving || deleting || draft.length < 1}
                      className="inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
                    >
                      {saving ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Save size={12} />
                      )}
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                ) : (
                  <span className="text-[10px] italic text-muted">
                    System skill — read-only
                  </span>
                )}
              </div>
              <code className="truncate font-mono text-[10px] text-muted">
                {skill.path}
              </code>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-status-error">
              <AlertCircle size={12} />
              {errorMsg ?? "Failed to load SKILL.md"}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
