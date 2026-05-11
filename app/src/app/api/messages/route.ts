/**
 * GET  /api/messages?thread=<thread_id>     → { messages: MessageRow[] }
 * GET  /api/messages?threads=1              → { threads: ThreadSummary[] }
 * POST /api/messages                        → insert message; if sender='user',
 *                                             also kicks off a chat run and
 *                                             persists the agent reply when done.
 *
 * Wave 2A.
 */
import type { NextRequest } from "next/server";

import {
  canonicalThreadId,
  getEmployee,
  insertMessage,
  listMessages,
  listThreads,
  type MessageRow,
} from "@/server/db.ts";
import { runEvents, startRun, type RunBusEvent } from "@/server/agent-runner.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badRequest(msg: string): Response {
  return Response.json({ error: msg }, { status: 400 });
}

export async function GET(request: NextRequest): Promise<Response> {
  ensureSeeded();
  const sp = request.nextUrl.searchParams;
  const threadId = sp.get("thread");
  const wantThreads = sp.get("threads");

  if (threadId) {
    const messages = listMessages(threadId);
    return Response.json({ messages });
  }

  if (wantThreads) {
    const summaries = listThreads();
    const threads = summaries.map((s) => ({
      thread_id: s.thread_id,
      participants: s.participants,
      last_message: s.preview,
      last_at: s.last_message_at,
      unread_count: s.unread_count,
    }));
    return Response.json({ threads });
  }

  return badRequest("provide ?thread=<id> or ?threads=1");
}

type SendBody = {
  sender_id?: string;
  recipient_id?: string;
  body?: string;
};

export async function POST(request: Request): Promise<Response> {
  ensureSeeded();
  let payload: SendBody;
  try {
    payload = (await request.json()) as SendBody;
  } catch {
    return badRequest("invalid JSON body");
  }
  if (!payload || typeof payload !== "object") return badRequest("body must be object");
  if (typeof payload.sender_id !== "string" || !payload.sender_id.trim()) {
    return badRequest("sender_id (string) required");
  }
  if (typeof payload.recipient_id !== "string" || !payload.recipient_id.trim()) {
    return badRequest("recipient_id (string) required");
  }
  if (typeof payload.body !== "string" || !payload.body.length) {
    return badRequest("body (string) required");
  }

  const sender_id = payload.sender_id.trim();
  const recipient_id = payload.recipient_id.trim();
  const body = payload.body;
  const thread_id = canonicalThreadId(sender_id, recipient_id);

  const message = insertMessage({ sender_id, recipient_id, body });

  // If a human is messaging an agent, kick off a chat run and arrange to
  // persist the agent's reply as a message when the run completes.
  let run_id: string | undefined;
  if (sender_id === "user" && getEmployee(recipient_id)) {
    try {
      const started = await startRun({
        employeeId: recipient_id,
        skill: "chat",
        input: body,
        threadId: thread_id,
      });
      run_id = started.runId;
      schedulePersistReply({
        runId: started.runId,
        agentId: recipient_id,
        userId: sender_id,
      });
    } catch (err) {
      // Don't fail the message send — surface as a warning.
      const msg = err instanceof Error ? err.message : String(err);
      return Response.json(
        { message, run_id: null, warning: `failed to start run: ${msg}` },
        { status: 201 },
      );
    }
  }

  return Response.json({ message, run_id }, { status: 201 });
}

/**
 * Listen on `runEvents` for the given runId; when 'done' fires, persist the
 * agent's `result` payload as a message back to the user. Self-detaches.
 *
 * Lives here (not in agent-runner) to keep Wave 1's runner pristine.
 */
function schedulePersistReply(args: {
  runId: string;
  agentId: string;
  userId: string;
}): void {
  const { runId, agentId, userId } = args;
  let lastResult: string | null = null;

  const handler = (ev: RunBusEvent) => {
    if (ev.type === "result") {
      const p = ev.payload as { result?: unknown } | null | undefined;
      if (p && typeof p.result === "string") {
        lastResult = p.result;
      }
    }
    if (ev.type === "done") {
      runEvents.off(runId, handler);
      const text = (lastResult ?? "").trim();
      if (!text) return;
      try {
        const reply: MessageRow = insertMessage({
          sender_id: agentId,
          recipient_id: userId,
          body: text,
          run_id: runId,
        });
        // Re-broadcast as a synthetic event so the global feed sees it.
        runEvents.emit("message:new", { runId, message: reply });
      } catch {
        // best-effort
      }
    }
  };

  runEvents.on(runId, handler);
}
