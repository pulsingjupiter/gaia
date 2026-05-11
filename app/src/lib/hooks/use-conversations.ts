"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Thread summary as shipped by Wave 2A `/api/messages?threads=1`.
 * Contract per Wave 2C brief.
 *
 * Wave 2D adds the optional `is_inter_agent` flag — when true, the thread is
 * synthesised from the per-agent inbox.json files (no DB row) and is
 * read-only in the UI.
 */
export type ThreadSummary = {
  thread_id: string;
  participants: string[]; // [a, b]
  last_message: string;
  last_at: number; // epoch ms
  unread_count: number;
  is_inter_agent?: boolean;
  /** Only set on inter-agent threads — the slug of the agent who sent the most recent message. */
  last_from?: string;
};

/** Wave 2C: matches `GET /api/notifications/unread-count`. */
export type UnreadCounts = {
  total: number;
  by_thread: Record<string, number>;
  by_kind: { chat: number; notification: number };
};

const EMPTY_UNREAD: UnreadCounts = {
  total: 0,
  by_thread: {},
  by_kind: { chat: 0, notification: 0 },
};

type ThreadsResponse = { threads: ThreadSummary[] };

type InterAgentThread = {
  thread_id: string;
  participants: [string, string];
  message_count: number;
  last_message_preview: string;
  last_message_at: number;
  last_from: string;
  is_inter_agent: true;
};
type InterAgentThreadsResponse = { threads: InterAgentThread[] };

const POLL_MS = 8000;

/**
 * Subscribe to the live list of conversation threads (polled every 8s).
 * Wave 2C: also fetches unread counts on the same cadence so the conv-list
 * and sidebar can render badges without each one re-polling.
 * Wave 2D: also fetches inter-agent threads (sourced from per-agent
 * inbox.json files) and merges them into the same list so the conversations
 * UI can render them alongside user-agent threads.
 */
export function useConversations() {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<UnreadCounts>(EMPTY_UNREAD);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const fetchOnce = useCallback(async () => {
    try {
      const [threadsRes, unreadRes, interRes] = await Promise.all([
        fetch("/api/messages?threads=1", { cache: "no-store" }),
        fetch("/api/notifications/unread-count", { cache: "no-store" }),
        fetch("/api/inter-agent-messages", { cache: "no-store" }),
      ]);

      let userThreads: ThreadSummary[] = [];
      if (threadsRes.ok) {
        const data = (await threadsRes.json()) as ThreadsResponse;
        userThreads = Array.isArray(data?.threads) ? data.threads : [];
      }

      let interThreads: ThreadSummary[] = [];
      if (interRes.ok) {
        const data = (await interRes.json()) as InterAgentThreadsResponse;
        const list = Array.isArray(data?.threads) ? data.threads : [];
        interThreads = list.map((t) => ({
          thread_id: t.thread_id,
          participants: [...t.participants],
          last_message: t.last_message_preview,
          last_at: t.last_message_at,
          unread_count: 0, // V1: no read-state for inter-agent threads
          is_inter_agent: true,
          last_from: t.last_from,
        }));
      }

      // Merge: user threads first then inter-agent. De-dupe defensively on
      // thread_id (shouldn't collide — user threads always include "user").
      const seen = new Set<string>();
      const merged: ThreadSummary[] = [];
      for (const t of [...userThreads, ...interThreads]) {
        if (seen.has(t.thread_id)) continue;
        seen.add(t.thread_id);
        merged.push(t);
      }
      merged.sort((a, b) => (b.last_at ?? 0) - (a.last_at ?? 0));

      if (mounted.current) setThreads(merged);

      if (unreadRes.ok) {
        const counts = (await unreadRes.json()) as UnreadCounts;
        if (mounted.current && counts && typeof counts === "object") {
          setUnreadCounts({
            total: counts.total ?? 0,
            by_thread: counts.by_thread ?? {},
            by_kind: counts.by_kind ?? { chat: 0, notification: 0 },
          });
        }
      }
    } catch {
      // Swallow: keep previous state. UI shows skeleton only on initial load.
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    fetchOnce();
    const id = window.setInterval(fetchOnce, POLL_MS);
    return () => {
      mounted.current = false;
      window.clearInterval(id);
    };
  }, [fetchOnce]);

  return { threads, unreadCounts, loading, refresh: fetchOnce } as const;
}
