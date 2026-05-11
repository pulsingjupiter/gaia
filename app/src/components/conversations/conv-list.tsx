"use client";
import { useMemo, useState } from "react";
import { Inbox, Search } from "lucide-react";
import { AgentAvatar } from "@/components/shared/agent-avatar";
import { useEmployees } from "@/components/employees/employees-context";
import type {
  ThreadSummary,
  UnreadCounts,
} from "@/lib/hooks/use-conversations";

const TABS = ["All", "Direct", "Groups", "Mentions"] as const;

type TabKey = (typeof TABS)[number];

const SYSTEM_ID = "system";

const EMPTY_UNREAD: UnreadCounts = {
  total: 0,
  by_thread: {},
  by_kind: { chat: 0, notification: 0 },
};

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "now";
  const m = Math.round(diff / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}

function isSystemThread(t: ThreadSummary): boolean {
  return t.participants.some((p) => p === SYSTEM_ID);
}

export function ConvList({
  threads,
  unreadCounts = EMPTY_UNREAD,
  loading,
  selectedId,
  onSelect,
}: {
  threads: ThreadSummary[];
  unreadCounts?: UnreadCounts;
  loading: boolean;
  selectedId: string | null;
  onSelect: (threadId: string) => void;
}) {
  const { employees } = useEmployees();
  const [tab, setTab] = useState<TabKey>("All");
  const [query, setQuery] = useState("");

  const lookup = (id: string) => {
    const found = employees.find((e) => e.id === id || e.slug === id);
    if (found) return found;
    if (id === "user") {
      return {
        id: "user",
        slug: "user",
        name: "You",
        initials: "YO",
        accent: "#111827",
        avatar: null,
      } as {
        id: string;
        slug: string;
        name: string;
        initials: string;
        accent: string;
        avatar: string | null;
      };
    }
    return {
      id,
      slug: id,
      name: id,
      initials: id.slice(0, 2).toUpperCase(),
      accent: "#9CA3AF",
      avatar: null,
    };
  };

  const filtered = useMemo(() => {
    let list = threads;
    if (tab === "Direct") list = list.filter((t) => t.participants.length <= 2);
    else if (tab === "Groups")
      list = list.filter((t) => t.participants.length > 2);
    else if (tab === "Mentions")
      list = list.filter((t) => t.last_message?.includes("@"));
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((t) => {
        const names = t.participants.map((p) => lookup(p).name.toLowerCase());
        return (
          names.some((n) => n.includes(q)) ||
          (t.last_message ?? "").toLowerCase().includes(q)
        );
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads, tab, query, employees]);

  // Wave 2C — split out the system/notifications thread so it can be pinned
  // at the top with its own styling. Falls back to a synthetic row when no
  // notifications have arrived yet so users can discover the inbox.
  const systemThread = useMemo<ThreadSummary | null>(() => {
    const real = filtered.find(isSystemThread);
    if (real) return real;
    // Only synthesize when no search/filter is active; otherwise the user's
    // intent is to narrow the list.
    if (tab !== "All" || query.trim()) return null;
    return {
      thread_id: ["user", SYSTEM_ID].sort().join(":"),
      participants: ["user", SYSTEM_ID],
      last_message: "All your notifications",
      last_at: 0,
      unread_count: 0,
    };
  }, [filtered, tab, query]);

  const otherThreads = useMemo(
    () => filtered.filter((t) => !isSystemThread(t)),
    [filtered],
  );

  const unreadFor = (t: ThreadSummary): number => {
    const fromCounts = unreadCounts.by_thread?.[t.thread_id];
    if (typeof fromCounts === "number") return fromCounts;
    return t.unread_count ?? 0;
  };

  const renderSystemRow = (t: ThreadSummary) => {
    const selected = t.thread_id === selectedId;
    const unread = unreadFor(t);
    return (
      <button
        key={t.thread_id}
        onClick={() => onSelect(t.thread_id)}
        className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left ${
          selected
            ? "bg-surface-hover"
            : "hover:bg-surface-muted"
        }`}
      >
        <span className="relative inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent ring-2 ring-white">
          <Inbox size={14} aria-hidden />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-semibold text-primary">
              System
            </span>
            {t.last_at > 0 ? (
              <span className="shrink-0 text-[10px] text-muted">
                {formatRelative(t.last_at)}
              </span>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-[11px] text-muted">
              {t.last_message || "All your notifications"}
            </div>
            {unread > 0 ? (
              <span className="ml-1 inline-flex min-w-[18px] shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-semibold text-white">
                {unread}
              </span>
            ) : null}
          </div>
        </div>
      </button>
    );
  };

  const renderRow = (t: ThreadSummary) => {
    const isInterAgent = !!t.is_inter_agent;
    // For user-agent threads we show the OTHER side (exclude "user"). For
    // inter-agent threads both participants are agents — show them as a pair.
    const shown = isInterAgent
      ? t.participants
      : t.participants.filter((p) => p !== "user");
    const a = lookup(shown[0] ?? t.participants[0]);
    const b = shown[1] ? lookup(shown[1]) : null;
    const selected = t.thread_id === selectedId;
    const display = b ? `${a.name} & ${b.name}` : a.name;
    const unread = unreadFor(t);
    return (
      <button
        key={t.thread_id}
        onClick={() => onSelect(t.thread_id)}
        className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left ${
          selected
            ? "bg-surface-hover"
            : "hover:bg-surface-muted"
        }`}
      >
        <div className="flex -space-x-1.5">
          <AgentAvatar
            value={a.avatar ?? null}
            name={a.name}
            size={28}
            accent={a.accent}
            ring
          />
          {b ? (
            <AgentAvatar
              value={b.avatar ?? null}
              name={b.name}
              size={28}
              accent={b.accent}
              ring
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-semibold text-primary">
              {display}
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              {isInterAgent ? (
                <span
                  className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-slate-500"
                  title="Agent-to-agent thread"
                >
                  agent → agent
                </span>
              ) : null}
              <span className="text-[10px] text-muted">
                {formatRelative(t.last_at)}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-[11px] text-muted">
              {t.last_message}
            </div>
            {unread > 0 ? (
              <span className="ml-1 inline-flex min-w-[18px] shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-semibold text-white">
                {unread}
              </span>
            ) : null}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pt-3">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-full rounded-lg border border-strong bg-surface-muted py-1.5 pl-7 pr-2 text-xs outline-none focus:border-accent"
          />
        </div>
        <div className="mt-2 flex gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-2.5 py-1 text-[11px] ${
                tab === t
                  ? "bg-accent-soft font-semibold text-accent"
                  : "text-secondary hover:bg-surface-muted"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 flex-1 overflow-y-auto px-2 pb-3 scroll-thin">
        {loading && threads.length === 0 ? (
          <div className="space-y-2 px-1 py-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg px-2 py-2"
              >
                <div className="size-7 shrink-0 animate-pulse rounded-full bg-surface-muted" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-2.5 w-2/3 animate-pulse rounded bg-surface-muted" />
                  <div className="h-2 w-3/4 animate-pulse rounded bg-surface-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : !systemThread && otherThreads.length === 0 ? (
          <div className="px-2 py-8 text-center text-[11px] text-muted">
            No conversations match.
          </div>
        ) : (
          <>
            {systemThread ? (
              <>
                <div className="px-1 pb-1 pt-2 section-header">
                  Notifications
                </div>
                <div className="flex flex-col">
                  {renderSystemRow(systemThread)}
                </div>
              </>
            ) : null}
            {otherThreads.length > 0 ? (
              <>
                <div className="px-1 pb-1 pt-3 section-header">Recent</div>
                <div className="flex flex-col">
                  {otherThreads.map(renderRow)}
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
