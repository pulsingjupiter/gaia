/**
 * SQLite persistence for Agent Site.
 *
 * Singleton DB at app/data/gaia.db. Schema is created idempotently on first
 * call to getDb(). All callers MUST go through the helpers below — do not
 * issue raw SQL elsewhere.
 */
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { randomUUID } from "node:crypto";

import { DEFAULT_EMPLOYEES } from "../lib/mock/employees.ts";
import { isPlannerCli, type PlannerCli } from "../lib/types.ts";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * Absolute path to the Next.js app/ directory.
 * Works under both Next.js (which sets process.cwd() to app/) and direct
 * Node ESM execution where __dirname doesn't exist.
 */
const APP_ROOT = (() => {
  // process.cwd() should be the Next.js app dir at runtime.
  const cwd = process.cwd();
  // If we're being executed from app/ or anything under it, use that.
  if (path.basename(cwd) === "app") return cwd;
  // Fall back to walking up from this file's URL.
  try {
    // @ts-ignore — import.meta only exists under ESM
    const url = (import.meta as any)?.url as string | undefined;
    if (url) {
      const here = new URL(url).pathname;
      // here = .../app/src/server/db.ts -> ../../.. = app/
      return path.resolve(path.dirname(here), "..", "..");
    }
  } catch {
    // ignore
  }
  return cwd;
})();
/** Absolute path to the project root (contains app/, agents/). */
const PROJECT_ROOT = path.resolve(APP_ROOT, "..");

/**
 * Env-driven paths — let a separate "test instance" point at a clean
 * blank-slate DB and agents dir on a different port.
 *
 * - `GAIA_DATA_DIR`   — relative to PROJECT_ROOT (default: `app/data`).
 *   Overrides where `gaia.db` is stored. Used by `npm run dev:test` to
 *   isolate the test instance's SQLite from the real one.
 * - `GAIA_AGENTS_DIR` — relative to PROJECT_ROOT (default: `agents`).
 *   Overrides the on-disk `agents/<slug>/` root that the API + watcher
 *   read/write. Test instance uses `agents-test/` so the real workforce
 *   is untouched.
 *
 * Resolved against PROJECT_ROOT so callers can pass plain folder names
 * (`./data-test`, `agents-test`) regardless of where the dev server is
 * launched from.
 */
const DATA_DIR = process.env.GAIA_DATA_DIR
  ? path.resolve(PROJECT_ROOT, process.env.GAIA_DATA_DIR)
  : path.join(APP_ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "gaia.db");
const AGENTS_DIR = process.env.GAIA_AGENTS_DIR
  ? path.resolve(PROJECT_ROOT, process.env.GAIA_AGENTS_DIR)
  : path.join(PROJECT_ROOT, "agents");

export const PATHS = {
  appRoot: APP_ROOT,
  projectRoot: PROJECT_ROOT,
  dataDir: DATA_DIR,
  dbPath: DB_PATH,
  agentsDir: AGENTS_DIR,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EmployeeRuntime = "claude" | "jules" | "codex" | "gemini";

export type EmployeeRow = {
  id: string;
  name: string;
  role: string;
  status: "idle" | "running" | "error";
  accent_color: string | null;
  avatar_emoji: string | null;
  agent_dir: string;
  created_at: number;
  internal_only: 0 | 1;
  /**
   * Per-agent daily cost cap in USD. NULL = no cap. Enforced in
   * `startRun()` against `getAgentSpendToday()` (Asia/Singapore day boundary).
   */
  daily_cost_cap_usd: number | null;
  /**
   * Which executor launches/operates the agent. Defaults to 'claude' for
   * existing rows. 'jules' (Google) and 'codex' (OpenAI) are async/cloud
   * executors — the multi-runtime MVP only branches launch + setup checks
   * on this field; no orchestration is done from Gaia's side.
   */
  runtime: EmployeeRuntime;
};

export type RunStatus =
  | "pending"
  | "running"
  | "success"
  | "error"
  | "cancelled"
  /**
   * `blocked` — the run was refused before spawning the CLI because the
   * agent had hit its `daily_cost_cap_usd` cap. No CLI process was started,
   * so cost_usd / duration_ms remain 0 / null. Surfaced to the user via a
   * notification + (for chat skills) a regular agent reply.
   */
  | "blocked";

export type RunRow = {
  id: string;
  employee_id: string;
  skill: string;
  input: string | null;
  status: RunStatus;
  started_at: number;
  ended_at: number | null;
  cost_usd: number;
  duration_ms: number | null;
  result_summary: string | null;
  error: string | null;
  project_id: string | null;
};

export type RunEventType =
  | "system"
  | "assistant_text"
  | "tool_use"
  | "tool_result"
  | "result"
  | "error";

export type RunEventRow = {
  id: number;
  run_id: string;
  ts: number;
  type: RunEventType;
  payload: string;
};

export type MessageKind = "chat" | "notification";

export type NotificationSource =
  | "run-completed"
  | "run-failed"
  | "session-ended"
  | "cron-fired"
  | "approval-resolved"
  | "inter-agent-message";

export type NotificationMetadata = {
  source: NotificationSource;
  run_id?: string;
  session_id?: string;
  project_id?: string;
  cost_usd?: number;
  duration_ms?: number;
  [key: string]: unknown;
};

export type MessageRow = {
  id: string;
  thread_id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  run_id: string | null;
  created_at: number;
  read_at: number | null;
  kind: MessageKind;
  metadata: string | null;
};

export type TaskPriority = "high" | "medium" | "low";
export type TaskStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "review"
  | "done"
  | "archived";

export type TaskRow = {
  id: string;
  title: string;
  employee_id: string | null;
  skill: string | null;
  /**
   * @deprecated Cron rows live in `scheduled_runs` after the cron-split
   * migration. The column survives on `tasks` for storage compatibility
   * (SQLite cannot easily drop columns) but is no longer read or written by
   * `tasks` code paths. Always `null` for work tasks.
   */
  schedule_cron: string | null;
  /** @deprecated cron-only. See `schedule_cron`. */
  human_label: string | null;
  /** @deprecated cron-only. See `schedule_cron`. */
  enabled: 0 | 1;
  /** @deprecated cron-only. See `schedule_cron`. */
  last_run_id: string | null;
  /** @deprecated cron-only. See `schedule_cron`. */
  last_run_at: number | null;
  priority: TaskPriority;
  status: TaskStatus;
  description: string | null;
  created_at: number | null;
  playbook: string | null;
  project_id: string | null;
  /** Optional milestone grouping. References `milestones.id`. */
  milestone_id: string | null;
  /** Per-task deadline as ms-epoch. Null = no deadline. */
  due_date: number | null;
  /**
   * Recurrence frequency. NULL = non-recurring (default). When set, marking
   * the task `done` spawns the next instance via `spawnNextRecurringInstance`.
   */
  recurrence: TaskRecurrence | null;
  /**
   * Original due_date ms-epoch — preserves the canonical time-of-day across
   * spawned instances. Set on the first occurrence; copied onto each spawn.
   */
  recurrence_anchor: number | null;
  /**
   * Self-FK to the chain's root task. All instances in a recurring chain
   * share the same `parent_task_id` (= the root's id); the root itself has
   * `parent_task_id = NULL`.
   */
  parent_task_id: string | null;
};

export type TaskRecurrence = "daily" | "weekdays" | "weekly" | "monthly";

export type MilestoneStatus = "active" | "complete" | "archived";

export type MilestoneRow = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  due_date: number | null;
  status: MilestoneStatus;
  sort_order: number;
  created_at: number;
  updated_at: number;
};

/**
 * A cron-fired autonomous task. Distinct from `TaskRow` — these rows live in
 * the `scheduled_runs` table and feed the in-process cron scheduler (see
 * `server/cron.ts`) and the /schedule page. Work-task / kanban code paths
 * MUST NOT touch this type.
 */
export type ScheduledRunRow = {
  id: string;
  employee_id: string;
  skill: string | null;
  playbook: string | null;
  schedule_cron: string;
  human_label: string | null;
  enabled: 0 | 1;
  last_run_id: string | null;
  last_run_at: number | null;
  created_at: number;
};

export type SettingRow = {
  key: string;
  value: string;
  updated_at: number;
};

// ---------------------------------------------------------------------------
// Projects + Sessions (Wave 1 — Claude Code orchestrator)
// ---------------------------------------------------------------------------

export type ProjectRow = {
  id: string;
  name: string;
  path: string;
  transcript_dir: string | null;
  color: string | null;
  icon: string | null;
  agent_name: string | null;
  agent_avatar: string | null;
  is_internal: 0 | 1;
  description: string | null;
  brief_markdown: string | null;
  archived: 0 | 1;
  created_at: number;
  updated_at: number;
};

export type SessionStatus = "active" | "idle" | "ended";

export type SessionRow = {
  id: string;
  project_id: string;
  transcript_path: string;
  title: string | null;
  status: SessionStatus;
  started_at: number;
  last_event_at: number;
  ended_at: number | null;
  total_cost_usd: number;
  total_tokens: number;
  num_messages: number;
  num_tool_uses: number;
  last_event_type: string | null;
  last_event_summary: string | null;
  last_tool: string | null;
  last_file: string | null;
  bytes_read: number;
};

export type ProjectStats = {
  sessions_count: number;
  active_count: number;
  total_cost_usd: number;
  last_event_at: number | null;
};

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

// Pin the open SQLite handle to globalThis. Turbopack dev sometimes loads
// `db.ts` into more than one module instance (route handlers, layout, the
// instrumentation hook). Without this pin, each instance would open its own
// connection — and the `_freshWiped` guard below could re-fire and delete
// the live DB out from under one of them. Production hot reloads can't do
// this either, so the global pin is safe.
const DB_KEY = "__gaia_db_handle__";
type GlobalWithDb = typeof globalThis & {
  [DB_KEY]?: Database.Database | null;
};
function getCachedDb(): Database.Database | null {
  return (globalThis as GlobalWithDb)[DB_KEY] ?? null;
}
function setCachedDb(db: Database.Database | null): void {
  (globalThis as GlobalWithDb)[DB_KEY] = db;
}

/**
 * Test-mode blank-slate wipe. Runs once per *process* when both
 * `GAIA_FRESH=1` AND `GAIA_DATA_DIR` are set — i.e. only the test instance
 * launched via `npm run dev:test:fresh`. Deletes the SQLite files and the
 * contents of the test agents dir (preserving the `_shared/` and `_system/`
 * scaffolds so internal services keep working). No-op on prod.
 *
 * Pinned to `globalThis` so module-level reloads under Turbopack dev can't
 * re-wipe the DB after the user has created their first agent.
 */
