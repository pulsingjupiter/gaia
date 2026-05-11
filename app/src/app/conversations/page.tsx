"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, MessageSquarePlus } from "lucide-react";
import { ConvList } from "@/components/conversations/conv-list";
import { ChatPanel } from "@/components/conversations/chat-panel";
import { ConversationsRightRail } from "@/components/conversations/right-rail";
import { LiveRunDrawer } from "@/components/shared/live-run-drawer";
import { useConversations } from "@/lib/hooks/use-conversations";
import { useThread } from "@/lib/hooks/use-thread";
import { useEmployees } from "@/components/employees/employees-context";

/** Canonical thread id for a 1:1 between two participants. */
function canonicalThreadId(a: string, b: string): string {
  return [a, b].sort().join(":");
}

export default function ConversationsPage() {
  const {
    threads,
    unreadCounts,
    loading: threadsLoading,
    refresh: refreshThreads,
  } = useConversations();
  const { employees } = useEmployees();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  // Pick a default thread once threads have loaded.
  const effectiveThreadId = useMemo(() => {
    if (selectedThreadId && threads.some((t) => t.thread_id === selectedThreadId)) {
      return selectedThreadId;
    }
    return threads[0]?.thread_id ?? null;
  }, [selectedThreadId, threads]);

  const thread = useMemo(
    () => threads.find((t) => t.thread_id === effectiveThreadId) ?? null,
    [threads, effectiveThreadId],
  );

  // Wave 2D — when the selected thread is agent↔agent (neither side is the
  // user), render via the read-only inter-agent path. The chat panel will
  // fetch its own messages and ignore the user-thread `messages` array.
  const isInterAgent = !!thread?.is_inter_agent;
  const interAgent = useMemo(() => {
    if (!thread || !isInterAgent) return null;
    const [a, b] = [...thread.participants].sort();
    if (!a || !b) return null;
    return { participants: [a, b] as [string, string] };
  }, [thread, isInterAgent]);

  // The "other" participant — the agent in the thread. For inter-agent
  // threads we fall back to the alphabetically-first participant so that
  // `them` is non-null and the chat panel can render its inter-agent branch.
  const otherId = useMemo(() => {
    if (!thread) return null;
    if (isInterAgent) return [...thread.participants].sort()[0] ?? null;
    return thread.participants.find((p) => p !== "user") ?? thread.participants[0] ?? null;
  }, [thread, isInterAgent]);

  const them = useMemo(() => {
    if (!otherId) return null;
    return employees.find((e) => e.id === otherId || e.slug === otherId) ?? null;
  }, [otherId, employees]);

  const {
    messages,
    loading: messagesLoading,
    sendMessage,
    refetch,
    markThreadRead,
    deleteMessage,
    clearNotifications,
  } = useThread(effectiveThreadId);

  // markThreadRead also refreshes the global unread counts so the conv-list
  // badges clear in the same beat. Memoized so chat-panel's effect is stable.
  const handleMarkThreadRead = useCallback(async () => {
    const marked = await markThreadRead();
    if (marked > 0) void refreshThreads();
  }, [markThreadRead, refreshThreads]);

  // Live run drawer state. The drawer is opt-in on Conversations: sending a
  // message no longer auto-opens it. Each agent message with a run_id exposes
  // a "View thinking" affordance that opens the drawer for that specific run.
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // The run id of the most recent send for this thread — drives the typing
  // indicator. Cleared when the agent reply lands (a message with this
  // run_id) or after a 90s failsafe in case something goes sideways.
  const [pendingRunId, setPendingRunId] = useState<string | null>(null);

  // Auto-clear pending once the reply has been persisted to the thread.
  useEffect(() => {
    if (!pendingRunId) return;
    if (messages.some((m) => m.run_id === pendingRunId)) {
      setPendingRunId(null);
    }
  }, [messages, pendingRunId]);

  // Reset pending whenever the user switches threads.
  useEffect(() => {
    setPendingRunId(null);
  }, [effectiveThreadId]);

  // 90s failsafe — never leave the indicator up forever.
  useEffect(() => {
    if (!pendingRunId) return;
    const captured = pendingRunId;
    const t = window.setTimeout(() => {
      setPendingRunId((curr) => (curr === captured ? null : curr));
    }, 90_000);
    return () => window.clearTimeout(t);
  }, [pendingRunId]);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    // Refetch on close so the agent's reply (persisted by the API on run end)
    // shows up promptly. The 4s poll would catch it anyway.
    void refetch();
    void refreshThreads();
  }, [refetch, refreshThreads]);

  const openRun = useCallback((runId: string) => {
    setActiveRunId(runId);
    setDrawerOpen(true);
  }, []);

  // ---------------------------------------------------------------------
  // Send handler — supports both "send into the current thread" and
  // "create a thread with a specific agent" (used by the empty-state CTA).
  // No longer auto-opens the drawer; user opts in via "View thinking".
  // ---------------------------------------------------------------------
  const handleSendInThread = useCallback(
    async (body: string) => {
      if (!otherId) return;
      const result = await sendMessage(body, otherId);
      if (result?.run_id) {
        setPendingRunId(result.run_id);
      }
    },
    [otherId, sendMessage],
  );

  const handleStartWithAgent = useCallback(
    async (agentId: string) => {
      // Optimistically focus a thread for this pair so the chat panel renders.
      const tid = canonicalThreadId("user", agentId);
      setSelectedThreadId(tid);
      try {
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sender_id: "user",
            recipient_id: agentId,
            body: "Hello!",
          }),
        });
        if (res.ok) {
          await refreshThreads();
          await refetch();
        }
      } catch {
        // ignore — UI stays on the (empty) thread; user can retry
      }
    },
    [refreshThreads, refetch],
  );

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center justify-between border-b border-subtle bg-white px-6 py-4">
        <div>
          <h1 className="text-xl font-bold text-primary">
            Conversations
          </h1>
          <p className="text-xs text-muted">
            Chat with your AI agents and collaborate in real-time.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
        >
          <Plus size={14} />
          New Conversation
        </button>
      </div>

      <div
        className="grid flex-1 overflow-hidden"
        style={{ gridTemplateColumns: "260px 1fr 280px" }}
      >
        <div className="border-r border-subtle bg-white">
          <ConvList
            threads={threads}
            unreadCounts={unreadCounts}
            loading={threadsLoading}
            selectedId={effectiveThreadId}
            onSelect={setSelectedThreadId}
          />
        </div>
        <div className="min-h-0 overflow-hidden bg-white">
          {threads.length === 0 && !threadsLoading ? (
            <EmptyConversations
              onStartWithAgent={handleStartWithAgent}
              kingHenryId={
                employees.find((e) => e.id === "king-henry" || e.slug === "king-henry")?.id
              }
            />
          ) : (
            <ChatPanel
              them={them}
              threadId={effectiveThreadId}
              loading={messagesLoading}
              messages={messages}
              onSend={handleSendInThread}
              onOpenRun={openRun}
              onMarkThreadRead={handleMarkThreadRead}
              pendingRunId={pendingRunId}
              interAgent={interAgent}
              onDeleteMessage={async (id) => {
                const ok = await deleteMessage(id);
                if (ok) void refreshThreads();
                return ok;
              }}
              onClearNotifications={async () => {
                const n = await clearNotifications();
                if (n > 0) void refreshThreads();
                return n;
              }}
            />
          )}
        </div>
        <div className="border-l border-subtle bg-page">
          <ConversationsRightRail employee={them} />
        </div>
      </div>

      <LiveRunDrawer
        runId={activeRunId}
        open={drawerOpen}
        onClose={closeDrawer}
      />
    </div>
  );
}

function EmptyConversations({
  onStartWithAgent,
  kingHenryId,
}: {
  onStartWithAgent: (agentId: string) => Promise<void>;
  kingHenryId?: string;
}) {
  return (
    <div className="flex h-full items-center justify-center bg-white px-8 text-center">
      <div className="max-w-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
          <MessageSquarePlus size={20} />
        </div>
        <div className="mt-3 text-base font-semibold text-primary">
          No conversations yet
        </div>
        <p className="mt-1 text-xs text-muted">
          Kick things off by saying hello to one of your AI agents. They&apos;ll
          reply in real time.
        </p>
        <button
          type="button"
          disabled={!kingHenryId}
          onClick={() => kingHenryId && void onStartWithAgent(kingHenryId)}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={14} />
          Start a conversation with King Henry
        </button>
      </div>
    </div>
  );
}
