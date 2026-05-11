"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BellOff,
  Brain,
  Check,
  Inbox,
  MoreHorizontal,
  Share2,
  Star,
  Trash2,
} from "lucide-react";
import { AgentAvatar } from "@/components/shared/agent-avatar";
import { ProgressCard, ResultCard } from "./embedded-cards";
import { Composer } from "./composer";
import { NotificationMessage } from "./notification-message";
import { TypingIndicator } from "./typing-indicator";
import { ApprovalCard } from "./approval-card";
import { useApprovals } from "@/lib/hooks/use-approvals";
import { useEmployees } from "@/components/employees/employees-context";
import { cn } from "@/lib/cn";
import type { Employee } from "@/lib/types";
import type { ThreadMessage } from "@/lib/hooks/use-thread";

const CONFIRM_TIMEOUT_MS = 3000;

type FencedBlock =
  | { type: "progress"; title?: string; subtitle?: string; progress?: number }
  | {
      type: "result";
      title?: string;
      bullets?: { label: string; body: string }[];
    }
  | { type: "unknown"; raw: unknown };

/**
 * Pull all ```json fenced blocks out of a message body and parse them.
 * Returns the cleaned body (with the fences stripped) plus parsed blocks.
 */
function extractFencedBlocks(body: string): {
  text: string;
  blocks: FencedBlock[];
} {
  const blocks: FencedBlock[] = [];
  const re = /```json\s*([\s\S]*?)```/gi;
  const text = body.replace(re, (_match, payload: string) => {
    try {
      const parsed = JSON.parse(payload);
      if (parsed && typeof parsed === "object" && "type" in parsed) {
        const t = (parsed as { type?: string }).type;
        if (t === "progress" || t === "result") {
          blocks.push(parsed as FencedBlock);
          return "";
        }
      }
      blocks.push({ type: "unknown", raw: parsed });
    } catch {
      // Leave unparseable JSON inline as text.
      return _match;
    }
    return "";
  });
  return { text: text.trim(), blocks };
}

function renderInline(text: string): React.ReactNode {
  // Render plain-text body preserving line breaks. Auto-link bare URLs.
  const lines = text.split(/\r?\n/);
  return lines.map((line, i) => (
    <span key={i}>
      {linkify(line)}
      {i < lines.length - 1 ? <br /> : null}
    </span>
  ));
}

