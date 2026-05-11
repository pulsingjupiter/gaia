/**
 * GET /api/sessions/[id]/transcript?from=N&limit=200
 *   → { events: ParsedEvent[], total }
 *
 * Reads the JSONL transcript directly and returns parsed events. ParsedEvent
 * shape: { ts, role, text?, tool_name?, tool_input?, tool_result_preview?, cost?, type? }
 */
import type { NextRequest } from "next/server";

import { getSession } from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";
import { readTranscriptEvents } from "@/server/session-watcher.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  const session = getSession(id);
  if (!session) {
    return Response.json({ error: "session not found" }, { status: 404 });
  }
  const sp = req.nextUrl.searchParams;
  const fromRaw = sp.get("from");
  const limitRaw = sp.get("limit");
  const from = fromRaw ? Math.max(0, Number(fromRaw)) : 0;
  const limit = limitRaw
    ? Math.max(1, Math.min(1000, Number(limitRaw)))
    : 200;
  if (!Number.isFinite(from) || !Number.isFinite(limit)) {
    return Response.json({ error: "from/limit must be numbers" }, { status: 400 });
  }
  const result = readTranscriptEvents(session.transcript_path, { from, limit });
  return Response.json(result);
}
