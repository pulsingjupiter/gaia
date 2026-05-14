"use client";
/**
 * useApprovals — polls /api/approvals and exposes approve/skip actions.
 *
 * Optimistically removes a row from the local cache when its status flips,
 * so the UI feels instant. The 8s poll keeps multi-tab views consistent.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type ApprovalStatus = "pending" | "approved" | "skipped";

export type ApprovalRow = {
  id: string;
  agent_id: string;
  run_id: string | null;
  action_type: string;
  title: string;
  body: string | null;
  payload: string | null;
  status: ApprovalStatus;
  created_at: number;
  resolved_at: number | null;
  resolved_by: string | null;
  notes: string | null;
};

type Filters = {
  status?: ApprovalStatus;
  agent_id?: string;
};

type ListResponse = { approvals: ApprovalRow[] };
type ResolveResponse = { approval: ApprovalRow };

const POLL_MS = 8_000;

export function useApprovals(filters?: Filters) {
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const cancelled = useRef(false);

  // Stash filters in a ref so the polling effect doesn't re-fire on every
  // reference-equal-but-content-equal filter object passed by the caller.
  const status = filters?.status;
  const agent_id = filters?.agent_id;

  const refresh = useCallback(async () => {
    const sp = new URLSearchParams();
    if (status) sp.set("status", status);
    if (agent_id) sp.set("agent_id", agent_id);
    sp.set("limit", "100");
    try {
      const res = await fetch(`/api/approvals?${sp.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`GET /api/approvals ${res.status}`);
      const data = (await res.json()) as ListResponse;
      if (cancelled.current) return;
      setApprovals(Array.isArray(data?.approvals) ? data.approvals : []);
    } catch {
      // keep last-known on transient errors
    } finally {
      if (!cancelled.current) setLoading(false);
    }
  }, [status, agent_id]);

  useEffect(() => {
    cancelled.current = false;
    setLoading(true);
    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => {
      cancelled.current = true;
      window.clearInterval(id);
    };
  }, [refresh]);

  const resolve = useCallback(
    async (
      id: string,
      action: "approve" | "skip",
      notes?: string,
    ): Promise<ApprovalRow | null> => {
      // Optimistic — drop the row immediately if we're filtering pending.
      const snapshot = approvals;
      setApprovals((prev) =>
        status === "pending" ? prev.filter((a) => a.id !== id) : prev,
      );
      try {
        const res = await fetch(`/api/approvals/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: action === "approve" ? "approved" : "rejected",
            notes: notes ?? null,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ResolveResponse;
        return data.approval ?? null;
      } catch {
        // Roll back the optimistic removal if the server didn't accept.
        setApprovals(snapshot);
        return null;
      }
    },
    [approvals, status],
  );

  const approve = useCallback(
    (id: string, notes?: string) => resolve(id, "approve", notes),
    [resolve],
  );
  const skip = useCallback(
    (id: string, notes?: string) => resolve(id, "skip", notes),
    [resolve],
  );

  return { approvals, loading, refresh, approve, skip } as const;
}
