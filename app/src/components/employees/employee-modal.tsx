"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, Sparkles } from "lucide-react";

import type { Employee, EmployeeRuntime, EmployeeStatus } from "@/lib/types";
import { RUNTIME_HELP, RUNTIME_LABELS, RUNTIME_VALUES } from "@/lib/types";
import { useEmployees } from "./employees-context";
import { AgentAvatar } from "@/components/shared/agent-avatar";
import { IconPicker } from "@/components/shared/icon-picker";
import {
  AGENT_TEMPLATES,
  getTemplateById,
  type AgentTemplate,
} from "@/lib/agent-templates";

const ACCENT_OPTIONS = [
  { name: "Indigo", value: "#5B5BD6" },
  { name: "Pink", value: "#F472B6" },
  { name: "Green", value: "#10B981" },
  { name: "Amber", value: "#F59E0B" },
  { name: "Blue", value: "#3B82F6" },
  { name: "Violet", value: "#8B5CF6" },
  { name: "Teal", value: "#14B8A6" },
];

const STATUS_OPTIONS: EmployeeStatus[] = ["Online", "Busy", "Idle"];

const BLANK_TEMPLATE_ID = "__blank__";

type TemplateChoice =
  | { kind: "blank" }
  | { kind: "template"; template: AgentTemplate };

