"use client";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { AgentAvatar } from "@/components/shared/agent-avatar";
import { useEmployees } from "@/components/employees/employees-context";
import { useConversations } from "@/lib/hooks/use-conversations";

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

export function ConversationsList() {
  const { threads, loading, unreadCounts } = useConversations();
  const { employees } = useEmployees();

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

  const recent = threads.slice(0, 4);

  return (
    <div className="card-surface p-4">
      <div className="flex items-center justify-between">
        <div className="section-header">Conversations</div>
        <Link
          href="/conversations"
          className="text-[11px] font-medium text-accent hover:underline"
        >
          View all →
        </Link>
      </div>
      <ul className="mt-3 flex flex-col gap-1">
        {loading && recent.length === 0 ? (
          [...Array(3)].map((_, i) => (
            <li key={i} className="flex items-center gap-2 px-2 py-2 animate-pulse">
              <div className="size-6 rounded-full bg-surface-muted" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="h-2 w-1/3 rounded bg-surface-muted" />
                <div className="h-2 w-2/3 rounded bg-surface-muted" />
              </div>
            </li>
          ))
        ) : recent.length === 0 ? (
          <li className="px-2 py-4 text-center text-xs text-muted">No messages yet.</li>
        ) : (
          recent.map((t) => {
            const isInterAgent = !!t.is_inter_agent;
            const shown = isInterAgent
              ? t.participants
              : t.participants.filter((p) => p !== "user");
            const a = lookup(shown[0] ?? t.participants[0]);
            const b = shown[1] ? lookup(shown[1]) : null;
            const display = b ? `${a.name} & ${b.name}` : a.name;
            const unread = unreadCounts.by_thread[t.thread_id] ?? t.unread_count;

            return (
              <li
                key={t.thread_id}
                className="rounded-lg px-2 py-2 hover:bg-surface-muted"
              >
                <Link href={`/conversations?id=${t.thread_id}`} className="flex items-center gap-2 text-left">
                  <div className="flex -space-x-1.5">
                    <AgentAvatar
                      value={a.avatar ?? null}
                      name={a.name}
                      size={24}
                      accent={a.accent}
                      ring
                    />
                    {b ? (
                      <AgentAvatar
                        value={b.avatar ?? null}
                        name={b.name}
                        size={24}
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
                      <span className="shrink-0 text-[10px] text-muted">
                        {formatRelative(t.last_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-[10px] text-muted">
                        {t.last_message}
                      </div>
                      {unread > 0 ? (
                        <span className="ml-1 size-1.5 shrink-0 rounded-full bg-accent" />
                      ) : null}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