const FRESH_KEY = "__gaia_fresh_wiped__";
type GlobalWithFresh = typeof globalThis & { [FRESH_KEY]?: boolean };
function maybeFreshWipe(): void {
  const g = globalThis as GlobalWithFresh;
  if (g[FRESH_KEY]) return;
  g[FRESH_KEY] = true;
  if (process.env.GAIA_FRESH !== "1") return;
  if (!process.env.GAIA_DATA_DIR) return; // refuse to wipe the prod data dir
  try {
    for (const f of ["gaia.db", "gaia.db-shm", "gaia.db-wal"]) {
      const p = path.join(DATA_DIR, f);
      if (fs.existsSync(p)) fs.rmSync(p, { force: true });
    }
    if (fs.existsSync(AGENTS_DIR)) {
      for (const entry of fs.readdirSync(AGENTS_DIR)) {
        if (entry === "_shared" || entry === "_system") continue;
        fs.rmSync(path.join(AGENTS_DIR, entry), {
          recursive: true,
          force: true,
        });
      }
    }
    console.log(
      `[fresh] wiped data-test/ for blank-slate session (data=${DATA_DIR}, agents=${AGENTS_DIR})`,
    );
  } catch (err) {
    console.error("[fresh] wipe failed", err);
  }
}

export function getDb(): Database.Database {
  const cached = getCachedDb();
  if (cached) return cached;
  maybeFreshWipe();
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  setCachedDb(db);
  return db;
}

/**
 * Test-mode runtime reset. Closes the cached connection so the next `getDb()`
 * opens a fresh one against whatever's on disk. Callers should delete the
 * SQLite files BEFORE invoking the next read; otherwise the open call will
 * just reopen the existing DB.
 *
 * Underscore-prefixed because it's only safe in the test instance — there are
 * no guards inside this function. The route handler that exposes it must
 * verify `GAIA_TEST_MODE=1` itself.
 */
