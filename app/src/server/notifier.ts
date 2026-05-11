/**
 * Notifier service.
 *
 * Listens to:
 *   - runEvents (agent-runner) → on run completion, insert a notification
 *     into the user↔agent thread.
 *   - sessionEvents (session-watcher) → for transcript activity events. The
 *     watcher does not currently emit a discrete `'session:ended'` event, so
 *     we detect end-of-session transitions by polling the DB at the same
 *     cadence as the watcher's status sweep (60s).
 *
 * Idempotent boot: guarded via globalThis.__gaia_notifier_started__ so a
 * second `startNotifier()` call from a hot-reloaded module is a no-op.
 */
import path from "node:path";
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { runEvents, type RunBusEvent } from "./agent-runner.ts";
import {
  PATHS,
  ensureSystemEmployee,
  getEmployee,
  getProject,
  getRun,
  getSession,
  insertApproval,
  insertNotification,
  listApprovals,
  listSessions,
  type EmployeeRow,
  type RunRow,
  type SessionRow,
} from "./db.ts";

// Track which run IDs have already had inbox messages dispatched. The dashboard
// notification carries metadata.run_id but we keep an in-memory set as a fast
// path so a re-emitted `done` event becomes a no-op without touching the DB.
const _inboxMessagesDispatched = new Set<string>();

const GLOBAL_KEY = "__gaia_notifier_started__";
type GlobalWithFlag = typeof globalThis & { [GLOBAL_KEY]?: boolean };

const SESSION_END_POLL_MS = 60 * 1000;

// Session IDs we've already created end-notifications for. Persists for the
// lifetime of the process; on cold start we seed it from the DB so we don't
// spam notifications for sessions that ended pre-boot.
const _notifiedSessionEnds = new Set<string>();

function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 100) / 10;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = Math.round(s - m * 60);
  return rs > 0 ? `${m}m ${rs}s` : `${m}m`;
}

function formatCost(usd: number | null | undefined): string {
  if (!usd || usd <= 0) return "$0";
  if (usd < 0.01) return `<$0.01`;
  return `$${usd.toFixed(2)}`;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}

// ---- Approval marker parser ----
//
// Agents may append blocks of the form:
//
//   <<<APPROVAL>>>
//   action_type: send_email
//   title: Send draft to mom@example.com
//   body: |
//     Subject: Lunch tomorrow
//
//     Hey Mom — confirming 12pm at the usual spot.
//   <<<END_APPROVAL>>>
//
// to indicate that an action should be queued for user approval. Multiple
// blocks per response are allowed. Blocks that fail to parse are skipped
// (logged, never thrown) so a malformed block can't take down the run.

export type ParsedApprovalBlock = {
  action_type: string;
  title: string;
  body: string | null;
};

const APPROVAL_BLOCK_RE =
  /<<<APPROVAL>>>([\s\S]*?)<<<END_APPROVAL>>>/g;

export function parseApprovalBlocks(text: string): ParsedApprovalBlock[] {
  if (!text) return [];
  const out: ParsedApprovalBlock[] = [];
  const matches = text.matchAll(APPROVAL_BLOCK_RE);
  for (const m of matches) {
    const raw = m[1] ?? "";
    const parsed = parseSingleBlock(raw);
    if (parsed) out.push(parsed);
    else console.warn("[notifier] skipped malformed APPROVAL block");
  }
  return out;
}

function parseSingleBlock(raw: string): ParsedApprovalBlock | null {
  // Tolerant line-oriented parser. Supports:
  //   action_type: <value>
  //   title: <value>
  //   body: <single-line value>
  //   body: |
  //     <indented block until next top-level key or end>
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  let action_type: string | null = null;
  let title: string | null = null;
  let body: string | null = null;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const stripped = line.trim();
    if (!stripped) {
      i++;
      continue;
    }
    const kv = /^\s*([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) {
      i++;
      continue;
    }
    const key = kv[1].toLowerCase();
    const value = kv[2];

    if (key === "action_type") {
      action_type = value.trim();
      i++;
    } else if (key === "title") {
      title = value.trim();
      i++;
    } else if (key === "body") {
      if (value.trim() === "|" || value.trim() === ">") {
        // Block scalar — collect indented lines until we hit a non-indented
        // top-level key or run out.
        i++;
        const collected: string[] = [];
        // Determine baseline indent from the first non-empty content line.
        let baseIndent: number | null = null;
        while (i < lines.length) {
          const cur = lines[i];
          if (cur.trim() === "") {
            collected.push("");
            i++;
            continue;
          }
          const indentMatch = /^(\s*)/.exec(cur);
          const indent = indentMatch ? indentMatch[1].length : 0;
          if (baseIndent === null) {
            if (indent === 0) break; // not actually indented; stop
            baseIndent = indent;
          }
          if (indent < (baseIndent ?? 0)) break;
          collected.push(cur.slice(baseIndent ?? 0));
          i++;
        }
        // Trim trailing empty lines.
        while (collected.length && collected[collected.length - 1] === "") {
          collected.pop();
        }
        body = collected.join("\n");
      } else {
        body = value.trim();
        i++;
      }
    } else {
      // Unknown key — skip.
      i++;
    }
  }

  if (!action_type || !title) return null;
  return {
    action_type: action_type.slice(0, 100),
    title: title.slice(0, 200),
    body: body && body.length ? body : null,
  };
}

