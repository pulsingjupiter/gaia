"use client";
/**
 * useRecentSessions — small hook for the Overview "Recent Sessions" widget.
 *
 * - GET /api/sessions?limit=N (default 5) on mount.
 * - Polls every 10s.
 * - Loads /api/projects in parallel once and caches the map so each session
 *   row can render its project's name / color / icon (sessions only carry
 *   `project_id`).
 * - Subscribes to `useSessionStream`; when an event arrives for a session
 *   currently in our list, we bump its `last_event_at` in place so the
 *   "X ago" timestamp updates without waiting for the next poll. New
 *   sessions still wait for the 10s poll — this matches the "nice-to-have"
 *   guidance.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ProjectRow } from "./use-projects";
import type { SessionRow } from "./use-project-sessions";
import { useSessionStream } from "./use-session-stream";

export type ProjectMap = Record<string, ProjectRow>;

export type UseRecentSessions = {
  sessions: SessionRow[];
  projects: ProjectMap;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const POLL_MS = 10_000;

export function useRecentSessions(limit = 5): UseRecentSessions {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [projects, setProjects] = useState<ProjectMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const projectsLoaded = useRef(false);
  const stream = useSessionStream();
  const lastStreamTsRef = useRef<number | null>(null);

  const fetchSessions = useCallback(async (): Promise<SessionRow[]> => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    const res = await fetch(`/api/sessions?${params.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`GET /api/sessions ${res.status}`);
    const data = (await res.json()) as { sessions: SessionRow[] };
    return Array.isArray(data.sessions) ? data.sessions : [];
  }, [limit]);

  const fetchProjects = useCallback(async (): Promise<ProjectMap> => {
    const res = await fetch("/api/projects", { cache: "no-store" });
    if (!res.ok) throw new Error(`GET /api/projects ${res.status}`);
    const data = (await res.json()) as { projects: ProjectRow[] };
    const map: ProjectMap = {};
    for (const p of data.projects ?? []) map[p.id] = p;
    return map;
  }, []);

  const refresh = useCallback(async () => {
    try {
      // Fetch sessions every cycle, projects only once (cached). If a session
      // references a project_id we don't yet have, refetch projects.
      const sessionsPromise = fetchSessions();
      const projectsPromise = projectsLoaded.current
        ? Promise.resolve<ProjectMap | null>(null)
        : fetchProjects();
      const [s, p] = await Promise.all([sessionsPromise, projectsPromise]);
      if (!mounted.current) return;
      setSessions(s);
      if (p) {
        setProjects(p);
        projectsLoaded.current = true;
      } else {
        // Lazy-fill: did we get a session referencing an unknown project?
        const unknown = s.some((row) => row.project_id && !projects[row.project_id]);
        if (unknown) {
          const fresh = await fetchProjects();
          if (mounted.current) setProjects(fresh);
        }
      }
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [fetchSessions, fetchProjects, projects]);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => {
      mounted.current = false;
      window.clearInterval(id);
    };
  }, [refresh]);

  // SSE: when an event arrives for a session we are currently displaying,
  // bump its `last_event_at` in place so the "X ago" reading freshens.
  useEffect(() => {
    if (stream.lastEventAt === null) return;
    if (lastStreamTsRef.current === stream.lastEventAt) return;
    lastStreamTsRef.current = stream.lastEventAt;
    const recent = stream.events.slice(-10);
    if (recent.length === 0) return;
    setSessions((prev) => {
      if (prev.length === 0) return prev;
      let changed = false;
      const next = prev.map((row) => {
        const hit = recent
          .filter((e) => e.session_id === row.id)
          .reduce<number>((max, e) => Math.max(max, e.ts), 0);
        if (hit > row.last_event_at) {
          changed = true;
          return { ...row, last_event_at: hit };
        }
        return row;
      });
      return changed ? next : prev;
    });
  }, [stream.events, stream.lastEventAt]);

  return useMemo(
    () => ({ sessions, projects, loading, error, refresh }),
    [sessions, projects, loading, error, refresh],
  );
}
