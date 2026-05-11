"use client";
/**
 * NotificationMessage — renders a `kind === 'notification'` row inline in the
 * thread as a horizontal "card" instead of a chat bubble.
 *
 * Wave 2C: shipped alongside `chat-panel.tsx`'s notification handling.
 */
import Link from "next/link";
import { Bell, CheckCircle2, CircleStop, Clock, ExternalLink } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { RowDeleteButton } from "./chat-panel";
import type {
  NotificationMetadata,
  NotificationSource,
  ThreadMessage,
} from "@/lib/hooks/use-thread";

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

function formatCost(usd: number | null | undefined): string | null {
  if (usd == null || !Number.isFinite(usd) || usd <= 0) return null;
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

function formatDuration(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return null;
  const s = Math.round(ms / 100) / 10;
  if (s < 60) return `${s}s`;
  const mins = Math.floor(s / 60);
  const rs = Math.round(s - mins * 60);
  return rs > 0 ? `${mins}m ${rs}s` : `${mins}m`;
}

type IconConfig = { Icon: LucideIcon; tone: string; bg: string };

function iconForSource(source: NotificationSource | undefined): IconConfig {
  switch (source) {
    case "run-completed":
      return {
        Icon: CheckCircle2,
        tone: "text-emerald-600",
        bg: "bg-emerald-50",
      };
    case "session-ended":
      return { Icon: CircleStop, tone: "text-slate-500", bg: "bg-slate-100" };
    case "cron-fired":
      return {
        Icon: Clock,
        tone: "text-accent",
        bg: "bg-accent-soft",
      };
    case "run-failed":
      return { Icon: Bell, tone: "text-rose-600", bg: "bg-rose-50" };
    default:
      return { Icon: Bell, tone: "text-slate-500", bg: "bg-slate-100" };
  }
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-secondary">
      {children}
    </span>
  );
}

export function NotificationMessage({
  msg,
  onOpenRun,
  onDelete,
}: {
  msg: ThreadMessage;
  onOpenRun?: (runId: string) => void;
  /** Hard-delete the underlying notification message row. */
  onDelete?: () => Promise<void> | void;
}) {
  const meta: NotificationMetadata | null = msg.metadataParsed ?? null;
  const { Icon, tone, bg } = iconForSource(meta?.source);
  const runId = meta?.run_id ?? msg.run_id ?? null;
  const sessionId = meta?.session_id ?? null;
  const projectId = meta?.project_id ?? null;
  const cost = formatCost(meta?.cost_usd);
  const duration = formatDuration(meta?.duration_ms);

  return (
    <div className="group relative mb-3 flex items-start gap-2.5 rounded-lg border border-subtle bg-surface-muted/40 px-3 py-2.5">
      <span
        className={`mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full ${bg}`}
      >
        <Icon size={14} className={tone} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="min-w-0 flex-1 text-[12px] font-medium leading-snug text-secondary">
            {msg.body}
          </p>
          <span
            className="shrink-0 text-[10px] text-muted"
            title={absoluteTime(msg.created_at)}
          >
            {relativeTime(msg.created_at)}
          </span>
          {onDelete ? (
            <RowDeleteButton onConfirm={onDelete} label="notification" />
          ) : null}
        </div>
        {(runId || (sessionId && projectId) || cost || duration) ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {runId && onOpenRun ? (
              <button
                type="button"
                onClick={() => onOpenRun(runId)}
                className="inline-flex items-center gap-1 rounded-md border border-subtle bg-white px-1.5 py-0.5 text-[10px] font-semibold text-secondary hover:bg-surface-muted"
              >
                View run
              </button>
            ) : null}
            {sessionId && projectId ? (
              <Link
                href={`/projects/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(sessionId)}`}
                className="inline-flex items-center gap-1 rounded-md border border-subtle bg-white px-1.5 py-0.5 text-[10px] font-semibold text-secondary hover:bg-surface-muted"
              >
                Open session
                <ExternalLink size={10} />
              </Link>
            ) : null}
            {cost ? <Chip>{cost}</Chip> : null}
            {duration ? <Chip>{duration}</Chip> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
