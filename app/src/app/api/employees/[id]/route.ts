/**
 * PATCH  /api/employees/[id]  → partial update
 * DELETE /api/employees/[id]  → soft-delete (status='archived'); agent_dir kept
 *
 * Wave 2A.
 */
import { getDb, getEmployee, type EmployeeRow } from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STRING_PATCH_KEYS = [
  "name",
  "role",
  "status",
  "accent_color",
  "avatar_emoji",
] as const;

const NUMBER_PATCH_KEYS = [
  // Daily cost cap in USD; null = no cap. Stored as REAL on the employees row.
  "daily_cost_cap_usd",
] as const;

type StringKey = (typeof STRING_PATCH_KEYS)[number];
type NumberKey = (typeof NUMBER_PATCH_KEYS)[number];

type PatchBody = Partial<Record<StringKey, string | null>> &
  Partial<Record<NumberKey, number | null>>;

function badRequest(msg: string): Response {
  return Response.json({ error: msg }, { status: 400 });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  const existing = getEmployee(id);
  if (!existing) {
    return Response.json({ error: `employee '${id}' not found` }, { status: 404 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return badRequest("invalid JSON body");
  }
  if (!body || typeof body !== "object") return badRequest("body must be object");

  const setClauses: string[] = [];
  const values: (string | number | null)[] = [];
  for (const key of STRING_PATCH_KEYS) {
    if (key in body) {
      const v = body[key];
      if (v !== null && typeof v !== "string") {
        return badRequest(`'${key}' must be string or null`);
      }
      setClauses.push(`${key} = ?`);
      values.push(v ?? null);
    }
  }
  for (const key of NUMBER_PATCH_KEYS) {
    if (key in body) {
      const v = body[key];
      if (v === null) {
        setClauses.push(`${key} = ?`);
        values.push(null);
        continue;
      }
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
        return badRequest(`'${key}' must be a non-negative number or null`);
      }
      setClauses.push(`${key} = ?`);
      values.push(v);
    }
  }
  if (setClauses.length === 0) {
    return Response.json({ employee: existing });
  }

  values.push(id);
  getDb()
    .prepare(`UPDATE employees SET ${setClauses.join(", ")} WHERE id = ?`)
    .run(...values);

  const employee = getEmployee(id) as EmployeeRow;
  return Response.json({ employee });
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  const existing = getEmployee(id);
  if (!existing) {
    return Response.json({ error: `employee '${id}' not found` }, { status: 404 });
  }

  // Soft-delete. Schema has no CHECK constraint on status so 'archived' is allowed.
  getDb()
    .prepare(`UPDATE employees SET status = 'archived' WHERE id = ?`)
    .run(id);
  return Response.json({ ok: true });
}
