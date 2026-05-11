"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Message kind shipped by Wave 1. */
export type MessageKind = "chat" | "notification";

/** Notification source — see `NotificationMetadata` in server/db.ts. */
export type NotificationSource =
  | "run-completed"
  | "run-failed"
  | "session-ended"
  | "cron-fired";

/** Parsed notification payload (best-effort — server may add extra keys). */
export type NotificationMetadata = {
  source: NotificationSource;
  run_id?: string;
  session_id?: string;
  project_id?: string;
  cost_usd?: number;
  duration_ms?: number;
  [key: string]: unknown;
};

/** Message row as shipped by Wave 2A (extended in Wave 1 with kind+metadata). */
export type ThreadMessage = {
  id: string;
  thread_id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  run_id?: string | null;
  created_at: number;
  read_at?: number | null;
  /** Wave 1 — 'chat' (default) or 'notification'. */
  kind?: MessageKind;
  /** Raw metadata JSON string from the server. */
  metadata?: string | null;
  /** Convenience — parsed `metadata`. Populated client-side for notification rows. */
  metadataParsed?: NotificationMetadata | null;
};

type FetchResponse = { messages: ThreadMessage[] };
type SendResponse = { message: ThreadMessage; run_id?: string | null };

const POLL_MS = 4000;

function parseMetadata(raw: string | null | undefined): NotificationMetadata | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as NotificationMetadata;
    }
  } catch {
    // best-effort
  }
  return null;
}

/** Tag every message with a parsed-metadata field for easy access in the UI. */
function annotate(messages: ThreadMessage[]): ThreadMessage[] {
  return messages.map((m) =>
    m.kind === "notification"
      ? { ...m, metadataParsed: parseMetadata(m.metadata ?? null) }
      : m,
  );
}

/**
 * Subscribe to a single thread's messages.
 * - GETs on threadId change.
 * - Polls every 4s while mounted (V1 simple update path).
 * - sendMessage POSTs and optimistically appends; returns { run_id } so the
 *   caller can open the LiveRunDrawer.
 * - markThreadRead POSTs the bulk-read endpoint for this thread.
 */
export function useThread(threadId: string | null) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);
  const currentId = useRef<string | null>(threadId);
  // Mirror of the latest messages so async helpers can roll back optimistic
  // mutations without re-running on every render.
  const messagesRef = useRef<ThreadMessage[]>([]);

  currentId.current = threadId;
  messagesRef.current = messages;

  const refetch = useCallback(async () => {
    const id = currentId.current;
    if (!id) {
      setMessages([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/messages?thread=${encodeURIComponent(id)}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as FetchResponse;
      // Only commit if the user hasn't switched threads mid-flight.
      if (!mounted.current || currentId.current !== id) return;
      setMessages(annotate(Array.isArray(data?.messages) ? data.messages : []));
    } catch {
      // Keep previous state on transient errors.
    }
  }, []);

  // Fetch + poll while a thread is selected.
  useEffect(() => {
    mounted.current = true;
    if (!threadId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    refetch().finally(() => {
      if (mounted.current) setLoading(false);
    });
    const id = window.setInterval(refetch, POLL_MS);
    return () => {
      mounted.current = false;
      window.clearInterval(id);
    };
  }, [threadId, refetch]);

  /**
   * Send a message from the current user to `recipient_id`.
   * Optimistically appends a placeholder, replaces with the server row, and
   * returns the run_id (if the API kicked off a chat run).
   */
  const sendMessage = useCallback(
    async (
      body: string,
      recipient_id: string,
    ): Promise<{ run_id: string | null; message: ThreadMessage } | null> => {
      const trimmed = body.trim();
      if (!trimmed) return null;
      const tempId = `tmp_${Math.random().toString(36).slice(2, 10)}`;
      const optimistic: ThreadMessage = {
        id: tempId,
        thread_id: threadId ?? "",
        sender_id: "user",
        recipient_id,
        body: trimmed,
        run_id: null,
        created_at: Date.now(),
        read_at: null,
        kind: "chat",
        metadata: null,
        metadataParsed: null,
      };
      setMessages((prev) => [...prev, optimistic]);

      try {
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sender_id: "user",
            recipient_id,
            body: trimmed,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as SendResponse;
        const annotated = annotate([data.message])[0]!;
        // Replace the optimistic placeholder with the persisted row.
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? annotated : m)),
        );
        return { run_id: data.run_id ?? null, message: annotated };
      } catch {
        // Mark optimistic message as failed by rolling back.
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        return null;
      }
    },
    [threadId],
  );

  /**
   * Hard-delete a single message (chat or notification). Optimistically removes
   * it from local state, then refetches to reconcile if the API rejects.
   */
  const deleteMessage = useCallback(
    async (id: string): Promise<boolean> => {
      if (!id) return false;
      const previous = messagesRef.current;
      setMessages((prev) => prev.filter((m) => m.id !== id));
      try {
        const res = await fetch(
          `/api/messages/${encodeURIComponent(id)}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          // Rollback on failure (e.g. already deleted) and refetch.
          if (mounted.current) setMessages(previous);
          void refetch();
          return false;
        }
        return true;
      } catch {
        if (mounted.current) setMessages(previous);
        void refetch();
        return false;
      }
    },
    [refetch],
  );

  /**
   * Hard-delete every notification in the current thread. Optimistically
   * removes them locally, then reconciles via refetch.
   */
  const clearNotifications = useCallback(async (): Promise<number> => {
    const id = currentId.current;
    if (!id) return 0;
    const previous = messagesRef.current;
    const before = previous.filter((m) => m.kind === "notification").length;
    if (before === 0) return 0;
    setMessages((prev) => prev.filter((m) => m.kind !== "notification"));
    try {
      const res = await fetch("/api/notifications/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: id }),
      });
      if (!res.ok) {
        if (mounted.current) setMessages(previous);
        void refetch();
        return 0;
      }
      const data = (await res.json()) as { ok?: boolean; deleted?: number };
      return data?.deleted ?? before;
    } catch {
      if (mounted.current) setMessages(previous);
      void refetch();
      return 0;
    }
  }, [refetch]);

  /**
   * Mark every unread message in the current thread as read.
   * Optimistically stamps `read_at` locally so the UI clears badges immediately.
   * No-op when `threadId` is null.
   */
  const markThreadRead = useCallback(async (): Promise<number> => {
    const id = currentId.current;
    if (!id) return 0;
    const stampedAt = Date.now();
    setMessages((prev) =>
      prev.map((m) => (m.read_at == null ? { ...m, read_at: stampedAt } : m)),
    );
    try {
      const res = await fetch(
        `/api/messages/thread/${encodeURIComponent(id)}/read`,
        { method: "POST" },
      );
      if (!res.ok) return 0;
      const data = (await res.json()) as { ok?: boolean; marked?: number };
      return data?.marked ?? 0;
    } catch {
      return 0;
    }
  }, []);

  return {
    messages,
    loading,
    sendMessage,
    refetch,
    markThreadRead,
    deleteMessage,
    clearNotifications,
  } as const;
}
