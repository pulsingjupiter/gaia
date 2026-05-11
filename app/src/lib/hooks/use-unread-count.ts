"use client";
/**
 * useUnreadCount — polls /api/notifications/unread-count every 8s.
 *
 * Returns the global unread totals plus a per-thread breakdown. The Sidebar
 * Inbox badge consumes `total`; other surfaces (e.g. per-conversation list)
 * can drill into `byThread`.
 *
 * Wave 2B (notifications). The endpoint is cheap (a single SQL count) so the
 * 8s cadence is fine for the global badge — finer-grained polling lives
 * inside the conversations UI itself.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type UnreadKindBreakdown = {
  chat: number;
  notification: number;
};

export type UnreadCountResponse = {
  total: number;
  by_thread: Record<string, number>;
  by_kind: UnreadKindBreakdown;
  /** Wave 2D — pending approvals are folded into `total`. */
  pending_approvals?: number;
};

export type UseUnreadCount = {
  /** Sum of unread chat + notification messages + pending approvals. */
  total: number;
  byThread: Record<string, number>;
  byKind: UnreadKindBreakdown;
  pendingApprovals: number;
  loading: boolean;
};

const POLL_MS = 8_000;
const EMPTY_BY_KIND: UnreadKindBreakdown = { chat: 0, notification: 0 };

export function useUnreadCount(): UseUnreadCount {
  const [total, setTotal] = useState(0);
  const [byThread, setByThread] = useState<Record<string, number>>({});
  const [byKind, setByKind] = useState<UnreadKindBreakdown>(EMPTY_BY_KIND);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [loading, setLoading] = useState(true);
  const cancelled = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`GET /api/notifications/unread-count ${res.status}`);
      const data = (await res.json()) as Partial<UnreadCountResponse>;
      if (cancelled.current) return;
      setTotal(typeof data.total === "number" ? data.total : 0);
      setByThread(data.by_thread ?? {});
      setByKind({
        chat: data.by_kind?.chat ?? 0,
        notification: data.by_kind?.notification ?? 0,
      });
      setPendingApprovals(
        typeof data.pending_approvals === "number" ? data.pending_approvals : 0,
      );
    } catch {
      // swallow — keep last-known values
    } finally {
      if (!cancelled.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    cancelled.current = false;
    void refresh();
    const id = setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => {
      cancelled.current = true;
      clearInterval(id);
    };
  }, [refresh]);

  return { total, byThread, byKind, pendingApprovals, loading };
}
