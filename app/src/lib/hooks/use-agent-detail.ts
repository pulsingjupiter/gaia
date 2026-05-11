"use client";
/**
 * useAgentDetail — aggregate a single agent's persona, skills, recent runs.
 *
 * The list endpoint `GET /api/employees` returns every employee row, so we
 * pull from that and select the matching id (no per-agent GET endpoint
 * exists in Wave 2A). Persona + skills + runs are then fetched in parallel.
 *
 * Returns derived totals (totalRuns, totalCost) so the right rail can avoid
 * a second pass over the runs array.
 *
 * Mutations: savePersona, addSkill, getSkill (full body), saveSkill,
 * deleteSkill. Each mutation refresh()es on success so the detail bundle
 * stays consistent with disk.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { EmployeeRow } from "@/lib/hooks/use-employees";

export type SkillEntry = {
  name: string;
  /** Folder name under .claude/skills/. Server returns it explicitly now;
   *  legacy responses fall back to `name`. */
  slug: string;
  path: string;
  preview: string;
};

export type SkillDetail = {
  name: string;
  slug: string;
  path: string;
  body: string;
  preview: string;
  modified_at: number;
};

export type RunRow = {
  id: string;
  employee_id: string;
  skill: string;
  input: string | null;
  status: "pending" | "running" | "success" | "error" | "cancelled";
  started_at: number;
  ended_at: number | null;
  cost_usd: number;
  duration_ms: number | null;
  result_summary: string | null;
  error: string | null;
};

export type Persona = {
  markdown_text: string;
  path: string | null;
  /** True when CLAUDE.md is missing (e.g. system agent or unscaffolded dir). */
  missing: boolean;
};

export type UseAgentDetail = {
  employee: EmployeeRow | null;
  persona: Persona | null;
  skills: SkillEntry[];
  recentRuns: RunRow[];
  totalCost: number;
  totalRuns: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  savePersona: (markdown_text: string) => Promise<void>;
  addSkill: (input: { name: string; body: string }) => Promise<void>;
  getSkill: (slug: string) => Promise<SkillDetail>;
  saveSkill: (slug: string, body: string) => Promise<void>;
  deleteSkill: (slug: string) => Promise<void>;
};

const RUNS_LIMIT = 20;

