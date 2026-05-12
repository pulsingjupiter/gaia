"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ProjectRepoMetadata =
  | {
      available: true;
      owner: string;
      repo: string;
      default_branch: string;
      stargazers_count: number;
      open_issues_count: number;
      pushed_at: string;
      description: string | null;
      homepage: string | null;
    }
  | {
      available: false;
      reason: "no_repo" | "non_github" | "fetch_failed" | "not_found";
      error?: string;
    };

export type UseProjectRepoMetadata = {
  data: ProjectRepoMetadata | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useProjectRepoMetadata(
  projectId: string | null | undefined,
): UseProjectRepoMetadata {
  const [data, setData] = useState<ProjectRepoMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async (force: boolean) => {
    if (!projectId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const qs = force ? "?refresh=1" : "";
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/repo-metadata${qs}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        throw new Error(`GET repo-metadata ${res.status}`);
      }
      const payload = (await res.json()) as ProjectRepoMetadata;
      if (!mounted.current) return;
      setData(payload);
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setData(null);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [projectId]);

  const refresh = useCallback(async () => {
    await load(true);
  }, [load]);

  useEffect(() => {
    mounted.current = true;
    void load(false);
    return () => {
      mounted.current = false;
    };
  }, [load]);

  return { data, loading, error, refresh };
}
