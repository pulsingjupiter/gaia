/**
 * GET /api/inter-agent-messages              → { threads: InterAgentThreadSummary[] }
 * GET /api/inter-agent-messages?thread=<id>  → { thread, messages: InterAgentMessage[] }
 *
 * Wave 2D — surfaces the contents of every `agents/<slug>/inbox.json` as a
 * read-only "agent ↔ agent" thread list. Inbox files are written by agents
 * via the `<<<MESSAGE>>>` marker convention (Wave 1C); we never insert here.
 *
 * Inbox entries are unkeyed — we synthesise message ids as `${from}:${ts}`.
 *
 * Caching: results are cached in-process for 5s to keep this endpoint cheap
 * when the conversations page polls it on its 8s cadence.
 */
import path from "node:path";
import fs from "node:fs/promises";
import type { NextRequest } from "next/server";

import { listEmployees, PATHS } from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RawInboxEntry = {
  from?: unknown;
  to?: unknown;
  from_name?: unknown;
  body?: unknown;
  run_id?: unknown;
  received_at?: unknown;
};

type InterAgentMessage = {
  id: string;
  from: string;
  from_name: string | null;
  body: string;
  run_id: string | null;
  received_at: number; // epoch ms
};

type InterAgentThreadSummary = {
  thread_id: string;
  participants: [string, string];
  message_count: number;
  last_message_preview: string;
  last_message_at: number;
  last_from: string;
  is_inter_agent: true;
};

type CollectedMessage = InterAgentMessage & {
  thread_id: string;
  /** the inbox-owner — i.e. the recipient. Used so we can recover both ends. */
  to: string;
};

// ---------------------------------------------------------------------------
// Cache (5s)
// ---------------------------------------------------------------------------

type Snapshot = {
  threads: InterAgentThreadSummary[];
  byThread: Map<string, InterAgentMessage[]>;
  participantsByThread: Map<string, [string, string]>;
};

const CACHE_TTL_MS = 5_000;
let cache: { at: number; snap: Snapshot } | null = null;

function badRequest(msg: string): Response {
  return Response.json({ error: msg }, { status: 400 });
}

function previewOf(body: string, max = 120): string {
  const trimmed = body.replace(/\s+/g, " ").trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function parseTimestamp(v: unknown): number | null {
  if (typeof v !== "string" || !v) return null;
  const ms = Date.parse(v);
  if (Number.isNaN(ms)) return null;
  return ms;
}

function threadIdFor(a: string, b: string): string {
  return [a, b].sort().join(":");
}

// ---------------------------------------------------------------------------
// Snapshot builder
// ---------------------------------------------------------------------------

async function buildSnapshot(): Promise<Snapshot> {
  // Real, non-system employees (skip the `system` pseudo-agent + any
  // internal-only rows that don't represent actual agent dirs).
  const employees = listEmployees().filter(
    (e) => e.id !== "system" && e.internal_only !== 1,
  );
  const employeeIds = new Set(employees.map((e) => e.id));
  const nameById = new Map(employees.map((e) => [e.id, e.name] as const));

  const collected: CollectedMessage[] = [];

  for (const e of employees) {
    const inboxPath = path.join(e.agent_dir, "inbox.json");
    let raw: string;
    try {
      raw = await fs.readFile(inboxPath, "utf8");
    } catch {
      // No inbox file — skip silently.
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[inter-agent-messages] malformed inbox.json for ${e.id}: ${msg}`,
      );
      continue;
    }
    if (!Array.isArray(parsed)) {
      console.warn(
        `[inter-agent-messages] inbox.json for ${e.id} is not an array — skipping`,
      );
      continue;
    }

    for (const entry of parsed as RawInboxEntry[]) {
      if (!entry || typeof entry !== "object") continue;
      const from = asString(entry.from);
      const body = asString(entry.body);
      if (!from || body == null) continue;
      if (!employeeIds.has(from)) {
        console.warn(
          `[inter-agent-messages] ${e.id}/inbox.json entry has unknown from='${from}' — skipping`,
        );
        continue;
      }
      if (from === e.id) continue; // self-message — ignore
      const ts =
        parseTimestamp(entry.received_at) ?? Date.now(); // fall back to "now" for legacy entries
      const fromName = asString(entry.from_name) ?? nameById.get(from) ?? null;
      const runId = asString(entry.run_id);
      const tid = threadIdFor(from, e.id);
      collected.push({
        id: `${from}:${ts}`,
        thread_id: tid,
        from,
        to: e.id,
        from_name: fromName,
        body,
        run_id: runId,
        received_at: ts,
      });
    }
  }

  // Group + sort.
  const byThread = new Map<string, InterAgentMessage[]>();
  const participantsByThread = new Map<string, [string, string]>();
  for (const m of collected) {
    const list = byThread.get(m.thread_id) ?? [];
    list.push({
      id: m.id,
      from: m.from,
      from_name: m.from_name,
      body: m.body,
      run_id: m.run_id,
      received_at: m.received_at,
    });
    byThread.set(m.thread_id, list);
    if (!participantsByThread.has(m.thread_id)) {
      const pair = [m.from, m.to].sort() as [string, string];
      participantsByThread.set(m.thread_id, pair);
    }
  }
  for (const list of byThread.values()) {
    list.sort((a, b) => a.received_at - b.received_at);
  }

  const threads: InterAgentThreadSummary[] = [];
  for (const [tid, msgs] of byThread.entries()) {
    if (msgs.length === 0) continue;
    const participants = participantsByThread.get(tid)!;
    // Both must still exist.
    if (!employeeIds.has(participants[0]) || !employeeIds.has(participants[1])) {
      continue;
    }
    const last = msgs[msgs.length - 1]!;
    threads.push({
      thread_id: tid,
      participants,
      message_count: msgs.length,
      last_message_preview: previewOf(last.body),
      last_message_at: last.received_at,
      last_from: last.from,
      is_inter_agent: true,
    });
  }

  threads.sort((a, b) => b.last_message_at - a.last_message_at);

  return { threads, byThread, participantsByThread };
}

async function getSnapshot(): Promise<Snapshot> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.snap;
  const snap = await buildSnapshot();
  cache = { at: now, snap };
  return snap;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<Response> {
  ensureSeeded();
  const sp = request.nextUrl.searchParams;
  const threadId = sp.get("thread");

  let snap: Snapshot;
  try {
    snap = await getSnapshot();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `failed to read inboxes: ${msg}` },
      { status: 500 },
    );
  }

  if (threadId) {
    const messages = snap.byThread.get(threadId);
    const participants = snap.participantsByThread.get(threadId);
    if (!messages || !participants) {
      return badRequest(`unknown thread '${threadId}'`);
    }
    return Response.json({
      thread: { thread_id: threadId, participants },
      messages,
    });
  }

  return Response.json({ threads: snap.threads });
}
