/**
 * GET /api/sessions/[id] → { session }
 * PATCH /api/sessions/[id] { custom_label } → { session }
 */
import { getSession, setSessionCustomLabel } from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: RouteCtx): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  const session = getSession(id);
  if (!session) {
    return Response.json({ error: "session not found" }, { status: 404 });
  }
  return Response.json({ session });
}

export async function PATCH(req: Request, ctx: RouteCtx): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  if (!getSession(id)) {
    return Response.json({ error: "session not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !("custom_label" in body)) {
    return Response.json(
      { error: "custom_label is required" },
      { status: 400 },
    );
  }

  const customLabel = (body as { custom_label: unknown }).custom_label;
  if (customLabel !== null && typeof customLabel !== "string") {
    return Response.json(
      { error: "custom_label must be a string or null" },
      { status: 400 },
    );
  }

  try {
    setSessionCustomLabel(id, customLabel);
  } catch (err) {
    if (err instanceof RangeError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  return Response.json({ session: getSession(id) });
}
