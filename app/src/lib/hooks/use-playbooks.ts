"use client";
/**
 * usePlaybooks — aggregated view of every skill across every non-system agent.
 *
 * A "playbook" in the UI is structurally an agent skill (a SKILL.md file
 * under `agents/<slug>/.claude/skills/<slug>/`). This hook fans out to the
 * existing endpoints to build the cross-agent list:
 *
 *   1. GET /api/employees                       — list of agents
 *   2. GET /api/employees/<id>/skills (parallel) — skills per agent
 *
 * No new API surface is introduced. Internal-only / system pseudo-agents
 * are filtered out so the playbooks grid only shows user-facing skills.
 *
 * Polls every 30s so newly added skills surface without a page reload.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { EmployeeRow } from "./use-employees";
import type { SkillEntry } from "./use-agent-skills";

export type PlaybookEntry = {
  /** Composite id: `${agent_id}__${skill_slug}` — unique across the app. */
  id: string;
  /** Skill name (typically a slug like "inbox-triage"). */
  name: string;
  /** First ~200 chars of SKILL.md, stripped of markdown. */
  description: string;
  /** Owning agent. */
  agent_id: string;
  agent_name: string;
  agent_avatar: string | null;
  agent_accent: string;
  /** Coarse bucket — kept simple ("Skill"). */
  category: string;
};

const POLL_MS = 30_000;
const DEFAULT_ACCENT = "#5B5BD6";
const DESC_MAX = 200;

/** Strip markdown noise from a SKILL.md preview so card descriptions read clean. */
function cleanDescription(preview: string): string {
  if (!preview) return "";
  let text = preview;
  // Drop headings ("# Skill: foo", "## When to use", etc.) line by line.
  text = text
    .split("\n")
    .filter((line) => !/^\s*#{1,6}\s/.test(line))
    .join(" ");
  // Inline markdown markers.
  text = text
    .replace(/`+([^`]*)`+/g, "$1") // code spans
    .replace(/\*\*([^*]+)\*\*/g, "$1") // bold
    .replace(/\*([^*]+)\*/g, "$1") // italic
    .replace(/_([^_]+)_/g, "$1") // underscore italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/[>\-*]\s+/g, " ") // list / quote markers
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= DESC_MAX) return text;
  return text.slice(0, DESC_MAX).replace(/\s+\S*$/, "") + "…";
}

function toPlaybook(
  employee: EmployeeRow,
  skill: SkillEntry,
): PlaybookEntry {
  const slug = skill.slug ?? skill.name;
  return {
    id: `${employee.id}__${slug}`,
    name: skill.name,
    description: cleanDescription(skill.preview),
    agent_id: employee.id,
    agent_name: employee.name,
    agent_avatar: employee.avatar_emoji ?? null,
    agent_accent: employee.accent_color ?? DEFAULT_ACCENT,
    category: "Skill",
  };
}

export type UsePlaybooks = {
  playbooks: PlaybookEntry[];
  loading: boolean;
  refresh: () => Promise<void>;
};

export function usePlaybooks(): UsePlaybooks {
  const [playbooks, setPlaybooks] = useState<PlaybookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const empRes = await fetch("/api/employees", { cache: "no-store" });
      if (!empRes.ok) throw new Error(`GET /api/employees ${empRes.status}`);
      const empData = (await empRes.json()) as { employees: EmployeeRow[] };
      const userAgents = (empData.employees ?? []).filter(
        (e) => e.id !== "system" && e.internal_only !== 1,
      );

      const skillResults = await Promise.all(
        userAgents.map(async (emp) => {
          try {
            const r = await fetch(
              `/api/employees/${encodeURIComponent(emp.id)}/skills`,
              { cache: "no-store" },
            );
            if (!r.ok) return { emp, skills: [] as SkillEntry[] };
            const body = (await r.json()) as { skills?: SkillEntry[] };
            return { emp, skills: body.skills ?? [] };
          } catch {
            return { emp, skills: [] as SkillEntry[] };
          }
        }),
      );

      const flat: PlaybookEntry[] = skillResults.flatMap(({ emp, skills }) =>
        skills.map((s) => toPlaybook(emp, s)),
      );

      flat.sort((a, b) => {
        const byAgent = a.agent_name.localeCompare(b.agent_name);
        if (byAgent !== 0) return byAgent;
        return a.name.localeCompare(b.name);
      });

      if (mounted.current) {
        setPlaybooks(flat);
        setLoading(false);
      }
    } catch {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    const id = window.setInterval(() => {
      void load();
    }, POLL_MS);
    return () => {
      mounted.current = false;
      window.clearInterval(id);
    };
  }, [load]);

  return { playbooks, loading, refresh: load };
}