function linkify(line: string): React.ReactNode {
  const re = /(https?:\/\/[^\s)]+)|((?:[\w.-]+@)[\w.-]+\.[a-z]{2,})/gi;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(line)) !== null) {
    if (match.index > lastIndex) parts.push(line.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith("http")) {
      parts.push(
        <a
          key={key++}
          href={token}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          {token}
        </a>,
      );
    } else {
      parts.push(
        <a
          key={key++}
          href={`mailto:${token}`}
          className="text-accent hover:underline"
        >
          {token}
        </a>,
      );
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < line.length) parts.push(line.slice(lastIndex));
  return parts.length ? parts : line;
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function isSameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  if (isSameDay(d.getTime(), today.getTime())) return "Today";
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (isSameDay(d.getTime(), y.getTime())) return "Yesterday";
  return d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Wave 2D — when a thread has neither participant equal to "user", the page
 * passes `interAgent` here. The panel switches into a read-only two-agent
 * layout, fetches its own messages from `/api/inter-agent-messages`, and
 * disables the composer.
 */
type InterAgentContext = {
  /** Sorted alphabetically — the canonical thread id is `${a}:${b}`. */
  participants: [string, string];
};

type InterAgentMessage = {
  id: string;
  from: string;
  from_name: string | null;
  body: string;
  run_id: string | null;
  received_at: number;
};

export function ChatPanel({
  them,
  threadId,
  loading,
  messages,
  onSend,
  onOpenRun,
  onMarkThreadRead,
  pendingRunId,
  onDeleteMessage,
  onClearNotifications,
  interAgent = null,
}: {
  them: Employee | null;
  threadId?: string | null;
  loading: boolean;
  messages: ThreadMessage[];
  onSend: (body: string) => Promise<void> | void;
  onOpenRun?: (runId: string) => void;
  /** Wave 2C — invoked ~1.5s after the panel renders for a thread, debounced. */
  onMarkThreadRead?: () => Promise<unknown> | void;
  pendingRunId?: string | null;
  /** Hard-delete a single message (chat or notification). */
  onDeleteMessage?: (id: string) => Promise<boolean> | boolean;
  /** Clear every notification in the active thread. */
  onClearNotifications?: () => Promise<number> | number;
  /** Wave 2D — when set, render as a read-only agent↔agent thread. */
  interAgent?: InterAgentContext | null;
}) {
  const isSystemThread = them?.id === "system" || them?.slug === "system";
  const isInterAgent = !!interAgent;
  const me = {
    name: "You",
    initials: "YO",
    accent: "#111827",
    avatar: null as string | null,
  };
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Pending approvals — for the System inbox, show ALL agents' pending
  // approvals; otherwise scope to the agent in this thread. The hook polls
  // every 8s and supports optimistic approve/skip. Inter-agent threads have
  // no approval surface — pass an impossible filter so the hook returns [].
  const approvalFilter = useMemo(
    () =>
      isInterAgent
        ? { status: "pending" as const, agent_id: "__none__" }
        : isSystemThread || !them
          ? { status: "pending" as const }
          : { status: "pending" as const, agent_id: them.id },
    [isInterAgent, isSystemThread, them],
  );
  const {
    approvals: pendingApprovals,
    approve: approveApproval,
    skip: skipApproval,
  } = useApprovals(approvalFilter);
  const { employees } = useEmployees();
  const employeeById = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const e of employees) {
      map.set(e.id, e);
      if (e.slug && e.slug !== e.id) map.set(e.slug, e);
    }
    return map;
  }, [employees]);

  // ---------------------------------------------------------------------
  // Inter-agent messages — fetched here (read-only). Polls every 8s while
  // an inter-agent thread is selected.
  // ---------------------------------------------------------------------
  const [interMessages, setInterMessages] = useState<InterAgentMessage[]>([]);
  const [interLoading, setInterLoading] = useState(false);
  useEffect(() => {
    if (!isInterAgent || !threadId) {
      setInterMessages([]);
      return;
    }
    let cancelled = false;
    let timer: number | null = null;
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/inter-agent-messages?thread=${encodeURIComponent(threadId)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { messages?: InterAgentMessage[] };
        if (cancelled) return;
        setInterMessages(Array.isArray(data?.messages) ? data.messages : []);
      } catch {
        // keep previous
      } finally {
        if (!cancelled) setInterLoading(false);
      }
    };
    setInterLoading(true);
    void poll();
    timer = window.setInterval(poll, 8000);
    return () => {
      cancelled = true;
      if (timer != null) window.clearInterval(timer);
    };
  }, [isInterAgent, threadId]);

  const interParticipantA = interAgent
    ? (employeeById.get(interAgent.participants[0]) ?? null)
    : null;
  const interParticipantB = interAgent
    ? (employeeById.get(interAgent.participants[1]) ?? null)
    : null;

  // Auto-scroll to bottom when messages grow OR when the typing indicator
  // appears/disappears, so the bubble stays in view as it animates in.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, interMessages.length, loading, interLoading, pendingRunId]);

  // Wave 2C — auto mark-read after a 1.5s settle so accidental hovers don't
  // clear unread badges. Re-arms whenever the user switches threads.
  // Wave 2D — inter-agent threads have no user-readable concept, so skip.
  useEffect(() => {
    if (!threadId || !onMarkThreadRead || isInterAgent) return;
    const t = window.setTimeout(() => {
      void onMarkThreadRead();
    }, 1500);
    return () => window.clearTimeout(t);
  }, [threadId, onMarkThreadRead, isInterAgent]);

  // Hide the typing indicator the moment the agent's reply lands in the
  // thread (run_id matches). The parent also clears pendingRunId on
  // success/error from the SSE; this is a belt-and-braces guard against any
  // race between the SSE close and the next thread poll.
  const replyArrived =
    !!pendingRunId && messages.some((m) => m.run_id === pendingRunId);
  const showTyping = !!them && !!pendingRunId && !replyArrived;

  const notificationCount = useMemo(
    () => messages.filter((m) => m.kind === "notification").length,
    [messages],
  );

  const grouped = useMemo(() => {
    const groups: { day: number; messages: ThreadMessage[] }[] = [];
    for (const m of messages) {
      const last = groups[groups.length - 1];
      if (last && isSameDay(last.day, m.created_at)) {
        last.messages.push(m);
      } else {
        groups.push({ day: m.created_at, messages: [m] });
      }
    }
    return groups;
  }, [messages]);

  if (!them) {
    return (
      <div className="flex h-full items-center justify-center bg-white text-center">
        <div className="max-w-xs">
          <div className="text-sm font-semibold text-primary">
            Pick a conversation from the left
          </div>
          <p className="mt-1 text-xs text-muted">
            Or start a new one with one of your AI agents from the sidebar.
          </p>
        </div>
      </div>
    );
  }

  // Wave 2D — agent↔agent thread render. Two-column layout (left = first
  // participant alphabetically, right = second), no composer, banner.
  if (isInterAgent && interAgent) {
    const a = interParticipantA;
    const b = interParticipantB;
    const labelA = a?.name ?? interAgent.participants[0];
    const labelB = b?.name ?? interAgent.participants[1];
    return (
      <div className="flex h-full min-h-0 flex-col">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-subtle bg-white px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex -space-x-1.5">
              <AgentAvatar
                value={a?.avatar ?? null}
                name={labelA}
                size={32}
                accent={a?.accent ?? "#9CA3AF"}
                ring
              />
              <AgentAvatar
                value={b?.avatar ?? null}
                name={labelB}
                size={32}
                accent={b?.accent ?? "#9CA3AF"}
                ring
              />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-primary">
                {labelA} <span className="text-muted">↔</span>{" "}
                {labelB}
              </div>
              <div className="text-[11px] text-muted">
                Agent-to-agent thread
              </div>
            </div>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
            agent → agent
          </span>
        </div>

        {/* Messages */}
        <div
          ref={scrollerRef}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-4 scroll-thin"
        >
          {interLoading && interMessages.length === 0 ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="flex gap-3">
                  <div className="size-8 shrink-0 animate-pulse rounded-full bg-surface-muted" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="h-2.5 w-24 animate-pulse rounded bg-surface-muted" />
                    <div className="h-3 w-2/3 animate-pulse rounded bg-surface-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : interMessages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center">
              <div className="max-w-xs">
                <div className="text-sm font-semibold text-primary">
                  No messages yet
                </div>
                <p className="mt-1 text-xs text-muted">
                  When {labelA} or {labelB} writes to the other&apos;s inbox,
                  it&apos;ll show up here.
                </p>
              </div>
            </div>
          ) : (
            <InterAgentMessageList
              messages={interMessages}
              leftId={interAgent.participants[0]}
              participantA={a}
              participantB={b}
              fallbackNameA={labelA}
              fallbackNameB={labelB}
            />
          )}
        </div>

        {/* Read-only banner */}
        <div className="shrink-0 border-t border-subtle bg-slate-50 px-4 py-3 text-center text-[11px] text-slate-600">
          Agent-to-agent thread —{" "}
          <span className="font-semibold">read-only</span>. Send manually via the
          agent&apos;s <code className="rounded bg-white px-1 py-px font-mono text-[10px] text-slate-700">&lt;&lt;&lt;MESSAGE&gt;&gt;&gt;</code>{" "}
          skill convention.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-subtle bg-white px-4 py-3">
        <div className="flex items-center gap-2.5">
          <AgentAvatar
            value={them.avatar ?? null}
            name={them.name}
            size={32}
            accent={them.accent}
          />
          <div className="leading-tight">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              {them.name}
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-status-online">
                <span className="size-1.5 rounded-full bg-status-online" />
                {them.status}
              </span>
            </div>
            <div className="text-[11px] text-muted">{them.role}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 text-muted">
          {onClearNotifications && notificationCount > 0 ? (
            <ClearNotificationsButton
              count={notificationCount}
              onConfirm={async () => {
                await onClearNotifications();
              }}
            />
          ) : null}
          <button className="rounded-md p-1.5 hover:bg-surface-muted">
            <Star size={14} />
          </button>
          <button className="rounded-md p-1.5 hover:bg-surface-muted">
            <Share2 size={14} />
          </button>
          <button className="rounded-md p-1.5 hover:bg-surface-muted">
            <MoreHorizontal size={14} />
          </button>
        </div>
      </div>

      {/* Messages — only this column scrolls; composer stays pinned below. */}
      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4 scroll-thin"
      >
        {loading && messages.length === 0 ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="size-8 shrink-0 animate-pulse rounded-full bg-surface-muted" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-2.5 w-24 animate-pulse rounded bg-surface-muted" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-surface-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : messages.length === 0 && !showTyping && pendingApprovals.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center">
            <div className="max-w-xs">
              {isSystemThread ? (
                <>
                  <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent">
                    <Inbox size={18} />
                  </div>
                  <div className="mt-2 text-sm font-semibold text-primary">
                    No notifications yet
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Agents will reach out here when they finish work for you,
                    or when an external Claude Code session ends.
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await fetch("/api/approvals/test", { method: "POST" });
                      } catch {
                        // best-effort — sample creation is optional
                      }
                    }}
                    className="mt-3 inline-flex items-center gap-1 rounded-md border border-strong bg-white px-2.5 py-1 text-[11px] font-semibold text-secondary hover:bg-surface-muted"
                  >
                    Try a sample approval
                  </button>
                </>
              ) : (
                <>
                  <div className="text-sm font-semibold text-primary">
                    Say hi to {them.name}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Type a message below to start the conversation.
                  </p>
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            {pendingApprovals.length > 0 ? (
              <div className="mb-3">
                {pendingApprovals.map((a) => (
                  <ApprovalCard
                    key={a.id}
                    approval={a}
                    agent={employeeById.get(a.agent_id) ?? null}
                    onApprove={async (id) => {
                      await approveApproval(id);
                    }}
                    onSkip={async (id) => {
                      await skipApproval(id);
                    }}
                  />
                ))}
              </div>
            ) : null}
            {grouped.map((group) => (
              <div key={group.day}>
                <div className="my-2 flex items-center gap-3">
                  <div className="h-px flex-1 bg-subtle" />
                  <span className="text-[10px] uppercase tracking-wider text-muted">
                    {dayLabel(group.day)}
                  </span>
                  <div className="h-px flex-1 bg-subtle" />
                </div>
                {group.messages.map((m) =>
                  m.kind === "notification" ? (
                    <NotificationMessage
                      key={m.id}
                      msg={m}
                      onOpenRun={onOpenRun}
                      onDelete={
                        onDeleteMessage
                          ? async () => {
                              await onDeleteMessage(m.id);
                            }
                          : undefined
                      }
                    />
                  ) : (
                    <MessageRow
                      key={m.id}
                      msg={m}
                      who={
                        m.sender_id === "user"
                          ? me
                          : {
                              name: them.name,
                              initials: them.initials,
                              accent: them.accent,
                              avatar: them.avatar ?? null,
                            }
                      }
                      onOpenRun={onOpenRun}
                      onDelete={
                        onDeleteMessage
                          ? async () => {
                              await onDeleteMessage(m.id);
                            }
                          : undefined
                      }
                    />
                  ),
                )}
              </div>
            ))}
            {showTyping && pendingRunId ? (
              <TypingIndicator agent={them} runId={pendingRunId} />
            ) : null}
          </>
        )}
      </div>

      <div className="shrink-0">
        {isSystemThread ? (
          <div className="border-t border-subtle bg-white px-4 py-3 text-center text-[11px] text-muted">
            You can&apos;t reply to system notifications.
          </div>
        ) : (
          <Composer name={them.name} onSend={onSend} />
        )}
      </div>
    </div>
  );
}

