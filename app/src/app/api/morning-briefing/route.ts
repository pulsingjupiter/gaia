/**
 * POST /api/morning-briefing
 *      body: {} (no inputs required)
 *      → 200 { created: number, skipped: number, scheduled_runs: ScheduledRunRow[] }
 *
 * Pre-creates the five "Morning Briefing" demo cron tasks (Atlas, King Henry,
 * Rack, Nova, Gaia) staggered between 9:00 and 10:00 SGT. All
 * rows are inserted with `enabled = 0` so the user reviews them before the
 * scheduler fires anything.
 *
 * Idempotent: rows are matched by their stable `morning-briefing-<agent>` id.
 * If a row already exists it is skipped (not overwritten, not errored). Re-
 * POSTing after a partial setup tops up the missing tasks and leaves the
 * existing ones alone.
 *
 * Post cron-split — writes to the new `scheduled_runs` table instead of the
 * conflated `tasks` table. The /schedule page reads the same source.
 */
import {
  getScheduledRun,
  insertScheduledRun,
  type ScheduledRunRow,
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
};

const BRIEFINGS: BriefingSpec[] = [
  {
    id: "morning-briefing-atlas",
    employee_id: "atlas",
    skill: "research-deep-dive",
    schedule_cron: "0 9 * * *",
    human_label: "Daily 9:00 AM",
    title: "Atlas: Daily research",
  },
  {
    id: "morning-briefing-king-henry",
    employee_id: "king-henry",
    skill: "inbox-triage",
    schedule_cron: "15 9 * * *",
    human_label: "Daily 9:15 AM",
    title: "King Henry: Inbox triage",
  },
  {
    id: "morning-briefing-rack",
    employee_id: "rack",
    skill: "infra-check",
    schedule_cron: "30 9 * * *",
    human_label: "Daily 9:30 AM",
    title: "Rack: Daily infra check",
  },
  {
    id: "morning-briefing-nova",
    employee_id: "nova",
    skill: "script-writer",
    schedule_cron: "45 9 * * *",
    human_label: "Daily 9:45 AM",
    title: "Nova: Daily content idea",
  },
  {
    id: "morning-briefing-gaia",
    employee_id: "gaia",
    skill: "research-tool",
    schedule_cron: "0 10 * * *",
    human_label: "Daily 10:00 AM",
    title: "Gaia: Architecture review",
  },
];

export async function POST(): Promise<Response> {
  ensureSeeded();

  const scheduled_runs: ScheduledRunRow[] = [];
  let created = 0;
  let skipped = 0;

  for (const spec of BRIEFINGS) {
    const existing = getScheduledRun(spec.id);
    if (existing) {
      scheduled_runs.push(existing);
      skipped += 1;
      continue;
    }
    const row = insertScheduledRun({
      id: spec.id,
      employee_id: spec.employee_id,
      skill: spec.skill,
      schedule_cron: spec.schedule_cron,
      human_label: spec.human_label,
      enabled: 0,
    });
    scheduled_runs.push(row);
    created += 1;
  }

  return Response.json({ created, skipped, scheduled_runs });
}