export function _resetDb(): void {
  const cached = getCachedDb();
  try {
    cached?.close();
  } catch {
    // ignore close errors — the file is about to be unlinked anyway
  }
  setCachedDb(null);
  // Leave FRESH_KEY set — the runtime reset endpoint already deletes the
  // SQLite files itself, so we don't want `maybeFreshWipe()` to fire again
  // on the next `getDb()` and double-delete a freshly-opened DB.
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      accent_color TEXT,
      avatar_emoji TEXT,
      agent_dir TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      skill TEXT NOT NULL,
      input TEXT,
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      cost_usd REAL DEFAULT 0,
      duration_ms INTEGER,
      result_summary TEXT,
      error TEXT,
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS run_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      ts INTEGER NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES runs(id)
    );
    CREATE INDEX IF NOT EXISTS idx_run_events_run ON run_events(run_id, id);

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      recipient_id TEXT NOT NULL,
      body TEXT NOT NULL,
      run_id TEXT,
      created_at INTEGER NOT NULL,
      read_at INTEGER,
      FOREIGN KEY (run_id) REFERENCES runs(id)
    );
    CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, created_at);

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      employee_id TEXT,
      skill TEXT,
      schedule_cron TEXT,
      human_label TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_id TEXT,
      last_run_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      transcript_dir TEXT UNIQUE,
      color TEXT,
      icon TEXT,
      agent_name TEXT,
      agent_avatar TEXT,
      is_internal INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      transcript_path TEXT NOT NULL UNIQUE,
      title TEXT,
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      last_event_at INTEGER NOT NULL,
      ended_at INTEGER,
      total_cost_usd REAL DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      num_messages INTEGER DEFAULT 0,
      num_tool_uses INTEGER DEFAULT 0,
      last_event_type TEXT,
      last_event_summary TEXT,
      last_tool TEXT,
      last_file TEXT,
      bytes_read INTEGER DEFAULT 0,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id, last_event_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status, last_event_at DESC);
  `);

  // Idempotent ADD COLUMNs for tasks (SQLite has no ADD COLUMN IF NOT EXISTS).
  // We swallow the "duplicate column" error per add so reruns are safe.
  const taskAdds: Array<[string, string]> = [
    ["priority", "TEXT DEFAULT 'medium'"],
    ["status", "TEXT DEFAULT 'backlog'"],
    ["description", "TEXT"],
    ["created_at", "INTEGER"],
    ["playbook", "TEXT"],
    ["project_id", "TEXT"],
  ];
  for (const [col, decl] of taskAdds) {
    try {
      db.exec(`ALTER TABLE tasks ADD COLUMN ${col} ${decl}`);
    } catch (err) {
      // Expected on subsequent boots; only swallow "duplicate column" errors.
      const msg = err instanceof Error ? err.message : String(err);
      if (!/duplicate column/i.test(msg)) throw err;
    }
  }

  // Idempotent ADD COLUMNs for messages — kind + metadata.
  const messageAdds: Array<[string, string]> = [
    ["kind", "TEXT DEFAULT 'chat'"],
    ["metadata", "TEXT"],
  ];
  for (const [col, decl] of messageAdds) {
    try {
      db.exec(`ALTER TABLE messages ADD COLUMN ${col} ${decl}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/duplicate column/i.test(msg)) throw err;
    }
  }

  // Idempotent ADD COLUMN for employees — internal_only flag, daily cost cap,
  // runtime. `daily_cost_cap_usd` is nullable (NULL = no cap). Existing rows
  // default to NULL on the ADD COLUMN, which is the desired "no cap" semantics.
  //
  // `runtime` defaults to 'claude' so existing rows are migrated cleanly.
  // The CHECK constraint is enforced at INSERT/UPDATE time. The multi-runtime
  // MVP only branches launch + setup checks on this field — Gaia does not
  // talk to the Jules/Codex/Gemini CLIs itself.
  const employeeAdds: Array<[string, string]> = [
    ["internal_only", "INTEGER NOT NULL DEFAULT 0"],
    ["daily_cost_cap_usd", "REAL"],
    [
      "runtime",
      "TEXT NOT NULL DEFAULT 'claude' CHECK (runtime IN ('claude','jules','codex','gemini'))",
    ],
  ];
  for (const [col, decl] of employeeAdds) {
    try {
      db.exec(`ALTER TABLE employees ADD COLUMN ${col} ${decl}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/duplicate column/i.test(msg)) throw err;
    }
  }

  // Multi-runtime MVP follow-up: SQLite stores column CHECK constraints in
  // the original CREATE TABLE / ADD COLUMN DDL, and there is no in-place
  // way to widen one. Older databases scaffolded before `gemini` joined the
  // runtime set will still carry `CHECK (runtime IN ('claude','jules','codex'))`,
  // which would reject any INSERT/UPDATE with runtime='gemini'. Detect that
  // exact pattern from `sqlite_master.sql` and rebuild the employees table
  // with the broader CHECK, copying data across in a transaction. The
  // rebuild is a one-off — once `sqlite_master.sql` mentions 'gemini' the
  // guard short-circuits and this is essentially free on subsequent boots.
  const employeesDdlRow = db
    .prepare(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'employees'`,
    )
    .get() as { sql?: string } | undefined;
  const employeesDdl = employeesDdlRow?.sql ?? "";
  const needsRuntimeCheckRebuild =
    /CHECK\s*\(\s*runtime\s+IN\s*\([^)]*\)\s*\)/i.test(employeesDdl) &&
    !/gemini/i.test(employeesDdl);
  if (needsRuntimeCheckRebuild) {
    // FKs must be OFF (connection-level) around the rebuild. `defer_foreign_keys`
    // is insufficient: pre-existing rows like messages.sender_id='user' (the
    // sentinel for the human side of a thread) violate the messages→employees
    // FK at COMMIT time. Those orphans are real and predate the FK being on.
    // Toggling foreign_keys around the transaction skips validation for the
    // duration of the rebuild only.
    db.pragma("foreign_keys = OFF");
    const rebuild = db.transaction(() => {
      // Inline-rewrite the existing DDL so we preserve every column,
      // default, and other CHECK exactly as-is — only the runtime CHECK
      // list is widened. Renaming the table away first avoids the
      // "table employees already exists" error and lets us copy via a
      // simple SELECT *.
      const newDdl = employeesDdl
        .replace(/CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?employees/i, "CREATE TABLE employees_new")
        .replace(
          /CHECK\s*\(\s*runtime\s+IN\s*\([^)]*\)\s*\)/i,
          "CHECK (runtime IN ('claude','jules','codex','gemini'))",
        );
      db.exec(newDdl);
      db.exec(`INSERT INTO employees_new SELECT * FROM employees`);
      db.exec(`DROP TABLE employees`);
      db.exec(`ALTER TABLE employees_new RENAME TO employees`);
    });
    try {
      rebuild();
    } finally {
      db.pragma("foreign_keys = ON");
    }
  }

  // Idempotent ADD COLUMN for projects — brief_markdown for the longer prose
  // brief that gets injected into agent runs scoped to the project.
  // (description stays put as the short list-page subtitle.)
  const projectAdds: Array<[string, string]> = [
    ["brief_markdown", "TEXT"],
  ];
  for (const [col, decl] of projectAdds) {
    try {
      db.exec(`ALTER TABLE projects ADD COLUMN ${col} ${decl}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/duplicate column/i.test(msg)) throw err;
    }
  }

  // Idempotent ADD COLUMN for runs — project_id so we can scope a run's
  // wrapper prompt with the project's brief and later filter runs by project.
  const runAdds: Array<[string, string]> = [
    ["project_id", "TEXT"],
  ];
  for (const [col, decl] of runAdds) {
    try {
      db.exec(`ALTER TABLE runs ADD COLUMN ${col} ${decl}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/duplicate column/i.test(msg)) throw err;
    }
  }
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id, started_at DESC)`,
  );

  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_messages_kind_unread ON messages(kind, read_at, created_at DESC)`,
  );

  // Thread sessions — maps a chat thread_id to the Claude CLI session_id we
  // captured on its first run. Subsequent runs in the same thread pass
  // `--resume <claude_session_id>` so the CLI re-enters the cached session
  // rather than re-uploading the whole conversation history every turn.
  // This drives the prompt-cache savings on multi-turn chats.
  //
  // NB: `claude_session_id` is decoupled from our `messages` table — clearing
  // messages does NOT invalidate Claude's session (the CLI holds its own
  // transcript on disk). They are independent stores by design.
  db.exec(`
    CREATE TABLE IF NOT EXISTS thread_sessions (
      thread_id TEXT PRIMARY KEY,
      claude_session_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER NOT NULL,
      turn_count INTEGER DEFAULT 0
    );
  `);

  // Approvals — agent-requested actions that need human sign-off before
  // they execute. Inserted by agents (or test harnesses) and resolved via the
  // /api/approvals/[id]/{approve,skip} endpoints. Idempotent.
  db.exec(`
    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      run_id TEXT,
      action_type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      payload TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      resolved_at INTEGER,
      resolved_by TEXT,
      notes TEXT,
      FOREIGN KEY (agent_id) REFERENCES employees(id),
      FOREIGN KEY (run_id) REFERENCES runs(id)
    );
    CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status, created_at DESC);
  `);

  // -------------------------------------------------------------------------
  // Cron-split migration — pull autonomy rows out of `tasks` into their own
  // `scheduled_runs` table so the `tasks` schema can be purely about work
  // items (backlog → todo → in_progress → review → done). The two concepts
  // were conflated under one table prior to this split.
  //
  // Idempotent: the CREATE/INSERT/DELETE block runs on every boot. After the
  // first successful run there are no `tasks.schedule_cron != ''` rows to
  // migrate, so subsequent boots are no-ops. The unused cron columns on
  // `tasks` remain in place (SQLite cannot easily drop columns and they are
  // cheap to leave) but no `tasks` code path reads or writes them.
  //
  // Backup: in non-test mode we write a one-time .bak file next to the DB if
  // there are migratable rows, so a manual recovery path exists even if the
  // process is killed mid-migration. We skip when a backup file already
  // exists for this DB to avoid filling the data dir on every dev restart.
  // -------------------------------------------------------------------------
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_runs (
      id              TEXT PRIMARY KEY,
      employee_id     TEXT NOT NULL,
      skill           TEXT,
      playbook        TEXT,
      schedule_cron   TEXT NOT NULL,
      human_label     TEXT,
      enabled         INTEGER NOT NULL DEFAULT 1,
      last_run_id     TEXT,
      last_run_at     INTEGER,
      created_at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_scheduled_runs_employee ON scheduled_runs(employee_id);
    CREATE INDEX IF NOT EXISTS idx_scheduled_runs_enabled ON scheduled_runs(enabled);
  `);

  try {
    const tasksHasCronColumn = (
      db
        .prepare<unknown[], { name: string }>(`PRAGMA table_info(tasks)`)
        .all() as { name: string }[]
    ).some((r) => r.name === "schedule_cron");

    if (tasksHasCronColumn) {
      const migratable = db
        .prepare<unknown[], { n: number }>(
          `SELECT COUNT(*) AS n FROM tasks WHERE schedule_cron IS NOT NULL AND schedule_cron != ''`,
        )
        .get() as { n: number };

      if (migratable.n > 0) {
        // Best-effort one-time backup before mutating data. NODE_ENV !== 'test'
        // and a unique-per-process filename so repeated boots in the same
        // minute don't spam the data dir.
        if (process.env.NODE_ENV !== "test") {
          try {
            const existingBackups = fs
              .readdirSync(DATA_DIR)
              .filter((f) => f.startsWith("gaia.db.bak-pre-cron-split-"));
            if (existingBackups.length === 0) {
              const ts = new Date()
                .toISOString()
                .replace(/[:.]/g, "-");
              const backupPath = path.join(
                DATA_DIR,
                `gaia.db.bak-pre-cron-split-${ts}`,
              );
              fs.copyFileSync(DB_PATH, backupPath);
              console.log(`[migrate] wrote backup ${backupPath}`);
            }
          } catch (err) {
            console.warn("[migrate] backup failed (continuing):", err);
          }
        }

        const tx = db.transaction(() => {
          db.exec(`
            INSERT OR IGNORE INTO scheduled_runs (
              id, employee_id, skill, playbook, schedule_cron,
              human_label, enabled, last_run_id, last_run_at, created_at
            )
            SELECT
              id,
              COALESCE(employee_id, 'system'),
              skill,
              playbook,
              schedule_cron,
              human_label,
              enabled,
              last_run_id,
              last_run_at,
              COALESCE(created_at, CAST(strftime('%s','now') AS INTEGER) * 1000)
            FROM tasks
            WHERE schedule_cron IS NOT NULL AND schedule_cron != '';

            DELETE FROM tasks
            WHERE schedule_cron IS NOT NULL AND schedule_cron != '';
          `);
        });
        tx();
        console.log(
          `[migrate] cron-split: moved ${migratable.n} row(s) tasks → scheduled_runs`,
        );
      }
    }
  } catch (err) {
    // Don't crash boot on a migration hiccup — log loudly and continue. The
    // cron scheduler will still pick up rows already in `scheduled_runs`.
    console.error("[migrate] cron-split failed:", err);
  }

  // -------------------------------------------------------------------------
  // Milestones + per-task deadlines
  //
  // Milestones group work tasks within a project. Per-task `due_date` lives on
  // `tasks` so the kanban/backlog can surface "overdue" / "due this week"
  // without joining. Both additions are idempotent — duplicate-column errors
  // on the ALTER TABLE are swallowed, the CREATE TABLE is IF NOT EXISTS.
  //
  // Best-effort one-time backup before mutating data in non-test mode. We
  // skip when a backup with this prefix already exists for today so repeated
  // dev restarts don't fill the data dir.
  // -------------------------------------------------------------------------
  try {
    const tasksHasMilestoneCol = (
      db
        .prepare<unknown[], { name: string }>(`PRAGMA table_info(tasks)`)
        .all() as { name: string }[]
    ).some((r) => r.name === "milestone_id");
    if (!tasksHasMilestoneCol && process.env.NODE_ENV !== "test") {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const existingBackups = fs
          .readdirSync(DATA_DIR)
          .filter((f) => f.startsWith(`gaia.db.bak-pre-milestones-${today}`));
        if (existingBackups.length === 0) {
          const ts = new Date().toISOString().replace(/[:.]/g, "-");
          const backupPath = path.join(
            DATA_DIR,
            `gaia.db.bak-pre-milestones-${ts}`,
          );
          fs.copyFileSync(DB_PATH, backupPath);
          console.log(`[migrate] wrote backup ${backupPath}`);
        }
      } catch (err) {
        console.warn("[migrate] milestones backup failed (continuing):", err);
      }
    }
  } catch (err) {
    console.warn("[migrate] milestones backup probe failed (continuing):", err);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS milestones (
      id           TEXT PRIMARY KEY,
      project_id   TEXT NOT NULL,
      name         TEXT NOT NULL,
      description  TEXT,
      due_date     INTEGER,
      status       TEXT NOT NULL DEFAULT 'active',
      sort_order   INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);
    CREATE INDEX IF NOT EXISTS idx_milestones_status  ON milestones(status);
  `);

  const taskMilestoneAdds: Array<[string, string]> = [
    ["milestone_id", "TEXT"],
    ["due_date", "INTEGER"],
  ];
  for (const [col, decl] of taskMilestoneAdds) {
    try {
      db.exec(`ALTER TABLE tasks ADD COLUMN ${col} ${decl}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/duplicate column/i.test(msg)) throw err;
    }
  }
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_tasks_milestone ON tasks(milestone_id)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date)`,
  );

  // -------------------------------------------------------------------------
  // Recurring tasks
  //
  // Adds `recurrence`, `recurrence_anchor`, `parent_task_id` to `tasks`.
  // `recurrence` is one of 'daily'|'weekdays'|'weekly'|'monthly' or NULL
  // (non-recurring). `recurrence_anchor` holds the original due_date ms-epoch
  // so the time-of-day stays stable across spawned instances. `parent_task_id`
  // is a self-FK to the root task in the chain — every spawned instance
  // shares the same root so the chain doesn't fork.
  //
  // Best-effort one-time backup before the ALTER. Skipped under tests; also
  // skipped if a backup with this prefix already exists for today.
  // -------------------------------------------------------------------------
  try {
    const tasksCols = (
      db
        .prepare<unknown[], { name: string }>(`PRAGMA table_info(tasks)`)
        .all() as { name: string }[]
    ).map((r) => r.name);
    const recurrenceColsMissing =
      !tasksCols.includes("recurrence") ||
      !tasksCols.includes("recurrence_anchor") ||
      !tasksCols.includes("parent_task_id");
    if (
      recurrenceColsMissing &&
      process.env.NODE_ENV !== "test" &&
      process.env.GAIA_TEST_MODE !== "1"
    ) {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const existingBackups = fs
          .readdirSync(DATA_DIR)
          .filter((f) => f.startsWith(`gaia.db.bak-pre-recurrence-${today}`));
        if (existingBackups.length === 0) {
          const ts = new Date().toISOString().replace(/[:.]/g, "-");
          const backupPath = path.join(
            DATA_DIR,
            `gaia.db.bak-pre-recurrence-${ts}`,
          );
          fs.copyFileSync(DB_PATH, backupPath);
          console.log(`[migrate] wrote backup ${backupPath}`);
        }
      } catch (err) {
        console.warn("[migrate] recurrence backup failed (continuing):", err);
      }
    }
  } catch (err) {
    console.warn("[migrate] recurrence backup probe failed (continuing):", err);
  }

  const taskRecurrenceAdds: Array<[string, string]> = [
    ["recurrence", "TEXT"],
    ["recurrence_anchor", "INTEGER"],
    ["parent_task_id", "TEXT"],
  ];
  for (const [col, decl] of taskRecurrenceAdds) {
    try {
      db.exec(`ALTER TABLE tasks ADD COLUMN ${col} ${decl}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/duplicate column/i.test(msg)) throw err;
    }
  }
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_tasks_recurrence ON tasks(recurrence)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id)`,
  );

  // -------------------------------------------------------------------------
  // Internal-projects cleanup
  //
  // The session-watcher historically auto-registered any directory that had a
  // Claude Code transcript as a "project". That includes agent dirs (which
  // have their own transcripts when an agent runs), the user's home, and tmp
  // dirs — all of which pollute the user-facing /projects grid.
  //
  // This migration walks the `projects` rows once on boot and flips
  // `is_internal = 1` for any whose path matches the internal-cwd rules
  // (agents dir, agents-test dir, /tmp, /private/tmp, /var/folders, or the
  // user's home dir itself). Idempotent — runs every boot but only updates
  // rows whose flag isn't already set. Best-effort backup is written if any
  // rows actually need flipping, with a unique-per-prefix guard so dev
  // restarts don't fill the data dir.
  // -------------------------------------------------------------------------
  try {
    const candidates = db
      .prepare<unknown[], { id: string; path: string; is_internal: number }>(
        `SELECT id, path, is_internal FROM projects WHERE is_internal = 0`,
      )
      .all() as { id: string; path: string; is_internal: number }[];

    const HOME = (() => {
      try {
        return path.resolve(os.homedir());
      } catch {
        return "";
      }
    })();
    const AGENTS_TEST_DIR = path.join(PROJECT_ROOT, "agents-test");

    const isUnder = (abs: string, root: string): boolean => {
      const r = path.resolve(root);
      if (abs === r) return true;
      const rel = path.relative(r, abs);
      return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
    };

    const isInternalPath = (p: string): boolean => {
      if (!p || typeof p !== "string") return false;
      let abs: string;
      try {
        abs = path.resolve(p);
      } catch {
        return false;
      }
      if (HOME && abs === HOME) return true;
      if (isUnder(abs, AGENTS_DIR)) return true;
      if (isUnder(abs, AGENTS_TEST_DIR)) return true;
      // Any path that has `/agents/` or `/agents-test/` as a directory
      // segment (catches alternate checkouts of this project, e.g. an
      // iCloud-synced copy whose agents/<slug> dirs live outside
      // PROJECT_ROOT).
      const segments = abs.split(path.sep).filter(Boolean);
      for (let i = 0; i < segments.length - 1; i++) {
        if (segments[i] === "agents" || segments[i] === "agents-test") {
          return true;
        }
      }
      if (isUnder(abs, "/tmp")) return true;
      if (isUnder(abs, "/private/tmp")) return true;
      if (isUnder(abs, "/var/folders")) return true;
      return false;
    };

    const toFlip = candidates.filter((c) => isInternalPath(c.path));

    if (toFlip.length > 0) {
      // One-time backup, prod DB only, before mutating any row.
      if (process.env.NODE_ENV !== "test" && process.env.GAIA_TEST_MODE !== "1") {
        try {
          const existingBackups = fs
            .readdirSync(DATA_DIR)
            .filter((f) => f.startsWith("gaia.db.bak-pre-internal-cleanup-"));
          if (existingBackups.length === 0) {
            const ts = new Date().toISOString().replace(/[:.]/g, "-");
            const backupPath = path.join(
              DATA_DIR,
              `gaia.db.bak-pre-internal-cleanup-${ts}`,
            );
            fs.copyFileSync(DB_PATH, backupPath);
            console.log(`[migrate] wrote backup ${backupPath}`);
          }
        } catch (err) {
          console.warn(
            "[migrate] internal-cleanup backup failed (continuing):",
            err,
          );
        }
      }

      const update = db.prepare(
        `UPDATE projects SET is_internal = 1, updated_at = ? WHERE id = ?`,
      );
      const now = Date.now();
      const tx = db.transaction(() => {
        for (const row of toFlip) update.run(now, row.id);
      });
      tx();
      console.log(
        `[migrate] internal-cleanup: flipped ${toFlip.length} project row(s) to is_internal=1`,
      );
    }
  } catch (err) {
    console.error("[migrate] internal-cleanup failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

export function listEmployees(): EmployeeRow[] {
  return getDb()
    .prepare(`SELECT * FROM employees ORDER BY created_at ASC`)
    .all() as EmployeeRow[];
}

export function getEmployee(id: string): EmployeeRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM employees WHERE id = ?`)
    .get(id) as EmployeeRow | undefined;
}

export function setEmployeeStatus(
  id: string,
  status: EmployeeRow["status"],
): void {
  getDb()
    .prepare(`UPDATE employees SET status = ? WHERE id = ?`)
    .run(status, id);
}

/** Idempotent: only seeds if employees table is empty. */
export function seedEmployeesIfEmpty(): { seeded: boolean; count: number } {
  const db = getDb();
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM employees`)
    .get() as { n: number };
  if (row.n > 0) return { seeded: false, count: row.n };

  const insert = db.prepare(`
    INSERT INTO employees (id, name, role, status, accent_color, avatar_emoji, agent_dir, created_at)
    VALUES (@id, @name, @role, @status, @accent_color, @avatar_emoji, @agent_dir, @created_at)
  `);

  const now = Date.now();
  // Emoji defaults per persona (UI uses initials so these are optional).
  const emojiByRole: Record<string, string> = {
    gaia: "🧠",
    nova: "✨",
    atlas: "🗺️",
    "king-henry": "✍️",
    rack: "🔧",
  };

  const tx = db.transaction(() => {
    for (const e of DEFAULT_EMPLOYEES) {
      insert.run({
        id: e.id,
        name: e.name,
        role: e.role,
        status: "idle",
        accent_color: e.accent ?? null,
        avatar_emoji: emojiByRole[e.id] ?? null,
        agent_dir: path.join(AGENTS_DIR, e.id),
        created_at: now,
      });
    }
  });
  tx();

  return { seeded: true, count: DEFAULT_EMPLOYEES.length };
}

/**
 * Idempotent: ensure the special 'system' pseudo-employee exists. Used as the
 * sender for notifications that have no real agent (session-ended, cron-fired
 * with no assigned agent, etc.). Marked internal_only=1 so the Workforce panel
 * can hide it while the row still satisfies foreign-key joins and avatar
 * rendering.
 */
export function ensureSystemEmployee(): EmployeeRow {
  const db = getDb();
  const existing = getEmployee("system");
  const agentDir = path.join(AGENTS_DIR, "_system");
  // Best-effort scaffold of an empty dir (no CLAUDE.md, no skills).
  try {
    if (!fs.existsSync(agentDir)) fs.mkdirSync(agentDir, { recursive: true });
  } catch {
    // ignore — dir presence is purely cosmetic for the system pseudo-agent.
  }
  if (existing) {
    // Backfill internal_only flag for older rows.
    if (existing.internal_only !== 1) {
      db.prepare(`UPDATE employees SET internal_only = 1 WHERE id = ?`).run(
        "system",
      );
    }
    return getEmployee("system")!;
  }
  db.prepare(
    `INSERT INTO employees (id, name, role, status, accent_color, avatar_emoji, agent_dir, created_at, internal_only)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
  ).run(
    "system",
    "System",
    "Notifications & autonomy",
    "idle",
    "#64748B",
    "monk",
    agentDir,
    Date.now(),
  );
  return getEmployee("system")!;
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export type InsertRunArgs = {
  id?: string;
  employee_id: string;
  skill: string;
  input: string | null;
  status?: RunStatus;
  project_id?: string | null;
};

export function insertRun(args: InsertRunArgs): RunRow {
  const id = args.id ?? randomUUID();
  const now = Date.now();
  const status: RunStatus = args.status ?? "running";
  getDb()
    .prepare(
      `INSERT INTO runs (id, employee_id, skill, input, status, started_at, cost_usd, project_id)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    )
    .run(
      id,
      args.employee_id,
      args.skill,
      args.input,
      status,
      now,
      args.project_id ?? null,
    );
  return getRun(id)!;
}

export type UpdateRunArgs = Partial<{
  status: RunStatus;
  ended_at: number | null;
  cost_usd: number;
  duration_ms: number | null;
  result_summary: string | null;
  error: string | null;
}>;

export function updateRun(id: string, patch: UpdateRunArgs): void {
  const keys = Object.keys(patch);
  if (keys.length === 0) return;
  const setClause = keys.map((k) => `${k} = @${k}`).join(", ");
  getDb()
    .prepare(`UPDATE runs SET ${setClause} WHERE id = @id`)
    .run({ id, ...patch });
}

export function getRun(id: string): RunRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM runs WHERE id = ?`)
    .get(id) as RunRow | undefined;
}

export function listRuns(opts?: {
  employee_id?: string;
  limit?: number;
}): RunRow[] {
  const limit = opts?.limit ?? 50;
  if (opts?.employee_id) {
    return getDb()
      .prepare(
        `SELECT * FROM runs WHERE employee_id = ? ORDER BY started_at DESC LIMIT ?`,
      )
      .all(opts.employee_id, limit) as RunRow[];
  }
  return getDb()
    .prepare(`SELECT * FROM runs ORDER BY started_at DESC LIMIT ?`)
    .all(limit) as RunRow[];
}

// ---------------------------------------------------------------------------
// Run events
// ---------------------------------------------------------------------------

export function appendRunEvent(args: {
  run_id: string;
  type: RunEventType;
  payload: unknown;
  ts?: number;
}): RunEventRow {
  const ts = args.ts ?? Date.now();
  const payload =
    typeof args.payload === "string"
      ? args.payload
      : JSON.stringify(args.payload);
  const info = getDb()
    .prepare(
      `INSERT INTO run_events (run_id, ts, type, payload) VALUES (?, ?, ?, ?)`,
    )
    .run(args.run_id, ts, args.type, payload);
  return {
    id: Number(info.lastInsertRowid),
    run_id: args.run_id,
    ts,
    type: args.type,
    payload,
  };
}

export function listRunEvents(
  run_id: string,
  opts?: { afterId?: number; limit?: number },
): RunEventRow[] {
  const limit = opts?.limit ?? 1000;
  const after = opts?.afterId ?? 0;
  return getDb()
    .prepare(
      `SELECT * FROM run_events WHERE run_id = ? AND id > ? ORDER BY id ASC LIMIT ?`,
    )
    .all(run_id, after, limit) as RunEventRow[];
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export function canonicalThreadId(a: string, b: string): string {
  return [a, b].sort().join(":");
}

export function insertMessage(args: {
  id?: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  run_id?: string | null;
  kind?: MessageKind;
  metadata?: NotificationMetadata | Record<string, unknown> | null;
}): MessageRow {
  const id = args.id ?? randomUUID();
  const thread_id = canonicalThreadId(args.sender_id, args.recipient_id);
  const now = Date.now();
  const kind: MessageKind = args.kind ?? "chat";
  const metadataJson =
    args.metadata == null ? null : JSON.stringify(args.metadata);
  getDb()
    .prepare(
      `INSERT INTO messages (id, thread_id, sender_id, recipient_id, body, run_id, created_at, kind, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      thread_id,
      args.sender_id,
      args.recipient_id,
      args.body,
      args.run_id ?? null,
      now,
      kind,
      metadataJson,
    );
  return getDb()
    .prepare(`SELECT * FROM messages WHERE id = ?`)
    .get(id) as MessageRow;
}

/**
 * Insert a notification message (kind='notification') into the recipient's
 * thread. Defaults recipient_id to 'user'. Used by the notifier service for
 * run-completed, session-ended, cron-fired events.
 */
export function insertNotification(args: {
  id?: string;
  sender_id: string;
  recipient_id?: string;
  body: string;
  metadata: NotificationMetadata;
  run_id?: string | null;
}): MessageRow {
  return insertMessage({
    id: args.id,
    sender_id: args.sender_id,
    recipient_id: args.recipient_id ?? "user",
    body: args.body,
    run_id: args.run_id ?? null,
    kind: "notification",
    metadata: args.metadata,
  });
}

export function listNotifications(opts?: {
  unread_only?: boolean;
  limit?: number;
  recipient_id?: string;
}): MessageRow[] {
  const db = getDb();
  const limit = Math.max(1, Math.min(opts?.limit ?? 50, 500));
  const where: string[] = [`kind = 'notification'`];
  const params: unknown[] = [];
  if (opts?.unread_only) where.push(`read_at IS NULL`);
  if (opts?.recipient_id) {
    where.push(`recipient_id = ?`);
    params.push(opts.recipient_id);
  }
  const sql = `SELECT * FROM messages WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);
  return db.prepare(sql).all(...params) as MessageRow[];
}

export function markMessageRead(id: string): boolean {
  const info = getDb()
    .prepare(`UPDATE messages SET read_at = ? WHERE id = ? AND read_at IS NULL`)
    .run(Date.now(), id);
  return info.changes > 0;
}

/**
 * Hard-delete a single message row by id. Returns true if a row was removed.
 * Used by `DELETE /api/messages/[id]` for both chat messages and notifications.
 */
export function deleteMessage(id: string): boolean {
  const info = getDb().prepare(`DELETE FROM messages WHERE id = ?`).run(id);
  return info.changes > 0;
}

/**
 * Hard-delete notification messages (kind='notification'). When `thread_id` is
 * provided, the delete is scoped to that thread; otherwise it clears notifications
 * across every thread. Returns the number of rows removed.
 */
export function clearNotifications(opts?: { thread_id?: string }): number {
  const db = getDb();
  if (opts?.thread_id) {
    const info = db
      .prepare(
        `DELETE FROM messages WHERE kind = 'notification' AND thread_id = ?`,
      )
      .run(opts.thread_id);
    return info.changes;
  }
  const info = db
    .prepare(`DELETE FROM messages WHERE kind = 'notification'`)
    .run();
  return info.changes;
}

export function markThreadRead(thread_id: string): number {
  const info = getDb()
    .prepare(
      `UPDATE messages SET read_at = ? WHERE thread_id = ? AND read_at IS NULL`,
    )
    .run(Date.now(), thread_id);
  return info.changes;
}

export type UnreadCounts = {
  total: number;
  by_thread: Record<string, number>;
  by_kind: { chat: number; notification: number };
};

export function unreadCounts(): UnreadCounts {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT thread_id, kind, COUNT(*) AS n
       FROM messages
       WHERE read_at IS NULL
       GROUP BY thread_id, kind`,
    )
    .all() as { thread_id: string; kind: MessageKind | null; n: number }[];
  const out: UnreadCounts = {
    total: 0,
    by_thread: {},
    by_kind: { chat: 0, notification: 0 },
  };
  for (const r of rows) {
    out.total += r.n;
    out.by_thread[r.thread_id] = (out.by_thread[r.thread_id] ?? 0) + r.n;
    const k: MessageKind = r.kind === "notification" ? "notification" : "chat";
    out.by_kind[k] += r.n;
  }
  return out;
}

export function listMessages(thread_id: string, limit = 200): MessageRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC LIMIT ?`,
    )
    .all(thread_id, limit) as MessageRow[];
}

export type ThreadSummary = {
  thread_id: string;
  participants: string[];
  last_message_at: number;
  preview: string;
  unread_count: number;
};

export function listThreads(participantId?: string): ThreadSummary[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT thread_id, MAX(created_at) AS last_at FROM messages GROUP BY thread_id ORDER BY last_at DESC LIMIT 100`,
    )
    .all() as { thread_id: string; last_at: number }[];

  const summaries: ThreadSummary[] = [];
  for (const r of rows) {
    const last = db
      .prepare(
        `SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .get(r.thread_id) as MessageRow | undefined;
    if (!last) continue;
    const participants = r.thread_id.split(":");
    if (participantId && !participants.includes(participantId)) continue;
    const unreadRow = db
      .prepare(
        `SELECT COUNT(*) AS n FROM messages WHERE thread_id = ? AND read_at IS NULL`,
      )
      .get(r.thread_id) as { n: number };
    summaries.push({
      thread_id: r.thread_id,
      participants,
      last_message_at: r.last_at,
      preview: last.body.slice(0, 200),
      unread_count: unreadRow.n,
    });
  }
  return summaries;
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export type ApprovalStatus = "pending" | "approved" | "skipped";

export type ApprovalRow = {
  id: string;
  agent_id: string;
  run_id: string | null;
  action_type: string;
  title: string;
  body: string | null;
  payload: string | null;
  status: ApprovalStatus;
  created_at: number;
  resolved_at: number | null;
  resolved_by: string | null;
  notes: string | null;
};

export type ApprovalFilters = {
  status?: ApprovalStatus;
  agent_id?: string;
  limit?: number;
};

export function listApprovals(filters?: ApprovalFilters): ApprovalRow[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters?.status) {
    where.push("status = ?");
    params.push(filters.status);
  }
  if (filters?.agent_id) {
    where.push("agent_id = ?");
    params.push(filters.agent_id);
  }
  const sql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const limit = Math.max(1, Math.min(filters?.limit ?? 50, 500));
  return getDb()
    .prepare(
      `SELECT * FROM approvals${sql} ORDER BY created_at DESC LIMIT ?`,
    )
    .all(...params, limit) as ApprovalRow[];
}

export function getApproval(id: string): ApprovalRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM approvals WHERE id = ?`)
    .get(id) as ApprovalRow | undefined;
}

