"use client";
/**
 * TypingIndicator — agent-side "is thinking…" bubble.
 *
 * Subscribes to a single run via useRunStream and translates the latest event
 * into a human label ("is reading…", "is searching…", "is writing…").
 * Falls back to "is thinking…" when no useful event has arrived yet.
 *
 * The parent (ChatPanel) decides when to render and unmount this component;
 * once status flips to success/error or the run is `done`, the parent clears
 * pendingRunId and we vanish on the next render. We surface an internal
 * 90-second failsafe label and a terminal error label here for clarity.
 */
import { useEffect, useMemo, useState } from "react";
import { AgentAvatar } from "@/components/shared/agent-avatar";
import { useRunStream, type RunEvent } from "@/lib/hooks/use-run-stream";
import type { Employee } from "@/lib/types";

const FAILSAFE_MS = 90_000;

/** Map a tool name (raw payload.name) to a verb/phrase shown to the user. */
function toolPhrase(rawName: unknown): string {
  const name = typeof rawName === "string" ? rawName.toLowerCase() : "";
  if (!name) return "using a tool";
  if (name.includes("read") || name.includes("open") || name.includes("file")) {
    return "reading";
  }
  if (
    name.includes("search") ||
    name.includes("grep") ||
    name.includes("find") ||
    name.includes("web")
  ) {
    return "searching";
  }
  if (name.includes("bash") || name.includes("exec") || name.includes("shell")) {
    return "running a command";
  }
  if (name.includes("write") || name.includes("edit") || name.includes("patch")) {
    return "editing";
  }
  if (name.includes("fetch") || name.includes("http")) {
    return "fetching";
  }
  // Default — surface the tool name verbatim, lightly cleaned.
  return `using ${name.replace(/[_-]+/g, " ")}`;
}

/** Last meaningful event wins. tool_use → tool phrase; assistant_text → writing. */
function labelFor(events: RunEvent[]): string {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.type === "tool_use") {
      return `is ${toolPhrase(ev.payload?.name)}…`;
    }
    if (ev.type === "assistant_text") {
      return "is writing…";
    }
  }
  return "is thinking…";
}

export function TypingIndicator({
  agent,
  runId,
}: {
  agent: Employee;
  runId: string;
}) {
  const { events, status, error } = useRunStream(runId);
  const [overdue, setOverdue] = useState(false);

  // 90s failsafe — if the run is somehow still pending past this, soften the
  // copy. The parent normally unmounts us long before we hit this.
  useEffect(() => {
    setOverdue(false);
    const t = window.setTimeout(() => setOverdue(true), FAILSAFE_MS);
    return () => window.clearTimeout(t);
  }, [runId]);

  const label = useMemo(() => labelFor(events), [events]);

  // Terminal error state — keep the bubble briefly so the parent thread poll
  // can pick up the persisted reply (if any) without a flash of nothing.
  // TODO: wire a retry affordance — needs a /api/runs/:id/retry route first.
  if (status === "error") {
    return (
      <div className="mb-4 flex gap-3" aria-live="polite">
        <AgentAvatar
          value={agent.avatar ?? null}
          name={agent.name}
          size={32}
          accent={agent.accent}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-muted">
              {agent.name}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-status-error">
            {agent.name} hit an error
            {error ? ` — ${truncate(error, 80)}` : "."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 flex gap-3" aria-live="polite" aria-busy="true">
      <AgentAvatar
        value={agent.avatar ?? null}
        name={agent.name}
        size={32}
        accent={agent.accent}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-muted">
            {agent.name}
          </span>
        </div>
        <div className="mt-0.5 inline-flex items-center gap-2 text-xs text-muted">
          <span>
            {agent.name} {overdue ? "is still working…" : label}
          </span>
          <span
            className="inline-flex items-center gap-0.5"
            aria-hidden="true"
          >
            <Dot delayMs={0} />
            <Dot delayMs={150} />
            <Dot delayMs={300} />
          </span>
          {overdue ? (
            <span className="text-[10px] text-muted">
              (taking longer than expected)
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Dot({ delayMs }: { delayMs: number }) {
  return (
    <span
      className="typing-dot inline-block size-1.5 rounded-full bg-muted"
      style={{ animationDelay: `${delayMs}ms` }}
    />
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
