/**
 * Claude Code transcript watcher.
 *
 * Tails ~/.claude/projects/<sanitised>/<session-uuid>.jsonl files, parses each
 * new line, and maintains a snapshot of every Session in the SQLite DB.
 *
 * On boot it walks the projects dir to discover existing sessions (and the
 * Projects they belong to). After that it relies on chokidar to react to file
 * `add` and `change` events.
 *
 * Events fan out via the singleton `sessionEvents` EventEmitter:
 *   - `session:any`  → every meaningful event, payload includes sessionId
 *   - `<sessionId>`  → per-session subscribers
 *
 * Singleton-guarded: calling startWatcher() twice is a no-op.
 */
import EventEmitter from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  PATHS,
  getProjectByPath,
  getProjectByTranscriptDir,
  getProject,
  getSession,
  listSessions,
  sweepSessionStatuses,
  updateProject,
  updateSession,
  upsertProject,
  upsertSession,
  type SessionRow,
  type SessionStatus,
} from "./db.ts";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");
const STATUS_SWEEP_INTERVAL_MS = 60 * 1000;

const PALETTE = [
  "#ff5d8f",
  "#ffaf5d",
  "#ffd45d",
  "#9be15d",
  "#5dd4d4",
  "#5d8fff",
  "#a05dff",
  "#ff5dd4",
  "#ff7a5d",
  "#5dffaf",
  "#5dffe9",
  "#c95dff",
];

function pickColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(h) % PALETTE.length]!;
}

// ---------------------------------------------------------------------------
// Bus
// ---------------------------------------------------------------------------

export type SessionBusPayload = {
  sessionId: string;
  projectId: string;
  type: string;
  summary: string;
  ts: number;
  payload?: unknown;
};

class SessionBus extends EventEmitter {}
// Pin the bus to globalThis so static + dynamic imports of this module
// (which Next.js dev / Turbopack can resolve to different instances) share
// the same EventEmitter — otherwise SSE listeners never receive watcher
// events.
const GLOBAL_BUS_KEY = "__gaia_session_bus__";
type GlobalWithBus = typeof globalThis & { [GLOBAL_BUS_KEY]?: SessionBus };
const _globalAny = globalThis as GlobalWithBus;
if (!_globalAny[GLOBAL_BUS_KEY]) {
  const bus = new SessionBus();
  bus.setMaxListeners(0);
  _globalAny[GLOBAL_BUS_KEY] = bus;
}
export const sessionEvents: SessionBus = _globalAny[GLOBAL_BUS_KEY]!;

function emitEvent(p: SessionBusPayload): void {
  try {
    sessionEvents.emit("session:any", p);
    sessionEvents.emit(p.sessionId, p);
  } catch (err) {
    console.error("[session-watcher] emit failed", err);
  }
}

// ---------------------------------------------------------------------------
// Transcript parsing
// ---------------------------------------------------------------------------

export type ParsedRole = "user" | "assistant" | "system" | "tool";

export type ParsedEvent = {
  ts: number;
  role: ParsedRole;
  text?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_result_preview?: string;
  cost?: number;
  type?: string;
};

export type LineSnapshotDelta = {
  role?: ParsedRole;
  text?: string;
  tool_name?: string;
  file?: string | null;
  cost_usd?: number;
  tokens?: number;
  ts?: number;
  cwd?: string;
  session_id?: string;
  title?: string;
  num_messages_inc?: number;
  num_tool_uses_inc?: number;
  last_event_type?: string;
  last_event_summary?: string;
};

/** Best-effort cost calculator from token usage. Sonnet 4.x rough rates ($/Mtok). */
const PRICE_INPUT_PER_MTOK = 3.0;
const PRICE_OUTPUT_PER_MTOK = 15.0;
const PRICE_CACHE_WRITE_PER_MTOK = 3.75;
const PRICE_CACHE_READ_PER_MTOK = 0.3;

/**
 * Parse an ISO timestamp from a transcript line. Returns 0 when missing/bad
 * (so we can skip rather than fall back to Date.now() — many envelope events
 * like permission-mode / file-history-snapshot carry no timestamp at all).
 */