export type InsertApprovalInput = {
  id?: string;
  agent_id: string;
  run_id?: string | null;
  action_type: string;
  title: string;
  body?: string | null;
  payload?: unknown | null;
  status?: ApprovalStatus;
  created_at?: number;
};

export function insertApproval(input: InsertApprovalInput): ApprovalRow {
  const id = input.id ?? randomUUID();
  const created_at = input.created_at ?? Date.now();
  const status: ApprovalStatus = input.status ?? "pending";
  let payloadJson: string | null = null;
  if (input.payload != null) {
    payloadJson =
      typeof input.payload === "string"
        ? input.payload
        : JSON.stringify(input.payload);
  }
  getDb()
    .prepare(
      `INSERT INTO approvals (
        id, agent_id, run_id, action_type, title, body, payload,
        status, created_at, resolved_at, resolved_by, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)`,
    )
    .run(
      id,
      input.agent_id,
      input.run_id ?? null,
      input.action_type,
      input.title,
      input.body ?? null,
      payloadJson,
      status,
      created_at,
    );
  return getApproval(id)!;
}

export function resolveApproval(
  id: string,
  status: "approved" | "skipped",
  opts?: { resolved_by?: string; notes?: string | null },
): ApprovalRow | undefined {
  const existing = getApproval(id);
  if (!existing) return undefined;
  // Idempotent — if already resolved, return as-is so callers can no-op.
  if (existing.status !== "pending") return existing;
  getDb()
    .prepare(
      `UPDATE approvals
         SET status = ?, resolved_at = ?, resolved_by = ?, notes = ?
       WHERE id = ?`,
    )
    .run(
      status,
      Date.now(),
      opts?.resolved_by ?? "user",
      opts?.notes ?? null,
      id,
    );
  return getApproval(id);
}

