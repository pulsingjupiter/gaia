"use client";
/**
 * useAgentSkills — wraps `GET /api/employees/<id>/skills`.
 *
 * Returns the list of skills declared under `agents/<slug>/.claude/skills/`.
 * Used by the Quick Run modal in `<AgentLaunchButton>` to populate the skill
 * picker without re-fetching the full agent detail bundle.
 */
import { useCallback, useEffect, useState } from "react";

export type SkillEntry = {
  name: string;
  /** URL-safe identifier (defaults to skill directory name). */
  slug?: string;
  path: string;
  preview: string;
};

type State = {
  skills: SkillEntry[];
  loading: boolean;
  error: string | null;
};

export function useAgentSkills(agentId: string | null): State & {
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<State>({
    skills: [],
    loading: false,
    error: null,
  });

  const load = useCallback(async () => {
    if (!agentId) {
      setState({ skills: [], loading: false, error: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch(
        `/api/employees/${encodeURIComponent(agentId)}/skills`,
        { cache: "no-store" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        skills?: SkillEntry[];
        error?: string;
      };
      if (!res.ok) {
        setState({
          skills: [],
          loading: false,
          error: data.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      setState({ skills: data.skills ?? [], loading: false, error: null });
    } catch (err) {
      setState({
        skills: [],
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, refresh: load };
}