function tsFromIso(iso: unknown): number {
  if (typeof iso !== "string") return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function fileFromToolInput(name: string, input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  if (name === "Bash") return null;
  for (const key of ["file_path", "path", "notebook_path", "filename"]) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

function previewToolResult(content: unknown): string {
  if (typeof content === "string") return content.slice(0, 200);
  if (Array.isArray(content)) {
    const text = content
      .map((c: any) => (typeof c === "string" ? c : c?.text ?? ""))
      .filter(Boolean)
      .join(" ");
    return text.slice(0, 200);
  }
  return "";
}

/**
 * Parse one JSONL line. Returns ParsedEvent for transcript display, or null
 * for lines we don't surface (permission-mode etc.).
 */
export function parseLineToEvent(line: string): ParsedEvent | null {
  let obj: any;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;

  const ts = tsFromIso(obj.timestamp);
  const t = obj.type;

  if (t === "user") {
    const c = obj.message?.content;
    if (typeof c === "string") {
      return { ts, role: "user", text: c, type: t };
    }
    if (Array.isArray(c)) {
      // tool_result rolled up in user content array
      const toolResult = c.find((x: any) => x?.type === "tool_result");
      if (toolResult) {
        return {
          ts,
          role: "tool",
          tool_result_preview: previewToolResult(toolResult.content),
          type: "tool_result",
        };
      }
      const textPart = c.find((x: any) => x?.type === "text");
      if (textPart?.text) {
        return { ts, role: "user", text: String(textPart.text), type: t };
      }
    }
    return { ts, role: "user", text: "", type: t };
  }

  if (t === "assistant") {
    const arr = obj.message?.content;
    if (Array.isArray(arr)) {
      // Find the most informative content block.
      const toolUse = arr.find((x: any) => x?.type === "tool_use");
      if (toolUse) {
        return {
          ts,
          role: "assistant",
          tool_name: String(toolUse.name ?? ""),
          tool_input: toolUse.input,
          type: "tool_use",
        };
      }
      const textBlock = arr.find((x: any) => x?.type === "text");
      if (textBlock?.text) {
        return {
          ts,
          role: "assistant",
          text: String(textBlock.text),
          type: t,
        };
      }
      const thinkingBlock = arr.find((x: any) => x?.type === "thinking");
      if (thinkingBlock?.thinking) {
        return {
          ts,
          role: "assistant",
          text: "(thinking)",
          type: "thinking",
        };
      }
    }
    return { ts, role: "assistant", text: "", type: t };
  }

  if (t === "system") {
    return { ts, role: "system", text: String(obj.subtype ?? ""), type: t };
  }

  // Skip permission-mode, file-history-snapshot, attachment, ai-title, etc.
  return null;
}

/**
 * Compute incremental snapshot fields from a parsed line. We do this in one
 * pass to keep watcher updates cheap.
 */
function deltaFromLine(line: string): LineSnapshotDelta | null {
  let obj: any;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;

  const ts = tsFromIso(obj.timestamp);
  const cwd = typeof obj.cwd === "string" ? obj.cwd : undefined;
  const session_id =
    typeof obj.sessionId === "string" ? obj.sessionId : undefined;
  const t = obj.type;
  const out: LineSnapshotDelta = { ts, cwd, session_id };

  if (t === "ai-title" && typeof obj.aiTitle === "string") {
    out.title = obj.aiTitle.slice(0, 200);
    return out;
  }

  if (t === "user") {
    const c = obj.message?.content;
    if (typeof c === "string") {
      out.role = "user";
      out.text = c;
      out.num_messages_inc = 1;
      out.last_event_type = "user_prompt";
      out.last_event_summary = c.slice(0, 160);
      return out;
    }
    if (Array.isArray(c)) {
      const toolResult = c.find((x: any) => x?.type === "tool_result");
      if (toolResult) {
        out.role = "tool";
        out.last_event_type = "tool_result";
        out.last_event_summary = previewToolResult(toolResult.content).slice(
          0,
          160,
        );
        return out;
      }
      const textPart = c.find((x: any) => x?.type === "text");
      if (textPart?.text) {
        out.role = "user";
        out.text = String(textPart.text);
        out.num_messages_inc = 1;
        out.last_event_type = "user_prompt";
        out.last_event_summary = String(textPart.text).slice(0, 160);
        return out;
      }
    }
    return out;
  }

  if (t === "assistant") {
    const arr = obj.message?.content;
    const usage = obj.message?.usage;
    if (usage && typeof usage === "object") {
      const inTok = Number(usage.input_tokens ?? 0) || 0;
      const outTok = Number(usage.output_tokens ?? 0) || 0;
      const cacheCreate = Number(usage.cache_creation_input_tokens ?? 0) || 0;
      const cacheRead = Number(usage.cache_read_input_tokens ?? 0) || 0;
      out.tokens = inTok + outTok + cacheCreate + cacheRead;
      out.cost_usd =
        (inTok * PRICE_INPUT_PER_MTOK +
          outTok * PRICE_OUTPUT_PER_MTOK +
          cacheCreate * PRICE_CACHE_WRITE_PER_MTOK +
          cacheRead * PRICE_CACHE_READ_PER_MTOK) /
        1_000_000;
    }

    if (Array.isArray(arr)) {
      const toolUse = arr.find((x: any) => x?.type === "tool_use");
      if (toolUse) {
        out.role = "assistant";
        out.tool_name = String(toolUse.name ?? "");
        out.file = fileFromToolInput(out.tool_name, toolUse.input);
        out.num_tool_uses_inc = 1;
        out.last_event_type = "tool_use";
        out.last_event_summary = out.file
          ? `${out.tool_name} ${out.file}`
          : out.tool_name;
        return out;
      }
      const textBlock = arr.find((x: any) => x?.type === "text");
      if (textBlock?.text) {
        out.role = "assistant";
        out.text = String(textBlock.text);
        out.num_messages_inc = 1;
        out.last_event_type = "assistant_text";
        out.last_event_summary = String(textBlock.text).slice(0, 160);
        return out;
      }
      const thinking = arr.find((x: any) => x?.type === "thinking");
      if (thinking) {
        out.role = "assistant";
        out.last_event_type = "thinking";
        out.last_event_summary = "(thinking)";
        return out;
      }
    }
    return out;
  }

  if (t === "system") {
    out.role = "system";
    out.last_event_type = `system:${obj.subtype ?? ""}`.slice(0, 64);
    out.last_event_summary = String(obj.subtype ?? "");
    return out;
  }

  // permission-mode, file-history-snapshot, attachment, last-prompt: still
  // useful for ts/cwd extraction so we return what we have without bumping
  // counters.
  return out;
}

// ---------------------------------------------------------------------------
// Project / session bookkeeping
// ---------------------------------------------------------------------------

/**
 * True if `cwd` represents an internal/agent directory or a temp path that
 * should never appear in the user-facing Projects list. Compares normalised
 * absolute paths so `..` / symlinks / trailing slashes don't slip through.
 *
 * Rules:
 *   - At or under `PATHS.agentsDir` (real `agents/<slug>`).
 *   - At or under the project root's `agents-test/` dir (test instance).
 *   - `/tmp` or under it.
 *   - `/private/tmp` (macOS) or under it.
 *   - `/var/folders/.../T/...` macOS per-user temp dirs.
 *   - The user's home dir itself (e.g. `/Users/<user>`) — never a "project".
 */
function isInternalCwd(cwd: string): boolean {
  if (!cwd || typeof cwd !== "string") return false;
  let abs: string;
  try {
    abs = path.resolve(cwd);
  } catch {
    return false;
  }

  // Home dir itself is not a project. Subdirs of home are fine (most projects
  // live there) so we only block the exact home dir.
  try {
    if (abs === path.resolve(os.homedir())) return true;
  } catch {
    // ignore
  }

  // Helper: is `abs` equal to or strictly under `root` (both normalised)?
  const isUnder = (root: string): boolean => {
    const r = path.resolve(root);
    if (abs === r) return true;
    const rel = path.relative(r, abs);
    return (
      rel !== "" &&
      !rel.startsWith("..") &&
      !path.isAbsolute(rel)
    );
  };

  // Real agents dir.
  if (isUnder(PATHS.agentsDir)) return true;

  // Test-instance agents dir (sibling to agents/). We check it whether or not
  // GAIA_AGENTS_DIR was set, so the real-instance DB still flags any rows
  // pointing into agents-test/.
  if (isUnder(path.join(PATHS.projectRoot, "agents-test"))) return true;

  // Any path that has `/agents/` or `/agents-test/` as a directory segment.
  // Catches alternate checkouts of this project (e.g. an iCloud-synced copy
  // whose `agents/<slug>` dirs don't live under PATHS.projectRoot).
  // Uses path.sep-agnostic split so it works regardless of OS.
  const segments = abs.split(path.sep).filter(Boolean);
  for (let i = 0; i < segments.length - 1; i++) {
    if (segments[i] === "agents" || segments[i] === "agents-test") {
      return true;
    }
  }

  // Temp dirs.
  if (isUnder("/tmp")) return true;
  if (isUnder("/private/tmp")) return true;
  if (isUnder("/var/folders")) return true;

  return false;
}

/** Lossy fallback for when we can't read a `cwd` field. */
function reverseSanitisedDir(dir: string): string {
  // The Claude CLI replaces `/` with `-`; reverse-substitute. This is lossy
  // for any path containing `-` already (e.g. com.apple.CloudDocs becomes
  // com-apple-CloudDocs). Documented as fallback only.
  return "/" + dir.replace(/^-+/, "").replace(/-/g, "/");
}

function projectNameFromCwd(cwd: string): string {
  const base = path.basename(cwd);
  return base || cwd;
}

/** Read the first line that has a cwd field. */
function firstCwdInFile(filePath: string, maxLines = 50): string | null {
  try {
    const fd = fs.openSync(filePath, "r");
    try {
      const stats = fs.fstatSync(fd);
      const size = stats.size;
      const len = Math.min(size, 256 * 1024);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, 0);
      const text = buf.toString("utf8");
      const lines = text.split("\n");
      for (let i = 0; i < Math.min(maxLines, lines.length); i++) {
        const line = lines[i];
        if (!line) continue;
        try {
          const obj = JSON.parse(line);
          if (obj && typeof obj.cwd === "string") return obj.cwd;
        } catch {
          // skip malformed
        }
      }
      return null;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

function ensureProjectForCwd(cwd: string, transcriptDir: string) {
  const internal = isInternalCwd(cwd);
  // Prefer transcript_dir lookup (stable across path remaps).
  const byDir = getProjectByTranscriptDir(transcriptDir);
  if (byDir) {
    const patch: Parameters<typeof updateProject>[1] = {};
    if (byDir.path !== cwd) {
      const collision = getProjectByPath(cwd);
      if (!collision || collision.id === byDir.id) {
        patch.path = cwd;
      }
      // else: another project owns this cwd — leave byDir.path alone to avoid UNIQUE collision
    }
    // Flip is_internal up if the path now matches internal rules. Never
    // flip a legit user project DOWN to non-internal here — operators may
    // have toggled is_internal manually.
    if (internal && byDir.is_internal !== 1) patch.is_internal = 1;
    if (Object.keys(patch).length > 0) updateProject(byDir.id, patch);
    return byDir;
  }
  const byPath = getProjectByPath(cwd);
  if (byPath) {
    const patch: Parameters<typeof updateProject>[1] = {};
    if (!byPath.transcript_dir) patch.transcript_dir = transcriptDir;
    if (internal && byPath.is_internal !== 1) patch.is_internal = 1;
    if (Object.keys(patch).length > 0) updateProject(byPath.id, patch);
    return byPath;
  }
  return upsertProject({
    name: projectNameFromCwd(cwd),
    path: cwd,
    transcript_dir: transcriptDir,
    color: pickColor(cwd),
    is_internal: internal ? 1 : 0,
  });
}

// ---------------------------------------------------------------------------
// Transcript IO — bootstrap + tail
// ---------------------------------------------------------------------------

type Snapshot = {
  started_at: number;
  last_event_at: number;
  total_cost_usd: number;
  total_tokens: number;
  num_messages: number;
  num_tool_uses: number;
  last_event_type: string | null;
  last_event_summary: string | null;
  last_tool: string | null;
  last_file: string | null;
  title: string | null;
  cwd: string | null;
  session_id: string | null;
};

function emptySnapshot(): Snapshot {
  return {
    started_at: 0,
    last_event_at: 0,
    total_cost_usd: 0,
    total_tokens: 0,
    num_messages: 0,
    num_tool_uses: 0,
    last_event_type: null,
    last_event_summary: null,
    last_tool: null,
    last_file: null,
    title: null,
    cwd: null,
    session_id: null,
  };
}

function applyDeltaToSnapshot(snap: Snapshot, d: LineSnapshotDelta): void {
  if (d.ts) {
    if (!snap.started_at) snap.started_at = d.ts;
    if (d.ts > snap.last_event_at) snap.last_event_at = d.ts;
  }
  if (d.cwd && !snap.cwd) snap.cwd = d.cwd;
  if (d.session_id && !snap.session_id) snap.session_id = d.session_id;
  if (d.title) snap.title = d.title;
  if (d.cost_usd) snap.total_cost_usd += d.cost_usd;
  if (d.tokens) snap.total_tokens += d.tokens;
  if (d.num_messages_inc) snap.num_messages += d.num_messages_inc;
  if (d.num_tool_uses_inc) snap.num_tool_uses += d.num_tool_uses_inc;
  if (d.last_event_type) snap.last_event_type = d.last_event_type;
  if (d.last_event_summary) snap.last_event_summary = d.last_event_summary;
  if (d.tool_name) snap.last_tool = d.tool_name;
  if (d.file !== undefined) {
    if (d.file) snap.last_file = d.file;
  }
}

function statusFor(last_event_at: number, now: number): SessionStatus {
  const dt = now - last_event_at;
  if (dt < 5 * 60 * 1000) return "active";
  if (dt < 30 * 60 * 1000) return "idle";
  return "ended";
}

/**
 * Bootstrap a session row from a complete file. Used on `add` and on initial
 * walk. Reads the entire file (sessions are typically << 100MB; we accept the
 * cost for accuracy).
 */
function bootstrapSession(transcriptPath: string): SessionRow | null {
  let content: string;
  try {
    content = fs.readFileSync(transcriptPath, "utf8");
  } catch {
    return null;
  }
  const stat = fs.statSync(transcriptPath);
  const transcriptDir = path.basename(path.dirname(transcriptPath));
  const sessionId = path.basename(transcriptPath, ".jsonl");

  const snap = emptySnapshot();
  for (const rawLine of content.split("\n")) {
    if (!rawLine) continue;
    const d = deltaFromLine(rawLine);
    if (d) applyDeltaToSnapshot(snap, d);
  }

  const cwd = snap.cwd ?? firstCwdInFile(transcriptPath);
  const finalCwd = cwd ?? reverseSanitisedDir(transcriptDir);

  if (isInternalCwd(finalCwd)) {
    return null;
  }

  // Test mode: only attach transcripts to projects the user has already
  // created via the onboarding wizard or settings. Silently skip everything
  // else so the test DB stays empty until the user creates their first agent.
  if (process.env.GAIA_TEST_MODE === "1") {
    const known =
      getProjectByTranscriptDir(transcriptDir) ?? getProjectByPath(finalCwd);
    if (!known) return null;
  }

  const project = ensureProjectForCwd(finalCwd, transcriptDir);
  const now = Date.now();
  const status = statusFor(snap.last_event_at || stat.mtimeMs, now);
  const sid = snap.session_id ?? sessionId;

  const existing = getSession(sid);
  if (existing) {
    updateSession(sid, {
      title: snap.title ?? existing.title,
      status,
      last_event_at: snap.last_event_at || existing.last_event_at,
      total_cost_usd: snap.total_cost_usd,
      total_tokens: snap.total_tokens,
      num_messages: snap.num_messages,
      num_tool_uses: snap.num_tool_uses,
      last_event_type: snap.last_event_type,
      last_event_summary: snap.last_event_summary,
      last_tool: snap.last_tool,
      last_file: snap.last_file,
      bytes_read: stat.size,
    });
    return getSession(sid)!;
  }

  return upsertSession({
    id: sid,
    project_id: project.id,
    transcript_path: transcriptPath,
    title: snap.title,
    status,
    started_at: snap.started_at || stat.birthtimeMs || now,
    last_event_at: snap.last_event_at || stat.mtimeMs,
    ended_at: status === "ended" ? snap.last_event_at || stat.mtimeMs : null,
    total_cost_usd: snap.total_cost_usd,
    total_tokens: snap.total_tokens,
    num_messages: snap.num_messages,
    num_tool_uses: snap.num_tool_uses,
    last_event_type: snap.last_event_type,
    last_event_summary: snap.last_event_summary,
    last_tool: snap.last_tool,
    last_file: snap.last_file,
    bytes_read: stat.size,
  });
}

/** Tail incremental bytes from `bytes_read` to file end. */
function tailSession(transcriptPath: string): void {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(transcriptPath);
  } catch {
    return;
  }
  const transcriptDir = path.basename(path.dirname(transcriptPath));
  const sessionId = path.basename(transcriptPath, ".jsonl");

  const existing = getSession(sessionId);
  if (!existing) {
    bootstrapSession(transcriptPath);
    return;
  }

  if (stat.size <= existing.bytes_read) {
    return;
  }
  if (stat.size < existing.bytes_read) {
    // File was truncated. Re-bootstrap.
    bootstrapSession(transcriptPath);
    return;
  }

  let buf: Buffer;
  try {
    const fd = fs.openSync(transcriptPath, "r");
    try {
      const len = stat.size - existing.bytes_read;
      buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, existing.bytes_read);
    } finally {
      fs.closeSync(fd);
    }
  } catch (err) {
    console.error("[session-watcher] read failed", transcriptPath, err);
    return;
  }

  const text = buf.toString("utf8");
  const lines = text.split("\n");
  // The last fragment may be a partial line; only consume up to the last \n.
  const lastNewlineIdx = text.lastIndexOf("\n");
  if (lastNewlineIdx === -1) return;
  const consumedBytes = Buffer.byteLength(text.slice(0, lastNewlineIdx + 1));
  const consumableLines = lines.slice(0, -1); // drop trailing partial / empty

  let cost = existing.total_cost_usd;
  let tokens = existing.total_tokens;
  let nMsg = existing.num_messages;
  let nTool = existing.num_tool_uses;
  let title = existing.title;
  let lastTs = existing.last_event_at;
  let lastEventType = existing.last_event_type;
  let lastEventSummary = existing.last_event_summary;
  let lastTool = existing.last_tool;
  let lastFile = existing.last_file;
  const events: SessionBusPayload[] = [];

  for (const line of consumableLines) {
    if (!line) continue;
    const d = deltaFromLine(line);
    if (!d) continue;
    if (d.title) title = d.title;
    if (d.ts && d.ts > lastTs) lastTs = d.ts;
    if (d.cost_usd) cost += d.cost_usd;
    if (d.tokens) tokens += d.tokens;
    if (d.num_messages_inc) nMsg += d.num_messages_inc;
    if (d.num_tool_uses_inc) nTool += d.num_tool_uses_inc;
    if (d.last_event_type) lastEventType = d.last_event_type;
    if (d.last_event_summary) lastEventSummary = d.last_event_summary;
    if (d.tool_name) lastTool = d.tool_name;
    if (d.file) lastFile = d.file;
    if (d.last_event_type) {
      events.push({
        sessionId: existing.id,
        projectId: existing.project_id,
        type: d.last_event_type,
        summary: d.last_event_summary ?? "",
        ts: d.ts ?? Date.now(),
      });
    }
  }

  const status = statusFor(lastTs, Date.now());
  updateSession(existing.id, {
    title,
    status,
    last_event_at: lastTs,
    ended_at: status === "ended" ? lastTs : null,
    total_cost_usd: cost,
    total_tokens: tokens,
    num_messages: nMsg,
    num_tool_uses: nTool,
    last_event_type: lastEventType,
    last_event_summary: lastEventSummary,
    last_tool: lastTool,
    last_file: lastFile,
    bytes_read: existing.bytes_read + consumedBytes,
  });

  for (const ev of events) emitEvent(ev);
}

// ---------------------------------------------------------------------------
// Public transcript reader (used by API)
// ---------------------------------------------------------------------------

export function readTranscriptEvents(
  transcriptPath: string,
  opts: { from?: number; limit?: number } = {},
): { events: ParsedEvent[]; total: number } {
  let content: string;
  try {
    content = fs.readFileSync(transcriptPath, "utf8");
  } catch {
    return { events: [], total: 0 };
  }
  const lines = content.split("\n").filter(Boolean);
  const all: ParsedEvent[] = [];
  for (const line of lines) {
    const ev = parseLineToEvent(line);
    if (ev) all.push(ev);
  }
  const from = Math.max(0, opts.from ?? 0);
  const limit = Math.max(1, Math.min(opts.limit ?? 200, 1000));
  return {
    events: all.slice(from, from + limit),
    total: all.length,
  };
}

// ---------------------------------------------------------------------------
// Watcher lifecycle
// ---------------------------------------------------------------------------

let _started = false;
let _watcher: any = null;
let _statusInterval: ReturnType<typeof setInterval> | null = null;

async function initialWalk(): Promise<{ files: number; sessions: number }> {
  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) {
    return { files: 0, sessions: 0 };
  }
  let files = 0;
  let sessions = 0;
  const subdirs = fs.readdirSync(CLAUDE_PROJECTS_DIR);
  for (const sub of subdirs) {
    const dir = path.join(CLAUDE_PROJECTS_DIR, sub);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(dir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    const jsonl = entries
      .filter((e) => e.isFile() && e.name.endsWith(".jsonl"))
      .map((e) => path.join(dir, e.name));
    files += jsonl.length;
    for (const fp of jsonl) {
      try {
        const row = bootstrapSession(fp);
        if (row) sessions++;
      } catch (err) {
        console.error("[session-watcher] bootstrap failed", fp, err);
      }
    }
  }
  return { files, sessions };
}

export async function startWatcher(): Promise<void> {
  if (_started) return;
  _started = true;

  console.log("[session-watcher] starting; dir =", CLAUDE_PROJECTS_DIR);

  // In test mode the user opens onboarding against a blank DB. Auto-walking
  // ~/.claude/projects/ here would noisily backfill projects from every other
  // directory the user has ever opened with the Claude CLI, defeating the
  // "blank-slate" experience. Skip the walk; transcripts that show up later
  // will still be tailed via chokidar but they won't auto-create unrelated
  // projects either (bootstrap is gated below).
  if (process.env.GAIA_TEST_MODE === "1") {
    console.log(
      "[session-watcher] GAIA_TEST_MODE=1 — skipping initial walk; new transcripts ignored unless project already exists",
    );
  } else {
    try {
      const walk = await initialWalk();
      console.log(
        `[session-watcher] initial walk: ${walk.files} files, ${walk.sessions} sessions registered`,
      );
    } catch (err) {
      console.error("[session-watcher] initial walk failed", err);
    }
  }

  // Lazy import — avoid edge-runtime resolution headaches.
  // chokidar v5 dropped glob support — pass the directory and filter inside.
  const chokidar = await import("chokidar");
  const isJsonl = (fp: string) => fp.endsWith(".jsonl");
  const watcher = chokidar.watch(CLAUDE_PROJECTS_DIR, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: false,
    usePolling: false,
  });

  watcher.on("add", (fp) => {
    if (!isJsonl(fp)) return;
    try {
      bootstrapSession(fp);
    } catch (err) {
      console.error("[session-watcher] add handler failed", fp, err);
    }
  });
  watcher.on("change", (fp) => {
    if (!isJsonl(fp)) return;
    try {
      tailSession(fp);
    } catch (err) {
      console.error("[session-watcher] change handler failed", fp, err);
    }
  });
  watcher.on("error", (err) => {
    console.error("[session-watcher] chokidar error", err);
  });

  _watcher = watcher;

  _statusInterval = setInterval(() => {
    try {
      sweepSessionStatuses();
    } catch (err) {
      console.error("[session-watcher] status sweep failed", err);
    }
  }, STATUS_SWEEP_INTERVAL_MS);
}

export async function stopWatcher(): Promise<void> {
  if (!_started) return;
  _started = false;
  if (_statusInterval) {
    clearInterval(_statusInterval);
    _statusInterval = null;
  }
  if (_watcher) {
    try {
      await _watcher.close();
    } catch {
      // ignore
    }
    _watcher = null;
  }
}

// ---------------------------------------------------------------------------
// Misc helpers exposed for API callers
// ---------------------------------------------------------------------------

export function listActiveSessions(): SessionRow[] {
  return listSessions({ status: "active", limit: 100 });
}

export function getProjectsRoot(): string {
  return CLAUDE_PROJECTS_DIR;
}

export function isInternalProjectCwd(cwd: string): boolean {
  return isInternalCwd(cwd);
}

export function pickProjectColor(seed: string): string {
  return pickColor(seed);
}

export function getProjectFromSession(sessionId: string) {
  const s = getSession(sessionId);
  if (!s) return undefined;
  return getProject(s.project_id);
}