export function countPendingApprovals(): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM approvals WHERE status = 'pending'`)
    .get() as { n: number };
  return row.n ?? 0;
}

// ---------------------------------------------------------------------------
// Thread sessions (Claude CLI session continuity for chat threads)
// ---------------------------------------------------------------------------

export type ThreadSessionRow = {
  thread_id: string;
  claude_session_id: string;
  agent_id: string;
  created_at: number;
  last_used_at: number;
  turn_count: number;
};

export function getThreadSession(
  thread_id: string,
): ThreadSessionRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM thread_sessions WHERE thread_id = ?`)
    .get(thread_id) as ThreadSessionRow | undefined;
}

export type UpsertThreadSessionInput = {
  thread_id: string;
  claude_session_id: string;
  agent_id: string;
};

/**
 * Insert-or-replace a thread_sessions row. On insert: created_at = now,
 * last_used_at = now, turn_count = 1. On update (e.g. after a stale-session
 * reset captured a fresh session_id): bumps last_used_at, resets turn_count to
 * 1, and replaces claude_session_id while preserving created_at.
 */
export function upsertThreadSession(
  input: UpsertThreadSessionInput,
): ThreadSessionRow {
  const now = Date.now();
  const existing = getThreadSession(input.thread_id);
  if (existing) {
    getDb()
      .prepare(
        `UPDATE thread_sessions
            SET claude_session_id = ?, agent_id = ?, last_used_at = ?, turn_count = 1
          WHERE thread_id = ?`,
      )
      .run(input.claude_session_id, input.agent_id, now, input.thread_id);
    return getThreadSession(input.thread_id)!;
  }
  getDb()
    .prepare(
      `INSERT INTO thread_sessions (
        thread_id, claude_session_id, agent_id, created_at, last_used_at, turn_count
      ) VALUES (?, ?, ?, ?, ?, 1)`,
    )
    .run(input.thread_id, input.claude_session_id, input.agent_id, now, now);
  return getThreadSession(input.thread_id)!;
}

/** Increment turn_count and bump last_used_at to now. */
export function bumpThreadSessionTurn(thread_id: string): void {
  getDb()
    .prepare(
      `UPDATE thread_sessions
          SET turn_count = turn_count + 1, last_used_at = ?
        WHERE thread_id = ?`,
    )
    .run(Date.now(), thread_id);
}

/**
 * Drop a thread_sessions row — used when a stored session_id can no longer be
 * resumed (e.g. the CLI's transcript was deleted) and we need to start fresh.
 */
