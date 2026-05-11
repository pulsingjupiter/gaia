"use client";
/**
 * PlanWithClaudeModal — 5-step wizard that takes a project goal/scope/team
 * and asks the headless Claude CLI to generate a milestone+task plan. After
 * generation the modal swaps to a review state where the user can edit
 * individual milestones/tasks before applying them.
 *
 * Driven by an in-component `step` state. Steps 1-5 collect input; the
 * `review` step renders the proposal returned by `/api/projects/[id]/plan`;
 * the `raw-fallback` step shows the unparseable output so the user can
 * recover without losing their work.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  Pencil,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { cn } from "@/lib/cn";
import { AgentAvatar } from "@/components/shared/agent-avatar";
import { useEmployees } from "@/components/employees/employees-context";
import type { Employee } from "@/lib/types";

type Props = {
  open: boolean;
  projectId: string | null;
  projectName?: string;
  onClose: () => void;
  /** Fired after a successful apply so the parent can refresh milestone/backlog UIs. */
  onApplied?: () => void;
};

type DetailLevel = "milestones" | "balanced" | "detailed";
type DateFirmness = "hard" | "aspirational" | "none";

type ProposalTask = {
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high";
  assignee_id: string | null;
  due_date: string | null;
};

type ProposalMilestone = {
  name: string;
  description: string;
  due_date: string | null;
  tasks: ProposalTask[];
};

type PlanProposal = {
  milestones: ProposalMilestone[];
  rationale: string;
};

type Step = 1 | 2 | 3 | 4 | 5 | "generating" | "review" | "raw-fallback";

type WizardState = {
  goal: string;
  targetDate: string;
  dateFirmness: DateFirmness;
  mustHave: string;
  outOfScope: string;
  teamAgentIds: string[];
  includeHuman: boolean;
  detailLevel: DetailLevel;
};

const INITIAL_STATE: WizardState = {
  goal: "",
  targetDate: "",
  dateFirmness: "aspirational",
  mustHave: "",
  outOfScope: "",
  teamAgentIds: [],
  includeHuman: true,
  detailLevel: "balanced",
};

const TOTAL_STEPS = 5;

