/**
 * POST /api/hook — Claude Code hook receiver.
 *
 * Optional sub-50ms push channel. Users install a hook in
 * ~/.claude/settings.json that POSTs lifecycle events here. Updates the
 * sessions row, fans out via the same `sessionEvents` bus the watcher uses,
 * and (on Stop) inserts a session-ended notification through the notifier
 * dedupe set so we don't double-emit when the watcher's poll catches up.
 *
 * Accepts either JSON or form-encoded body. Always returns 204 quickly —
 * the hook is fire-and-forget; we never want to block the user's terminal.
 */
import os from "node:os";
import path from "node:path";

import {
  getProject,
  getProjectByPath,
  getSession,
  insertNotification,
  updateSession,
  upsertProject,
  upsertSession,
} from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";
import {
  pickProjectColor,
  sessionEvents,
  isInternalProjectCwd,
} from "@/server/session-watcher.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HookBody = {
  event?: string;
  session_id?: string;
  // Some hook configs use 'session' instead of 'session_id'.
  session?: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: unknown;
  summary?: string;
  ts?: number | string;
};

const NO_CONTENT = new Response(null, { status: 204 });

function badRequest(msg: string): Response {
  return Response.json({ error: msg }, { status: 400 });
}

function fileFromToolInput(name: string, input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  if (name === "Bash") return null;
  const obj = input as Record<string, unknown>;
  for (const key of ["file_path", "path", "notebook_path", "filename"]) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

function projectNameFromCwd(cwd: string): string {
  const base = path.basename(cwd);
  return base || cwd;
}

async function readBody(req: Request): Promise<HookBody | null> {
  const ctype = req.headers.get("content-type") ?? "";
  try {
    if (ctype.includes("application/json")) {
      return (await req.json()) as HookBody;
    }
    if (
      ctype.includes("application/x-www-form-urlencoded") ||
      ctype.includes("multipart/form-data")
    ) {
      const form = await req.formData();
      const out: HookBody = {};
      for (const [k, v] of form.entries()) {
        if (typeof v !== "string") continue;
        if (k === "ts") {
          const n = Number(v);
          if (Number.isFinite(n)) out.ts = n;
        } else if (k === "tool_input") {
          try {
            out.tool_input = JSON.parse(v);
          } catch {
            out.tool_input = v;
          }
        } else {
          (out as Record<string, unknown>)[k] = v;
        }
      }
      return out;
    }
    // Best-effort: try JSON.
    const text = await req.text();
    if (!text) return {};
    try {
      return JSON.parse(text) as HookBody;
    } catch {
      return {};
    }
  } catch {
    return null;
  }
}

/**
 * Ensure a project exists for the given cwd. Mirrors the watcher's discovery
 * logic but with no transcript_dir (since hooks may fire before the JSONL
 * file is even created).
 */
function ensureProjectForCwd(cwd: string): { id: string } | null {
  if (!cwd) return null;
  if (isInternalProjectCwd(cwd)) return null;
  const existing = getProjectByPath(cwd);
  if (existing) return existing;
  return upsertProject({
    name: projectNameFromCwd(cwd),
    path: cwd,
    color: pickProjectColor(cwd),
  });
}

export async function POST(req: Request): Promise<Response> {
  try {
    ensureSeeded();
  } catch (err) {
    console.error("[hook] ensureSeeded failed", err);
    return NO_CONTENT;
  }

  const body = await readBody(req);
  if (!body) {
    return badRequest("invalid body");
  }

  const event = typeof body.event === "string" ? body.event.trim() : "";
  const sessionId =
    (typeof body.session_id === "string" && body.session_id.trim()) ||
    (typeof body.session === "string" && body.session.trim()) ||
    "";
  if (!event) return badRequest("event required");
  if (!sessionId) return badRequest("session_id required");

  const tsNum =
    typeof body.ts === "number"
      ? body.ts
      : typeof body.ts === "string"
        ? Number(body.ts)
        : NaN;
  const ts = Number.isFinite(tsNum) ? tsNum : Date.now();

  const cwdRaw = typeof body.cwd === "string" ? body.cwd : "";
  // Tilde expansion is best-effort — hooks usually pass $PWD which is already
  // absolute, but be friendly.
  const cwd = cwdRaw.startsWith("~")
    ? path.join(os.homedir(), cwdRaw.slice(1))
    : cwdRaw;

  try {
    let projectId: string | null = null;
    let session = getSession(sessionId);

    if (session) {
      projectId = session.project_id;
    } else if (cwd) {
      const project = ensureProjectForCwd(cwd);
      if (project) {
        projectId = project.id;
        // Create a placeholder session row so subsequent updates have a
        // target. The watcher will fill in transcript_path / counters when
        // the JSONL appears on disk.
        session = upsertSession({
          id: sessionId,
          project_id: project.id,
          transcript_path: "",
          status: "active",
          started_at: ts,
          last_event_at: ts,
          last_event_type: event,
          last_event_summary: typeof body.summary === "string" ? body.summary : event,
        });
      }
    }

    // Update the session row if we have one.
    if (session) {
      const toolName =
        typeof body.tool_name === "string" ? body.tool_name : null;
      const file = toolName
        ? fileFromToolInput(toolName, body.tool_input)
        : null;
      const summary =
        (typeof body.summary === "string" && body.summary) || event;

      const isStop = event === "Stop" || event === "SubagentStop";

      const patch: Parameters<typeof updateSession>[1] = {
        last_event_at: ts,
        last_event_type: event,
        last_event_summary: summary.slice(0, 200),
      };
      if (toolName) patch.last_tool = toolName;
      if (file) patch.last_file = file;
      if (isStop) {
        patch.status = "ended";
        patch.ended_at = ts;
      } else {
        patch.status = "active";
      }
      updateSession(session.id, patch);

      // Re-fetch for the bus payload (so listeners see canonical row state).
      const fresh = getSession(session.id) ?? session;
      const project = getProject(fresh.project_id);

      // Fan out on the bus.
      try {
        const payload = {
          sessionId: fresh.id,
          projectId: fresh.project_id,
          type: event,
          summary: summary.slice(0, 200),
          ts,
        };
        sessionEvents.emit("session:any", payload);
        sessionEvents.emit(fresh.id, payload);
      } catch (err) {
        console.error("[hook] bus emit failed", err);
      }

      // On Stop: insert session-ended notification (idempotent — guarded by
      // the same dedupe key shape the notifier uses; we just call insert
      // directly, and the notifier's in-process Set will pick up the
      // already-ended status on its next poll without re-emitting).
      if (isStop && project) {
        try {
          const msgs = fresh.num_messages ?? 0;
          const cost = fresh.total_cost_usd ?? 0;
          const costStr =
            cost <= 0 ? "$0" : cost < 0.01 ? "<$0.01" : `$${cost.toFixed(2)}`;
          insertNotification({
            sender_id: "system",
            body:
              `${project.name} session ended — ${msgs} message${msgs === 1 ? "" : "s"} exchanged, ` +
              `${costStr} estimated cost.`,
            metadata: {
              source: "session-ended",
              session_id: fresh.id,
              project_id: fresh.project_id,
              cost_usd: cost,
            },
          });
        } catch (err) {
          // Likely a duplicate (notifier already emitted) — fine.
          console.error("[hook] session-ended notification failed", err);
        }
      }
    } else {
      // No session in DB and no cwd to auto-create one. That's fine for
      // synthetic test pings — emit a bare bus event so SSE listeners can
      // still see the heartbeat, then 204.
      try {
        const payload = {
          sessionId,
          projectId: "",
          type: event,
          summary:
            typeof body.summary === "string" && body.summary ? body.summary : event,
          ts,
        };
        sessionEvents.emit("session:any", payload);
        sessionEvents.emit(sessionId, payload);
      } catch {
        // ignore
      }
    }
  } catch (err) {
    // Never crash the user's CLI — log and swallow.
    console.error("[hook] handler failed", err);
  }

  return NO_CONTENT;
}