export function deleteThreadSession(thread_id: string): boolean {
  const info = getDb()
    .prepare(`DELETE FROM thread_sessions WHERE thread_id = ?`)
    .run(thread_id);
  return info.changes > 0;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export type TaskFilters = {
  employee_id?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  search?: string;
  project_id?: string;
  /**
   * Filter by milestone assignment. Pass a string id to scope to that
   * milestone; pass `null` to filter to tasks with NO milestone.
   */
  milestone_id?: string | null;
  /** ms-epoch upper bound — tasks with due_date strictly before this value. */
  due_before?: number;
  /**
   * Pre-baked deadline buckets used by the kanban / overview widgets. Only
   * one applies at a time. Always restricts to tasks where status is not
   * `done` or `archived` (the "active" set).
   *
   * - `overdue`: due_date < now AND due_date IS NOT NULL
   * - `this_week`: due_date BETWEEN now AND now+7d (inclusive)
   * - `today`: due_date BETWEEN now AND end-of-today-local
   * - `no_due`: due_date IS NULL
   */
  due_status?: "overdue" | "this_week" | "today" | "no_due";
};

function buildTaskWhere(
  filters: TaskFilters | undefined,
  forcedStatus?: TaskStatus,
): { sql: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (forcedStatus) {
    where.push("status = ?");
    params.push(forcedStatus);
  } else if (filters?.status) {
    where.push("status = ?");
    params.push(filters.status);
  }
  if (filters?.employee_id) {
    where.push("employee_id = ?");
    params.push(filters.employee_id);
  }
  if (filters?.priority) {
    where.push("priority = ?");
    params.push(filters.priority);
  }
  if (filters?.project_id) {
    where.push("project_id = ?");
    params.push(filters.project_id);
  }
  if (filters && "milestone_id" in filters) {
    if (filters.milestone_id === null) {
      where.push("milestone_id IS NULL");
    } else if (typeof filters.milestone_id === "string") {
      where.push("milestone_id = ?");
      params.push(filters.milestone_id);
    }
  }
  if (typeof filters?.due_before === "number") {
    where.push("due_date IS NOT NULL AND due_date < ?");
    params.push(filters.due_before);
  }
  if (filters?.due_status) {
    const now = Date.now();
    if (filters.due_status === "overdue") {
      where.push(
        "due_date IS NOT NULL AND due_date < ? AND status NOT IN ('done','archived')",
      );
      params.push(now);
    } else if (filters.due_status === "this_week") {
      where.push(
        "due_date IS NOT NULL AND due_date >= ? AND due_date <= ? AND status NOT IN ('done','archived')",
      );
      params.push(now, now + 7 * 86_400_000);
    } else if (filters.due_status === "today") {
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      where.push(
        "due_date IS NOT NULL AND due_date >= ? AND due_date <= ? AND status NOT IN ('done','archived')",
      );
      params.push(now, endOfToday.getTime());
    } else if (filters.due_status === "no_due") {
      where.push("due_date IS NULL AND status NOT IN ('done','archived')");
    }
  }
  if (filters?.search && filters.search.trim()) {
    where.push("(LOWER(title) LIKE ? OR LOWER(COALESCE(description,'')) LIKE ?)");
    const term = `%${filters.search.trim().toLowerCase()}%`;
    params.push(term, term);
  }
  const sql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  return { sql, params };
}

/** Tasks where status='backlog'. */
export function listBacklogTasks(filters?: TaskFilters): TaskRow[] {
  const { sql, params } = buildTaskWhere(filters, "backlog");
  return getDb()
    .prepare(
      `SELECT * FROM tasks${sql} ORDER BY COALESCE(created_at, 0) DESC, id ASC`,
    )
    .all(...params) as TaskRow[];
}

/** All tasks (any status). Useful for activity/sprint queries. */
export function listAllTasks(filters?: TaskFilters): TaskRow[] {
  const { sql, params } = buildTaskWhere(filters);
  return getDb()
    .prepare(
      `SELECT * FROM tasks${sql} ORDER BY COALESCE(created_at, 0) DESC, id ASC`,
    )
    .all(...params) as TaskRow[];
}

export function getTask(id: string): TaskRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM tasks WHERE id = ?`)
    .get(id) as TaskRow | undefined;
}

export type InsertTaskInput = {
  id?: string;
  title: string;
  employee_id?: string | null;
  skill?: string | null;
  schedule_cron?: string | null;
  human_label?: string | null;
  enabled?: 0 | 1 | boolean;
  priority?: TaskPriority;
  status?: TaskStatus;
  description?: string | null;
  playbook?: string | null;
  created_at?: number;
  project_id?: string | null;
  milestone_id?: string | null;
  due_date?: number | null;
  recurrence?: TaskRecurrence | null;
  recurrence_anchor?: number | null;
  parent_task_id?: string | null;
};

export function insertTask(input: InsertTaskInput): TaskRow {
  const id = input.id ?? randomUUID();
  const created_at = input.created_at ?? Date.now();
  const enabledVal: 0 | 1 =
    input.enabled === undefined
      ? 1
      : (Number(Boolean(input.enabled)) as 0 | 1);
  getDb()
    .prepare(
      `INSERT INTO tasks (
        id, title, employee_id, skill, schedule_cron, human_label,
        enabled, last_run_id, last_run_at,
        priority, status, description, created_at, playbook, project_id,
        milestone_id, due_date, recurrence, recurrence_anchor, parent_task_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.title,
      input.employee_id ?? null,
      input.skill ?? null,
      input.schedule_cron ?? null,
      input.human_label ?? null,
      enabledVal,
      input.priority ?? "medium",
      input.status ?? "backlog",
      input.description ?? null,
      created_at,
      input.playbook ?? null,
      input.project_id ?? null,
      input.milestone_id ?? null,
      input.due_date ?? null,
      input.recurrence ?? null,
      input.recurrence_anchor ?? null,
      input.parent_task_id ?? null,
    );
  return getTask(id)!;
}

export type UpdateTaskPatch = Partial<{
  title: string;
  employee_id: string | null;
  skill: string | null;
  schedule_cron: string | null;
  human_label: string | null;
  enabled: 0 | 1 | boolean;
  last_run_id: string | null;
  last_run_at: number | null;
  priority: TaskPriority;
  status: TaskStatus;
  description: string | null;
  playbook: string | null;
  project_id: string | null;
  milestone_id: string | null;
  due_date: number | null;
  recurrence: TaskRecurrence | null;
  recurrence_anchor: number | null;
  parent_task_id: string | null;
}>;

const TASK_PATCH_KEYS = [
  "title",
  "employee_id",
  "skill",
  "schedule_cron",
  "human_label",
  "enabled",
  "last_run_id",
  "last_run_at",
  "priority",
  "status",
  "description",
  "playbook",
  "project_id",
  "milestone_id",
  "due_date",
  "recurrence",
  "recurrence_anchor",
  "parent_task_id",
] as const;

export function updateTask(id: string, patch: UpdateTaskPatch): TaskRow | undefined {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  for (const key of TASK_PATCH_KEYS) {
    if (key in patch) {
      let v: unknown = (patch as Record<string, unknown>)[key];
      if (key === "enabled") v = Number(Boolean(v)) as 0 | 1;
      setClauses.push(`${key} = ?`);
      values.push(v);
    }
  }
  if (setClauses.length === 0) return getTask(id);
  values.push(id);
  getDb()
    .prepare(`UPDATE tasks SET ${setClauses.join(", ")} WHERE id = ?`)
    .run(...values);
  return getTask(id);
}

/**
 * Hard-deletes the row from the tasks table. Callers that want a soft-delete
 * should prefer `updateTask(id, { status: 'archived' })`.
 */
export function deleteTask(id: string): boolean {
  const info = getDb().prepare(`DELETE FROM tasks WHERE id = ?`).run(id);
  return info.changes > 0;
}

export const VALID_RECURRENCES: readonly TaskRecurrence[] = [
  "daily",
  "weekdays",
  "weekly",
  "monthly",
] as const;

/**
 * Compute the next occurrence of a recurring task as ms-epoch. Preserves the
 * time-of-day of `current_due_date`. `weekdays` skips Sat/Sun (Fri → Mon).
 * `monthly` clamps to the last day of the next month when the day-of-month
 * doesn't exist (e.g. Jan 31 → Feb 28 / 29).
 */
export function computeNextOccurrence(
  current_due_date: number,
  recurrence: TaskRecurrence,
): number {
  const d = new Date(current_due_date);
  if (recurrence === "daily") {
    d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  if (recurrence === "weekdays") {
    d.setDate(d.getDate() + 1);
    // 0=Sun, 6=Sat
    const dow = d.getDay();
    if (dow === 6) d.setDate(d.getDate() + 2); // Sat → Mon
    else if (dow === 0) d.setDate(d.getDate() + 1); // Sun → Mon
    return d.getTime();
  }
  if (recurrence === "weekly") {
    d.setDate(d.getDate() + 7);
    return d.getTime();
  }
  // monthly — preserve day-of-month, clamp to last day if next month is shorter
  const desiredDay = d.getDate();
  const hh = d.getHours();
  const mm = d.getMinutes();
  const ss = d.getSeconds();
  const ms = d.getMilliseconds();
  const targetMonth = d.getMonth() + 1;
  const targetYear = d.getFullYear();
  // Last day of target month: day 0 of (month+1) returns last day of `month`.
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  const day = Math.min(desiredDay, lastDay);
  return new Date(targetYear, targetMonth, day, hh, mm, ss, ms).getTime();
}

/**
 * Spawn the next instance of a recurring task. Returns the new row, or null
 * if the parent isn't recurring or has no anchorable due date.
 *
 * The spawned task copies the template fields (title, description, project,
 * owner, priority, milestone, recurrence, recurrence_anchor) and sets
 * `parent_task_id` to the chain's root id so every instance shares the same
 * root. Status is reset to `todo`. `due_date` is computed via
 * `computeNextOccurrence`.
 */
export function spawnNextRecurringInstance(
  parentTaskId: string,
): TaskRow | null {
  const parent = getTask(parentTaskId);
  if (!parent) return null;
  if (!parent.recurrence) return null;
  const anchorBase =
    parent.due_date ?? parent.recurrence_anchor ?? null;
  if (anchorBase === null) {
    console.warn(
      `[recurrence] task ${parentTaskId} has recurrence=${parent.recurrence} but no due_date or recurrence_anchor — skipping spawn`,
    );
    return null;
  }
  const next = computeNextOccurrence(anchorBase, parent.recurrence);
  const rootId = parent.parent_task_id ?? parent.id;
  const id = randomUUID();
  return insertTask({
    id,
    title: parent.title,
    employee_id: parent.employee_id,
    project_id: parent.project_id,
    description: parent.description,
    priority: parent.priority,
    milestone_id: parent.milestone_id,
    status: "todo",
    due_date: next,
    recurrence: parent.recurrence,
    recurrence_anchor: parent.recurrence_anchor ?? parent.due_date ?? next,
    parent_task_id: rootId,
  });
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export type MilestoneFilters = {
  project_id: string;
  status?: MilestoneStatus;
  search?: string;
};

export function listMilestones(filters: MilestoneFilters): MilestoneRow[] {
  const where: string[] = ["project_id = ?"];
  const params: unknown[] = [filters.project_id];
  if (filters.status) {
    where.push("status = ?");
    params.push(filters.status);
  }
  if (filters.search && filters.search.trim()) {
    where.push("(LOWER(name) LIKE ? OR LOWER(COALESCE(description,'')) LIKE ?)");
    const term = `%${filters.search.trim().toLowerCase()}%`;
    params.push(term, term);
  }
  return getDb()
    .prepare(
      `SELECT * FROM milestones WHERE ${where.join(" AND ")}
       ORDER BY sort_order ASC,
                COALESCE(due_date, 9999999999999) ASC,
                created_at DESC`,
    )
    .all(...params) as MilestoneRow[];
}

export function getMilestone(id: string): MilestoneRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM milestones WHERE id = ?`)
    .get(id) as MilestoneRow | undefined;
}

export type InsertMilestoneInput = {
  id?: string;
  project_id: string;
  name: string;
  description?: string | null;
  due_date?: number | null;
  status?: MilestoneStatus;
  sort_order?: number;
};

export function insertMilestone(input: InsertMilestoneInput): MilestoneRow {
  const id = input.id ?? randomUUID();
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO milestones (
        id, project_id, name, description, due_date, status,
        sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.project_id,
      input.name,
      input.description ?? null,
      input.due_date ?? null,
      input.status ?? "active",
      input.sort_order ?? 0,
      now,
      now,
    );
  return getMilestone(id)!;
}

export type UpdateMilestonePatch = Partial<{
  name: string;
  description: string | null;
  due_date: number | null;
  status: MilestoneStatus;
  sort_order: number;
}>;

const MILESTONE_PATCH_KEYS = [
  "name",
  "description",
  "due_date",
  "status",
  "sort_order",
] as const;

export function updateMilestone(
  id: string,
  patch: UpdateMilestonePatch,
): MilestoneRow | undefined {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  for (const key of MILESTONE_PATCH_KEYS) {
    if (key in patch) {
      setClauses.push(`${key} = ?`);
      values.push((patch as Record<string, unknown>)[key]);
    }
  }
  if (setClauses.length === 0) return getMilestone(id);
  setClauses.push("updated_at = ?");
  values.push(Date.now());
  values.push(id);
  getDb()
    .prepare(`UPDATE milestones SET ${setClauses.join(", ")} WHERE id = ?`)
    .run(...values);
  return getMilestone(id);
}

/**
 * Delete a milestone. Does NOT cascade-delete tasks; instead, any task whose
 * `milestone_id` points at this milestone is nulled out so the work item
 * survives the deletion. Returns true if a milestone row was removed.
 */
export function deleteMilestone(id: string): boolean {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(`UPDATE tasks SET milestone_id = NULL WHERE milestone_id = ?`).run(id);
    const info = db.prepare(`DELETE FROM milestones WHERE id = ?`).run(id);
    return info.changes > 0;
  });
  return tx();
}

/**
 * Aggregate counts for the Tasks summary widgets. Excludes `done` and
 * `archived` work from the urgency rollups since those are no longer active.
 * `total` reflects the same "active" filter so the math (overdue + this_week
 * + in_progress + …) lines up with what the UI shows.
 */
export type TaskDueSummary = {
  total: number;
  overdue: number;
  due_this_week: number;
  due_today: number;
  in_progress: number;
};

export function getTaskDueSummary(scope?: {
  project_id?: string;
}): TaskDueSummary {
  const db = getDb();
  const now = Date.now();
  const weekAhead = now + 7 * 86_400_000;
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const projectClause = scope?.project_id ? "AND project_id = ?" : "";
  const baseParams: unknown[] = scope?.project_id ? [scope.project_id] : [];

  const totalRow = db
    .prepare<unknown[], { n: number }>(
      `SELECT COUNT(*) AS n FROM tasks
       WHERE status NOT IN ('done','archived') ${projectClause}`,
    )
    .get(...baseParams) as { n: number };

  const overdueRow = db
    .prepare<unknown[], { n: number }>(
      `SELECT COUNT(*) AS n FROM tasks
       WHERE status NOT IN ('done','archived')
         AND due_date IS NOT NULL AND due_date < ? ${projectClause}`,
    )
    .get(now, ...baseParams) as { n: number };

  const weekRow = db
    .prepare<unknown[], { n: number }>(
      `SELECT COUNT(*) AS n FROM tasks
       WHERE status NOT IN ('done','archived')
         AND due_date IS NOT NULL
         AND due_date >= ? AND due_date <= ? ${projectClause}`,
    )
    .get(now, weekAhead, ...baseParams) as { n: number };

  const todayRow = db
    .prepare<unknown[], { n: number }>(
      `SELECT COUNT(*) AS n FROM tasks
       WHERE status NOT IN ('done','archived')
         AND due_date IS NOT NULL
         AND due_date >= ? AND due_date <= ? ${projectClause}`,
    )
    .get(now, endOfToday.getTime(), ...baseParams) as { n: number };

  const inProgressRow = db
    .prepare<unknown[], { n: number }>(
      `SELECT COUNT(*) AS n FROM tasks
       WHERE status = 'in_progress' ${projectClause}`,
    )
    .get(...baseParams) as { n: number };

  return {
    total: totalRow.n,
    overdue: overdueRow.n,
    due_this_week: weekRow.n,
    due_today: todayRow.n,
    in_progress: inProgressRow.n,
  };
}

// ---------------------------------------------------------------------------
// Scheduled runs (cron-fired autonomous tasks)
//
// Decoupled from `tasks` so the kanban / backlog schema can be exclusively
// about work items. The cron scheduler (`server/cron.ts`) reads from here,
// the /schedule page manages these rows, and the in-process cron runner
// fires them. Helpers mirror the task helpers above in shape.
// ---------------------------------------------------------------------------

export type ScheduledRunFilters = {
  employee_id?: string;
  enabled?: boolean;
};

export function listScheduledRuns(filters?: ScheduledRunFilters): ScheduledRunRow[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters?.employee_id) {
    where.push("employee_id = ?");
    params.push(filters.employee_id);
  }
  if (filters?.enabled !== undefined) {
    where.push("enabled = ?");
    params.push(filters.enabled ? 1 : 0);
  }
  const sql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  return getDb()
    .prepare(
      `SELECT * FROM scheduled_runs${sql} ORDER BY created_at DESC, id ASC`,
    )
    .all(...params) as ScheduledRunRow[];
}

export function getScheduledRun(id: string): ScheduledRunRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM scheduled_runs WHERE id = ?`)
    .get(id) as ScheduledRunRow | undefined;
}