// ---- Inbox message marker parser ----
//
// Agents may append blocks of the form:
//
//   <<<MESSAGE to="atlas">>>
//   Hey Atlas, can you do a quick deep-dive on Singapore cold-brew? Thanks.
//   <<<END_MESSAGE>>>
//
// to hand work to another agent. The recipient picks the message up the next
// time they run (their wrapper prompt instructs them to read inbox.json).
// Multiple blocks per response = multiple deliveries. Malformed blocks are
// logged and skipped — never throw.

export type ParsedInboxMessage = {
  to: string;
  body: string;
};

const INBOX_MESSAGE_BLOCK_RE =
  /<<<MESSAGE\b([^>]*)>>>([\s\S]*?)<<<END_MESSAGE>>>/g;

export function parseInboxMessages(text: string): ParsedInboxMessage[] {
  if (!text) return [];
  const out: ParsedInboxMessage[] = [];
  const matches = text.matchAll(INBOX_MESSAGE_BLOCK_RE);
  for (const m of matches) {
    const attrsRaw = m[1] ?? "";
    const body = (m[2] ?? "").trim();
    // Tolerant attribute extraction. We only care about `to=`; unknown attrs
    // are ignored. Quotes optional, single or double.
    const toMatch =
      /\bto\s*=\s*"([^"]+)"/i.exec(attrsRaw) ||
      /\bto\s*=\s*'([^']+)'/i.exec(attrsRaw) ||
      /\bto\s*=\s*([A-Za-z0-9_\-]+)/i.exec(attrsRaw);
    if (!toMatch) {
      console.warn("[notifier] skipped MESSAGE block — missing to= attr");
      continue;
    }
    const to = toMatch[1].trim();
    if (!to || !body) {
      console.warn("[notifier] skipped MESSAGE block — empty to/body");
      continue;
    }
    out.push({ to, body });
  }
  return out;
}

type InboxEntry = {
  from: string;
  from_name: string;
  body: string;
  run_id: string;
  received_at: string;
};

function inboxPathFor(agentDir: string): string {
  return path.join(agentDir, "inbox.json");
}

function readInboxArray(inboxPath: string): InboxEntry[] {
  try {
    const raw = fs.readFileSync(inboxPath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as InboxEntry[];
    console.warn(`[notifier] inbox.json not an array, resetting: ${inboxPath}`);
    return [];
  } catch (err) {
    // Missing file or invalid JSON → start fresh.
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.warn(`[notifier] inbox.json read failed (${inboxPath}):`, err);
    }
    return [];
  }
}

function writeInboxArrayAtomic(
  inboxPath: string,
  entries: InboxEntry[],
): void {
  fs.mkdirSync(path.dirname(inboxPath), { recursive: true });
  const tmp = `${inboxPath}.${randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(entries, null, 2)}\n`, {
    encoding: "utf8",
  });
  fs.renameSync(tmp, inboxPath);
}

