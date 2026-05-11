"use client";
/**
 * useProjectDetail — fetch a single project + stats from /api/projects/[id].
 *
 * Returns the project row, computed stats, and helpers to PATCH or DELETE
 * (archive). Refresh is exposed for callers that want to re-pull after a
 * mutation outside the hook.
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
  brief_markdown: string | null;
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

export type UpdateProjectPatch = Partial<{
  name: string;
  path: string;
  transcript_dir: string | null;
  color: string | null;
  icon: string | null;
  agent_name: string | null;
  agent_avatar: string | null;
  description: string | null;
  brief_markdown: string | null;
  archived: boolean | 0 | 1;
}>;

export type UseProjectDetail = {
  project: ProjectRow | null;
  stats: ProjectStats | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  update: (patch: UpdateProjectPatch) => Promise<ProjectRow | null>;
  archive: () => Promise<boolean>;
};

export function useProjectDetail(id: string | null | undefined): UseProjectDetail {
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!id) {
      setProject(null);
      setStats(null);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`GET /api/projects/${id} ${res.status}`);
      const data = (await res.json()) as {
        project: ProjectRow;
        stats: ProjectStats;
      };
      if (!mounted.current) return;
      setProject(data.project);
      setStats(data.stats);
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  const update = useCallback<UseProjectDetail["update"]>(
    async (patch) => {
      if (!id) return null;
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error(`PATCH /api/projects/${id} ${res.status}`);
        const data = (await res.json()) as { project: ProjectRow };
        setProject(data.project);
        return data.project;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      }
    },
    [id],
  );

  const archive = useCallback<UseProjectDetail["archive"]>(async () => {
    if (!id) return false;
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`DELETE /api/projects/${id} ${res.status}`);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }, [id]);

  return { project, stats, loading, error, refresh, update, archive };
}