async function fetchEmployee(id: string): Promise<EmployeeRow | null> {
  const res = await fetch("/api/employees", { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /api/employees ${res.status}`);
  const data = (await res.json()) as { employees: EmployeeRow[] };
  return data.employees.find((row) => row.id === id) ?? null;
}

async function fetchPersona(id: string): Promise<Persona> {
  const res = await fetch(
    `/api/employees/${encodeURIComponent(id)}/persona`,
    { cache: "no-store" },
  );
  if (res.status === 404) {
    // 404 is expected for agents without a CLAUDE.md (e.g. system).
    let pathHint: string | null = null;
    try {
      const data = (await res.json()) as { path?: string };
      if (typeof data.path === "string") pathHint = data.path;
    } catch {
      // ignore
    }
    return { markdown_text: "", path: pathHint, missing: true };
  }
  if (!res.ok) throw new Error(`GET persona ${res.status}`);
  const data = (await res.json()) as { markdown_text: string; path?: string };
  return {
    markdown_text: data.markdown_text,
    path: data.path ?? null,
    missing: false,
  };
}

async function fetchSkills(id: string): Promise<SkillEntry[]> {
  const res = await fetch(
    `/api/employees/${encodeURIComponent(id)}/skills`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`GET skills ${res.status}`);
  const data = (await res.json()) as {
    skills: Array<Partial<SkillEntry> & { name: string; path: string; preview: string }>;
  };
  return (data.skills ?? []).map((s) => ({
    name: s.name,
    slug: s.slug ?? s.name,
    path: s.path,
    preview: s.preview,
  }));
}

async function fetchRuns(id: string): Promise<RunRow[]> {
  const url = `/api/runs?employee_id=${encodeURIComponent(id)}&limit=${RUNS_LIMIT}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET runs ${res.status}`);
  const data = (await res.json()) as { runs?: RunRow[] };
  return data.runs ?? [];
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: unknown };
    if (typeof data?.error === "string") return data.error;
  } catch {
    // ignore JSON parse failure — fall through
  }
  return fallback;
}

export function useAgentDetail(id: string | null | undefined): UseAgentDetail {
  const [employee, setEmployee] = useState<EmployeeRow | null>(null);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [recentRuns, setRecentRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!id) {
      setEmployee(null);
      setPersona(null);
      setSkills([]);
      setRecentRuns([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Fire all 4 fetches in parallel; tolerate per-call failures so a
      // missing skills dir or CLAUDE.md doesn't sink the whole detail view.
      const [empRes, personaRes, skillsRes, runsRes] = await Promise.allSettled([
        fetchEmployee(id),
        fetchPersona(id),
        fetchSkills(id),
        fetchRuns(id),
      ]);
      if (!mounted.current) return;

      const emp = empRes.status === "fulfilled" ? empRes.value : null;
      setEmployee(emp);
      setPersona(personaRes.status === "fulfilled" ? personaRes.value : null);
      setSkills(skillsRes.status === "fulfilled" ? skillsRes.value : []);
      setRecentRuns(runsRes.status === "fulfilled" ? runsRes.value : []);

      const firstError = [empRes, personaRes, skillsRes, runsRes].find(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      if (!emp) {
        setError(`agent '${id}' not found`);
      } else if (firstError) {
        const reason = firstError.reason;
        setError(reason instanceof Error ? reason.message : String(reason));
      } else {
        setError(null);
      }
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  const savePersona = useCallback(
    async (markdown_text: string) => {
      if (!id) throw new Error("no agent selected");
      const res = await fetch(
        `/api/employees/${encodeURIComponent(id)}/persona`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ markdown_text }),
        },
      );
      if (!res.ok) {
        const msg = await readErrorMessage(res, `PUT persona ${res.status}`);
        throw new Error(msg);
      }
      await refresh();
    },
    [id, refresh],
  );

  const addSkill = useCallback(
    async ({ name, body }: { name: string; body: string }) => {
      if (!id) throw new Error("no agent selected");
      const res = await fetch(
        `/api/employees/${encodeURIComponent(id)}/skills`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, body }),
        },
      );
      if (!res.ok) {
        const msg = await readErrorMessage(res, `POST skill ${res.status}`);
        throw new Error(msg);
      }
      await refresh();
    },
    [id, refresh],
  );

  const getSkill = useCallback(
    async (slug: string): Promise<SkillDetail> => {
      if (!id) throw new Error("no agent selected");
      const res = await fetch(
        `/api/employees/${encodeURIComponent(id)}/skills/${encodeURIComponent(slug)}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const msg = await readErrorMessage(res, `GET skill ${res.status}`);
        throw new Error(msg);
      }
      const data = (await res.json()) as { skill: SkillDetail };
      return data.skill;
    },
    [id],
  );

  const saveSkill = useCallback(
    async (slug: string, body: string) => {
      if (!id) throw new Error("no agent selected");
      const res = await fetch(
        `/api/employees/${encodeURIComponent(id)}/skills/${encodeURIComponent(slug)}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
      if (!res.ok) {
        const msg = await readErrorMessage(res, `PUT skill ${res.status}`);
        throw new Error(msg);
      }
      await refresh();
    },
    [id, refresh],
  );

  const deleteSkill = useCallback(
    async (slug: string) => {
      if (!id) throw new Error("no agent selected");
      const res = await fetch(
        `/api/employees/${encodeURIComponent(id)}/skills/${encodeURIComponent(slug)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const msg = await readErrorMessage(res, `DELETE skill ${res.status}`);
        throw new Error(msg);
      }
      await refresh();
    },
    [id, refresh],
  );

  // Derived totals over the (capped) recent runs window. Documented as
  // "recent N runs" in the UI rather than all-time.
  const totalRuns = recentRuns.length;
  const totalCost = recentRuns.reduce(
    (sum, r) => sum + (Number.isFinite(r.cost_usd) ? r.cost_usd : 0),
    0,
  );

  return {
    employee,
    persona,
    skills,
    recentRuns,
    totalRuns,
    totalCost,
    loading,
    error,
    refresh,
    savePersona,
    addSkill,
    getSkill,
    saveSkill,
    deleteSkill,
  };
}