export function EmployeeModal({
  open,
  onOpenChange,
  employee,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employee?: Employee | null;
}) {
  const { add, update } = useEmployees();
  // Feature A — in CREATE mode we show a "Choose a template" step before
  // the form. Edit mode skips it entirely (irrelevant for editing).
  const isEdit = !!employee;
  const [choice, setChoice] = useState<TemplateChoice | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState<EmployeeStatus>("Online");
  const [accent, setAccent] = useState(ACCENT_OPTIONS[0].value);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<EmployeeRuntime>("claude");
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(employee?.name ?? "");
    setRole(employee?.role ?? "");
    setStatus(employee?.status ?? "Online");
    setAccent(employee?.accent ?? ACCENT_OPTIONS[0].value);
    setAvatar(employee?.avatar ?? null);
    setRuntime(employee?.runtime ?? "claude");
    setPickerOpen(false);
    // Edit mode: skip the picker. Create mode: show the picker first.
    setChoice(isEdit ? { kind: "blank" } : null);
  }, [open, employee, isEdit]);

  if (!open) return null;

  const showPicker = !isEdit && choice === null;

  const handlePickTemplate = (id: string) => {
    if (id === BLANK_TEMPLATE_ID) {
      setChoice({ kind: "blank" });
      // Blank: leave whatever was in state alone (currently empty).
      return;
    }
    const tpl = getTemplateById(id);
    if (!tpl) return;
    setChoice({ kind: "template", template: tpl });
    setName(tpl.name);
    setRole(tpl.role);
    setAccent(tpl.accent);
    setAvatar(tpl.avatar_id);
  };

  const handleChangeTemplate = () => {
    setChoice(null);
    // Reset the form so the next pick starts clean — otherwise a user who
    // tweaked the name then went back would see their tweak applied to the
    // next template.
    setName("");
    setRole("");
    setAccent(ACCENT_OPTIONS[0].value);
    setAvatar(null);
    setRuntime("claude");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (employee) {
      update(employee.id, { name, role, status, accent, avatar, runtime });
    } else {
      const template_id =
        choice && choice.kind === "template" ? choice.template.id : null;
      add(
        { name, role, status, accent, avatar, runtime },
        { template_id },
      );
    }
    onOpenChange(false);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        onClick={() => onOpenChange(false)}
      >
        <div
          className={
            "card-surface w-full shadow-xl " +
            (showPicker ? "max-w-3xl p-6" : "max-w-md p-6")
          }
          onClick={(e) => e.stopPropagation()}
        >
          {showPicker ? (
            <TemplatePicker
              onPick={handlePickTemplate}
              onCancel={() => onOpenChange(false)}
            />
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-primary">
                  {employee ? "Edit Agent" : "Add Agent"}
                </h2>
                {!isEdit && choice && choice.kind === "template" ? (
                  <button
                    type="button"
                    onClick={handleChangeTemplate}
                    className="inline-flex items-center gap-1 rounded-md border border-strong bg-white px-2 py-1 text-[11px] font-medium text-secondary hover:bg-surface-muted"
                  >
                    <ChevronLeft size={12} />
                    Change template
                  </button>
                ) : null}
                {!isEdit && choice && choice.kind === "blank" ? (
                  <button
                    type="button"
                    onClick={handleChangeTemplate}
                    className="inline-flex items-center gap-1 rounded-md border border-strong bg-white px-2 py-1 text-[11px] font-medium text-secondary hover:bg-surface-muted"
                  >
                    <ChevronLeft size={12} />
                    Pick template
                  </button>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-muted">
                {employee
                  ? "Update agent details below."
                  : choice && choice.kind === "template"
                    ? `Starting from "${choice.template.name}" — tweak anything before saving.`
                    : "Add a new AI agent to your workforce."}
              </p>

              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <div>
                  <label className="text-xs font-medium text-secondary">
                    Name
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-strong bg-white px-3 py-2 text-sm outline-none focus:border-accent"
                    placeholder="e.g. Lyra"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary">
                    Avatar
                  </label>
                  <div className="mt-1 flex items-center gap-3">
                    <AgentAvatar
                      value={avatar}
                      name={name || "?"}
                      size={40}
                      accent={accent}
                    />
                    <button
                      type="button"
                      onClick={() => setPickerOpen(true)}
                      className="rounded-lg border border-strong bg-white px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-muted"
                    >
                      Choose…
                    </button>
                    {avatar ? (
                      <button
                        type="button"
                        onClick={() => setAvatar(null)}
                        className="text-[11px] font-medium text-muted hover:underline"
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary">
                    Role
                  </label>
                  <input
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-strong bg-white px-3 py-2 text-sm outline-none focus:border-accent"
                    placeholder="e.g. Data Engineer"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary">
                    Runtime
                  </label>
                  <div
                    role="radiogroup"
                    aria-label="Runtime"
                    className="mt-1 space-y-1.5"
                  >
                    {RUNTIME_VALUES.map((rt) => {
                      const selected = runtime === rt;
                      return (
                        <label
                          key={rt}
                          className={
                            "flex cursor-pointer items-start gap-2 rounded-lg border bg-white px-3 py-2 text-xs transition " +
                            (selected
                              ? "border-accent ring-1 ring-accent"
                              : "border-strong hover:bg-surface-muted")
                          }
                        >
                          <input
                            type="radio"
                            name="runtime"
                            value={rt}
                            checked={selected}
                            onChange={() => setRuntime(rt)}
                            className="mt-0.5 accent-accent"
                          />
                          <span className="min-w-0">
                            <span className="block font-medium text-primary">
                              {RUNTIME_LABELS[rt]}
                            </span>
                            <span className="block text-[11px] leading-snug text-muted">
                              {RUNTIME_HELP[rt]}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as EmployeeStatus)}
                    className="mt-1 w-full rounded-lg border border-strong bg-white px-3 py-2 text-sm outline-none focus:border-accent"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary">
                    Accent
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {ACCENT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setAccent(opt.value)}
                        className="size-8 rounded-full border-2 transition"
                        style={{
                          background: opt.value,
                          borderColor:
                            accent === opt.value ? "#111827" : "transparent",
                        }}
                        aria-label={opt.name}
                        title={opt.name}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="rounded-lg border border-strong px-3 py-2 text-sm font-medium text-secondary hover:bg-surface-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                  >
                    {employee ? "Save changes" : "Add agent"}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
      <IconPicker
        open={pickerOpen}
        current={avatar}
        name={name || "Agent"}
        accent={accent}
        onSelect={(id) => {
          setAvatar(id);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
        title="Choose an avatar"
      />
    </>
  );
}

/**
 * Step 1 — 11-tile grid (10 templates + blank). Stays compact: each tile
 * is small but readable, with avatar + name + 1-line pitch.
 */
function TemplatePicker({
  onPick,
  onCancel,
}: {
  onPick: (id: string) => void;
  onCancel: () => void;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-primary">
            Choose a template
          </h2>
          <p className="mt-1 text-sm text-muted">
            Pick a starting persona — name, role, avatar, and a starter
            CLAUDE.md + skill are pre-filled. You can edit anything before
            saving.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-strong px-2 py-1 text-xs font-medium text-secondary hover:bg-surface-muted"
        >
          Cancel
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {AGENT_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t.id)}
            className="group flex h-full flex-col gap-2 rounded-lg border border-subtle bg-white p-3 text-left transition hover:border-accent hover:shadow-sm"
          >
            <div className="flex items-center gap-2">
              <AgentAvatar
                value={t.avatar_id}
                name={t.name}
                size={32}
                accent={t.accent}
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-primary">
                  {t.name}
                </div>
                <div className="truncate text-[10px] text-muted">{t.role}</div>
              </div>
            </div>
            <p className="line-clamp-2 text-[11px] leading-snug text-secondary">
              {t.short_pitch}
            </p>
          </button>
        ))}

        {/* Blank tile — visually de-emphasised so the picker reads as
            "templates first, then escape hatch". */}
        <button
          type="button"
          onClick={() => onPick(BLANK_TEMPLATE_ID)}
          className="group flex h-full flex-col gap-2 rounded-lg border border-dashed border-subtle bg-surface-muted/40 p-3 text-left transition hover:border-accent hover:bg-white"
        >
          <div className="flex items-center gap-2">
            <div
              className="flex size-8 items-center justify-center rounded-full bg-white text-muted"
              style={{ outline: "1px dashed currentColor" }}
            >
              <Sparkles size={14} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-primary">
                Blank
              </div>
              <div className="truncate text-[10px] text-muted">
                Start from scratch
              </div>
            </div>
          </div>
          <p className="line-clamp-2 text-[11px] leading-snug text-secondary">
            Empty CLAUDE.md, no skills. Fill in everything yourself.
          </p>
        </button>
      </div>
    </div>
  );
}