export type InsertScheduledRunInput = {
  id?: string;
  employee_id: string;
  skill?: string | null;
  playbook?: string | null;
  schedule_cron: string;
  human_label?: string | null;
  enabled?: 0 | 1 | boolean;
  last_run_id?: string | null;
  last_run_at?: number | null;
  created_at?: number;
};

export function insertScheduledRun(
  input: InsertScheduledRunInput,
): ScheduledRunRow {
  const id = input.id ?? randomUUID();
  const created_at = input.created_at ?? Date.now();
  const enabledVal: 0 | 1 =
    input.enabled === undefined
      ? 1
      : (Number(Boolean(input.enabled)) as 0 | 1);
  getDb()
    .prepare(
      `INSERT INTO scheduled_runs (
        id, employee_id, skill, playbook, schedule_cron,
        human_label, enabled, last_run_id, last_run_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.employee_id,
      input.skill ?? null,
      input.playbook ?? null,
      input.schedule_cron,
      input.human_label ?? null,
      enabledVal,
      input.last_run_id ?? null,
      input.last_run_at ?? null,
      created_at,
    );
  return getScheduledRun(id)!;
}

export type UpdateScheduledRunPatch = Partial<{
  employee_id: string;
  skill: string | null;
  playbook: string | null;
  schedule_cron: string;
  human_label: string | null;
  enabled: 0 | 1 | boolean;
  last_run_id: string | null;
  last_run_at: number | null;
}>;

const SCHEDULED_RUN_PATCH_KEYS = [
  "employee_id",
  "skill",
  "playbook",
  "schedule_cron",
  "human_label",
  "enabled",
  "last_run_id",
  "last_run_at",
] as const;

export function updateScheduledRun(
  id: string,
  patch: UpdateScheduledRunPatch,
): ScheduledRunRow | undefined {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  for (const key of SCHEDULED_RUN_PATCH_KEYS) {
    if (key in patch) {
      let v: unknown = (patch as Record<string, unknown>)[key];
      if (key === "enabled") v = Number(Boolean(v)) as 0 | 1;
      setClauses.push(`${key} = ?`);
      values.push(v);
    }
  }
  if (setClauses.length === 0) return getScheduledRun(id);
  values.push(id);
  getDb()
    .prepare(
      `UPDATE scheduled_runs SET ${setClauses.join(", ")} WHERE id = ?`,
    )
    .run(...values);
  return getScheduledRun(id);
}

export function deleteScheduledRun(id: string): boolean {
  const info = getDb()
    .prepare(`DELETE FROM scheduled_runs WHERE id = ?`)
    .run(id);
  return info.changes > 0;
}

export function toggleScheduledRun(
  id: string,
  enabled: boolean,
): ScheduledRunRow | undefined {
  return updateScheduledRun(id, { enabled });
}

// ---------------------------------------------------------------------------
// Settings (key/value JSON store)
// ---------------------------------------------------------------------------

export function getSetting<T = unknown>(key: string): T | null {
  const row = getDb()
    .prepare(`SELECT value FROM settings WHERE key = ?`)
    .get(key) as { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export function setSetting(key: string, value: unknown): void {
  const json = JSON.stringify(value);
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, json, now);
}

export function getAllSettings(): Record<string, unknown> {
  const rows = getDb()
    .prepare(`SELECT key, value FROM settings`)
    .all() as { key: string; value: string }[];
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      out[r.key] = JSON.parse(r.value);
    } catch {
      out[r.key] = null;
    }
  }
  return out;
}

/**
 * Default LLM CLI used by Plan with Gaia / Gaia AI Assess. Stored as a
 * single string under the `default_llm_cli` key in the settings table.
 * Falls back to "claude" when unset or invalid.
 */
const DEFAULT_LLM_CLI_KEY = "default_llm_cli";

export function getDefaultLlmCli(): PlannerCli {
  const raw = getSetting<unknown>(DEFAULT_LLM_CLI_KEY);
  if (isPlannerCli(raw)) return raw;
  return "claude";
}

export function setDefaultLlmCli(value: PlannerCli): void {
  if (!isPlannerCli(value)) {
    throw new Error(
      `default_llm_cli must be 'claude' | 'codex' | 'gemini' (got ${String(value)})`,
    );
  }
  setSetting(DEFAULT_LLM_CLI_KEY, value);
}

// ---------------------------------------------------------------------------
// Run stats (aggregates for dashboard / activity)
// ---------------------------------------------------------------------------

export type RunStatsFilters = {
  from?: Date;
  to?: Date;
  employee_id?: string;
};

export type RunStats = {
  total: number;
  success: number;
  error: number;
  running: number;
  avg_duration_ms: number;
  total_cost_usd: number;
  runs_today: number;
  success_rate: number;
};

export function getRunStats(filters?: RunStatsFilters): RunStats {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters?.from) {
    where.push("started_at >= ?");
    params.push(filters.from.getTime());
  }
  if (filters?.to) {
    where.push("started_at <= ?");
    params.push(filters.to.getTime());
  }
  if (filters?.employee_id) {
    where.push("employee_id = ?");
    params.push(filters.employee_id);
  }
  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";

  const db = getDb();
  const totals = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'success'  THEN 1 ELSE 0 END) AS success,
         SUM(CASE WHEN status = 'error'    THEN 1 ELSE 0 END) AS error,
         SUM(CASE WHEN status = 'running'  THEN 1 ELSE 0 END) AS running,
         COALESCE(AVG(duration_ms), 0) AS avg_duration_ms,
         COALESCE(SUM(cost_usd), 0)    AS total_cost_usd
       FROM runs${whereSql}`,
    )
    .get(...params) as {
    total: number;
    success: number | null;
    error: number | null;
    running: number | null;
    avg_duration_ms: number;
    total_cost_usd: number;
  };

  // runs_today is independent of `from/to` filters but still respects employee_id.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayWhere: string[] = ["started_at >= ?"];
  const todayParams: unknown[] = [startOfToday.getTime()];
  if (filters?.employee_id) {
    todayWhere.push("employee_id = ?");
    todayParams.push(filters.employee_id);
  }
  const todayRow = db
    .prepare(`SELECT COUNT(*) AS n FROM runs WHERE ${todayWhere.join(" AND ")}`)
    .get(...todayParams) as { n: number };

  const total = totals.total ?? 0;
  const success = totals.success ?? 0;
  const error = totals.error ?? 0;
  const running = totals.running ?? 0;
  const finished = success + error;
  const success_rate = finished > 0 ? success / finished : 0;

  return {
    total,
    success,
    error,
    running,
    avg_duration_ms: Math.round(totals.avg_duration_ms ?? 0),
    total_cost_usd: Number((totals.total_cost_usd ?? 0).toFixed(6)),
    runs_today: todayRow.n,
    success_rate: Number(success_rate.toFixed(4)),
  };
}

// ---------------------------------------------------------------------------
// Per-agent daily spend (cost-cap enforcement)
// ---------------------------------------------------------------------------

/**
 * Return the millisecond timestamp at midnight for "today" in Asia/Singapore.
 * SGT is a fixed UTC+08:00 offset (no DST), so we compute the day boundary by
 * shifting epoch into SGT, flooring to the day, and shifting back to UTC.
 *
 * Used by `getAgentSpendToday()` so the daily cost cap rolls over at SGT
 * midnight rather than the host's local midnight.
 */
