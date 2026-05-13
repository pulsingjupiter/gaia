"use client";
/**
 * GaiaAiAssessModal — auto-assesses a project (no user input required) and
 * shows a preview that the user can curate before applying.
 *
 * Flow:
 *  1. "confirm" — small explainer + Run / Cancel buttons.
 *  2. "running" — spinner while POST /assess works (30–60s).
 *  3. "review"  — editable description and brief + checkbox list of
 *     milestones and tasks. User can deselect items they don't want.
 *  4. "error"   — surfaced inline with a Retry button.
 *
 * Apply: POST /assess/apply with only the checked items + final project fields.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Loader2,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";

import { cn } from "@/lib/cn";

type Props = {
  open: boolean;
  projectId: string | null;
  projectName?: string;
  onClose: () => void;
  /** Fired after a successful apply so the parent can refresh the page. */
  onApplied?: () => void;
};

type Phase = "confirm" | "running" | "review" | "error";

type AssessTask = {
  title: string;
  priority: "low" | "medium" | "high";
  milestone_idx: number | null;
};

type AssessMilestone = {
  title: string;
  due_at: string | null;
};

type AssessProposal = {
  description: string;
  brief_markdown: string;
  milestones: AssessMilestone[];
  tasks: AssessTask[];
};

export function GaiaAiAssessModal({
  open,
  projectId,
  projectName,
  onClose,
  onApplied,
}: Props) {
  const [phase, setPhase] = useState<Phase>("confirm");
  const [proposal, setProposal] = useState<AssessProposal | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [briefDraft, setBriefDraft] = useState("");
  const [applyBrief, setApplyBrief] = useState(false);
  const [milestoneChecks, setMilestoneChecks] = useState<boolean[]>([]);
  const [taskChecks, setTaskChecks] = useState<boolean[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [installHint, setInstallHint] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  // Reset on close.
  useEffect(() => {
    if (!open) {
      setPhase("confirm");
      setProposal(null);
      setDescriptionDraft("");
      setBriefDraft("");
      setApplyBrief(false);
      setMilestoneChecks([]);
      setTaskChecks([]);
      setErrorMsg(null);
      setInstallHint(null);
      setApplying(false);
    }
  }, [open]);

  // Body scroll lock + escape.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase !== "running") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, phase, onClose]);

  const runAssess = useCallback(async () => {
    if (!projectId) return;
    setPhase("running");
    setErrorMsg(null);
    setInstallHint(null);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/assess`,
        { method: "POST", headers: { "content-type": "application/json" } },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        proposal?: AssessProposal;
        error?: string;
        install_hint?: string;
      };
      if (!res.ok || data.ok === false || !data.proposal) {
        setErrorMsg(data.error ?? `Server error (${res.status}).`);
        if (data.install_hint) setInstallHint(data.install_hint);
        setPhase("error");
        return;
      }
      setProposal(data.proposal);
      setDescriptionDraft(data.proposal.description ?? "");
      setBriefDraft(data.proposal.brief_markdown ?? "");
      setApplyBrief((data.proposal.brief_markdown ?? "").trim().length > 0);
      setMilestoneChecks(data.proposal.milestones.map(() => true));
      setTaskChecks(data.proposal.tasks.map(() => true));
      setPhase("review");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, [projectId]);

  const apply = useCallback(async () => {
    if (!projectId || !proposal) return;
    setApplying(true);
    setErrorMsg(null);

    // Build the curated payload. milestone_idx values must be remapped
    // because deselecting a milestone shifts the indexes the server sees.
    const keptMilestones: AssessMilestone[] = [];
    const indexRemap = new Map<number, number>();
    proposal.milestones.forEach((m, i) => {
      if (milestoneChecks[i]) {
        indexRemap.set(i, keptMilestones.length);
        keptMilestones.push(m);
      }
    });
    const keptTasks: AssessTask[] = [];
    proposal.tasks.forEach((t, i) => {
      if (!taskChecks[i]) return;
      const remapped =
        t.milestone_idx != null ? indexRemap.get(t.milestone_idx) ?? null : null;
      keptTasks.push({ ...t, milestone_idx: remapped });
    });
    const briefToApply = applyBrief ? briefDraft.trim() : "";

    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/assess/apply`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            description: descriptionDraft.trim(),
            ...(briefToApply ? { brief_markdown: briefToApply } : {}),
            milestones: keptMilestones,
            tasks: keptTasks,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
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
  }, [
    projectId,
    proposal,
    milestoneChecks,
    taskChecks,
    descriptionDraft,
    briefDraft,
    applyBrief,
    onApplied,
    onClose,
  ]);

  if (!open) return null;

  const keptMilestoneCount = milestoneChecks.filter(Boolean).length;
  const keptTaskCount = taskChecks.filter(Boolean).length;
  const hasAnythingToApply =
    keptMilestoneCount > 0 ||
    keptTaskCount > 0 ||
    descriptionDraft.trim().length > 0 ||
    (applyBrief && briefDraft.trim().length > 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={() => {
        if (phase !== "running") onClose();
      }}
    >
      <div
        className="card-surface flex max-h-[80vh] w-full max-w-[640px] flex-col overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-subtle px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Sparkles size={14} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-primary">
                Gaia AI Assess
              </div>
              <div className="truncate text-[11px] text-muted">
                {projectName ?? "project"}
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={phase === "running"}
            className="rounded-md p-1 text-muted hover:bg-surface-muted disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {phase === "confirm" ? (
            <ConfirmPanel />
          ) : phase === "running" ? (
            <RunningPanel />
          ) : phase === "error" ? (
            <ErrorPanel errorMsg={errorMsg} installHint={installHint} />
          ) : proposal ? (
            <ReviewPanel
              proposal={proposal}
              descriptionDraft={descriptionDraft}
              briefDraft={briefDraft}
              applyBrief={applyBrief}
              milestoneChecks={milestoneChecks}
              taskChecks={taskChecks}
              applyError={errorMsg}
              onDescription={setDescriptionDraft}
              onBrief={setBriefDraft}
              onToggleBrief={() => setApplyBrief((v) => !v)}
              onToggleMilestone={(i) =>
                setMilestoneChecks((arr) =>
                  arr.map((v, idx) => (idx === i ? !v : v)),
                )
              }
              onToggleTask={(i) =>
                setTaskChecks((arr) =>
                  arr.map((v, idx) => (idx === i ? !v : v)),
                )
              }
            />
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-subtle bg-surface-muted px-5 py-3">
          {phase === "confirm" ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-strong bg-white px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void runAssess()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
              >
                <Sparkles size={12} />
                Run Assess
              </button>
            </>
          ) : phase === "running" ? (
            <span className="text-[11px] text-muted">
              Takes ~30–60 seconds. Keep this window open.
            </span>
          ) : phase === "error" ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-strong bg-white px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-muted"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => void runAssess()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
              >
                <RotateCcw size={12} />
                Try again
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={applying}
                className="rounded-lg border border-strong bg-white px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void apply()}
                disabled={applying || !hasAnythingToApply}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {applying ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Check size={12} />
                )}
                {applying
                  ? "Applying…"
                  : `Apply Selected (${keptMilestoneCount} milestone${keptMilestoneCount === 1 ? "" : "s"}, ${keptTaskCount} task${keptTaskCount === 1 ? "" : "s"}${applyBrief && briefDraft.trim() ? ", brief" : ""})`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

function ConfirmPanel() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-primary">
        Gaia will read this project&apos;s files and recent sessions, then
        propose a description, brief, milestones, and tasks. Run now?
      </p>
      <ul className="space-y-1 text-xs text-secondary">
        <li>· Reads up to 30 top-level files (first ~1 KB each).</li>
        <li>· Reads your last 5 sessions for this project.</li>
        <li>· Nothing is saved until you review and apply.</li>
      </ul>
    </div>
  );
}

function RunningPanel() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <Loader2 size={28} className="animate-spin text-accent" />
      <div className="text-sm font-medium text-primary">
        Gaia is assessing…
      </div>
      <div className="max-w-sm text-xs text-muted">
        Reading files and recent sessions. This can take 30–60 seconds.
      </div>
    </div>
  );
}