export function maybeWriteInboxMessages(
  run: RunRow,
  sender: EmployeeRow,
): number {
  const text = run.result_summary ?? "";
  if (!text || !text.includes("<<<MESSAGE")) return 0;

  if (_inboxMessagesDispatched.has(run.id)) return 0;

  const blocks = parseInboxMessages(text);
  if (blocks.length === 0) return 0;

  let delivered = 0;
  for (const b of blocks) {
    const recipient = getEmployee(b.to);
    if (!recipient) {
      console.warn(
        `[notifier] inbox message dropped — unknown recipient '${b.to}' (run ${run.id})`,
      );
      continue;
    }
    if (recipient.id === sender.id) {
      console.warn(
        `[notifier] inbox message dropped — sender == recipient '${sender.id}' (run ${run.id})`,
      );
      continue;
    }
    const inboxPath = inboxPathFor(recipient.agent_dir);
    try {
      const existing = readInboxArray(inboxPath);
      const entry: InboxEntry = {
        from: sender.id,
        from_name: sender.name,
        body: b.body,
        run_id: run.id,
        received_at: new Date().toISOString(),
      };
      existing.push(entry);
      writeInboxArrayAtomic(inboxPath, existing);
      delivered += 1;
    } catch (err) {
      console.error(
        `[notifier] inbox.json write failed for ${recipient.id}`,
        err,
      );
      continue;
    }

    // Dashboard notification — visible in the user's view of the sender.
    try {
      const preview = truncate(b.body.replace(/\s+/g, " "), 140);
      insertNotification({
        sender_id: sender.id,
        body: `${sender.name} → ${recipient.name}: ${preview}`,
        run_id: run.id,
        metadata: {
          source: "inter-agent-message",
          run_id: run.id,
          from: sender.id,
          to: recipient.id,
          body: b.body,
        },
      });
    } catch (err) {
      console.error("[notifier] inter-agent notification failed", err);
    }
  }

  if (delivered > 0) {
    _inboxMessagesDispatched.add(run.id);
    console.log(
      `[notifier] dispatched ${delivered} inbox message(s) from run ${run.id}`,
    );
  }
  return delivered;
}

export function startNotifier(): void {
  const _g = globalThis as GlobalWithFlag;
  if (_g[GLOBAL_KEY]) return;
  _g[GLOBAL_KEY] = true;

  // Make sure the 'system' pseudo-employee exists so session-ended
  // notifications have a valid sender_id.
  try {
    ensureSystemEmployee();
  } catch (err) {
    console.error("[notifier] ensureSystemEmployee failed", err);
  }

  // Seed the dedupe set with sessions already in 'ended' status, so we don't
  // re-notify on cold boot.
  try {
    for (const s of listSessions({ status: "ended", limit: 500 })) {
      _notifiedSessionEnds.add(s.id);
    }
  } catch (err) {
    console.error("[notifier] seed dedupe set failed", err);
  }

  // ---- Run completions ----
  runEvents.on("run:any", (raw: unknown) => {
    try {
      handleRunBusEvent(raw as RunBusEvent & { runId: string });
    } catch (err) {
      console.error("[notifier] run handler failed", err);
    }
  });

  // ---- Session ended polling ----
  setInterval(() => {
    try {
      pollSessionEnds();
    } catch (err) {
      console.error("[notifier] session poll failed", err);
    }
  }, SESSION_END_POLL_MS);

  console.log("[notifier] started");
}

function handleRunBusEvent(ev: RunBusEvent & { runId?: string }): void {
  if (ev.type !== "done") return;
  const runId = ev.runId ?? (ev.payload as { runId?: string } | null)?.runId;
  if (!runId) return;

  const run = getRun(runId);
  if (!run) return;
  // Chat replies are persisted as messages elsewhere; skip them here.
  if (run.skill === "chat") return;

  const agent = getEmployee(run.employee_id);
  if (!agent) return;

  if (run.status === "success") {
    // First, scan the result for approval marker blocks and create rows.
    // Insert approvals BEFORE the run-completion notification so the user
    // sees them at the top of the agent thread (per existing UI ordering).
    try {
      maybeCreateApprovalsFromRun(run.id, agent.id, run.result_summary ?? "");
    } catch (err) {
      console.error("[notifier] approval parsing failed", run.id, err);
    }

    // Inter-agent inbox messages — must persist BEFORE the artifact save and
    // the user-facing notification so the recipient can already see them.
    try {
      maybeWriteInboxMessages(run, agent);
    } catch (err) {
      console.error("[notifier] inbox message dispatch failed", run.id, err);
    }

    // Auto-save the run output as a markdown artifact so the Files page
    // becomes a real workspace agents can hand off through. Errors here
    // are logged but never block the notification path.
    let savedFileName: string | null = null;
    try {
      savedFileName = maybeSaveRunArtifact(run, agent);
    } catch (err) {
      console.error("[notifier] artifact save failed", run.id, err);
    }

    const summary = run.result_summary ? truncate(run.result_summary, 200) : "";
    const fileFragment = savedFileName ? `Saved to \`${savedFileName}\`.` : "";
    const body = [
      `${agent.name} completed ${run.skill} in ${formatDuration(run.duration_ms)}.`,
      fileFragment,
      summary,
    ]
      .filter(Boolean)
      .join(" ");
    insertNotification({
      sender_id: agent.id,
      body,
      run_id: run.id,
      metadata: {
        source: "run-completed",
        run_id: run.id,
        cost_usd: run.cost_usd,
        duration_ms: run.duration_ms ?? undefined,
        ...(savedFileName ? { file_name: savedFileName } : {}),
      },
    });
  } else if (run.status === "error") {
    const errMsg = run.error ? truncate(run.error, 200) : "(no error message)";
    insertNotification({
      sender_id: agent.id,
      body: `${agent.name} failed ${run.skill}: ${errMsg}`,
      run_id: run.id,
      metadata: {
        source: "run-failed",
        run_id: run.id,
        cost_usd: run.cost_usd,
        duration_ms: run.duration_ms ?? undefined,
      },
    });
  }
}

