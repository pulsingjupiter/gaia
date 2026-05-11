"use client";
/**
 * AddSkillModal — Feature C.
 *
 * Structured composer for a new SKILL.md. Instead of asking the user to
 * write the markdown by hand, we collect named fields and assemble the
 * file server-side (via `composeSkillMd` in `server/agent-scaffold.ts`).
 *
 * Fields:
 *   - Skill name (auto-slugged, shown live).
 *   - When to use (textarea, required).
 *   - Inputs (textarea, required).
 *   - What you produce (textarea, required).
 *   - Defaults (textarea, optional).
 *
 * On submit POSTs to /api/employees/[id]/skills with the structured body.
 * The API both supports the structured shape AND the legacy raw `body`
 * shape, so older callers still work.
 */
import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Sparkles, X } from "lucide-react";

import { slugify } from "@/lib/slugify";

const MAX_NAME_CHARS = 50;
const MAX_FIELD_CHARS = 2000;

type StructuredBody = {
  name: string;
  slug: string;
  when_to_use: string;
  inputs: string;
  output: string;
  defaults?: string;
};

export function AddSkillModal({
  open,
  onOpenChange,
  agentId,
  existingSlugs,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agentId: string;
  existingSlugs: Set<string>;
  /**
   * Notify the caller after a successful create — the page typically
   * refreshes its skills list here.
   */
  onCreated?: (slug: string) => void;
}) {
  const [name, setName] = useState("");
  const [whenToUse, setWhenToUse] = useState("");
  const [inputs, setInputs] = useState("");
  const [output, setOutput] = useState("");
  const [defaults, setDefaults] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setWhenToUse("");
    setInputs("");
    setOutput("");
    setDefaults("");
    setSubmitting(false);
    setErrorMsg(null);
  }, [open]);

  if (!open) return null;

  const slug = slugify(name);
  const slugTaken = slug && existingSlugs.has(slug);

  const validate = (): string | null => {
    if (!name.trim()) return "Name is required.";
    if (name.length > MAX_NAME_CHARS)
      return `Name too long (${name.length}/${MAX_NAME_CHARS}).`;
    if (!slug) return "Name must contain at least one alphanumeric character.";
    if (slugTaken) return `A skill with slug '${slug}' already exists.`;
    if (!whenToUse.trim()) return "\"When to use\" is required.";
    if (!inputs.trim()) return "\"Inputs\" is required.";
    if (!output.trim()) return "\"What you produce\" is required.";
    for (const [label, val] of [
      ["When to use", whenToUse],
      ["Inputs", inputs],
      ["What you produce", output],
      ["Defaults", defaults],
    ] as const) {
      if (val.length > MAX_FIELD_CHARS) {
        return `${label} is too long (${val.length}/${MAX_FIELD_CHARS}).`;
      }
    }
    return null;
  };

  const handleSubmit = async () => {
    setErrorMsg(null);
    const err = validate();
    if (err) {
      setErrorMsg(err);
      return;
    }
    const payload: StructuredBody = {
      name: name.trim(),
      slug,
      when_to_use: whenToUse.trim(),
      inputs: inputs.trim(),
      output: output.trim(),
    };
    const trimmedDefaults = defaults.trim();
    if (trimmedDefaults) payload.defaults = trimmedDefaults;

    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/employees/${encodeURIComponent(agentId)}/skills`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        skill?: { slug?: string };
        error?: string;
      };
      if (!res.ok) {
        setErrorMsg(data.error ?? `HTTP ${res.status}`);
        setSubmitting(false);
        return;
      }
      onCreated?.(data.skill?.slug ?? slug);
      onOpenChange(false);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => !submitting && onOpenChange(false)}
    >
      <div
        className="card-surface w-full max-w-2xl p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Sparkles size={14} className="text-accent" />
              New skill
            </div>
            <p className="mt-1 text-xs text-muted">
              Fill in the structured fields — we'll compose the SKILL.md for
              you.
            </p>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onOpenChange(false)}
            disabled={submitting}
            className="rounded-md border border-strong bg-white p-1 text-secondary hover:bg-surface-muted disabled:opacity-60"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-4">
          <Field
            label="Name"
            value={name}
            onChange={setName}
            placeholder="e.g. Inbox triage"
            disabled={submitting}
            maxLength={MAX_NAME_CHARS + 8}
            hint={
              slug ? (
                <>
                  Folder: <code className="font-mono">{slug}/SKILL.md</code>
                  {slugTaken ? (
                    <span className="ml-2 text-status-error">
                      (already exists)
                    </span>
                  ) : null}
                </>
              ) : null
            }
          />
          <TextareaField
            label="When to use"
            value={whenToUse}
            onChange={setWhenToUse}
            placeholder="One paragraph describing when this skill should be triggered."
            disabled={submitting}
            maxLength={MAX_FIELD_CHARS}
          />
          <TextareaField
            label="Inputs"
            value={inputs}
            onChange={setInputs}
            placeholder="Bulleted list of inputs the skill expects."
            disabled={submitting}
            maxLength={MAX_FIELD_CHARS}
          />
          <TextareaField
            label="What you produce"
            value={output}
            onChange={setOutput}
            placeholder="Describe the output shape — Markdown structure, templates, etc."
            disabled={submitting}
            maxLength={MAX_FIELD_CHARS}
          />
          <TextareaField
            label="Defaults (optional)"
            value={defaults}
            onChange={setDefaults}
            placeholder="Opinionated defaults — formatting, tone, fallback behaviour."
            disabled={submitting}
            maxLength={MAX_FIELD_CHARS}
          />
        </div>

        {errorMsg ? (
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-status-error">
            <AlertCircle size={12} />
            {errorMsg}
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => !submitting && onOpenChange(false)}
            disabled={submitting}
            className="rounded-lg border border-strong bg-white px-3 py-2 text-sm font-medium text-secondary hover:bg-surface-muted disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            {submitting ? "Creating…" : "Create skill"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small primitives — kept local to this file (no abstraction need outside).
// ---------------------------------------------------------------------------

function Field({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  maxLength,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  hint?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-medium text-secondary">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        className="rounded-md border border-subtle bg-white px-2.5 py-1.5 text-sm text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-60"
      />
      {hint ? <div className="text-[10px] text-muted">{hint}</div> : null}
    </div>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  maxLength: number;
}) {
  const over = value.length > maxLength;
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-medium text-secondary">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={false}
        className="min-h-[96px] w-full resize-y rounded-md border border-subtle bg-white p-2.5 text-[13px] leading-relaxed text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-60"
      />
      <div className="text-[10px] text-muted">
        <span className={over ? "font-semibold text-status-error" : ""}>
          {value.length}
        </span>{" "}
        / {maxLength}
      </div>
    </div>
  );
}
