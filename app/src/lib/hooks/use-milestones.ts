"use client";
/**
 * useMilestones — project-scoped milestone CRUD with a 30s poll.
 *
 * Wraps `/api/projects/[id]/milestones` (GET/POST) and `/api/milestones/[id]`
 * (PATCH/DELETE). Mutations refresh the list so server-side mutations stay
 * authoritative.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type MilestoneStatus = "active" | "complete" | "archived";

export type MilestoneRow = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  due_date: number | null;
  status: MilestoneStatus;
  sort_order: number;
  created_at: number;
  updated_at: number;
};

export type AddMilestoneInput = {
  name: string;
  description?: string | null;
  due_date?: number | string | null;
  status?: MilestoneStatus;
  sort_order?: number;
};

export type UpdateMilestoneInput = Partial<{
  name: string;
  description: string | null;
  due_date: number | string | null;
  status: MilestoneStatus;
  sort_order: number;
}>;

export type UseMilestones = {
  milestones: MilestoneRow[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  add: (input: AddMilestoneInput) => Promise<MilestoneRow | null>;
  update: (id: string, patch: UpdateMilestoneInput) => Promise<MilestoneRow | null>;
  remove: (id: string) => Promise<boolean>;
};

const POLL_MS = 30_000;

export function useMilestones(
  projectId: string | null | undefined,
): UseMilestones {
  const [milestones, setMilestones] = useState<MilestoneRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setMilestones([]);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/milestones`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`GET milestones ${res.status}`);
      const data = (await res.json()) as { milestones: MilestoneRow[] };
      if (cancelled.current) return;
      setMilestones(Array.isArray(data.milestones) ? data.milestones : []);
      setError(null);
    } catch (err) {
      if (cancelled.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!cancelled.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    cancelled.current = false;
    setLoading(true);
    void refresh();
    const id = setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => {
      cancelled.current = true;
      clearInterval(id);
    };
  }, [refresh]);

  const add = useCallback<UseMilestones["add"]>(
    async (input) => {
      if (!projectId) return null;
      try {
        const res = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/milestones`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(input),
          },
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(data?.error ?? `POST milestones ${res.status}`);
        }
        const data = (await res.json()) as { milestone: MilestoneRow };
        await refresh();
        return data.milestone;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      }
    },
    [projectId, refresh],
  );

  const update = useCallback<UseMilestones["update"]>(
    async (id, patch) => {
      try {
        const res = await fetch(`/api/milestones/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(data?.error ?? `PATCH milestone ${res.status}`);
        }
        const data = (await res.json()) as { milestone: MilestoneRow };
        await refresh();
        return data.milestone;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      }
    },
    [refresh],
  );

  const remove = useCallback<UseMilestones["remove"]>(
    async (id) => {
      try {
        const res = await fetch(`/api/milestones/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(data?.error ?? `DELETE milestone ${res.status}`);
        }
        await refresh();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [refresh],
  );

  return { milestones, loading, error, refresh, add, update, remove };
}