function MessageRow({
  msg,
  who,
  onOpenRun,
  onDelete,
}: {
  msg: ThreadMessage;
  who: {
    name: string;
    initials: string;
    accent: string;
    avatar: string | null;
  };
  onOpenRun?: (runId: string) => void;
  onDelete?: () => Promise<void> | void;
}) {
  const { text, blocks } = useMemo(
    () => extractFencedBlocks(msg.body),
    [msg.body],
  );

  const isAgent = msg.sender_id !== "user";
  const runId = msg.run_id ?? null;
  const showThinking = isAgent && !!runId && !!onOpenRun;

  return (
    <div className="group relative mb-4 flex gap-3">
      <AgentAvatar
        value={who.avatar}
        name={who.name}
        size={32}
        accent={who.accent}
      />
      {onDelete ? (
        <div className="absolute right-0 top-0">
          <RowDeleteButton onConfirm={onDelete} label={`message from ${who.name}`} />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-primary">
            {who.name}
          </span>
          <span className="text-[10px] text-muted">
            {formatTime(msg.created_at)}
          </span>
        </div>
        {text ? (
          <div className="mt-0.5 whitespace-pre-wrap text-sm text-secondary">
            {renderInline(text)}
          </div>
        ) : null}
        {blocks.map((b, i) => {
          if (b.type === "progress") {
            return (
              <ProgressCard
                key={i}
                title={b.title}
                subtitle={b.subtitle}
                progress={b.progress}
              />
            );
          }
          if (b.type === "result") {
            return (
              <ResultCard key={i} title={b.title} bullets={b.bullets} />
            );
          }
          return null;
        })}
        {showThinking && runId ? (
          <button
            type="button"
            onClick={() => onOpenRun(runId)}
            className="mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted hover:bg-surface-muted hover:text-secondary"
            aria-label="View agent thinking for this reply"
          >
            <Brain size={11} />
            View thinking
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Hover-revealed trash button used on every message + notification row.
 *
 * Uses the same INLINE TWO-STEP CONFIRM pattern as the cron task list — the
 * first click swaps the icon to a red checkmark for ~3s, the second commits.
 * Blur or the timer aborts. The button stays hidden (opacity 0) until the row
 * is hovered (group-hover).
 */
export function RowDeleteButton({
  onConfirm,
  label,
}: {
  onConfirm: () => Promise<void> | void;
  label: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleClick = () => {
    if (!confirming) {
      setConfirming(true);
      timerRef.current = setTimeout(() => {
        setConfirming(false);
        timerRef.current = null;
      }, CONFIRM_TIMEOUT_MS);
      return;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setConfirming(false);
    void onConfirm();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onBlur={() => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setConfirming(false);
      }}
      title={confirming ? `Confirm delete ${label}` : `Delete ${label}`}
      aria-label={confirming ? `Confirm delete ${label}` : `Delete ${label}`}
      className={cn(
        "rounded-md p-1 transition",
        confirming
          ? "bg-status-error/15 text-status-error opacity-100"
          : "text-muted opacity-0 hover:bg-surface-muted hover:text-status-error group-hover:opacity-60 focus-visible:opacity-100",
      )}
    >
      {confirming ? <Check size={12} /> : <Trash2 size={12} />}
    </button>
  );
}

/**
 * Header-level "Clear notifications" affordance. Single click expands into a
 * small inline confirm strip; second click commits. Blur or pressing the
 * cancel pill aborts. Lives next to the star/share/⋯ icons in the chat panel
 * header and only renders when the active thread has notifications.
 */
function ClearNotificationsButton({
  count,
  onConfirm,
}: {
  count: number;
  onConfirm: () => Promise<void> | void;
}) {
  const [armed, setArmed] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Auto-disarm if focus leaves the inline confirm UI.
  const handleBlur: React.FocusEventHandler<HTMLDivElement> = (e) => {
    const next = e.relatedTarget as Node | null;
    if (!containerRef.current || !next) {
      setArmed(false);
      return;
    }
    if (!containerRef.current.contains(next)) setArmed(false);
  };

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        title={`Clear ${count} notification${count === 1 ? "" : "s"} in this thread`}
        aria-label="Clear notifications"
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-muted hover:bg-surface-muted hover:text-secondary"
      >
        <BellOff size={13} />
        Clear
      </button>
    );
  }

  return (
    <div
      ref={containerRef}
      onBlur={handleBlur}
      className="inline-flex items-center gap-1 rounded-md border border-status-error/30 bg-status-error/5 px-1.5 py-0.5"
    >
      <span className="text-[11px] font-medium text-status-error">
        Clear all {count}?
      </span>
      <button
        type="button"
        onClick={async () => {
          setArmed(false);
          await onConfirm();
        }}
        className="rounded-md bg-status-error px-1.5 py-0.5 text-[10px] font-semibold text-white hover:opacity-90"
      >
        Yes
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-secondary hover:bg-white"
      >
        No
      </button>
    </div>
  );
}

/**
 * Wave 2D — agent↔agent message list. Bubbles align left for the
 * alphabetically-first participant and right for the second, mirroring the
 * "you vs them" layout of the user-agent chat but without any user side.
 */
function InterAgentMessageList({
  messages,
  leftId,
  participantA,
  participantB,
  fallbackNameA,
  fallbackNameB,
}: {
  messages: InterAgentMessage[];
  leftId: string;
  participantA: Employee | null;
  participantB: Employee | null;
  fallbackNameA: string;
  fallbackNameB: string;
}) {
  const groups = useMemo(() => {
    const out: { day: number; messages: InterAgentMessage[] }[] = [];
    for (const m of messages) {
      const last = out[out.length - 1];
      if (last && isSameDay(last.day, m.received_at)) {
        last.messages.push(m);
      } else {
        out.push({ day: m.received_at, messages: [m] });
      }
    }
    return out;
  }, [messages]);

  const nodes: ReactNode[] = [];
  for (const g of groups) {
    nodes.push(
      <div key={`day-${g.day}`} className="my-2 flex items-center gap-3">
        <div className="h-px flex-1 bg-subtle" />
        <span className="text-[10px] uppercase tracking-wider text-muted">
          {dayLabel(g.day)}
        </span>
        <div className="h-px flex-1 bg-subtle" />
      </div>,
    );
    for (const m of g.messages) {
      const isLeft = m.from === leftId;
      const who = isLeft ? participantA : participantB;
      const fallbackName = isLeft ? fallbackNameA : fallbackNameB;
      const name = m.from_name ?? who?.name ?? fallbackName;
      nodes.push(
        <div
          key={m.id}
          className={cn(
            "mb-3 flex gap-2",
            isLeft ? "justify-start" : "flex-row-reverse justify-start",
          )}
        >
          <AgentAvatar
            value={who?.avatar ?? null}
            name={name}
            size={28}
            accent={who?.accent ?? "#9CA3AF"}
          />
          <div className={cn("min-w-0 max-w-[78%]", isLeft ? "" : "text-right")}>
            <div
              className={cn(
                "flex items-baseline gap-2",
                isLeft ? "" : "flex-row-reverse",
              )}
            >
              <span className="text-xs font-semibold text-primary">
                {name}
              </span>
              <span className="text-[10px] text-muted">
                {formatTime(m.received_at)}
              </span>
            </div>
            <div
              className={cn(
                "mt-0.5 inline-block whitespace-pre-wrap rounded-2xl px-3 py-2 text-left text-sm",
                isLeft
                  ? "bg-surface-muted text-secondary"
                  : "bg-accent-soft text-primary",
              )}
            >
              {renderInline(m.body)}
            </div>
          </div>
        </div>,
      );
    }
  }
  return <>{nodes}</>;
}