function ErrorPanel({
  errorMsg,
  installHint,
}: {
  errorMsg: string | null;
  installHint: string | null;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-2 text-xs text-status-error">
        <div className="font-semibold">Couldn&apos;t complete the assessment.</div>
        {errorMsg ? <div className="mt-1 text-[11px]">{errorMsg}</div> : null}
        {installHint ? (
          <div className="mt-1 font-mono text-[10px] text-status-error/80">
            {installHint}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ReviewPanel({
  proposal,
  descriptionDraft,
  briefDraft,
  applyBrief,
  milestoneChecks,
  taskChecks,
  applyError,
  onDescription,
  onBrief,
  onToggleBrief,
  onToggleMilestone,
  onToggleTask,
}: {
  proposal: AssessProposal;
  descriptionDraft: string;
  briefDraft: string;
  applyBrief: boolean;
  milestoneChecks: boolean[];
  taskChecks: boolean[];
  applyError: string | null;
  onDescription: (v: string) => void;
  onBrief: (v: string) => void;
  onToggleBrief: () => void;
  onToggleMilestone: (i: number) => void;
  onToggleTask: (i: number) => void;
}) {
  return (
    <div className="space-y-4">
      {applyError ? (
        <div className="rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-2 text-xs text-status-error">
          {applyError}
        </div>
      ) : null}

      <section>
        <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Description
        </h4>
        <textarea
          value={descriptionDraft}
          onChange={(e) => onDescription(e.target.value)}
          rows={Math.max(2, Math.min(6, descriptionDraft.split("\n").length + 1))}
          placeholder="Project description (1-2 sentences)"
          className="w-full resize-y rounded-lg border border-strong bg-white px-3 py-2 text-sm leading-relaxed text-primary focus:border-accent focus:outline-none"
        />
        <p className="mt-1 text-[10px] text-muted">
          Leave empty to skip updating the description.
        </p>
      </section>

      <section>
        <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Brief
        </h4>
        <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs font-medium text-secondary">
          <input
            type="checkbox"
            checked={applyBrief}
            onChange={onToggleBrief}
            className="accent-accent"
          />
          Apply brief to project Settings
        </label>
        <textarea
          value={briefDraft}
          onChange={(e) => onBrief(e.target.value)}
          rows={12}
          placeholder="Long-form markdown context for agents"
          className={cn(
            "w-full resize-y rounded-lg border border-strong bg-white px-3 py-2 text-sm leading-relaxed text-primary focus:border-accent focus:outline-none",
            applyBrief ? "" : "bg-surface-muted opacity-60",
          )}
        />
        <p className="mt-1 text-[10px] text-muted">
          Uncheck to skip updating the Settings brief.
        </p>
      </section>

      <section>
        <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Milestones ({proposal.milestones.length})
        </h4>
        {proposal.milestones.length === 0 ? (
          <p className="text-xs text-muted">No milestones proposed.</p>
        ) : (
          <ul className="divide-y divide-subtle overflow-hidden rounded-lg border border-subtle">
            {proposal.milestones.map((m, i) => {
              const on = milestoneChecks[i] ?? false;
              return (
                <li key={i}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-start gap-3 px-3 py-2.5",
                      on ? "bg-white" : "bg-surface-muted opacity-70",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => onToggleMilestone(i)}
                      className="mt-1 accent-accent"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-primary">
                        {m.title}
                      </div>
                      {m.due_at ? (
                        <div className="mt-0.5 text-[10px] text-muted">
                          Due {m.due_at}
                        </div>
                      ) : null}
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Tasks ({proposal.tasks.length})
        </h4>
        {proposal.tasks.length === 0 ? (
          <p className="text-xs text-muted">No tasks proposed.</p>
        ) : (
          <ul className="divide-y divide-subtle overflow-hidden rounded-lg border border-subtle">
            {proposal.tasks.map((t, i) => {
              const on = taskChecks[i] ?? false;
              const milestoneTitle =
                t.milestone_idx != null
                  ? proposal.milestones[t.milestone_idx]?.title ?? null
                  : null;
              const milestoneOn =
                t.milestone_idx != null
                  ? milestoneChecks[t.milestone_idx] ?? false
                  : true;
              return (
                <li key={i}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-start gap-3 px-3 py-2",
                      on ? "bg-white" : "bg-surface-muted opacity-70",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => onToggleTask(i)}
                      className="mt-1 accent-accent"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-primary">{t.title}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted">
                        <span className="capitalize">{t.priority}</span>
                        {milestoneTitle ? (
                          <>
                            <span>·</span>
                            <span
                              className={
                                milestoneOn ? "" : "line-through opacity-60"
                              }
                              title={
                                milestoneOn
                                  ? undefined
                                  : "Milestone deselected — task will be unassigned."
                              }
                            >
                              {milestoneTitle}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