function sgtMidnightToday(now = Date.now()): number {
  const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const sgtNow = now + SGT_OFFSET_MS;
  const sgtMidnight = Math.floor(sgtNow / ONE_DAY_MS) * ONE_DAY_MS;
  return sgtMidnight - SGT_OFFSET_MS;
}

/**
 * Sum of `runs.cost_usd` for `employee_id` where `status = 'success'` and
 * `started_at >= local-midnight-today` (Asia/Singapore). Returns 0 when no
 * matching runs exist. Used by the cost-cap check in `startRun`.
 *
 * Only `success` runs are summed: blocked runs have cost_usd=0, errored runs
 * arguably shouldn't count, and running rows haven't yet billed. This is the
 * simplest defensible behavior for V1.
 */
export function getAgentSpendToday(
  employeeId: string,
  now = Date.now(),
): number {
  const since = sgtMidnightToday(now);
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(cost_usd), 0) AS total
         FROM runs
        WHERE employee_id = ?
          AND status = 'success'
          AND started_at >= ?`,
    )
    .get(employeeId, since) as { total: number };
  return Number(row.total ?? 0);
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export type ProjectFilters = {
  include_archived?: boolean;
  search?: string;
  is_internal?: boolean;
};

export function listProjects(filters?: ProjectFilters): ProjectRow[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (!filters?.include_archived) {
    where.push("archived = 0");
  }
  if (filters?.search && filters.search.trim()) {
    where.push("(LOWER(name) LIKE ? OR LOWER(path) LIKE ?)");
    const term = `%${filters.search.trim().toLowerCase()}%`;
    params.push(term, term);
  }
  if (typeof filters?.is_internal === "boolean") {
    where.push("is_internal = ?");
    params.push(filters.is_internal ? 1 : 0);
  }
  const sql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  return getDb()
    .prepare(`SELECT * FROM projects${sql} ORDER BY updated_at DESC`)
    .all(...params) as ProjectRow[];
}

export function getProject(id: string): ProjectRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM projects WHERE id = ?`)
    .get(id) as ProjectRow | undefined;
}

export function getProjectByPath(path: string): ProjectRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM projects WHERE path = ?`)
    .get(path) as ProjectRow | undefined;
}

export function getProjectByTranscriptDir(dir: string): ProjectRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM projects WHERE transcript_dir = ?`)
    .get(dir) as ProjectRow | undefined;
}

export type UpsertProjectInput = {
  id?: string;
  name: string;
  path: string;
  transcript_dir?: string | null;
  color?: string | null;
  icon?: string | null;
  agent_name?: string | null;
  agent_avatar?: string | null;
  is_internal?: boolean | 0 | 1;
  description?: string | null;
  brief_markdown?: string | null;
};

function projectSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || `project-${Date.now()}`;
}

/**
 * Upsert by (path) primary key. If a project already exists at the given path
 * we return it unchanged. Caller can then patch via updateProject if needed.
 */
export function upsertProject(input: UpsertProjectInput): ProjectRow {
  const existingByPath = getProjectByPath(input.path);
  if (existingByPath) return existingByPath;

  let id = input.id ?? projectSlug(input.name);
  // De-duplicate slug
  if (getProject(id)) {
    let n = 2;
    while (getProject(`${id}-${n}`)) n++;
    id = `${id}-${n}`;
  }

  const now = Date.now();
  const isInternal: 0 | 1 = input.is_internal ? 1 : 0;
  getDb()
    .prepare(
      `INSERT INTO projects (
        id, name, path, transcript_dir, color, icon,
        agent_name, agent_avatar, is_internal, description, brief_markdown,
        archived, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .run(
      id,
      input.name,
      input.path,
      input.transcript_dir ?? null,
      input.color ?? null,
      input.icon ?? null,
      input.agent_name ?? null,
      input.agent_avatar ?? null,
      isInternal,
      input.description ?? null,
      input.brief_markdown ?? null,
      now,
      now,
    );
  return getProject(id)!;
}

export type UpdateProjectPatch = Partial<{
  name: string;
  path: string;
  transcript_dir: string | null;
  color: string | null;
  icon: string | null;
  agent_name: string | null;
  agent_avatar: string | null;
  is_internal: boolean | 0 | 1;
  description: string | null;
  brief_markdown: string | null;
  archived: boolean | 0 | 1;
}>;

const PROJECT_PATCH_KEYS = [
  "name",
  "path",
  "transcript_dir",
  "color",
  "icon",
  "agent_name",
  "agent_avatar",
  "is_internal",
  "description",
  "brief_markdown",
  "archived",
] as const;

export function updateProject(
  id: string,
  patch: UpdateProjectPatch,
): ProjectRow | undefined {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  for (const key of PROJECT_PATCH_KEYS) {
    if (key in patch) {
      let v: unknown = (patch as Record<string, unknown>)[key];
      if (key === "is_internal" || key === "archived") {
        v = Number(Boolean(v)) as 0 | 1;
      }
      setClauses.push(`${key} = ?`);
      values.push(v);
    }
  }
  if (setClauses.length === 0) return getProject(id);
  setClauses.push(`updated_at = ?`);
  values.push(Date.now());
  values.push(id);
  getDb()
    .prepare(`UPDATE projects SET ${setClauses.join(", ")} WHERE id = ?`)
    .run(...values);
  return getProject(id);
}

export function archiveProject(id: string): ProjectRow | undefined {
  return updateProject(id, { archived: 1 });
}

export function getProjectStats(id: string): ProjectStats {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS sessions_count,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_count,
         COALESCE(SUM(total_cost_usd), 0) AS total_cost_usd,
         MAX(last_event_at) AS last_event_at
       FROM sessions WHERE project_id = ?`,
    )
    .get(id) as {
    sessions_count: number;
    active_count: number | null;
    total_cost_usd: number;
    last_event_at: number | null;
  };
  return {
    sessions_count: row.sessions_count ?? 0,
    active_count: row.active_count ?? 0,
    total_cost_usd: Number((row.total_cost_usd ?? 0).toFixed(6)),
    last_event_at: row.last_event_at,
  };
}

// ---------------------------------------------------------------------------
// Sessions (Claude Code transcripts)
// ---------------------------------------------------------------------------

export type SessionFilters = {
  project_id?: string;
  status?: SessionStatus;
  limit?: number;
};

export function listSessions(filters?: SessionFilters): SessionRow[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters?.project_id) {
    where.push("project_id = ?");
    params.push(filters.project_id);
  }
  if (filters?.status) {
    where.push("status = ?");
    params.push(filters.status);
  }
  const sql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const limit = filters?.limit ?? 50;
  return getDb()
    .prepare(
      `SELECT * FROM sessions${sql} ORDER BY last_event_at DESC LIMIT ?`,
    )
    .all(...params, limit) as SessionRow[];
}

export function getSession(id: string): SessionRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM sessions WHERE id = ?`)
    .get(id) as SessionRow | undefined;
}

export function getSessionByTranscriptPath(
  transcript_path: string,
): SessionRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM sessions WHERE transcript_path = ?`)
    .get(transcript_path) as SessionRow | undefined;
}

export type UpsertSessionInput = {
  id: string;
  project_id: string;
  transcript_path: string;
  title?: string | null;
  status?: SessionStatus;
  started_at: number;
  last_event_at: number;
  ended_at?: number | null;
  total_cost_usd?: number;
  total_tokens?: number;
  num_messages?: number;
  num_tool_uses?: number;
  last_event_type?: string | null;
  last_event_summary?: string | null;
  last_tool?: string | null;
  last_file?: string | null;
  bytes_read?: number;
};

export function upsertSession(input: UpsertSessionInput): SessionRow {
  const existing = getSession(input.id);
  if (existing) {
    return existing;
  }
  getDb()
    .prepare(
      `INSERT INTO sessions (
        id, project_id, transcript_path, title, status,
        started_at, last_event_at, ended_at,
        total_cost_usd, total_tokens, num_messages, num_tool_uses,
        last_event_type, last_event_summary, last_tool, last_file, bytes_read
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      input.project_id,
      input.transcript_path,
      input.title ?? null,
      input.status ?? "idle",
      input.started_at,
      input.last_event_at,
      input.ended_at ?? null,
      input.total_cost_usd ?? 0,
      input.total_tokens ?? 0,
      input.num_messages ?? 0,
      input.num_tool_uses ?? 0,
      input.last_event_type ?? null,
      input.last_event_summary ?? null,
      input.last_tool ?? null,
      input.last_file ?? null,
      input.bytes_read ?? 0,
    );
  return getSession(input.id)!;
}

export type UpdateSessionPatch = Partial<{
  title: string | null;
  status: SessionStatus;
  last_event_at: number;
  ended_at: number | null;
  total_cost_usd: number;
  total_tokens: number;
  num_messages: number;
  num_tool_uses: number;
  last_event_type: string | null;
  last_event_summary: string | null;
  last_tool: string | null;
  last_file: string | null;
  bytes_read: number;
}>;

const SESSION_PATCH_KEYS = [
  "title",
  "status",
  "last_event_at",
  "ended_at",
  "total_cost_usd",
  "total_tokens",
  "num_messages",
  "num_tool_uses",
  "last_event_type",
  "last_event_summary",
  "last_tool",
  "last_file",
  "bytes_read",
] as const;

export function updateSession(
  id: string,
  patch: UpdateSessionPatch,
): SessionRow | undefined {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  for (const key of SESSION_PATCH_KEYS) {
    if (key in patch) {
      setClauses.push(`${key} = ?`);
      values.push((patch as Record<string, unknown>)[key]);
    }
  }
  if (setClauses.length === 0) return getSession(id);
  values.push(id);
  getDb()
    .prepare(`UPDATE sessions SET ${setClauses.join(", ")} WHERE id = ?`)
    .run(...values);
  return getSession(id);
}

/**
 * Run a status sweep across all sessions based on time deltas.
 * - active: last_event_at within ACTIVE_MS
 * - idle:   within IDLE_MS
 * - ended:  beyond IDLE_MS
 */
export function sweepSessionStatuses(now = Date.now()): void {
  const ACTIVE_MS = 5 * 60 * 1000;
  const IDLE_MS = 30 * 60 * 1000;
  const db = getDb();
  db.prepare(
    `UPDATE sessions SET status = 'active'
       WHERE status != 'active' AND ? - last_event_at < ?`,
  ).run(now, ACTIVE_MS);
  db.prepare(
    `UPDATE sessions SET status = 'idle'
       WHERE status != 'idle'
         AND ? - last_event_at >= ?
         AND ? - last_event_at < ?`,
  ).run(now, ACTIVE_MS, now, IDLE_MS);
  db.prepare(
    `UPDATE sessions SET status = 'ended', ended_at = COALESCE(ended_at, last_event_at)
       WHERE status != 'ended' AND ? - last_event_at >= ?`,
  ).run(now, IDLE_MS);
}
