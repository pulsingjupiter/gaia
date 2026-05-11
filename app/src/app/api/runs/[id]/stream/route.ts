/**
 * GET /api/runs/[id]/stream  → SSE
 *
 * Replays past events from `run_events` first, then subscribes to live events
 * via the runner's EventEmitter. Stream closes after the run emits 'done',
 * or when the client disconnects (request.signal.aborted).
 *
 * Frame format:
 *   event: <type>
 *   data: <JSON of {ts, payload}>
 *
 * A keep-alive comment `: ping\n\n` is sent every 15s.
 *
 * Wave 2A.
 */
import { getRun, listRunEvents } from "@/server/db.ts";
import { runEvents, type RunBusEvent } from "@/server/agent-runner.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;

function sseFrame(eventName: string, data: unknown): string {
  return `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  ensureSeeded();
  const { id } = await ctx.params;
  const run = getRun(id);
  if (!run) {
    return Response.json({ error: `run '${id}' not found` }, { status: 404 });
  }

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

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        runEvents.off(id, onEvent);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      const onEvent = (ev: RunBusEvent) => {
        safeEnqueue(sseFrame(ev.type, { ts: ev.ts, payload: ev.payload }));
        if (ev.type === "done") cleanup();
      };

      // Subscribe BEFORE replay so we don't miss events that arrive between
      // the listRunEvents() snapshot and the subscription.
      runEvents.on(id, onEvent);

      // Replay past events.
      const past = listRunEvents(id);
      for (const e of past) {
        let payload: unknown;
        try {
          payload = JSON.parse(e.payload);
        } catch {
          payload = e.payload;
        }
        safeEnqueue(sseFrame(e.type, { ts: e.ts, payload }));
      }

      // If the run already finished before/during replay, close.
      const fresh = getRun(id);
      if (fresh && (fresh.status === "success" || fresh.status === "error" || fresh.status === "cancelled")) {
        safeEnqueue(
          sseFrame("done", {
            ts: Date.now(),
            payload: { runId: id, status: fresh.status },
          }),
        );
        cleanup();
        return;
      }

      // Heartbeat
      heartbeat = setInterval(() => {
        safeEnqueue(`: ping\n\n`);
      }, HEARTBEAT_MS);

      // Client disconnect
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
