/**
 * GET /api/runs/stream  → SSE — global activity feed across all runs.
 *
 * Subscribes to `run:any` on the runner's EventEmitter. Each frame:
 *   event: <type>
 *   data: <JSON of {run_id, ts, payload}>
 *
 * Heartbeat every 15s. Stays open until client disconnects.
 *
 * Wave 2A.
 */
import { runEvents, type RunBusEvent } from "@/server/agent-runner.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;

type AnyEvent = RunBusEvent & { runId: string };

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

      const onAny = (ev: AnyEvent) => {
        safeEnqueue(
          sseFrame(ev.type, {
            run_id: ev.runId,
            ts: ev.ts,
            payload: ev.payload,
          }),
        );
      };

      runEvents.on("run:any", onAny);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        runEvents.off("run:any", onAny);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      // Initial comment so clients know the stream is live.
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
