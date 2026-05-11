"use client";
/**
 * AddPlaybookModal — two-step "Add Playbook" flow on /playbooks.
 *
 * Step 1: pick a template (15 presets + Blank) grouped by category, with a
 *         single search input that filters by name / pitch / category.
 * Step 2: pick an owner agent (recommended ones float to the top) + edit
 *         the structured SKILL.md fields pre-filled from the template.
 *
 * Submit POSTs to /api/employees/<owner_id>/skills with the structured body
 * (the same shape `AddSkillModal` uses). On success we fire `onCreated` and
 * close the modal; the parent re-fetches via `usePlaybooks().refresh()`.
 *
 * No new API surface — the [id]/skills route already accepts the structured
 * shape and refuses duplicate slugs with a 409.
 */
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronLeft,
  Loader2,
  Search,
  Sparkles,
  X,
} from "lucide-react";

import { AgentAvatar } from "@/components/shared/agent-avatar";
import { useEmployees } from "@/components/employees/employees-context";
import { slugify } from "@/lib/slugify";
import {
  PLAYBOOK_TEMPLATES,
  getPlaybookTemplateById,
  type PlaybookCategory,
  type PlaybookTemplate,
} from "@/lib/playbook-templates";
import type { Employee } from "@/lib/types";

const BLANK_ID = "__blank__";
const MAX_NAME_CHARS = 50;
const MAX_FIELD_CHARS = 2_000;

const CATEGORY_ORDER: PlaybookCategory[] = [
  "Productivity",
  "Engineering",
  "Research",
  "Content",
  "Sales",
  "Customer",
  "Data",
  "Ops",
];

type Step = "pick" | "fill";

type Chosen =
  | { kind: "blank" }
  | { kind: "template"; template: PlaybookTemplate };

