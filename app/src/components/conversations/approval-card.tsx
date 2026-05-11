"use client";
/**
 * ApprovalCard — renders one ApprovalRow inline at the top of the chat panel.
 *
 * Pending approvals show Approve / Skip buttons. Resolved approvals (only
 * shown if the caller passes them in) collapse to a muted footer stamp.
 */
import { useState } from "react";
import { Check, ChevronDown, ChevronUp, X } from "lucide-react";
import { AgentAvatar } from "@/components/shared/agent-avatar";
import { cn } from "@/lib/cn";
import type { ApprovalRow } from "@/lib/hooks/use-approvals";
import type { Employee } from "@/lib/types";

const ABSOLUTE_FMT: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  const m = Math.round(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function absoluteTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString([], ABSOLUTE_FMT);
  } catch {
    return "";
  }
}

const BODY_LINE_CLAMP = 3;

export function ApprovalCard({
  approval,
  agent,
  onApprove,
  onSkip,
}: {
  approval: ApprovalRow;
  /** Resolved Employee row for `approval.agent_id`, or null when unknown. */
  agent: Employee | null;
  onApprove: (id: string) => void | Promise<void>;
  onSkip: (id: string) => void | Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<"approve" | "skip" | null>(null);

  const isPending = approval.status === "pending";
  const body = approval.body ?? "";
  const showExpander = body.split(/\r?\n/).length > BODY_LINE_CLAMP || body.length > 220;

  const agentName = agent?.name ?? approval.agent_id;
  const accent = agent?.accent ?? "#6366F1";

  async function handle(action: "approve" | "skip") {
    if (busy || !isPending) return;
    setBusy(action);
    try {
      if (action === "approve") await onApprove(approval.id);
      else await onSkip(approval.id);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-amber-200 bg-amber-50/40">
      <div className="flex items-start gap-2.5 px-3 pt-2.5">
        <AgentAvatar
          value={agent?.avatar ?? null}
          name={agentName}
          size={28}
          accent={accent}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[13px] font-semibold text-primary">
              {agentName}
            </span>
            {isPending ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                Pending approval
              </span>
            ) : (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  approval.status === "approved"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-200 text-slate-600",
                )}
              >
                {approval.status}
              </span>
            )}
            <span
              className="ml-auto shrink-0 text-[10px] text-muted"
              title={absoluteTime(approval.created_at)}
            >
              {relativeTime(approval.created_at)}
            </span>
          </div>
          <div className="mt-0.5 text-[14px] font-semibold leading-snug text-primary">
            {approval.title}
          </div>
          {body ? (
            <div
              className={cn(
                "mt-1 whitespace-pre-wrap text-[12.5px] text-secondary",
                !expanded && "line-clamp-3",
              )}
            >
              {body}
            </div>
          ) : null}
          {showExpander ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline"
            >
              {expanded ? (
                <>
                  <ChevronUp size={12} />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown size={12} />
                  Show more
                </>
              )}
            </button>
          ) : null}
        </div>
      </div>
      {isPending ? (
        <div className="mt-2.5 flex items-center justify-end gap-2 border-t border-amber-200/70 bg-white/60 px-3 py-2">
          <button
            type="button"
            onClick={() => handle("skip")}
            disabled={!!busy}
            className="inline-flex items-center gap-1 rounded-md border border-strong bg-white px-2.5 py-1 text-[11px] font-semibold text-secondary hover:bg-surface-muted disabled:opacity-50"
          >
            <X size={12} />
            {busy === "skip" ? "Skipping…" : "Skip"}
          </button>
          <button
            type="button"
            onClick={() => handle("approve")}
            disabled={!!busy}
            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <Check size={12} />
            {busy === "approve" ? "Approving…" : "Approve"}
          </button>
        </div>
      ) : approval.resolved_at ? (
        <div className="border-t border-subtle bg-white/40 px-3 py-1.5 text-[11px] text-muted">
          {approval.status === "approved" ? "Approved" : "Skipped"}{" "}
          {relativeTime(approval.resolved_at)}
          {approval.notes ? ` — ${approval.notes}` : null}
        </div>
      ) : null}
    </div>
  );
}
