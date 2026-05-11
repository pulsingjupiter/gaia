"use client";
/**
 * useScheduledRuns — fetches /api/scheduled-runs with a 30s poll cadence and
 * exposes optimistic mutations (toggle, add, update, remove, runNow) for the
 * /schedule page.
 *
 * The in-process cron scheduler picks up `enabled`/`schedule_cron` changes
 * via its own 30s sync, so client-side optimism is purely a UI nicety — the
 * server is still the source of truth.
 *
 * Replaces the older `useCronTasks` hook after the cron-split migration —
 * cron-fired autonomous runs now live in their own `scheduled_runs` table
 * (separate from work tasks on the kanban).
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type ScheduledRunRow = {
  id: string;
  employee_id: string;
  skill: string | null;
  playbook: string | null;
  schedule_cron: string;
  human_label: string | null;
  enabled: 0 | 1;
  last_run_id: string | null;
  last_run_at: number | null;
  created_at: number;
};

export type CreateScheduledRunInput = {
  /** Used to generate the row id and seed `human_label` when no label given. */
  title: string;
  employee_id: string;
  skill: string;
  schedule_cron: string;
  human_label?: string;
  playbook?: string | null;
};

export type UpdateScheduledRunInput = Partial<{
  employee_id: string;
  skill: string | null;
  playbook: string | null;
  schedule_cron: string;
  human_label: string | null;
  enabled: boolean;
}>;

export type UseScheduledRuns = {
  scheduledRuns: ScheduledRunRow[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  toggle: (id: string, enabled: boolean) => Promise<ScheduledRunRow | null>;
  add: (input: CreateScheduledRunInput) => Promise<ScheduledRunRow | null>;
  update: (
    id: string,
    patch: UpdateScheduledRunInput,
  ) => Promise<ScheduledRunRow | null>;
  remove: (id: string) => Promise<boolean>;
  runNow: (id: string) => Promise<{ run_id: string } | null>;
};

const POLL_MS = 30_000;

async function fetchScheduledRuns(): Promise<ScheduledRunRow[]> {
  const res = await fetch("/api/scheduled-runs", { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /api/scheduled-runs ${res.status}`);
  const data = (await res.json()) as { scheduled_runs: ScheduledRunRow[] };
  return data.scheduled_runs ?? [];
}

export function useScheduledRuns(): UseScheduledRuns {
  const [scheduledRuns, setScheduledRuns] = useState<ScheduledRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const list = await fetchScheduledRuns();
      if (cancelled.current) return;
      setScheduledRuns(list);
      setError(null);
    } catch (err) {
      if (cancelled.current) return;
      setError(err instanceof Error ? err.message : String(err));
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

  const toggle: UseScheduledRuns["toggle"] = useCallback(
    async (id, enabled) => {
      // Optimistic flip first — revert on failure.
      const next: 0 | 1 = enabled ? 1 : 0;
      let rolledBackTo: 0 | 1 | null = null;
      setScheduledRuns((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          rolledBackTo = t.enabled;
          return { ...t, enabled: next };
        }),
      );
      try {
        const res = await fetch(
          `/api/scheduled-runs/${encodeURIComponent(id)}/toggle`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ enabled }),
          },
        );
        if (!res.ok) throw new Error(`POST toggle ${res.status}`);
        const data = (await res.json()) as { scheduled_run: ScheduledRunRow };
        setScheduledRuns((prev) =>
          prev.map((t) => (t.id === id ? data.scheduled_run : t)),
        );
        return data.scheduled_run;
      } catch (err) {
        if (rolledBackTo !== null) {
          const prevValue: 0 | 1 = rolledBackTo;
          setScheduledRuns((prev) =>
            prev.map((t) => (t.id === id ? { ...t, enabled: prevValue } : t)),
          );
        }
        setError(err instanceof Error ? err.message : String(err));
        return null;
      }
    },
    [],
  );

  const add: UseScheduledRuns["add"] = useCallback(async (input) => {
    try {
      const res = await fetch("/api/scheduled-runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(
          data?.error ?? `POST /api/scheduled-runs ${res.status}`,
        );
      }
      const data = (await res.json()) as { scheduled_run: ScheduledRunRow };
      setScheduledRuns((prev) => {
        const idx = prev.findIndex((t) => t.id === data.scheduled_run.id);
        if (idx === -1) return [data.scheduled_run, ...prev];
        const next = [...prev];
        next[idx] = data.scheduled_run;
        return next;
      });
      return data.scheduled_run;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, []);

  const update: UseScheduledRuns["update"] = useCallback(async (id, patch) => {
    try {
      const res = await fetch(
        `/api/scheduled-runs/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(
          data?.error ?? `PATCH /api/scheduled-runs/${id} ${res.status}`,
        );
      }
      const data = (await res.json()) as { scheduled_run: ScheduledRunRow };
      setScheduledRuns((prev) =>
        prev.map((t) => (t.id === id ? data.scheduled_run : t)),
      );
      return data.scheduled_run;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, []);

  const remove: UseScheduledRuns["remove"] = useCallback(async (id) => {
    try {
      const res = await fetch(
        `/api/scheduled-runs/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(
          data?.error ?? `DELETE /api/scheduled-runs/${id} ${res.status}`,
        );
      }
      setScheduledRuns((prev) => prev.filter((t) => t.id !== id));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }, []);

  const runNow: UseScheduledRuns["runNow"] = useCallback(async (id) => {
    try {
      const res = await fetch(
        `/api/scheduled-runs/${encodeURIComponent(id)}/run-now`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(
          data?.error ??
            `POST /api/scheduled-runs/${id}/run-now ${res.status}`,
        );
      }
      const data = (await res.json()) as { run_id: string };
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, []);

  return {
    scheduledRuns,
    loading,
    error,
    refresh,
    toggle,
    add,
    update,
    remove,
    runNow,
  };
}
