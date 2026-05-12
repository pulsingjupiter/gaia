/**
 * POST /api/projects/[id]/assess/apply
 *
 * Body: the user-curated AssessProposal (description / milestones / tasks)
 * returned by /api/projects/[id]/assess and edited in the preview modal.
 * Writes are wrapped in a single SQLite transaction.
 *
 * - description: applied with updateProject() if non-empty.
 * - milestones: inserted via insertMilestone() (status="active").
 * - tasks: inserted via insertTask() (status="backlog"). A task's
 *   `milestone_idx` (0-based) is resolved to the just-inserted milestone's
 *   id; out-of-range indices fall through to no milestone.
 */
import {
  getDb,
  getProject,
  insertMilestone,
  insertTask,
  updateProject,
} from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

type IncomingMilestone = {
  title?: unknown;
  due_at?: unknown;
};

type IncomingTask = {
  title?: unknown;
  priority?: unknown;
  milestone_idx?: unknown;
};

type ApplyBody = {
  description?: unknown;
  milestones?: unknown;
  tasks?: unknown;
};

function badRequest(msg: string): Response {
  return Response.json({ error: msg }, { status: 400 });
}

function normalisePriority(v: unknown): "low" | "medium" | "high" {
  if (v === "low" || v === "medium" || v === "high") return v;
  return "medium";
}

function parseIsoDate(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (!Number.isFinite(d.getTime())) return null;
  return d.getTime();
}

export async function POST(req: Request, ctx: RouteCtx): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  const project = getProject(id);
  if (!project) {
    return Response.json({ error: "project not found" }, { status: 404 });
  }

  let body: ApplyBody;
  try {
    body = (await req.json()) as ApplyBody;
  } catch {
    return badRequest("invalid JSON body");
  }

  const description =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;
  const milestonesIn: IncomingMilestone[] = Array.isArray(body.milestones)
    ? (body.milestones as IncomingMilestone[])
    : [];
  const tasksIn: IncomingTask[] = Array.isArray(body.tasks)
    ? (body.tasks as IncomingTask[])
    : [];

  const db = getDb();
  let createdMilestones = 0;
  let createdTasks = 0;
  let updatedDescription = false;

  const tx = db.transaction(() => {
    // Description: only overwrite if the user supplied something new.
    if (description !== null && description !== project.description) {
      updateProject(id, { description });
      updatedDescription = true;
    }

    // Milestones — track inserted ids in order for milestone_idx lookup.
    const milestoneIds: string[] = [];
    let sortOrder = 0;
    for (const m of milestonesIn) {
      if (typeof m.title !== "string" || !m.title.trim()) {
        milestoneIds.push("");
        continue;
      }
      const due = parseIsoDate(m.due_at);
      const row = insertMilestone({
        project_id: id,
        name: m.title.trim(),
        description: null,
        due_date: due,
        status: "active",
        sort_order: sortOrder++,
      });
      milestoneIds.push(row.id);
      createdMilestones += 1;
    }

    for (const t of tasksIn) {
      if (typeof t.title !== "string" || !t.title.trim()) continue;
      let milestoneId: string | null = null;
      if (
        typeof t.milestone_idx === "number" &&
        Number.isInteger(t.milestone_idx) &&
        t.milestone_idx >= 0 &&
        t.milestone_idx < milestoneIds.length &&
        milestoneIds[t.milestone_idx]
      ) {
        milestoneId = milestoneIds[t.milestone_idx];
      }
      insertTask({
        title: t.title.trim(),
        description: null,
        employee_id: null,
        priority: normalisePriority(t.priority),
        status: "backlog",
        project_id: id,
        milestone_id: milestoneId,
        due_date: null,
      });
      createdTasks += 1;
    }
  });

  try {
    tx();
  } catch (err) {
    return Response.json(
      {
        error: `apply failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    );
  }

  return Response.json({
    created: {
      description: updatedDescription,
      milestones: createdMilestones,
      tasks: createdTasks,
    },
  });
}