export function AddPlaybookModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Notify the parent so it can refresh the playbook list. */
  onCreated?: (info: { agentId: string; slug: string }) => void;
}) {
  const { employees } = useEmployees();
  const [step, setStep] = useState<Step>("pick");
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    setStep("pick");
    setChosen(null);
    setQuery("");
  }, [open]);

  // Body-scroll lock + Esc-to-close while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  const ownerCandidates = employees.filter((e) => !e.internalOnly && e.id !== "system");

  const handlePick = (id: string) => {
    if (id === BLANK_ID) {
      setChosen({ kind: "blank" });
    } else {
      const tpl = getPlaybookTemplateById(id);
      if (!tpl) return;
      setChosen({ kind: "template", template: tpl });
    }
    setStep("fill");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="card-surface w-full max-w-3xl p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {step === "pick" ? (
          <TemplatePicker
            query={query}
            setQuery={setQuery}
            onPick={handlePick}
            onCancel={() => onOpenChange(false)}
          />
        ) : (
          <FillForm
            chosen={chosen}
            owners={ownerCandidates}
            onBack={() => {
              setStep("pick");
              setChosen(null);
            }}
            onCancel={() => onOpenChange(false)}
            onCreated={(info) => {
              onCreated?.(info);
              onOpenChange(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — template picker
// ---------------------------------------------------------------------------

function TemplatePicker({
  query,
  setQuery,
  onPick,
  onCancel,
}: {
  query: string;
  setQuery: (v: string) => void;
  onPick: (id: string) => void;
  onCancel: () => void;
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PLAYBOOK_TEMPLATES;
    return PLAYBOOK_TEMPLATES.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.short_pitch.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q),
    );
  }, [query]);

  const grouped = useMemo(() => {
    const byCat = new Map<PlaybookCategory, PlaybookTemplate[]>();
    for (const t of filtered) {
      const list = byCat.get(t.category) ?? [];
      list.push(t);
      byCat.set(t.category, list);
    }
    for (const list of byCat.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return CATEGORY_ORDER.flatMap((cat) => {
      const list = byCat.get(cat);
      if (!list || list.length === 0) return [];
      return [{ category: cat, items: list }];
    });
  }, [filtered]);

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-accent" />
            <h2 className="text-lg font-semibold text-primary">Add Playbook</h2>
          </div>
          <p className="mt-1 text-sm text-muted">
            Pick a template, then choose which agent owns it. Each playbook is
            a SKILL.md the agent can run.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="rounded-md border border-strong bg-white p-1 text-secondary hover:bg-surface-muted"
        >
          <X size={14} />
        </button>
      </div>

      <div className="relative mt-4">
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

      <div className="mt-4 max-h-[60vh] overflow-y-auto pr-1">
        {grouped.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted">
            No templates match "{query}".
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {grouped.map(({ category, items }) => (
              <div key={category}>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  {category}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {items.map((t) => (
                    <TemplateTile
                      key={t.id}
                      id={t.id}
                      name={t.name}
                      pitch={t.short_pitch}
                      category={t.category}
                      onPick={onPick}
                    />
                  ))}
                </div>
              </div>
            ))}
            <div>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
                Start from scratch
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <TemplateTile
                  id={BLANK_ID}
                  name="Blank"
                  pitch="Empty form — write your own when-to-use, inputs, and output."
                  category="Blank"
                  onPick={onPick}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateTile({
  id,
  name,
  pitch,
  category,
  onPick,
}: {
  id: string;
  name: string;
  pitch: string;
  category: string;
  onPick: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(id)}
      className="group flex h-full flex-col gap-2 rounded-lg border border-subtle bg-white p-3 text-left transition hover:border-accent hover:shadow-sm"
    >
      <span className="w-fit rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">
        {category}
      </span>
      <div className="text-sm font-semibold text-primary">{name}</div>
      <p className="text-[11px] leading-snug text-secondary">{pitch}</p>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — owner + structured fields
// ---------------------------------------------------------------------------

function FillForm({
  chosen,
  owners,
  onBack,
  onCancel,
  onCreated,
}: {
  chosen: Chosen | null;
  owners: Employee[];
  onBack: () => void;
  onCancel: () => void;
  onCreated: (info: { agentId: string; slug: string }) => void;
}) {
  const isBlank = chosen?.kind !== "template";
  const template = chosen?.kind === "template" ? chosen.template : null;

  // Recommendation: an owner is "recommended" when its agent id (which for
  // templated agents equals the template id) appears in the playbook
  // template's `recommended_owner_template_ids`. Fall back to a fuzzy match
  // on the employee's slug/name/role so hand-created agents still surface.
  const recommendedSet = useMemo(() => {
    if (!template) return new Set<string>();
    const set = new Set<string>(template.recommended_owner_template_ids);
    // Fuzzy fallback: for each recommended template id, look up its
    // canonical name keywords and tag matching employees.
    const fuzzyHits = new Set<string>();
    const recIds = template.recommended_owner_template_ids;
    for (const o of owners) {
      const haystack = `${o.id} ${o.name} ${o.role}`.toLowerCase();
      for (const rid of recIds) {
        // rid is kebab-case like "chief-of-staff" or "sales-bd"; split into
        // tokens and require any token longer than 2 chars to appear.
        const tokens = rid.split("-").filter((t) => t.length > 2);
        if (tokens.length === 0) continue;
        const hit = tokens.some((t) => haystack.includes(t));
        if (hit) fuzzyHits.add(o.id);
      }
    }
    for (const id of fuzzyHits) set.add(id);
    return set;
  }, [template, owners]);

  const sortedOwners = useMemo(() => {
    const recs: Employee[] = [];
    const rest: Employee[] = [];
    for (const o of owners) {
      if (recommendedSet.has(o.id)) recs.push(o);
      else rest.push(o);
    }
    recs.sort((a, b) => a.name.localeCompare(b.name));
    rest.sort((a, b) => a.name.localeCompare(b.name));
    return { recs, rest };
  }, [owners, recommendedSet]);

  const [ownerId, setOwnerId] = useState<string>(() => {
    const first = sortedOwners.recs[0] ?? sortedOwners.rest[0];
    return first?.id ?? "";
  });

  const [name, setName] = useState<string>(template?.name ?? "");
  const [slugInput, setSlugInput] = useState<string>(template?.skill.slug ?? "");
  const [slugTouched, setSlugTouched] = useState<boolean>(false);
  const [whenToUse, setWhenToUse] = useState<string>(
    template?.skill.when_to_use ?? "",
  );
  const [inputs, setInputs] = useState<string>(template?.skill.inputs ?? "");
  const [output, setOutput] = useState<string>(template?.skill.output ?? "");
  const [defaults, setDefaults] = useState<string>(
    template?.skill.defaults ?? "",
  );

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Auto-slug from name unless the user has hand-edited the slug field.
  useEffect(() => {
    if (slugTouched) return;
    setSlugInput(slugify(name));
  }, [name, slugTouched]);

  if (!chosen) {
    // Defensive — shouldn't happen, but rather than crash, render a back link.
    return (
      <div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-md border border-strong bg-white px-2 py-1 text-[11px] font-medium text-secondary hover:bg-surface-muted"
        >
          <ChevronLeft size={12} />
          Back to templates
        </button>
        <p className="mt-4 text-sm text-muted">No template selected.</p>
      </div>
    );
  }

  const slug = slugify(slugInput);
  const ownerObj = owners.find((o) => o.id === ownerId) ?? null;

  const validate = (): string | null => {
    if (!ownerId) return "Pick an agent to own this playbook.";
    if (!name.trim()) return "Name is required.";
    if (name.length > MAX_NAME_CHARS)
      return `Name too long (${name.length}/${MAX_NAME_CHARS}).`;
    if (!slug) return "Slug must contain at least one alphanumeric character.";
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
    const payload: {
      name: string;
      slug: string;
      when_to_use: string;
      inputs: string;
      output: string;
      defaults?: string;
    } = {
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
        `/api/employees/${encodeURIComponent(ownerId)}/skills`,
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
        if (res.status === 409 && ownerObj) {
          setErrorMsg(
            `${ownerObj.name} already has a playbook called '${slug}'. Pick a different name or slug.`,
          );
        } else {
          setErrorMsg(data.error ?? `HTTP ${res.status}`);
        }
        setSubmitting(false);
        return;
      }
      onCreated({ agentId: ownerId, slug: data.skill?.slug ?? slug });
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={onBack}
            disabled={submitting}
            className="inline-flex items-center gap-1 rounded-md border border-strong bg-white px-2 py-1 text-[11px] font-medium text-secondary hover:bg-surface-muted disabled:opacity-60"
          >
            <ChevronLeft size={12} />
            Back to templates
          </button>
          <h2 className="mt-3 text-lg font-semibold text-primary">
            {isBlank ? "Blank playbook" : `${template?.name}`}
          </h2>
          {!isBlank && template ? (
            <p className="mt-1 text-sm text-muted">{template.short_pitch}</p>
          ) : (
            <p className="mt-1 text-sm text-muted">
              Fill in the structured fields — we'll compose the SKILL.md.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          aria-label="Close"
          className="rounded-md border border-strong bg-white p-1 text-secondary hover:bg-surface-muted disabled:opacity-60"
        >
          <X size={14} />
        </button>
      </div>

      <div className="mt-5 max-h-[60vh] overflow-y-auto pr-1">
        <div className="flex flex-col gap-4">
          <OwnerPicker
            recs={sortedOwners.recs}
            rest={sortedOwners.rest}
            value={ownerId}
            onChange={setOwnerId}
            recommendationHint={
              !isBlank && sortedOwners.recs.length > 0 && template
                ? `Recommended for: ${sortedOwners.recs.map((o) => o.role).join(", ")}`
                : null
            }
            disabled={submitting}
          />

          <Field
            label="Skill name"
            value={name}
            onChange={setName}
            placeholder="e.g. Inbox triage"
            disabled={submitting}
            maxLength={MAX_NAME_CHARS + 8}
          />
          <Field
            label="Slug"
            value={slugInput}
            onChange={(v) => {
              setSlugTouched(true);
              setSlugInput(v);
            }}
            placeholder="kebab-case-folder-name"
            disabled={submitting}
            hint={
              slug ? (
                <>
                  Folder: <code className="font-mono">{slug}/SKILL.md</code>
                </>
              ) : (
                <span className="text-status-error">
                  Slug must contain at least one alphanumeric character.
                </span>
              )
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
          onClick={onCancel}
          disabled={submitting}
          className="rounded-lg border border-strong bg-white px-3 py-2 text-sm font-medium text-secondary hover:bg-surface-muted disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || owners.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          {submitting ? "Creating…" : "Create playbook"}
        </button>
      </div>
      {owners.length === 0 ? (
        <p className="mt-2 text-right text-[10px] text-muted">
          You need at least one agent before you can add a playbook.
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Owner picker — custom dropdown so we can render avatars + a "Recommended"
// section heading. Falls back gracefully when no recommendations apply.
// ---------------------------------------------------------------------------

function OwnerPicker({
  recs,
  rest,
  value,
  onChange,
  recommendationHint,
  disabled,
}: {
  recs: Employee[];
  rest: Employee[];
  value: string;
  onChange: (id: string) => void;
  recommendationHint: string | null;
  disabled?: boolean;
}) {
  // We use a native <select> for accessibility + keyboard support, but we
  // render a parallel preview card below it so the user sees avatar + role.
  const selected = [...recs, ...rest].find((o) => o.id === value) ?? null;

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-medium text-secondary">Owner</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="rounded-md border border-subtle bg-white px-2.5 py-1.5 text-sm text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-60"
      >
        {recs.length > 0 ? (
          <optgroup label="Recommended">
            {recs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} — {o.role}
              </option>
            ))}
          </optgroup>
        ) : null}
        {rest.length > 0 ? (
          <optgroup label={recs.length > 0 ? "Other agents" : "Agents"}>
            {rest.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} — {o.role}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
      <div className="flex items-center justify-between gap-2">
        {selected ? (
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <AgentAvatar
              value={selected.avatar ?? null}
              name={selected.name}
              accent={selected.accent}
              size={20}
            />
            <span>
              {selected.name} · {selected.role}
            </span>
          </div>
        ) : (
          <span className="text-[11px] text-muted">No agent selected.</span>
        )}
        {recommendationHint ? (
          <span className="text-[10px] text-muted">{recommendationHint}</span>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small primitives — kept local; intentionally near-duplicate of
// `add-skill-modal.tsx` to avoid a premature shared abstraction.
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
