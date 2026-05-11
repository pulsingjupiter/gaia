/**
 * Agent runner — spawns the Claude Code CLI for a given employee + skill,
 * parses its stream-json output, persists every event to SQLite, and
 * fans events out via a process-global EventEmitter so SSE consumers
 * can subscribe.
 *
 * The CLI is invoked with `--dangerously-skip-permissions` and runs with
 * the employee's agent_dir as cwd, so the agent reads its own CLAUDE.md
 * and skills/inbox by relative path.
 */
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

import {
  appendRunEvent,
  bumpThreadSessionTurn,
  canonicalThreadId,
  deleteThreadSession,
  getAgentSpendToday,
  getEmployee,
  getProject,
  getRun,
  getThreadSession,
  insertMessage,
  insertNotification,
  insertRun,
  listMessages,
  setEmployeeStatus,
  updateRun,
  upsertThreadSession,
  type EmployeeRow,
  type MessageRow,
  type ProjectRow,
  type RunRow,
  type RunEventType,
} from "./db.ts";

const CLAUDE_BIN = "/Users/adrian/.local/bin/claude";

// ---------------------------------------------------------------------------
// Event bus
// ---------------------------------------------------------------------------

/**
 * Global event bus. Emits the event name `runId` with payload {type, payload, ts}.
 * Also emits "run:any" with {runId, type, payload, ts}.
 *
 * Wave 2 SSE route should subscribe via subscribeToRun(runId) and stream events
 * to the client until a {type:'done'} event arrives.
 *
 * Pinned to globalThis so static + dynamic imports of this module (which
 * Next.js dev / Turbopack can resolve to different instances) share the same
 * EventEmitter. Without this, the notifier (booted via instrumentation) and
 * the API route handler (which calls startRun) end up holding different
 * `runEvents` objects — the route emits "done" on its copy, the notifier's
 * listener never fires, and the run-completed notification is silently
 * dropped. Mirrors the pattern in session-watcher.ts.
 */
const GLOBAL_RUN_BUS_KEY = "__gaia_run_bus__";
type GlobalWithRunBus = typeof globalThis & {
  [GLOBAL_RUN_BUS_KEY]?: EventEmitter;
};
const _globalAnyRun = globalThis as GlobalWithRunBus;
if (!_globalAnyRun[GLOBAL_RUN_BUS_KEY]) {
  const bus = new EventEmitter();
  bus.setMaxListeners(0); // many SSE clients possible
  _globalAnyRun[GLOBAL_RUN_BUS_KEY] = bus;
}
export const runEvents: EventEmitter = _globalAnyRun[GLOBAL_RUN_BUS_KEY]!;

export type RunBusEvent = {
  type: RunEventType | "done" | "started";
  payload: unknown;
  ts: number;
};