function pollSessionEnds(): void {
  const ended = listSessions({ status: "ended", limit: 200 });
  for (const s of ended) {
    if (_notifiedSessionEnds.has(s.id)) continue;
    _notifiedSessionEnds.add(s.id);
    try {
      emitSessionEndedNotification(s);
    } catch (err) {
      console.error("[notifier] session-ended emit failed", s.id, err);
    }
  }
}

function maybeCreateApprovalsFromRun(
  runId: string,
  agentId: string,
  resultText: string,
): void {
  if (!resultText || !resultText.includes("<<<APPROVAL>>>")) return;

  // Idempotency guard — if any approvals already exist for this run, skip.
  // listApprovals supports filtering by agent_id; we filter by run_id in JS
  // since there's no dedicated index/filter for it.
  try {
    const existing = listApprovals({ agent_id: agentId, limit: 500 }).filter(
      (a) => a.run_id === runId,
    );
    if (existing.length > 0) return;
  } catch (err) {
    console.error("[notifier] approval idempotency check failed", err);
    // Fall through — better to risk a duplicate than to swallow the run.
  }

  const blocks = parseApprovalBlocks(resultText);
  for (const b of blocks) {
    try {
      insertApproval({
        agent_id: agentId,
        run_id: runId,
        action_type: b.action_type,
        title: b.title,
        body: b.body,
        payload: null,
      });
    } catch (err) {
      console.error("[notifier] insertApproval failed", err);
    }
  }
  if (blocks.length > 0) {
    console.log(
      `[notifier] created ${blocks.length} approval(s) from run ${runId}`,
    );
  }
}

// ---- Run artifact auto-save -------------------------------------------------
//
// On every successful, non-chat run with a non-empty `result_summary`, write
// the result to `<projectRoot>/agents/_shared/files/<filename>.md` so it shows
// up on the Files page and downstream agents can pick it up.
//
// Filename pattern:
//   <YYYY-MM-DD>_<agent-id>_<skill>_<runid8>__<title-slug>.md
//
// Idempotency comes from the `runid8` segment + `existsSync` — re-emitting the
// same `done` event is a no-op.

const SHARED_FILES_DIR_LOCAL = path.join(
  PATHS.agentsDir,
  "_shared",
  "files",
);
const MAX_FILENAME_LEN = 180;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Format a Date as YYYY-MM-DD in Asia/Singapore. We use the Intl APIs rather
 * than date-fns to avoid pulling tz data — Singapore is UTC+8, no DST.
 */
function ymdInSingapore(d: Date): string {
  // Singapore is UTC+8 with no DST historically since 1982.
  const utcMs = d.getTime() + d.getTimezoneOffset() * 60_000;
  const sgt = new Date(utcMs + 8 * 60 * 60_000);
  return `${sgt.getUTCFullYear()}-${pad2(sgt.getUTCMonth() + 1)}-${pad2(sgt.getUTCDate())}`;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
}

