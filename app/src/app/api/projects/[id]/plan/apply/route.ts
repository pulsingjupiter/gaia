/**
 * POST /api/projects/[id]/plan/apply
 *
 * Body: the (possibly edited) PlanProposal returned by /api/projects/[id]/plan.
 * Inserts milestones + their tasks under a single SQLite transaction. Tasks
 * land in the project's todo queue (`status='todo'`) because the preview modal
 * is the review step.
 */
import {
  getDb,
  getEmployee,
  getProject,
  insertMilestone,
  insertTask,
} from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

type IncomingTask = {
  title?: unknown;
  description?: unknown;
  priority?: unknown;
  assignee_id?: unknown;
  due_date?: unknown;
};

type IncomingMilestone = {
  name?: unknown;
  description?: unknown;
  due_date?: unknown;
  tasks?: unknown;
};

type ApplyBody = {
  milestones?: unknown;
  rationale?: unknown;
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
  if (!Array.isArray(body.milestones)) {
    return badRequest("milestones (array) required");
  }

  const milestones = body.milestones as IncomingMilestone[];
  const warnings: string[] = [];

  // Track existing milestone names to flag duplicates (we still insert).
  const seenNames = new Set<string>();

  const db = getDb();
  let createdMilestones = 0;
  let createdTasks = 0;

  const tx = db.transaction(() => {
    let sortOrder = 0;
    for (const m of milestones) {
      if (typeof m.name !== "string" || !m.name.trim()) continue;
      const name = m.name.trim();
      if (seenNames.has(name.toLowerCase())) {
        warnings.push(`Duplicate name: '${name}'`);
      }
      seenNames.add(name.toLowerCase());

      const due = parseIsoDate(m.due_date);
      const milestone = insertMilestone({
        project_id: id,
        name,
        description:
          typeof m.description === "string" && m.description.trim()
            ? m.description.trim()
            : null,
        due_date: due,
        status: "active",
        sort_order: sortOrder++,
      });
      createdMilestones += 1;

      const tasks = Array.isArray(m.tasks) ? (m.tasks as IncomingTask[]) : [];
      for (const t of tasks) {
        if (typeof t.title !== "string" || !t.title.trim()) continue;
        let employeeId: string | null = null;
        if (typeof t.assignee_id === "string" && t.assignee_id.trim()) {
          const candidate = t.assignee_id.trim();
          // The "adrian" pseudo-id (the human) and any non-existent agent id
          // are not valid FK targets — drop them silently rather than fail
          // the whole transaction.
          if (candidate !== "adrian" && getEmployee(candidate)) {
            employeeId = candidate;
          }
        }
        const taskDue = parseIsoDate(t.due_date) ?? due;
        insertTask({
          title: t.title.trim(),
          description:
            typeof t.description === "string" && t.description.trim()
              ? t.description.trim()
              : null,
          employee_id: employeeId,
          priority: normalisePriority(t.priority),
          status: "todo",
          project_id: id,
          milestone_id: milestone.id,
          due_date: taskDue,
        });
        createdTasks += 1;
      }
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
    created: { milestones: createdMilestones, tasks: createdTasks },
    warnings,
  });
}
