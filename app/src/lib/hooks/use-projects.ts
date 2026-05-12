"use client";
/**
 * useProjects + useProjectsWithStats — fetch-backed project state.
 *
 * GET /api/projects on mount, polls every 8s. Mutations call the matching
 * endpoint and apply the server response in place. `useProjectsWithStats`
 * additionally fetches `/api/projects/[id]` for each row so cards can show
 * sessions_count / total_cost_usd / last_event_at.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type ProjectRow = {
  id: string;
  name: string;
  path: string;
  transcript_dir: string | null;
  color: string | null;
  icon: string | null;
  agent_name: string | null;
  agent_avatar: string | null;
  is_internal: 0 | 1;
  description: string | null;
  repo_url: string | null;
  archived: 0 | 1;
  created_at: number;
  updated_at: number;
};

export type ProjectStats = {
  sessions_count: number;
  active_count: number;
  total_cost_usd: number;
  last_event_at: number | null;
};

export type ProjectWithStats = ProjectRow & { stats: ProjectStats };

export type CreateProjectInput = {
  name: string;
  path: string;
  color?: string;
  icon?: string;
  agent_name?: string;
  agent_avatar?: string;
  description?: string;
  repo_url?: string | null;
};

export type UpdateProjectPatch = Partial<{
  name: string;
  path: string;
  transcript_dir: string;
  color: string;
  icon: string;
  agent_name: string;
  agent_avatar: string;
  is_internal: 0 | 1;
  description: string;
  repo_url: string | null;
  archived: 0 | 1;
}>;

export type UseProjects = {
  projects: ProjectRow[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  add: (input: CreateProjectInput) => Promise<ProjectRow | null>;
  update: (id: string, patch: UpdateProjectPatch) => Promise<ProjectRow | null>;
  archive: (id: string) => Promise<boolean>;
};

const POLL_MS = 8_000;

async function fetchProjects(includeArchived = false, search?: string): Promise<ProjectRow[]> {
  const params = new URLSearchParams();
  if (includeArchived) params.set("include_archived", "1");
  if (search) params.set("search", search);
  const qs = params.toString();
  const res = await fetch(`/api/projects${qs ? `?${qs}` : ""}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /api/projects ${res.status}`);
  const data = (await res.json()) as { projects: ProjectRow[] };
  return data.projects ?? [];
}

export function useProjects(opts?: { includeArchived?: boolean }): UseProjects {
  const includeArchived = !!opts?.includeArchived;
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const list = await fetchProjects(includeArchived);
      if (cancelled.current) return;
      setProjects(list);
      setError(null);
    } catch (err) {
      if (cancelled.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!cancelled.current) setLoading(false);
    }
  }, [includeArchived]);

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

  const add: UseProjects["add"] = useCallback(async (input) => {
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `POST /api/projects ${res.status}`);
      }
      const data = (await res.json()) as { project: ProjectRow };
      setProjects((prev) => {
        const idx = prev.findIndex((p) => p.id === data.project.id);
        if (idx === -1) return [...prev, data.project];
        const next = [...prev];
        next[idx] = data.project;
        return next;
      });
      return data.project;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, []);

  const update: UseProjects["update"] = useCallback(async (id, patch) => {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`PATCH /api/projects/${id} ${res.status}`);
      const data = (await res.json()) as { project: ProjectRow };
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? data.project : p)),
      );
      return data.project;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, []);

  const archive: UseProjects["archive"] = useCallback(async (id) => {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`DELETE /api/projects/${id} ${res.status}`);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }, []);

  return { projects, loading, error, refresh, add, update, archive };
}

// ---- with-stats variant ------------------------------------------------------

export type UseProjectsWithStats = Omit<UseProjects, "projects"> & {
  projects: ProjectWithStats[];
  // Locally update a project's last_event_summary / last_event_at without
  // refetching. Used by the page's session-stream subscriber to pulse cards.
  applySessionSignal: (
    projectId: string,
    patch: { ts?: number; summary?: string | null },
  ) => void;
};

async function fetchProjectStats(id: string): Promise<ProjectStats | null> {
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { stats: ProjectStats };
    return data.stats ?? null;
  } catch {
    return null;
  }
}

export function useProjectsWithStats(opts?: { includeArchived?: boolean }): UseProjectsWithStats {
  const base = useProjects(opts);
  const [statsById, setStatsById] = useState<Record<string, ProjectStats>>({});
  const [signalById, setSignalById] = useState<
    Record<string, { ts: number; summary: string | null }>
  >({});

  const projectIdsKey = base.projects.map((p) => p.id).sort().join(",");

  useEffect(() => {
    let cancelled = false;
    if (base.projects.length === 0) {
      setStatsById({});
      return () => {
        cancelled = true;
      };
    }
    void Promise.all(
      base.projects.map(async (p) => {
        const stats = await fetchProjectStats(p.id);
        return [p.id, stats] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      setStatsById((prev) => {
        const next: Record<string, ProjectStats> = {};
        for (const [id, stats] of entries) {
          if (stats) next[id] = stats;
          else if (prev[id]) next[id] = prev[id];
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // Refetch stats whenever the project list itself changes.
  }, [projectIdsKey, base.projects]);

  const applySessionSignal: UseProjectsWithStats["applySessionSignal"] = useCallback(
    (projectId, patch) => {
      setSignalById((prev) => {
        const ts = patch.ts ?? Date.now();
        const next = { ...prev, [projectId]: { ts, summary: patch.summary ?? prev[projectId]?.summary ?? null } };
        return next;
      });
      setStatsById((prev) => {
        const cur = prev[projectId];
        if (!cur) return prev;
        const ts = patch.ts ?? Date.now();
        if (cur.last_event_at && cur.last_event_at >= ts) return prev;
        return { ...prev, [projectId]: { ...cur, last_event_at: ts } };
      });
    },
    [],
  );

  const projects: ProjectWithStats[] = base.projects.map((p) => ({
    ...p,
    stats:
      statsById[p.id] ??
      ({
        sessions_count: 0,
        active_count: 0,
        total_cost_usd: 0,
        last_event_at: signalById[p.id]?.ts ?? null,
      } satisfies ProjectStats),
  }));

  return {
    projects,
    loading: base.loading,
    error: base.error,
    refresh: base.refresh,
    add: base.add,
    update: base.update,
    archive: base.archive,
    applySessionSignal,
  };
}