function stripMarkdown(s: string): string {
  return s
    .replace(/`{1,3}[^`]*`{1,3}/g, " ") // inline/triple code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → keep label
    .replace(/[*_~>#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Derive a slugged title from the run output. If the result starts with a
 * top-level heading, use that; otherwise fall back to the first 50 chars of
 * the result (markdown stripped).
 */
function deriveTitleSlug(result: string): string {
  const trimmed = result.trimStart();
  const headingMatch = /^#\s+([^\n]+)/.exec(trimmed);
  let raw: string;
  if (headingMatch) {
    raw = headingMatch[1];
  } else {
    raw = stripMarkdown(trimmed).slice(0, 80);
  }
  const slug = slugify(raw);
  return slug || "untitled";
}

function safeSegment(s: string): string {
  // No '/', no leading '.', no '..'. Replace anything outside [a-z0-9_-] with '-'.
  const cleaned = s
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^\.+/, "");
  return cleaned || "x";
}

function buildArtifactFilename(args: {
  date: string;
  agentId: string;
  skill: string;
  runId: string;
  titleSlug: string;
}): string {
  const runid8 = args.runId.replace(/-/g, "").slice(0, 8) || "00000000";
  const base = [
    args.date,
    safeSegment(args.agentId),
    safeSegment(args.skill),
    runid8,
  ].join("_");
  let name = `${base}__${args.titleSlug}.md`;
  // Filenames cap at MAX_FILENAME_LEN. If we overflow, trim the title slug.
  if (name.length > MAX_FILENAME_LEN) {
    const overflow = name.length - MAX_FILENAME_LEN;
    const trimmedSlug = args.titleSlug.slice(0, Math.max(1, args.titleSlug.length - overflow));
    name = `${base}__${trimmedSlug || "untitled"}.md`;
  }
  return name;
}

function escapeYamlScalar(s: string): string {
  // Quote and escape backslashes + double-quotes for YAML double-quoted form.
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function buildFrontmatter(run: RunRow, agent: EmployeeRow): string {
  const createdMs = run.ended_at ?? run.started_at ?? Date.now();
  const inputRaw = run.input ?? "";
  const inputTrunc =
    inputRaw.length > 200 ? `${inputRaw.slice(0, 200)}…` : inputRaw;

  const lines: string[] = ["---"];
  lines.push(`run_id: ${escapeYamlScalar(run.id)}`);
  lines.push(`agent_id: ${escapeYamlScalar(agent.id)}`);
  lines.push(`agent_name: ${escapeYamlScalar(agent.name)}`);
  lines.push(`skill: ${escapeYamlScalar(run.skill)}`);
  lines.push(`created_at: ${escapeYamlScalar(new Date(createdMs).toISOString())}`);
  lines.push(`duration_ms: ${run.duration_ms ?? 0}`);
  lines.push(`cost_usd: ${run.cost_usd ?? 0}`);
  // RunRow has no project_id today; omit per spec.
  lines.push(`input: ${escapeYamlScalar(inputTrunc)}`);
  lines.push("---");
  return lines.join("\n");
}

function maybeSaveRunArtifact(run: RunRow, agent: EmployeeRow): string | null {
  if (run.status !== "success") return null;
  if (run.skill === "chat") return null;
  if (run.employee_id === "system") return null;
  const summary = run.result_summary ?? "";
  if (!summary.trim()) return null;

  // Ensure dir exists.
  try {
    fs.mkdirSync(SHARED_FILES_DIR_LOCAL, { recursive: true });
  } catch (err) {
    console.error("[notifier] mkdir shared/files failed", err);
    return null;
  }

  const date = ymdInSingapore(new Date(run.ended_at ?? run.started_at ?? Date.now()));
  const titleSlug = deriveTitleSlug(summary);
  let filename = buildArtifactFilename({
    date,
    agentId: agent.id,
    skill: run.skill,
    runId: run.id,
    titleSlug,
  });
  let fullPath = path.join(SHARED_FILES_DIR_LOCAL, filename);

  // Idempotency: filename includes runid8, so existsSync is enough.
  if (fs.existsSync(fullPath)) {
    return filename;
  }

  // Belt-and-suspenders disambiguation in case of a (very unlikely) collision
  // with a different run that produced the same name.
  // Only kicks in if some external file already squats the slot.
  let attempt = 0;
  while (fs.existsSync(fullPath) && attempt < 3) {
    attempt += 1;
    const suffix = randomBytes(2).toString("hex");
    filename = filename.replace(/\.md$/, `_${suffix}.md`);
    fullPath = path.join(SHARED_FILES_DIR_LOCAL, filename);
  }

  const frontmatter = buildFrontmatter(run, agent);
  const content = `${frontmatter}\n\n${summary.trimEnd()}\n`;

  // Atomic write: .tmp + rename.
  const tmpPath = `${fullPath}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    fs.writeFileSync(tmpPath, content, { encoding: "utf8" });
    fs.renameSync(tmpPath, fullPath);
  } catch (err) {
    console.error("[notifier] artifact write failed", run.id, err);
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
    return null;
  }

  console.log(`[notifier] saved run artifact ${filename}`);
  return filename;
}

function emitSessionEndedNotification(s: SessionRow): void {
  const project = getProject(s.project_id);
  const projectLabel = project?.name ?? s.project_id;
  const session = getSession(s.id) ?? s; // re-fetch to be safe
  const msgs = session.num_messages ?? 0;
  const body =
    `${projectLabel} session ended — ${msgs} message${msgs === 1 ? "" : "s"} exchanged, ` +
    `${formatCost(session.total_cost_usd)} estimated cost.`;
  insertNotification({
    sender_id: "system",
    body,
    metadata: {
      source: "session-ended",
      session_id: session.id,
      project_id: session.project_id,
      cost_usd: session.total_cost_usd,
    },
  });
}