export function PlanWithClaudeModal({
  open,
  projectId,
  projectName,
  onClose,
  onApplied,
}: Props) {
  const [step, setStep] = useState<Step>(1);
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [proposal, setProposal] = useState<PlanProposal | null>(null);
  const [rawOutput, setRawOutput] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [installHint, setInstallHint] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const generatingRef = useRef(false);

  const { employees } = useEmployees();
  const agents = useMemo(
    () => employees.filter((e) => !e.internalOnly),
    [employees],
  );

  // Reset everything when the modal closes.
  useEffect(() => {
    if (!open) {
      setStep(1);
      setState(INITIAL_STATE);
      setProposal(null);
      setRawOutput("");
      setErrorMsg(null);
      setInstallHint(null);
      setApplying(false);
      setConfirmingCancel(false);
      generatingRef.current = false;
    }
  }, [open]);

  // Body scroll lock + escape handler.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const closeWithGuard = useCallback(() => {
    if (step === "generating") return; // can't bail mid-generation
    if (step === "review" || step === "raw-fallback") {
      setConfirmingCancel(true);
      return;
    }
    onClose();
  }, [step, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeWithGuard();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeWithGuard]);

  const generate = useCallback(async () => {
    if (!projectId) return;
    if (generatingRef.current) return;
    generatingRef.current = true;
    setStep("generating");
    setErrorMsg(null);
    setInstallHint(null);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/plan`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            goal: state.goal.trim(),
            target_date:
              state.dateFirmness === "none"
                ? null
                : state.targetDate.trim() || null,
            date_firmness: state.dateFirmness,
            must_have: state.mustHave.trim(),
            out_of_scope: state.outOfScope.trim(),
            team_agent_ids: state.teamAgentIds,
            include_human: state.includeHuman,
            detail_level: state.detailLevel,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        proposal?: PlanProposal;
        raw?: string;
        error?: string;
        install_hint?: string;
      };
      if (!res.ok) {
        setErrorMsg(data.error ?? `Server error (${res.status}).`);
        if (data.install_hint) setInstallHint(data.install_hint);
        setStep(5);
        return;
      }
      if (data.ok && data.proposal) {
        setProposal(data.proposal);
        setRawOutput(typeof data.raw === "string" ? data.raw : "");
        setStep("review");
        return;
      }
      setRawOutput(typeof data.raw === "string" ? data.raw : "");
      setErrorMsg(data.error ?? "Could not parse plan from Claude's response");
      setStep("raw-fallback");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStep(5);
    } finally {
      generatingRef.current = false;
    }
  }, [projectId, state]);

  const apply = useCallback(async () => {
    if (!projectId || !proposal) return;
    setApplying(true);
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/plan/apply`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(proposal),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        created?: { milestones: number; tasks: number };
        warnings?: string[];
        error?: string;
      };
      if (!res.ok) {
        setErrorMsg(data.error ?? `Apply failed (${res.status}).`);
        setApplying(false);
        return;
      }
      onApplied?.();
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setApplying(false);
    }
  }, [projectId, proposal, onApplied, onClose]);

  if (!open) return null;

  const totalMilestoneCount = proposal?.milestones.length ?? 0;
  const totalTaskCount = proposal
    ? proposal.milestones.reduce((acc, m) => acc + m.tasks.length, 0)
    : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={() => {
        if (step !== "generating") closeWithGuard();
      }}
    >
      <div
        className="card-surface w-full max-w-[640px] overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Header
          step={step}
          onClose={closeWithGuard}
          disabled={step === "generating"}
          onRegenerate={
            step === "review"
              ? () => {
                  setProposal(null);
                  setStep(5);
                }
              : null
          }
        />

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {step === 1 ? (
            <Step1Goal
              value={state.goal}
              onChange={(v) => setState((s) => ({ ...s, goal: v }))}
            />
          ) : null}
          {step === 2 ? (
            <Step2Timeline
              targetDate={state.targetDate}
              dateFirmness={state.dateFirmness}
              onTargetDate={(v) =>
                setState((s) => ({ ...s, targetDate: v }))
              }
              onDateFirmness={(v) =>
                setState((s) => ({
                  ...s,
                  dateFirmness: v,
                  targetDate: v === "none" ? "" : s.targetDate,
                }))
              }
            />
          ) : null}
          {step === 3 ? (
            <Step3Scope
              mustHave={state.mustHave}
              outOfScope={state.outOfScope}
              onMustHave={(v) => setState((s) => ({ ...s, mustHave: v }))}
              onOutOfScope={(v) =>
                setState((s) => ({ ...s, outOfScope: v }))
              }
            />
          ) : null}
          {step === 4 ? (
            <Step4Team
              agents={agents}
              selected={state.teamAgentIds}
              includeHuman={state.includeHuman}
              onToggleAgent={(id) =>
                setState((s) => ({
                  ...s,
                  teamAgentIds: s.teamAgentIds.includes(id)
                    ? s.teamAgentIds.filter((x) => x !== id)
                    : [...s.teamAgentIds, id],
                }))
              }
              onToggleHuman={() =>
                setState((s) => ({ ...s, includeHuman: !s.includeHuman }))
              }
            />
          ) : null}
          {step === 5 ? (
            <Step5Detail
              detailLevel={state.detailLevel}
              onChange={(v) =>
                setState((s) => ({ ...s, detailLevel: v }))
              }
              errorMsg={errorMsg}
              installHint={installHint}
            />
          ) : null}
          {step === "generating" ? <GeneratingPanel /> : null}
          {step === "review" && proposal ? (
            <ReviewPanel
              proposal={proposal}
              agents={agents}
              includeHuman={state.includeHuman}
              onChange={setProposal}
              applyError={errorMsg}
            />
          ) : null}
          {step === "raw-fallback" ? (
            <RawFallbackPanel raw={rawOutput} errorMsg={errorMsg} />
          ) : null}
        </div>

        <Footer
          step={step}
          state={state}
          totalMilestoneCount={totalMilestoneCount}
          totalTaskCount={totalTaskCount}
          applying={applying}
          onBack={() =>
            setStep((s) => {
              if (typeof s === "number" && s > 1) return (s - 1) as Step;
              return s;
            })
          }
          onNext={() =>
            setStep((s) => {
              if (typeof s === "number" && s < TOTAL_STEPS)
                return (s + 1) as Step;
              return s;
            })
          }
          onCancel={closeWithGuard}
          onGenerate={() => void generate()}
          onApply={() => void apply()}
          onTryAgain={() => {
            setRawOutput("");
            setErrorMsg(null);
            setStep(5);
          }}
        />

        {confirmingCancel ? (
          <ConfirmCancel
            onKeep={() => setConfirmingCancel(false)}
            onDiscard={() => {
              setConfirmingCancel(false);
              onClose();
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header / footer / steps
// ---------------------------------------------------------------------------

function Header({
  step,
  onClose,
  disabled,
  onRegenerate,
}: {
  step: Step;
  onClose: () => void;
  disabled: boolean;
  onRegenerate?: (() => void) | null;
}) {
  const stepLabel =
    typeof step === "number"
      ? `Step ${step} of ${TOTAL_STEPS}`
      : step === "generating"
        ? "Generating plan…"
        : step === "review"
          ? "Review proposal"
          : "Output not parseable";

  return (
    <div className="flex items-center justify-between border-b border-subtle px-5 py-3.5">
      <div className="flex items-center gap-3 min-w-0">
        <div className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Sparkles size={14} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-primary">
            Plan with Claude
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <span>{stepLabel}</span>
            {typeof step === "number" ? (
              <span className="font-mono tracking-wider">
                {Array.from({ length: TOTAL_STEPS }, (_, i) =>
                  i + 1 <= step ? "●" : "○",
                ).join("")}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {onRegenerate ? (
          <button
            type="button"
            onClick={onRegenerate}
            className="inline-flex items-center gap-1 rounded-md border border-strong bg-white px-2 py-1 text-[11px] font-medium text-secondary hover:bg-surface-muted"
          >
            <RotateCcw size={11} />
            Regenerate
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          disabled={disabled}
          className="rounded-md p-1 text-muted hover:bg-surface-muted disabled:opacity-40"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

function Footer({
  step,
  state,
  totalMilestoneCount,
  totalTaskCount,
  applying,
  onBack,
  onNext,
  onCancel,
  onGenerate,
  onApply,
  onTryAgain,
}: {
  step: Step;
  state: WizardState;
  totalMilestoneCount: number;
  totalTaskCount: number;
  applying: boolean;
  onBack: () => void;
  onNext: () => void;
  onCancel: () => void;
  onGenerate: () => void;
  onApply: () => void;
  onTryAgain: () => void;
}) {
  if (step === "generating") {
    return (
      <div className="border-t border-subtle bg-surface-muted px-5 py-3 text-[11px] text-muted">
        Takes ~30–60 seconds… do not close this window.
      </div>
    );
  }

  if (step === "review") {
    return (
      <div className="flex items-center justify-between gap-3 border-t border-subtle bg-surface-muted px-5 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-strong bg-white px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={applying || totalMilestoneCount === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {applying ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {applying
            ? "Applying…"
            : `Apply (${totalMilestoneCount} milestone${totalMilestoneCount === 1 ? "" : "s"}, ${totalTaskCount} task${totalTaskCount === 1 ? "" : "s"})`}
        </button>
      </div>
    );
  }

  if (step === "raw-fallback") {
    return (
      <div className="flex items-center justify-between gap-3 border-t border-subtle bg-surface-muted px-5 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-strong bg-white px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-muted"
        >
          Close
        </button>
        <button
          type="button"
          onClick={onTryAgain}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
        >
          <RotateCcw size={12} />
          Try again
        </button>
      </div>
    );
  }

  const canProceed = stepIsValid(step, state);
  const isLastStep = step === TOTAL_STEPS;

  return (
    <div className="flex items-center justify-between gap-3 border-t border-subtle bg-surface-muted px-5 py-3">
      <button
        type="button"
        onClick={step === 1 ? onCancel : onBack}
        className="rounded-lg border border-strong bg-white px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-muted"
      >
        {step === 1 ? "Cancel" : "Back"}
      </button>
      {isLastStep ? (
        <button
          type="button"
          onClick={onGenerate}
          disabled={!canProceed}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          <Sparkles size={12} />
          Generate plan with Claude
        </button>
      ) : (
        <button
          type="button"
          onClick={onNext}
          disabled={!canProceed}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          Next
          <ChevronRight size={12} />
        </button>
      )}
    </div>
  );
}

function stepIsValid(step: Step, state: WizardState): boolean {
  if (step === 1) return state.goal.trim().length >= 10;
  if (step === 2) return true;
  if (step === 3) return state.mustHave.trim().length >= 10;
  if (step === 4) return state.teamAgentIds.length > 0 || state.includeHuman;
  if (step === 5) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Step panels
// ---------------------------------------------------------------------------

function Step1Goal({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Panel
      title="What's the goal of this project?"
      hint="At least 10 characters. Be specific about the outcome."
    >
      <textarea
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ship Gaia v1 with kanban, scheduling, and agent templates"
        rows={4}
        className="w-full resize-y rounded-lg border border-strong bg-white px-3 py-2 text-sm text-primary focus:outline-none focus:border-accent"
      />
    </Panel>
  );
}

function Step2Timeline({
  targetDate,
  dateFirmness,
  onTargetDate,
  onDateFirmness,
}: {
  targetDate: string;
  dateFirmness: DateFirmness;
  onTargetDate: (v: string) => void;
  onDateFirmness: (v: DateFirmness) => void;
}) {
  return (
    <Panel title="Timeline">
      <div className="space-y-4">
        {dateFirmness !== "none" ? (
          <Field label="Target completion date">
            <input
              type="date"
              value={targetDate}
              onChange={(e) => onTargetDate(e.target.value)}
              className="w-full rounded-lg border border-strong bg-white px-3 py-2 text-sm text-primary focus:outline-none focus:border-accent"
            />
          </Field>
        ) : null}
        <Field label="How firm is this date?">
          <Radio
            name="date-firmness"
            value={dateFirmness}
            onChange={(v) => onDateFirmness(v as DateFirmness)}
            options={[
              { value: "hard", label: "Hard deadline" },
              { value: "aspirational", label: "Aspirational" },
              { value: "none", label: "No date set" },
            ]}
          />
        </Field>
      </div>
    </Panel>
  );
}

function Step3Scope({
  mustHave,
  outOfScope,
  onMustHave,
  onOutOfScope,
}: {
  mustHave: string;
  outOfScope: string;
  onMustHave: (v: string) => void;
  onOutOfScope: (v: string) => void;
}) {
  return (
    <Panel title="Scope">
      <div className="space-y-4">
        <Field label="What MUST be in scope?" hint="3–5 bullets is ideal.">
          <textarea
            value={mustHave}
            onChange={(e) => onMustHave(e.target.value)}
            rows={4}
            placeholder={"• Kanban board\n• Scheduling UI\n• Agent templates"}
            className="w-full resize-y rounded-lg border border-strong bg-white px-3 py-2 text-sm text-primary focus:outline-none focus:border-accent"
          />
        </Field>
        <Field label="What's explicitly OUT of scope? (optional)">
          <textarea
            value={outOfScope}
            onChange={(e) => onOutOfScope(e.target.value)}
            rows={3}
            placeholder="Mobile app, billing, multi-tenant auth"
            className="w-full resize-y rounded-lg border border-strong bg-white px-3 py-2 text-sm text-primary focus:outline-none focus:border-accent"
          />
        </Field>
      </div>
    </Panel>
  );
}

function Step4Team({
  agents,
  selected,
  includeHuman,
  onToggleAgent,
  onToggleHuman,
}: {
  agents: Employee[];
  selected: string[];
  includeHuman: boolean;
  onToggleAgent: (id: string) => void;
  onToggleHuman: () => void;
}) {
  return (
    <Panel
      title="Who's on this team?"
      hint="At least one person required. Claude will assign tasks accordingly."
    >
      <div className="space-y-2">
        <TeamRow
          checked={includeHuman}
          onClick={onToggleHuman}
          accent="#5B5BD6"
          name="You (Adrian)"
          role="Human"
        />
        {agents.length === 0 ? (
          <p className="px-1 text-xs text-muted">
            No agents available. Add agents on the Agents page first.
          </p>
        ) : (
          agents.map((a) => (
            <TeamRow
              key={a.id}
              checked={selected.includes(a.id)}
              onClick={() => onToggleAgent(a.id)}
              accent={a.accent}
              avatar={a.avatar}
              name={a.name}
              role={a.role}
            />
          ))
        )}
      </div>
    </Panel>
  );
}

function TeamRow({
  checked,
  onClick,
  accent,
  avatar,
  name,
  role,
}: {
  checked: boolean;
  onClick: () => void;
  initials?: string;
  accent: string;
  avatar?: string | null;
  name: string;
  role: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border bg-white px-3 py-2 text-left transition",
        checked
          ? "border-accent bg-accent-soft/40"
          : "border-strong hover:bg-surface-muted",
      )}
    >
      <span
        className={cn(
          "inline-flex size-4 shrink-0 items-center justify-center rounded border",
          checked
            ? "border-accent bg-accent text-white"
            : "border-strong bg-white",
        )}
      >
        {checked ? <Check size={10} /> : null}
      </span>
      <AgentAvatar value={avatar ?? null} name={name} size={28} accent={accent} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-primary">{name}</div>
        <div className="text-[11px] text-muted">{role}</div>
      </div>
    </button>
  );
}

function Step5Detail({
  detailLevel,
  onChange,
  errorMsg,
  installHint,
}: {
  detailLevel: DetailLevel;
  onChange: (v: DetailLevel) => void;
  errorMsg: string | null;
  installHint: string | null;
}) {
  return (
    <Panel title="How much detail should Claude generate?">
      <div className="space-y-2">
        <DetailOption
          value="milestones"
          current={detailLevel}
          onClick={onChange}
          title="Just milestones"
          subtitle="5–7 high-level checkpoints, no tasks."
        />
        <DetailOption
          value="balanced"
          current={detailLevel}
          onClick={onChange}
          title="Milestones + key tasks"
          subtitle="4–6 milestones with 3–6 tasks each (recommended)."
          recommended
        />
        <DetailOption
          value="detailed"
          current={detailLevel}
          onClick={onChange}
          title="Detailed task breakdown"
          subtitle="6–10 milestones with 5–10 tasks each (50+ tasks)."
        />
      </div>
      <p className="mt-4 text-[11px] text-muted">
        Takes ~30–60 seconds…
      </p>
      {errorMsg ? (
        <div className="mt-3 rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-2 text-xs text-status-error">
          <div className="font-medium">{errorMsg}</div>
          {installHint ? (
            <div className="mt-1 font-mono text-[10px] text-status-error/80">
              {installHint}
            </div>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

function DetailOption({
  value,
  current,
  onClick,
  title,
  subtitle,
  recommended,
}: {
  value: DetailLevel;
  current: DetailLevel;
  onClick: (v: DetailLevel) => void;
  title: string;
  subtitle: string;
  recommended?: boolean;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border bg-white px-3 py-2.5 text-left transition",
        active ? "border-accent bg-accent-soft/40" : "border-strong hover:bg-surface-muted",
      )}
    >
      <span
        className={cn(
          "mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border",
          active ? "border-accent" : "border-strong bg-white",
        )}
      >
        {active ? <span className="size-2 rounded-full bg-accent" /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-primary">{title}</span>
          {recommended ? (
            <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">
              Recommended
            </span>
          ) : null}
        </div>
        <div className="text-[11px] text-muted">{subtitle}</div>
      </div>
    </button>
  );
}

function GeneratingPanel() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <Loader2 size={28} className="animate-spin text-accent" />
      <div className="text-sm font-medium text-primary">
        Claude is drafting your plan…
      </div>
      <div className="max-w-sm text-xs text-muted">
        This usually takes 30–60 seconds. Keep this window open.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review panel
// ---------------------------------------------------------------------------

function ReviewPanel({
  proposal,
  agents,
  includeHuman,
  onChange,
  applyError,
}: {
  proposal: PlanProposal;
  agents: Employee[];
  includeHuman: boolean;
  onChange: (next: PlanProposal) => void;
  applyError: string | null;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(
    () => new Set(proposal.milestones.map((_, i) => i)),
  );
  const [rationaleOpen, setRationaleOpen] = useState(false);

  const agentById = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const a of agents) map.set(a.id, a);
    return map;
  }, [agents]);

  function toggle(idx: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function removeMilestone(idx: number) {
    const next = {
      ...proposal,
      milestones: proposal.milestones.filter((_, i) => i !== idx),
    };
    onChange(next);
  }

  function updateMilestone(idx: number, patch: Partial<ProposalMilestone>) {
    const next = {
      ...proposal,
      milestones: proposal.milestones.map((m, i) =>
        i === idx ? { ...m, ...patch } : m,
      ),
    };
    onChange(next);
  }

  function removeTask(mIdx: number, tIdx: number) {
    const milestone = proposal.milestones[mIdx];
    if (!milestone) return;
    const nextTasks = milestone.tasks.filter((_, i) => i !== tIdx);
    updateMilestone(mIdx, { tasks: nextTasks });
  }

  function updateTask(
    mIdx: number,
    tIdx: number,
    patch: Partial<ProposalTask>,
  ) {
    const milestone = proposal.milestones[mIdx];
    if (!milestone) return;
    const nextTasks = milestone.tasks.map((t, i) =>
      i === tIdx ? { ...t, ...patch } : t,
    );
    updateMilestone(mIdx, { tasks: nextTasks });
  }

  const total = proposal.milestones.reduce(
    (acc, m) => acc + m.tasks.length,
    0,
  );

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-subtle bg-surface-muted px-3 py-2 text-xs text-secondary">
        Claude proposes <strong>{proposal.milestones.length}</strong>{" "}
        milestone{proposal.milestones.length === 1 ? "" : "s"},{" "}
        <strong>{total}</strong> task{total === 1 ? "" : "s"}. Edit or remove
        anything below before applying.
      </div>

      {applyError ? (
        <div className="rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-2 text-xs text-status-error">
          {applyError}
        </div>
      ) : null}

      <div className="divide-y divide-subtle rounded-lg border border-subtle">
        {proposal.milestones.map((m, mIdx) => {
          const isOpen = expanded.has(mIdx);
          return (
            <MilestoneCard
              key={mIdx}
              milestone={m}
              isOpen={isOpen}
              onToggle={() => toggle(mIdx)}
              onUpdate={(patch) => updateMilestone(mIdx, patch)}
              onRemove={() => removeMilestone(mIdx)}
            >
              {m.tasks.map((t, tIdx) => (
                <TaskCard
                  key={tIdx}
                  task={t}
                  agent={t.assignee_id ? agentById.get(t.assignee_id) ?? null : null}
                  isHuman={t.assignee_id === "adrian" && includeHuman}
                  agents={agents}
                  includeHuman={includeHuman}
                  onUpdate={(patch) => updateTask(mIdx, tIdx, patch)}
                  onRemove={() => removeTask(mIdx, tIdx)}
                />
              ))}
              {m.tasks.length === 0 ? (
                <div className="px-4 py-2 text-[11px] text-muted">
                  No tasks for this milestone.
                </div>
              ) : null}
            </MilestoneCard>
          );
        })}
        {proposal.milestones.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted">
            All milestones removed. Close and re-open the wizard to regenerate.
          </div>
        ) : null}
      </div>

      {proposal.rationale ? (
        <div className="rounded-lg border border-subtle bg-surface-muted">
          <button
            type="button"
            onClick={() => setRationaleOpen((o) => !o)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-secondary"
          >
            <span>Rationale</span>
            <ChevronDown
              size={12}
              className={cn(
                "transition-transform",
                rationaleOpen ? "rotate-180" : "",
              )}
            />
          </button>
          {rationaleOpen ? (
            <div className="border-t border-subtle px-3 py-2 text-xs text-secondary whitespace-pre-wrap">
              {proposal.rationale}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MilestoneCard({
  milestone,
  isOpen,
  onToggle,
  onUpdate,
  onRemove,
  children,
}: {
  milestone: ProposalMilestone;
  isOpen: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<ProposalMilestone>) => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(milestone.name);
  const [draftDate, setDraftDate] = useState(milestone.due_date ?? "");

  function commit() {
    onUpdate({
      name: draftName.trim() || milestone.name,
      due_date: draftDate.trim() || null,
    });
    setEditing(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-surface-muted">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronDown
            size={12}
            className={cn(
              "shrink-0 text-muted transition-transform",
              isOpen ? "" : "-rotate-90",
            )}
          />
          {editing ? (
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="min-w-0 flex-1 rounded border border-strong bg-white px-2 py-0.5 text-sm font-medium text-primary"
            />
          ) : (
            <span className="truncate text-sm font-semibold text-primary">
              {milestone.name}
            </span>
          )}
          {milestone.due_date ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              <Calendar size={9} />
              Due {milestone.due_date}
            </span>
          ) : null}
        </button>
        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <input
                type="date"
                value={draftDate ?? ""}
                onChange={(e) => setDraftDate(e.target.value)}
                className="rounded border border-strong bg-white px-1.5 py-0.5 text-[11px] text-primary"
              />
              <button
                type="button"
                onClick={commit}
                className="inline-flex items-center gap-1 rounded-md border border-accent bg-accent px-2 py-1 text-[11px] font-semibold text-white"
              >
                Save
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                aria-label="Edit milestone"
                onClick={() => {
                  setDraftName(milestone.name);
                  setDraftDate(milestone.due_date ?? "");
                  setEditing(true);
                }}
                className="rounded-md border border-strong bg-white p-1 text-secondary hover:bg-surface-muted"
              >
                <Pencil size={11} />
              </button>
              <button
                type="button"
                aria-label="Remove milestone"
                onClick={onRemove}
                className="rounded-md border border-strong bg-white p-1 text-status-error hover:bg-red-50"
              >
                <X size={11} />
              </button>
            </>
          )}
        </div>
      </div>
      {isOpen ? <div className="bg-surface-muted/40">{children}</div> : null}
    </div>
  );
}

function TaskCard({
  task,
  agent,
  isHuman,
  agents,
  includeHuman,
  onUpdate,
  onRemove,
}: {
  task: ProposalTask;
  agent: Employee | null;
  isHuman: boolean;
  agents: Employee[];
  includeHuman: boolean;
  onUpdate: (patch: Partial<ProposalTask>) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(task.title);
  const [draftPriority, setDraftPriority] = useState<ProposalTask["priority"]>(task.priority);
  const [draftAssignee, setDraftAssignee] = useState(task.assignee_id ?? "");
  const [draftDate, setDraftDate] = useState(task.due_date ?? "");

  function commit() {
    onUpdate({
      title: draftTitle.trim() || task.title,
      priority: draftPriority,
      assignee_id: draftAssignee || null,
      due_date: draftDate.trim() || null,
    });
    setEditing(false);
  }

  const ownerLabel = isHuman
    ? "Adrian"
    : agent
      ? agent.name
      : task.assignee_id ?? "Unassigned";

  return (
    <div className="flex items-start justify-between gap-2 border-t border-subtle px-3 py-2">
      {editing ? (
        <div className="flex-1 space-y-1.5">
          <input
            autoFocus
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            className="w-full rounded border border-strong bg-white px-2 py-1 text-xs text-primary"
          />
          <div className="flex flex-wrap gap-1.5">
            <select
              value={draftPriority}
              onChange={(e) => setDraftPriority(e.target.value as ProposalTask["priority"])}
              className="rounded border border-strong bg-white px-1.5 py-0.5 text-[10px] text-primary"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <select
              value={draftAssignee}
              onChange={(e) => setDraftAssignee(e.target.value)}
              className="rounded border border-strong bg-white px-1.5 py-0.5 text-[10px] text-primary"
            >
              <option value="">Unassigned</option>
              {includeHuman ? <option value="adrian">Adrian (you)</option> : null}
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={draftDate}
              onChange={(e) => setDraftDate(e.target.value)}
              className="rounded border border-strong bg-white px-1.5 py-0.5 text-[10px] text-primary"
            />
            <button
              type="button"
              onClick={commit}
              className="rounded-md border border-accent bg-accent px-2 py-0.5 text-[10px] font-semibold text-white"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md border border-strong bg-white px-2 py-0.5 text-[10px] font-medium text-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-3 shrink-0 rounded-full border border-subtle bg-white" />
            <span className="truncate text-xs text-primary">{task.title}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 pl-5 text-[10px] text-muted">
            <span>{ownerLabel}</span>
            <span>·</span>
            <span className="capitalize">{task.priority}</span>
            {task.due_date ? (
              <>
                <span>·</span>
                <span>Due {task.due_date}</span>
              </>
            ) : null}
          </div>
        </div>
      )}
      {!editing ? (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="Edit task"
            onClick={() => {
              setDraftTitle(task.title);
              setDraftPriority(task.priority);
              setDraftAssignee(task.assignee_id ?? "");
              setDraftDate(task.due_date ?? "");
              setEditing(true);
            }}
            className="rounded-md p-1 text-muted hover:bg-white hover:text-secondary"
          >
            <Pencil size={10} />
          </button>
          <button
            type="button"
            aria-label="Remove task"
            onClick={onRemove}
            className="rounded-md p-1 text-muted hover:bg-white hover:text-status-error"
          >
            <X size={10} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Raw fallback panel
// ---------------------------------------------------------------------------

function RawFallbackPanel({
  raw,
  errorMsg,
}: {
  raw: string;
  errorMsg: string | null;
}) {
  const [copied, setCopied] = useState(false);

  async function copyOutput() {
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-2 text-xs text-status-error">
        <div className="font-semibold">
          Couldn&apos;t auto-parse Claude&apos;s response
        </div>
        {errorMsg ? <div className="mt-1 text-[11px]">{errorMsg}</div> : null}
      </div>
      <div className="text-xs text-secondary">Claude&apos;s raw output:</div>
      <pre className="max-h-[40vh] overflow-auto rounded-lg border border-subtle bg-surface-muted px-3 py-2 font-mono text-[11px] text-primary whitespace-pre-wrap">
        {raw || "(no output captured)"}
      </pre>
      <div>
        <button
          type="button"
          onClick={copyOutput}
          className="inline-flex items-center gap-1 rounded-md border border-strong bg-white px-2 py-1 text-[11px] font-medium text-secondary hover:bg-surface-muted"
        >
          <Copy size={11} />
          {copied ? "Copied" : "Copy output"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirm-cancel
// ---------------------------------------------------------------------------

function ConfirmCancel({
  onKeep,
  onDiscard,
}: {
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/30"
      onClick={onKeep}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-surface w-full max-w-xs p-4 shadow-xl"
      >
        <h3 className="text-sm font-semibold text-primary">Discard plan?</h3>
        <p className="mt-1 text-xs text-secondary">
          You&apos;ll lose the proposal Claude generated. The project itself
          is unchanged.
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onKeep}
            className="rounded-lg border border-strong bg-white px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-muted"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="inline-flex items-center gap-1 rounded-lg bg-status-error px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            <Trash2 size={11} />
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small primitives
// ---------------------------------------------------------------------------

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-primary">{title}</h3>
      {hint ? <p className="mt-0.5 text-[11px] text-muted">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
      {hint ? <p className="mt-1 text-[10px] text-muted">{hint}</p> : null}
    </label>
  );
}

function Radio({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-1.5">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <label
            key={o.value}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm transition",
              active ? "border-accent bg-accent-soft/40" : "border-strong hover:bg-surface-muted",
            )}
          >
            <input
              type="radio"
              name={name}
              checked={active}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            <span
              className={cn(
                "inline-flex size-4 shrink-0 items-center justify-center rounded-full border",
                active ? "border-accent" : "border-strong",
              )}
            >
              {active ? <span className="size-2 rounded-full bg-accent" /> : null}
            </span>
            <span className="text-primary">{o.label}</span>
          </label>
        );
      })}
    </div>
  );
}
