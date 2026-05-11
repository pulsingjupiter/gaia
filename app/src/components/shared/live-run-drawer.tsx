"use client";
/**
 * LiveRunDrawer — slide-in right rail showing a single run's live timeline.
 *
 * Self-contained so other waves can mount it with just a runId. Closing
 * the drawer (or unmounting) tears down the underlying EventSource.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Loader2, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useEmployees } from "@/components/employees/employees-context";
import { useRunStream, type RunEvent } from "@/lib/hooks/use-run-stream";
import { cn } from "@/lib/cn";

type RunMeta = {
  employee_id: string | null;
  skill: string | null;
  status: "pending" | "running" | "success" | "error" | "cancelled" | null;
};

export function LiveRunDrawer({
  runId,
  open,
  onClose,
}: {
  runId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const stream = useRunStream(open ? runId : null);
  const [meta, setMeta] = useState<RunMeta>({
    employee_id: null,
    skill: null,
    status: null,
  });
  const { employees } = useEmployees();

  // Pull the canonical RunRow once for header context (employee, skill).
  useEffect(() => {
    if (!open || !runId) {
      setMeta({ employee_id: null, skill: null, status: null });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/runs/${encodeURIComponent(runId)}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const run = data?.run ?? null;
        if (run) {
          setMeta({
            employee_id: run.employee_id ?? null,
            skill: run.skill ?? null,
            status: run.status ?? null,
          });
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, runId]);

  // Lock body scroll when open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Dismiss on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const employee = useMemo(
    () => employees.find((e) => e.id === meta.employee_id) ?? null,
    [employees, meta.employee_id],
  );

  const liveStatus =
    stream.status === "idle"
      ? meta.status === "success"
        ? "success"
        : meta.status === "error"
          ? "error"
          : "running"
      : stream.status;

  // Render-time text accumulator: fold partial deltas (from system payloads
  // shaped as { stream_event } or { partial }) into the trailing
  // assistant_text. The runner already emits final assistant_text events,
  // so we just need to skip noisy system entries.
  const visibleEvents = useMemo(() => filterEvents(stream.events), [stream.events]);

  return (
    <div
      aria-hidden={!open}
      className={cn(
        "pointer-events-none fixed inset-0 z-40 transition",
        open ? "pointer-events-auto" : "",
      )}
    >
      {/* Backdrop — click anywhere outside the panel to dismiss. Kept very
          subtle so the chat thread underneath stays readable. */}
      <div
        onClick={onClose}
        aria-label="Close drawer"
        className={cn(
          "absolute inset-0 bg-black/10 transition-opacity",
          open ? "opacity-100" : "opacity-0",
        )}
      />
      {/* Panel */}
      <aside
        className={cn(
          "absolute right-0 top-0 flex h-full w-full max-w-[520px] flex-col border-l border-subtle bg-white shadow-xl transition-transform",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-subtle px-5 py-4">
          {employee ? (
            <Avatar
              initials={employee.initials}
              color={employee.accent}
              size={36}
            />
          ) : (
            <div className="size-9 rounded-full bg-surface-muted" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="truncate text-sm font-semibold text-primary">
                {employee?.name ?? "Run"}
              </div>
              <StatusBadge status={liveStatus} />
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
              {meta.skill ? (
                <span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent">
                  {meta.skill}
                </span>
              ) : null}
              {stream.cost > 0 ? (
                <span>${stream.cost.toFixed(4)}</span>
              ) : null}
              {stream.durationMs != null ? (
                <span>· {Math.round(stream.durationMs / 1000)}s</span>
              ) : null}
            </div>
          </div>
          <button
            onClick={onClose}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-subtle bg-white text-secondary hover:bg-surface-muted hover:text-primary"
            aria-label="Close"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {visibleEvents.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted">
              <Loader2 className="mr-2 animate-spin" size={14} />
              Waiting for events…
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {visibleEvents.map((e, idx) => (
                <li key={idx}>
                  <EventBlock ev={e} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        {liveStatus === "success" && stream.result_summary ? (
          <div className="border-t border-subtle bg-surface-muted px-5 py-3">
            <div className="mb-1 flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                Result
              </div>
              <CopyButton text={stream.result_summary} />
            </div>
            <div className="rounded-lg border border-subtle bg-white p-3 text-xs leading-relaxed text-primary whitespace-pre-wrap">
              {stream.result_summary}
            </div>
          </div>
        ) : null}
        {liveStatus === "error" && stream.error ? (
          <div className="border-t border-subtle bg-[#FEF2F2] px-5 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-status-error">
              Error
            </div>
            <div className="mt-1 text-xs text-status-error whitespace-pre-wrap">
              {stream.error}
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

// ---- Sub-components ----

function StatusBadge({
  status,
}: {
  status: "running" | "success" | "error" | "idle";
}) {
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-semibold text-[#92400E]">
        <Loader2 size={10} className="animate-spin" />
        Running
      </span>
    );
  }
  if (status === "success") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#D1FAE5] px-2 py-0.5 text-[10px] font-semibold text-[#065F46]">
        Success
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#FEE2E2] px-2 py-0.5 text-[10px] font-semibold text-[#991B1B]">
        Error
      </span>
    );
  }
  return null;
}

function EventBlock({ ev }: { ev: RunEvent }) {
  if (ev.type === "assistant_text") {
    const text = typeof ev.payload?.text === "string" ? ev.payload.text : "";
    return (
      <div className="text-sm leading-relaxed text-primary whitespace-pre-wrap">
        {text}
      </div>
    );
  }
  if (ev.type === "tool_use") {
    const name = ev.payload?.name ?? "tool";
    return (
      <ToolCard label={`Used tool: ${name}`} input={ev.payload?.input} />
    );
  }
  if (ev.type === "tool_result") {
    const isErr = !!ev.payload?.is_error;
    return (
      <ToolCard
        label={isErr ? "Tool error" : "Tool result"}
        input={ev.payload?.content}
        tone={isErr ? "error" : "result"}
      />
    );
  }
  if (ev.type === "result") {
    return (
      <div className="rounded-lg border border-subtle bg-surface-muted px-3 py-2 text-[11px] text-secondary">
        Run finished — {ev.payload?.status ?? "unknown"}
      </div>
    );
  }
  if (ev.type === "error") {
    const msg =
      ev.payload?.stderr ??
      ev.payload?.spawn_error ??
      ev.payload?.error ??
      JSON.stringify(ev.payload);
    return (
      <div className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs text-[#991B1B] whitespace-pre-wrap">
        {String(msg)}
      </div>
    );
  }
  return null;
}

function ToolCard({
  label,
  input,
  tone = "neutral",
}: {
  label: string;
  input: unknown;
  tone?: "neutral" | "result" | "error";
}) {
  const [open, setOpen] = useState(false);
  const palette =
    tone === "error"
      ? "border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]"
      : tone === "result"
        ? "border-subtle bg-surface-muted text-secondary"
        : "border-subtle bg-surface-muted text-secondary";
  return (
    <div className={cn("rounded-lg border px-3 py-2 text-xs", palette)}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left font-medium"
      >
        <span>{label}</span>
        <span className="text-[10px] text-muted">
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open ? (
        <pre className="mt-2 max-h-60 overflow-auto rounded-md bg-white p-2 text-[10px] leading-snug text-secondary">
          {tryStringify(input)}
        </pre>
      ) : null}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // ignore
        }
      }}
      className="inline-flex items-center gap-1 rounded-md border border-subtle bg-white px-2 py-0.5 text-[10px] font-medium text-secondary hover:bg-surface-muted"
    >
      {copied ? (
        <>
          <Check size={10} /> Copied
        </>
      ) : (
        <>
          <Copy size={10} /> Copy
        </>
      )}
    </button>
  );
}

// ---- Helpers ----

function filterEvents(all: RunEvent[]): RunEvent[] {
  // Drop noisy system events (init, partials, thinking) for the timeline —
  // the runner already emits canonical assistant_text events.
  return all.filter((e) => e.type !== "system" && e.type !== "done");
}

function tryStringify(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
