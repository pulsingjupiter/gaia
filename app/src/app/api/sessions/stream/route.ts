/**
 * GET /api/sessions/stream  → SSE — global Claude Code session activity feed.
 *
 * Each frame:
 *   event: <type>
 *   data: <JSON of {session_id, project_id, ts, summary, payload}>
 *
 * Heartbeat every 15s. Stays open until client disconnects.
 */
import { ensureSeeded } from "@/server/seed.ts";
import {
  sessionEvents,
  type SessionBusPayload,
} from "@/server/session-watcher.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;

function sseFrame(eventName: string, data: unknown): string {
  return `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request): Promise<Response> {
  ensureSeeded();

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | null = null;

      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const onAny = (ev: SessionBusPayload) => {
        safeEnqueue(
          sseFrame(ev.type, {
            session_id: ev.sessionId,
            project_id: ev.projectId,
            ts: ev.ts,
            summary: ev.summary,
            payload: ev.payload,
          }),
        );
      };

      sessionEvents.on("session:any", onAny);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        sessionEvents.off("session:any", onAny);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      safeEnqueue(`: connected\n\n`);

      heartbeat = setInterval(() => {
        safeEnqueue(`: ping\n\n`);
      }, HEARTBEAT_MS);

      const signal = request.signal;
      if (signal.aborted) {
        cleanup();
        return;
      }
      signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