function emit(runId: string, ev: RunBusEvent): void {
  runEvents.emit(runId, ev);
  runEvents.emit("run:any", { runId, ...ev });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type StartRunArgs = {
  employeeId: string;
  skill: string;
  input?: string | null;
  threadId?: string | null;
  projectId?: string | null;
};

export type StartRunResult = {
  runId: string;
  run: RunRow;
  /** Resolves when the underlying process exits (success or failure). */
  done: Promise<RunRow>;
};

export async function startRun(args: StartRunArgs): Promise<StartRunResult> {
  const employee = getEmployee(args.employeeId);
  if (!employee) {
    throw new Error(`Unknown employee: ${args.employeeId}`);
  }

  const runId = randomUUID();
  const startedAt = Date.now();
  const input = args.input ?? null;
  const projectId = args.projectId ?? null;
  const threadIdRaw = args.threadId ?? null;

  // Per-agent daily cost cap. When the agent has a `daily_cost_cap_usd` set
  // and today's `success`-run spend has already met or exceeded it, refuse to
  // spawn the CLI. Insert a 'blocked' run row (so the run is still
  // observable in the activity log), notify the user via the system thread,
  // and — for chat skills — also drop a friendly reply in the user↔agent
  // thread so the user isn't left wondering why their message went silent.
  const cap = employee.daily_cost_cap_usd;
  if (cap != null && Number.isFinite(cap)) {
    const spent = getAgentSpendToday(employee.id);
    if (spent >= cap) {
      const blockedRun = insertRun({
        id: runId,
        employee_id: employee.id,
        skill: args.skill,
        input,
        status: "blocked",
        project_id: projectId,
      });
      // Mark the row terminal: ended_at = started_at, error message captures
      // why so the run-detail panel renders something useful.
      const errMsg = `Daily cost cap hit ($${spent.toFixed(2)} / $${cap.toFixed(2)}).`;
      updateRun(runId, {
        ended_at: startedAt,
        cost_usd: 0,
        duration_ms: 0,
        error: errMsg,
      });
      // Don't flip employee.status to 'error' — the agent itself is fine,
      // it just can't run more today. Leave whatever status they had.

      // System notification (visible in /api/notifications + system thread).
      const notifBody = `${employee.name} hit today's cost cap ($${spent.toFixed(2)}/$${cap.toFixed(2)}). Run skipped.`;
      try {
        insertNotification({
          sender_id: "system",
          body: notifBody,
          run_id: runId,
          metadata: {
            source: "run-failed",
            run_id: runId,
            cost_usd: 0,
            cap_usd: cap,
            spent_today_usd: spent,
            agent_id: employee.id,
            reason: "daily-cost-cap",
          },
        });
      } catch {
        // Best-effort — don't let notifier failures swallow the block.
      }

      // For chat runs, also post a regular agent reply so the user sees
      // something in the chat panel rather than dead air.
      if (args.skill === "chat" && threadIdRaw) {
        try {
          const threadParticipants = threadIdRaw.split(":");
          const userId =
            threadParticipants.find((p) => p !== employee.id) ?? "user";
          insertMessage({
            sender_id: employee.id,
            recipient_id: userId,
            body: "I've hit my daily cost cap and can't run right now. Lift the cap in Settings → Agents to continue.",
            run_id: runId,
            kind: "chat",
          });
        } catch {
          // best-effort
        }
      }

      // Emit a synthetic "started → done" pair so SSE consumers don't hang.
      emit(runId, {
        type: "system",
        payload: { event: "blocked", reason: "daily-cost-cap", cap_usd: cap, spent_today_usd: spent },
        ts: startedAt,
      });
      emit(runId, { type: "done", payload: { runId, status: "blocked" }, ts: Date.now() });

      const finalRun = getRun(runId)!;
      return {
        runId,
        run: blockedRun,
        done: Promise.resolve(finalRun),
      };
    }
  }

  const run = insertRun({
    id: runId,
    employee_id: employee.id,
    skill: args.skill,
    input,
    status: "running",
    project_id: projectId,
  });
  setEmployeeStatus(employee.id, "running");

  // Session-continuity decision. For chat threads we look up an existing
  // claude_session_id and pass `--resume` so the CLI re-attaches to its
  // cached session (no history re-upload, ~50–70% cheaper after turn 1).
  // Non-chat skills always run fresh.
  const threadId = args.threadId ?? null;
  const isChat = args.skill === "chat" && !!threadId;
  const existingSession = isChat ? getThreadSession(threadId!) : undefined;
  const resumeSessionId = existingSession?.claude_session_id ?? null;

  // Project-brief injection. When a projectId is provided, look up the project
  // and read its brief_markdown. The brief is injected at the TOP of the
  // wrapper prompt so the agent reads it before its persona instructions.
  //
  // For chat skills we only inject on the first turn (no resumeSessionId) —
  // the persistent CLI session already carries the brief from turn 1, so
  // re-injecting on every resume would duplicate tokens and defeat the point
  // of session continuity. For non-chat skills (one-shot runs) we always
  // inject when a brief exists.
  const project: ProjectRow | undefined = projectId
    ? getProject(projectId)
    : undefined;
  const includeBrief =
    !!project?.brief_markdown && project.brief_markdown.trim().length > 0;
  const briefForWrapper =
    includeBrief && (!isChat || !resumeSessionId) ? project! : null;

  // When --resume is used we drop the conversation-history block from the
  // wrapper (Claude already has it). Without resume (first turn / non-chat)
  // we keep the existing wrapper shape.
  const wrapperPrompt = buildWrapperPrompt({
    employee,
    skill: args.skill,
    input,
    threadId,
    skipHistory: !!resumeSessionId,
    project: briefForWrapper,
  });

  emit(runId, { type: "system", payload: { event: "started" }, ts: startedAt });

  const done = new Promise<RunRow>((resolve) => {
    spawnAndPipe({
      runId,
      employee,
      wrapperPrompt,
      threadId,
      isChat,
      resumeSessionId,
      projectId,
      onExit: (finalRun) => resolve(finalRun),
    });
  });

  return { runId, run, done };
}

/**
 * Async iterator over events for a given run. Stops after the 'done' event.
 * Useful for SSE handlers in Wave 2 routes.
 */
export async function* subscribeToRun(
  runId: string,
): AsyncGenerator<RunBusEvent, void, void> {
  const queue: RunBusEvent[] = [];
  let resolveNext: (() => void) | null = null;
  let stopped = false;

  const handler = (ev: RunBusEvent) => {
    queue.push(ev);
    if (resolveNext) {
      resolveNext();
      resolveNext = null;
    }
  };

  runEvents.on(runId, handler);

  try {
    while (!stopped) {
      while (queue.length > 0) {
        const ev = queue.shift()!;
        yield ev;
        if (ev.type === "done") {
          stopped = true;
          break;
        }
      }
      if (stopped) break;
      await new Promise<void>((r) => {
        resolveNext = r;
      });
    }
  } finally {
    runEvents.off(runId, handler);
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function buildWrapperPrompt(args: {
  employee: EmployeeRow;
  skill: string;
  input: string | null;
  threadId: string | null;
  skipHistory?: boolean;
  project?: ProjectRow | null;
}): string {
  const { employee, skill, input, threadId, skipHistory, project } = args;

  // Project-context block. When the run is scoped to a project that has a
  // brief, prepend it ABOVE the persona instructions so the agent reads the
  // project context first. Empty briefs are skipped silently.
  const projectBlock = formatProjectBrief(project);

  // For chat skill with a thread, inject recent conversation history so the
  // agent has memory across turns. Without this, every spawn is a goldfish:
  // the wrapper prompt only carries the latest input, so the agent
  // re-introduces itself every message.
  //
  // When `skipHistory` is true we are about to invoke the CLI with --resume
  // <claude_session_id>. The CLI's cached session already holds the full
  // conversation, so re-injecting our own history block would just duplicate
  // tokens and defeat the point of session continuity. The wrapper collapses
  // to the latest input + minimal guardrails.
  if (skill === "chat" && threadId) {
    const history = skipHistory
      ? ""
      : formatChatHistory({
          threadId,
          agentName: employee.name,
          latestInput: input,
        });
    return [
      ...(projectBlock ? [projectBlock, ``] : []),
      `You are ${employee.name}. Read your CLAUDE.md for your persona and role.`,
      `Skill to execute: ${skill}`,
      ``,
      ...(history ? [history, ``] : []),
      `Latest message from user:`,
      input && input.trim() ? input : "(none)",
      ``,
      `Before responding:`,
      `- Don't re-introduce yourself; the user already knows who you are.`,
      `- Don't ask "what do you need" if context shows you're mid-task.`,
      `- Build on the prior turns naturally — reference details the user has shared.`,
      `- Keep responses concise.`,
      ``,
      `Skill description is in .claude/skills/${skill}/SKILL.md if it exists.`,
      ``,
      `Produce a concise final result for the user.`,
    ].join("\n");
  }

  return [
    ...(projectBlock ? [projectBlock, ``] : []),
    `You are ${employee.name}. Read your CLAUDE.md for your persona and role.`,
    `Skill to execute: ${skill}`,
    `Input: ${input && input.trim() ? input : "(none)"}`,
    ``,
    `Before working, check your inbox for unread messages addressed to you (read the file \`inbox.json\` in your agent dir).`,
    `After working, you may write up to 3 messages to other agents by appending to \`inbox.json\` in the format { "to": "<agent_id>", "from": "<your_id>", "body": "..." }.`,
    ``,
    `Skill description is in .claude/skills/${skill}/SKILL.md if it exists.`,
    ``,
    `Produce a concise final result for the user.`,
  ].join("\n");
}

/**
 * Render the project brief as a wrapper-prompt block. Returns "" when there's
 * no project or no brief. The block is intentionally framed as supplementary
 * context (not a replacement for the agent's CLAUDE.md persona).
 */
function formatProjectBrief(project: ProjectRow | null | undefined): string {
  if (!project) return "";
  const brief = (project.brief_markdown ?? "").trim();
  if (!brief) return "";
  return [
    `Project context — ${project.name}:`,
    brief,
    ``,
    `(End of project context.)`,
  ].join("\n");
}

/**
 * Pull the most recent chat messages from a thread and format them for the
 * wrapper prompt. Filters out notifications, empty bodies, and messages older
 * than 24h. Drops the trailing user message that matches `latestInput` (the
 * just-inserted message that triggered this run) so we don't duplicate it.
 *
 * Returns an empty string when no usable history is available.
 */
function formatChatHistory(args: {
  threadId: string;
  agentName: string;
  latestInput: string | null;
}): string {
  const { threadId, agentName, latestInput } = args;
  const HISTORY_LIMIT = 10;
  const MAX_BODY_CHARS = 500;
  const TRUNCATE_TO = 400;
  const MAX_AGE_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();

  // Pull a generous window so filters/dedupe still leave us with HISTORY_LIMIT.
  let raw: MessageRow[];
  try {
    raw = listMessages(threadId, HISTORY_LIMIT * 4);
  } catch {
    return "";
  }

  // Apply filters: chat-kind only, non-empty body, within 24h.
  const filtered = raw.filter((m) => {
    if (m.kind === "notification") return false;
    if (!m.body || !m.body.trim()) return false;
    if (now - m.created_at > MAX_AGE_MS) return false;
    return true;
  });

  if (filtered.length === 0) return "";

  // Drop the trailing user message if it matches the latest input — that's
  // the just-inserted message that triggered this run; it'll be rendered
  // separately as "Latest message from user".
  const trimmed = [...filtered];
  const trimInput = (latestInput ?? "").trim();
  while (trimmed.length > 0) {
    const tail = trimmed[trimmed.length - 1]!;
    if (tail.sender_id === "user" && tail.body.trim() === trimInput) {
      trimmed.pop();
      continue;
    }
    break;
  }

  if (trimmed.length === 0) return "";

  // Cap to the most recent HISTORY_LIMIT entries.
  const window = trimmed.slice(-HISTORY_LIMIT);

  const lines: string[] = ["Recent conversation (most recent last):"];
  for (const m of window) {
    let body = m.body.trim();
    if (body.length > MAX_BODY_CHARS) {
      body = body.slice(0, TRUNCATE_TO) + "…";
    }
    const speaker =
      m.sender_id === "user" ? "User" : `You (${agentName})`;
    lines.push(`${speaker}: ${body}`);
  }
  return lines.join("\n");
}

/**
 * Heuristic — is the stderr/error from this CLI exit consistent with a
 * stale --resume target (the session_id we passed no longer exists)?
 *
 * The CLI doesn't emit a structured error code for this; we sniff the
 * stderr string. Conservative match — only triggers on phrases that
 * clearly indicate the session can't be resumed.
 */
function isStaleResumeError(stderr: string, errorMsg: string | null): boolean {
  const hay = `${stderr}\n${errorMsg ?? ""}`.toLowerCase();
  return (
    hay.includes("session not found") ||
    hay.includes("no session") ||
    hay.includes("could not find session") ||
    hay.includes("invalid session") ||
    hay.includes("failed to load session") ||
    hay.includes("unable to resume")
  );
}

type SpawnArgs = {
  runId: string;
  employee: EmployeeRow;
  wrapperPrompt: string;
  threadId: string | null;
  isChat: boolean;
  resumeSessionId: string | null;
  projectId: string | null;
  onExit: (run: RunRow) => void;
};

function spawnAndPipe(args: SpawnArgs): void {
  spawnAttempt(args, /* isRetry */ false);
}

function spawnAttempt(args: SpawnArgs, isRetry: boolean): void {
  const {
    runId,
    employee,
    wrapperPrompt,
    threadId,
    isChat,
    resumeSessionId,
    projectId,
    onExit,
  } = args;

  // Track the session_id we observe in this attempt's stream — used both
  // for the first-turn upsert (when we had no resumeSessionId) and as a
  // sanity-check when --resume was passed (CLI echoes the same id back).
  let observedSessionId: string | null = null;

  const cliArgs: string[] = [];
  if (resumeSessionId) {
    cliArgs.push("--resume", resumeSessionId);
  }
  cliArgs.push(
    "-p",
    wrapperPrompt,
    "--dangerously-skip-permissions",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose",
  );

  let child: ChildProcessByStdio<null, Readable, Readable>;
  try {
    child = spawn(CLAUDE_BIN, cliArgs, {
      cwd: employee.agent_dir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    finalize(runId, employee.id, "error", msg, 0, null);
    onExit(getRunOrThrow(runId));
    return;
  }

  let stdoutBuf = "";
  let stderrBuf = "";
  let totalCostUsd = 0;
  let resultText: string | null = null;
  let cliDurationMs: number | null = null;
  let sawError = false;
  let errorMsg: string | null = null;

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  const captureSessionIdFrom = (obj: any): void => {
    // The CLI emits an early `{"type":"system","subtype":"init",...,"session_id":"<uuid>",...}`
    // event. Hook events also carry session_id but init is the canonical one.
    if (
      observedSessionId == null &&
      obj &&
      typeof obj === "object" &&
      obj.type === "system" &&
      obj.subtype === "init" &&
      typeof obj.session_id === "string" &&
      obj.session_id.length > 0
    ) {
      observedSessionId = obj.session_id;
    }
  };

  child.stdout.on("data", (chunk: string) => {
    stdoutBuf += chunk;
    let nl: number;
    while ((nl = stdoutBuf.indexOf("\n")) >= 0) {
      const line = stdoutBuf.slice(0, nl).trim();
      stdoutBuf = stdoutBuf.slice(nl + 1);
      if (!line) continue;

      let parsed: any;
      try {
        parsed = JSON.parse(line);
      } catch {
        // Non-JSON line — store as raw system event.
        const ev = appendRunEvent({
          run_id: runId,
          type: "system",
          payload: { raw: line },
        });
        emit(runId, {
          type: "system",
          payload: { raw: line },
          ts: ev.ts,
        });
        continue;
      }

      captureSessionIdFrom(parsed);

      handleStreamObject(runId, parsed, {
        onCost: (c) => {
          totalCostUsd = c;
        },
        onResult: (r) => {
          resultText = r.result ?? null;
          if (typeof r.duration_ms === "number") cliDurationMs = r.duration_ms;
          if (typeof r.total_cost_usd === "number")
            totalCostUsd = r.total_cost_usd;
          if (r.is_error) {
            sawError = true;
            errorMsg = r.result ?? "result.is_error=true";
          }
        },
      });
    }
  });

  child.stderr.on("data", (chunk: string) => {
    stderrBuf += chunk;
    const ev = appendRunEvent({
      run_id: runId,
      type: "error",
      payload: { stderr: chunk },
    });
    emit(runId, { type: "error", payload: { stderr: chunk }, ts: ev.ts });
  });

  child.on("error", (err) => {
    sawError = true;
    errorMsg = err.message;
    const ev = appendRunEvent({
      run_id: runId,
      type: "error",
      payload: { spawn_error: err.message },
    });
    emit(runId, {
      type: "error",
      payload: { spawn_error: err.message },
      ts: ev.ts,
    });
  });

  child.on("close", (code) => {
    // Drain any trailing buffered line.
    if (stdoutBuf.trim()) {
      try {
        const parsed = JSON.parse(stdoutBuf.trim());
        captureSessionIdFrom(parsed);
        handleStreamObject(runId, parsed, {
          onCost: (c) => {
            totalCostUsd = c;
          },
          onResult: (r) => {
            resultText = r.result ?? null;
            if (typeof r.duration_ms === "number")
              cliDurationMs = r.duration_ms;
            if (typeof r.total_cost_usd === "number")
              totalCostUsd = r.total_cost_usd;
          },
        });
      } catch {
        // ignore
      }
    }

    const exitedOk = code === 0 && !sawError;
    const status: "success" | "error" = exitedOk ? "success" : "error";

    // Stale-session retry: if we tried to --resume a stored session_id and
    // the CLI bailed out, drop the dead row and retry once with a fresh
    // session. We rebuild the wrapper prompt (with full history) since the
    // new session has no memory.
    if (
      !exitedOk &&
      !isRetry &&
      isChat &&
      threadId &&
      resumeSessionId &&
      isStaleResumeError(stderrBuf, errorMsg)
    ) {
      deleteThreadSession(threadId);
      const ev = appendRunEvent({
        run_id: runId,
        type: "system",
        payload: {
          event: "stale-session-retry",
          dropped_session_id: resumeSessionId,
        },
      });
      emit(runId, {
        type: "system",
        payload: {
          event: "stale-session-retry",
          dropped_session_id: resumeSessionId,
        },
        ts: ev.ts,
      });
      // Rebuild the wrapper with full history (skipHistory=false) — the
      // fresh session has no memory of prior turns. Re-include the project
      // brief if the run is project-scoped — the new session won't have it
      // either.
      const retryProject = projectId ? getProject(projectId) : undefined;
      const retryProjectForWrapper =
        retryProject?.brief_markdown && retryProject.brief_markdown.trim()
          ? retryProject
          : null;
      const freshPrompt = buildWrapperPrompt({
        employee,
        skill: "chat",
        input: extractLatestInputFromRun(runId),
        threadId,
        skipHistory: false,
        project: retryProjectForWrapper,
      });
      spawnAttempt(
        {
          runId,
          employee,
          wrapperPrompt: freshPrompt,
          threadId,
          isChat,
          resumeSessionId: null,
          projectId,
          onExit,
        },
        /* isRetry */ true,
      );
      return;
    }

    const wallMs = Date.now() - getStartedAt(runId);
    const durationMs = cliDurationMs ?? wallMs;

    // Persist session continuity state. For chat threads:
    //   - First turn (no prior session): insert fresh row with the session_id
    //     we just observed in the stream.
    //   - Subsequent turn (resume succeeded): bump turn_count + last_used_at.
    //   - Retry-after-stale (we deleted the row above): the second attempt
    //     ran without --resume, captured a new session_id — upsert it.
    if (status === "success" && isChat && threadId) {
      if (resumeSessionId) {
        bumpThreadSessionTurn(threadId);
      } else if (observedSessionId) {
        upsertThreadSession({
          thread_id: threadId,
          claude_session_id: observedSessionId,
          agent_id: employee.id,
        });
      }
    }

    finalize(
      runId,
      employee.id,
      status,
      sawError
        ? errorMsg ?? (stderrBuf.trim() || `exit code ${code}`)
        : null,
      totalCostUsd,
      durationMs,
      resultText,
    );

    const ev = appendRunEvent({
      run_id: runId,
      type: "result",
      payload: {
        status,
        exit_code: code,
        cost_usd: totalCostUsd,
        duration_ms: durationMs,
        result: resultText,
      },
    });
    emit(runId, {
      type: "result",
      payload: {
        status,
        exit_code: code,
        cost_usd: totalCostUsd,
        duration_ms: durationMs,
        result: resultText,
      },
      ts: ev.ts,
    });
    emit(runId, { type: "done", payload: { runId, status }, ts: Date.now() });

    onExit(getRunOrThrow(runId));
  });
}

/**
 * Pulled the run's `input` field for use in the stale-session retry path.
 * Ensures the rebuilt wrapper prompt carries the same latest user message
 * we tried to send in the failed first attempt.
 */
function extractLatestInputFromRun(runId: string): string | null {
  return getRun(runId)?.input ?? null;
}

// `canonicalThreadId` is re-exported so callers needing to compute thread_id
// don't have to import db.ts directly. (Currently unused inside this module
// but kept on the imports for symmetry with future call sites.)
void canonicalThreadId;

function handleStreamObject(
  runId: string,
  obj: any,
  cb: {
    onCost: (c: number) => void;
    onResult: (r: any) => void;
  },
): void {
  // Map claude stream-json types into our compact RunEventType set.
  // Persist the full object as payload; the UI can drill in if it wants.
  const t = obj?.type as string | undefined;

  let evType: RunEventType = "system";
  let payload: unknown = obj;

  if (t === "system") {
    evType = "system";
  } else if (t === "stream_event") {
    // Partial deltas — keep as-is. Tagged 'system' so we don't pollute the
    // assistant_text stream with partial signatures.
    evType = "system";
  } else if (t === "assistant") {
    // Full assistant message — extract text/tool_use blocks.
    const blocks: any[] = obj?.message?.content ?? [];
    for (const block of blocks) {
      if (block.type === "text" && typeof block.text === "string") {
        const ev = appendRunEvent({
          run_id: runId,
          type: "assistant_text",
          payload: { text: block.text },
        });
        emit(runId, {
          type: "assistant_text",
          payload: { text: block.text },
          ts: ev.ts,
        });
      } else if (block.type === "tool_use") {
        const ev = appendRunEvent({
          run_id: runId,
          type: "tool_use",
          payload: {
            id: block.id,
            name: block.name,
            input: block.input,
          },
        });
        emit(runId, {
          type: "tool_use",
          payload: { id: block.id, name: block.name, input: block.input },
          ts: ev.ts,
        });
      } else if (block.type === "thinking") {
        const ev = appendRunEvent({
          run_id: runId,
          type: "system",
          payload: { thinking: true },
        });
        emit(runId, {
          type: "system",
          payload: { thinking: true },
          ts: ev.ts,
        });
      }
    }
    return; // already persisted block-by-block
  } else if (t === "user") {
    // tool_result messages from CLI tool execution.
    const blocks: any[] = obj?.message?.content ?? [];
    for (const block of blocks) {
      if (block.type === "tool_result") {
        const ev = appendRunEvent({
          run_id: runId,
          type: "tool_result",
          payload: {
            tool_use_id: block.tool_use_id,
            is_error: block.is_error,
            content: block.content,
          },
        });
        emit(runId, {
          type: "tool_result",
          payload: {
            tool_use_id: block.tool_use_id,
            is_error: block.is_error,
            content: block.content,
          },
          ts: ev.ts,
        });
      }
    }
    return;
  } else if (t === "result") {
    cb.onResult(obj);
    // We persist a "result" event later in the close handler with our
    // canonical shape. Skip the raw result here.
    return;
  } else if (t === "rate_limit_event") {
    evType = "system";
  } else if (t === undefined) {
    evType = "system";
  }

  const ev = appendRunEvent({ run_id: runId, type: evType, payload });
  emit(runId, { type: evType, payload, ts: ev.ts });
}

function finalize(
  runId: string,
  employeeId: string,
  status: "success" | "error",
  error: string | null,
  costUsd: number,
  durationMs: number | null,
  resultSummary?: string | null,
): void {
  updateRun(runId, {
    status,
    ended_at: Date.now(),
    cost_usd: costUsd,
    duration_ms: durationMs,
    result_summary: resultSummary ?? null,
    error,
  });
  setEmployeeStatus(employeeId, status === "error" ? "error" : "idle");
}

function getStartedAt(runId: string): number {
  const r = getRunOrThrow(runId);
  return r.started_at;
}

function getRunOrThrow(runId: string): RunRow {
  const r = getRun(runId);
  if (!r) throw new Error(`Run not found: ${runId}`);
  return r;
}
