/**
 * POST /api/morning-briefing
 *      body: {} (no inputs required)
 *      → 200 { created: number, skipped: number, tasks: TaskRow[] }
 *
 * Pre-creates the five "Morning Briefing" demo cron tasks (Atlas, King Henry,
 * Rack, Nova, Professor Adrian) staggered between 9:00 and 10:00 SGT. All
 * rows are inserted with `enabled = 0` so the user reviews them before the
 * scheduler fires anything.
 *
 * Idempotent: rows are matched by their stable `morning-briefing-<agent>` id.
 * If a row already exists it is skipped (not overwritten, not errored). Re-
 * POSTing after a partial setup tops up the missing tasks and leaves the
 * existing ones alone.
 */
import {
  getTask,
  insertTask,
  type TaskRow,
} from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BriefingSpec = {
  id: string;
  employee_id: string;
  skill: string;
  schedule_cron: string;
  human_label: string;
  title: string;
  description: string;
};

const BRIEFINGS: BriefingSpec[] = [
  {
    id: "morning-briefing-atlas",
    employee_id: "atlas",
    skill: "research-deep-dive",
    schedule_cron: "0 9 * * *",
    human_label: "Daily 9:00 AM",
    title: "Atlas: Daily research",
    description:
      "Today's most-discussed topics in solo-founder Twitter, Hacker News, and Indie Hackers. 5 highlights, links if known.",
  },
  {
    id: "morning-briefing-king-henry",
    employee_id: "king-henry",
    skill: "inbox-triage",
    schedule_cron: "15 9 * * *",
    human_label: "Daily 9:15 AM",
    title: "King Henry: Inbox triage",
    description:
      "Triage any pending inbox items. Surface anything urgent. If empty, just say so.",
  },
  {
    id: "morning-briefing-rack",
    employee_id: "rack",
    skill: "infra-check",
    schedule_cron: "30 9 * * *",
    human_label: "Daily 9:30 AM",
    title: "Rack: Daily infra check",
    description: "Run a routine health check. Flag anomalies.",
  },
  {
    id: "morning-briefing-nova",
    employee_id: "nova",
    skill: "script-writer",
    schedule_cron: "45 9 * * *",
    human_label: "Daily 9:45 AM",
    title: "Nova: Daily content idea",
    description:
      "Generate 1 fresh short-form video idea (≤60s) tied to today's research. Hook + payoff + CTA.",
  },
  {
    id: "morning-briefing-professor-adrian",
    employee_id: "professor-adrian",
    skill: "research-tool",
    schedule_cron: "0 10 * * *",
    human_label: "Daily 10:00 AM",
    title: "Professor Adrian: Architecture review",
    description:
      "What in Gaia's architecture deserves attention this week? List 3 things, ranked by leverage.",
  },
];

export async function POST(): Promise<Response> {
  ensureSeeded();

  const tasks: TaskRow[] = [];
  let created = 0;
  let skipped = 0;

  for (const spec of BRIEFINGS) {
    const existing = getTask(spec.id);
    if (existing) {
      tasks.push(existing);
      skipped += 1;
      continue;
    }
    const row = insertTask({
      id: spec.id,
      title: spec.title,
      employee_id: spec.employee_id,
      skill: spec.skill,
      schedule_cron: spec.schedule_cron,
      human_label: spec.human_label,
      description: spec.description,
      enabled: 0,
      status: "backlog",
      priority: "medium",
    });
    tasks.push(row);
    created += 1;
  }

  return Response.json({ created, skipped, tasks });
}
