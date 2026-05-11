"use client";
/**
 * Profile tab — render + inline-edit the agent's CLAUDE.md.
 *
 * Read view shows the rendered markdown text in a monospace pane with the
 * on-disk path and a Copy button. Click "Edit persona" to swap into a
 * textarea editor with Save / Cancel. Save calls back into useAgentDetail,
 * shows a transient "Saved" badge, then drops back to read mode.
 *
 * The 'system' pseudo-agent is read-only — the Edit button is disabled with
 * a tooltip explaining why.
 */
import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  FileWarning,
  Loader2,
  Pencil,
  Save,
  X,
} from "lucide-react";

import type { Persona } from "@/lib/hooks/use-agent-detail";

const MAX_PERSONA_CHARS = 10000;

export function ProfileTab({
  persona,
  agentId,
  onSave,
}: {
  persona: Persona | null;
  agentId: string;
  onSave: (markdown_text: string) => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isSystem = agentId === "system";
  const editable = !isSystem && !!persona && !persona.missing;

  // Autosize the textarea to fit its content (within a sensible cap) so
  // Adrian doesn't have to hunt for an internal scrollbar while editing.
  useEffect(() => {
    if (!editing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 720)}px`;
  }, [draft, editing]);

  if (!persona) {
    return (
      <div className="card-surface p-6 text-sm text-muted">
        Loading persona…
      </div>
    );
  }

  if (persona.missing) {
    return (
      <div className="card-surface flex items-start gap-3 p-5">
        <FileWarning size={18} className="mt-0.5 text-muted" />
        <div>
          <p className="text-sm font-semibold text-primary">
            No CLAUDE.md found.
          </p>
          <p className="mt-1 text-xs text-secondary">
            This agent has no persona file on disk yet. Create one at:
          </p>
          {persona.path ? (
            <code className="mt-2 block rounded-md bg-surface-muted px-3 py-2 font-mono text-[11px] text-secondary">
              {persona.path}
            </code>
          ) : null}
        </div>
      </div>
    );
  }

  const copyPath = async () => {
    if (!persona.path) return;
    try {
      await navigator.clipboard.writeText(persona.path);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API is best-effort; silently ignore.
    }
  };

  const beginEdit = () => {
    setDraft(persona.markdown_text);
    setErrorMsg(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraft("");
    setErrorMsg(null);
    setEditing(false);
  };

  const handleSave = async () => {
    setErrorMsg(null);
    if (draft.length < 1) {
      setErrorMsg("Persona cannot be empty.");
      return;
    }
    if (draft.length > MAX_PERSONA_CHARS) {
      setErrorMsg(`Persona too long (${draft.length}/${MAX_PERSONA_CHARS}).`);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="card-surface flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={
              editing
                ? "rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent"
                : "rounded-full bg-surface-muted px-2 py-0.5 font-medium text-secondary"
            }
          >
            {editing ? "Editing" : "Read-only"}
          </span>
          <span className="truncate text-muted">
            Path on disk:&nbsp;
            <code className="font-mono text-[11px] text-secondary">
              {persona.path ?? "—"}
            </code>
          </span>
          {savedFlash ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-status-success/15 px-2 py-0.5 text-[10px] font-semibold text-status-success">
              <Check size={10} />
              Saved
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {persona.path ? (
            <button
              type="button"
              onClick={copyPath}
              className="inline-flex items-center gap-1 rounded-md border border-strong bg-white px-2 py-1 text-[11px] font-medium text-secondary hover:bg-surface-muted"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy path"}
            </button>
          ) : null}
          {!editing ? (
            <button
              type="button"
              onClick={beginEdit}
              disabled={!editable}
              title={
                isSystem
                  ? "System persona is read-only"
                  : "Edit persona inline"
              }
              className={
                editable
                  ? "inline-flex items-center gap-1 rounded-md border border-strong bg-accent px-2 py-1 text-[11px] font-semibold text-white hover:opacity-90"
                  : "inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-strong bg-surface-muted px-2 py-1 text-[11px] font-semibold text-muted opacity-60"
              }
            >
              <Pencil size={12} />
              Edit persona
            </button>
          ) : null}
        </div>
      </div>

      {!editing ? (
        <pre className="card-surface max-h-[60vh] overflow-auto whitespace-pre-wrap break-words p-5 font-mono text-[12px] leading-relaxed text-primary">
          {persona.markdown_text}
        </pre>
      ) : (
        <div className="card-surface flex flex-col gap-3 p-4">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={saving}
            spellCheck={false}
            className="min-h-[280px] w-full resize-none rounded-md border border-subtle bg-surface-muted/50 p-3 font-mono text-[12px] leading-relaxed text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-60"
          />
          <div className="flex flex-wrap items-center justify-between gap-3 text-[11px]">
            <div className="text-muted">
              <span
                className={
                  draft.length > MAX_PERSONA_CHARS
                    ? "font-semibold text-status-error"
                    : ""
                }
              >
                {draft.length}
              </span>{" "}
              / {MAX_PERSONA_CHARS} chars
            </div>
            {errorMsg ? (
              <div className="text-status-error">{errorMsg}</div>
            ) : null}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancelEdit}
                disabled={saving}
                className="inline-flex items-center gap-1 rounded-md border border-strong bg-white px-2.5 py-1 text-[11px] font-medium text-secondary hover:bg-surface-muted disabled:opacity-60"
              >
                <X size={12} />
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || draft.length < 1}
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
          </div>
        </div>
      )}
    </div>
  );
}
