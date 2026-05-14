#!/usr/bin/env tsx
/**
 * Gaia Telegram bot — master-agent bridge.
 * Long-polls Telegram getUpdates, dispatches to claude -p, replies.
 * Single-user by default; allow-list via TELEGRAM_ALLOWED_CHAT_IDS.
 *
 * Run: cd app && npm run bot
 * Stop: Ctrl+C
 */

import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";
import {
  PATHS,
  listAllTasks,
  listApprovals,
  countPendingApprovals,
  getEmployee,
  listSessions,
  listProjects,
  type SessionRow,
  getTelegramConfig,
} from "../src/server/db";

interface Update {
  update_id: number;
  message?: TgMessage;
}
interface TgMessage {
  message_id: number;
  chat: { id: number; type: "private" | "group" | "supergroup" | "channel" };
  text?: string;
  date: number;
}

let API_BASE = "";
const LOCAL_API_BASE = "http://localhost:7878/api";
const SESSIONS_FILE_PATH = path.join(
  PATHS.agentsDir,
  "gaia",
  ".telegram-sessions.json",
);

const NL = "\n";

async function sendChatAction(chatId: number, action: "typing"): Promise<void> {
  try {
    await fetch(`${API_BASE}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action }),
    });
  } catch {
    // best-effort — never block on this
  }
}

async function sendMessage(chatId: number, text: string): Promise<void> {
  if (!text || text.trim() === "") return;
  const MAX_LENGTH = 4096;
  for (let i = 0; i < text.length; i += MAX_LENGTH) {
    const chunk = text.substring(i, i + MAX_LENGTH);
    const url = `${API_BASE}/sendMessage`;
    const body = {
      chat_id: chatId,
      text: chunk,
      parse_mode: "Markdown" as const,
    };
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const respBody = (await response.json().catch(() => ({}))) as {
          description?: string;
        };
        console.error(`Telegram sendMessage ${response.status}:`, respBody);
        // Retry without Markdown if it complained about parse error
        if (
          respBody.description &&
          respBody.description.toLowerCase().includes("parse")
        ) {
          await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: chunk }),
          });
        }
      }
    } catch (e) {
      console.error(`sendMessage failed:`, e);
    }
  }
}

function readSessionsFile(): Record<string, string> {
  try {
    if (!fs.existsSync(SESSIONS_FILE_PATH)) return {};
    return JSON.parse(
      fs.readFileSync(SESSIONS_FILE_PATH, "utf8"),
    ) as Record<string, string>;
  } catch (e) {
    console.error(`session file read error:`, e);
    return {};
  }
}

function writeSessionsFile(sessions: Record<string, string>): void {
  try {
    fs.mkdirSync(path.dirname(SESSIONS_FILE_PATH), { recursive: true });
    fs.writeFileSync(SESSIONS_FILE_PATH, JSON.stringify(sessions, null, 2));
  } catch (e) {
    console.error(`session file write error:`, e);
  }
}

function getChatSession(chatId: number): string | undefined {
  return readSessionsFile()[String(chatId)];
}

function setChatSession(chatId: number, sessionId: string): void {
  const sessions = readSessionsFile();
  sessions[String(chatId)] = sessionId;
  writeSessionsFile(sessions);
}

async function handleHelp(chatId: number): Promise<void> {
  const lines = [
    "*Gaia Bot Commands*",
    "/help — show this list",
    "/status — projects, tasks, approvals overview",
    "/projects — list active projects",
    "/tasks — today's due tasks + in-progress",
    "/approvals — pending approvals",
    "/approve <id> — approve a pending request",
    "/reject <id> — reject a pending request",
    "/task <project_id> <title> — create a task",
    "",
    "Otherwise: send any message in natural language and Gaia (the master agent) will answer.",
  ];
  await sendMessage(chatId, lines.join(NL));
}

async function handleStatus(chatId: number): Promise<void> {
  const projects = listProjects();
  const pending = countPendingApprovals();
  const dueToday = listAllTasks({ due_status: "today" });
  const inProgress = listAllTasks({ status: "in_progress" });
  const lines = [
    "*System Status*",
    `- Active projects: ${projects.length}`,
    `- Pending approvals: ${pending}`,
    `- Tasks due today: ${dueToday.length}`,
    `- Tasks in progress: ${inProgress.length}`,
  ];
  await sendMessage(chatId, lines.join(NL));
}

async function handleProjects(chatId: number): Promise<void> {
  const projects = listProjects();
  if (projects.length === 0) {
    await sendMessage(chatId, "No active projects.");
    return;
  }
  const projectLines = projects.map((p) => {
    const open =
      listAllTasks({ project_id: p.id, status: "todo" }).length +
      listAllTasks({ project_id: p.id, status: "in_progress" }).length;
    return `*${p.name}* (id: ${p.id}) — ${open} open task${
      open === 1 ? "" : "s"
    }`;
  });
  const body = ["*Active Projects*", ...projectLines].join(NL);
  await sendMessage(chatId, body);
}

async function handleTasks(chatId: number): Promise<void> {
  const dueToday = listAllTasks({ due_status: "today" });
  const inProgress = listAllTasks({ status: "in_progress" });
  const sections: string[] = [];
  if (dueToday.length > 0) {
    const rows = dueToday.map(
      (t) => `[${t.priority}] ${t.title} (${t.project_id})`,
    );
    sections.push(["*Tasks Due Today*", ...rows].join(NL));
  }
  if (inProgress.length > 0) {
    const rows = inProgress.map(
      (t) => `[${t.priority}] ${t.title} (${t.project_id})`,
    );
    sections.push(["*Tasks In Progress*", ...rows].join(NL));
  }
  if (sections.length === 0) {
    await sendMessage(chatId, "No tasks due today or in progress.");
    return;
  }
  await sendMessage(chatId, sections.join(NL + NL));
}

async function handleApprovals(chatId: number): Promise<void> {
  const approvals = listApprovals({ status: "pending" });
  if (approvals.length === 0) {
    await sendMessage(chatId, "No pending approvals.");
    return;
  }
  const rows = approvals.map((a) => {
    const agent = getEmployee(a.agent_id);
    return `*ID ${a.id}*: ${a.title} (from ${agent?.name ?? "Unknown"})`;
  });
  await sendMessage(chatId, ["*Pending Approvals*", ...rows].join(NL));
}

async function handleApprovalAction(
  chatId: number,
  command: string,
  text: string,
): Promise<void> {
  const parts = text.split(" ").filter(Boolean);
  const action = command.substring(1);
  if (parts.length < 2) {
    await sendMessage(chatId, `Usage: ${command} <id>`);
    return;
  }
  const approvalId = parts[1];
  const status = action === "approve" ? "approved" : "rejected";
  try {
    const response = await fetch(`${LOCAL_API_BASE}/approvals/${approvalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (response.ok) {
      await sendMessage(chatId, `Approval ${approvalId} ${status}.`);
    } else {
      const errText = await response.text();
      await sendMessage(chatId, `Failed to ${action} ${approvalId}: ${errText}`);
    }
  } catch (e) {
    await sendMessage(
      chatId,
      `Local API call failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

async function handleCreateTask(chatId: number, text: string): Promise<void> {
  const parts = text.split(" ").filter(Boolean);
  if (parts.length < 3) {
    await sendMessage(chatId, "Usage: /task <project_id> <title>");
    return;
  }
  const [, projectId, ...titleParts] = parts;
  const title = titleParts.join(" ");
  try {
    const response = await fetch(`${LOCAL_API_BASE}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        title,
        status: "todo",
        priority: "medium",
      }),
    });
    if (response.ok) {
      const data = (await response.json()) as {
        task?: { id?: string };
        id?: string;
      };
      const id = data.task?.id ?? data.id ?? "(unknown)";
      await sendMessage(chatId, `Task created: ${id} — ${title}`);
    } else {
      const errText = await response.text();
      await sendMessage(chatId, `Failed to create task: ${errText}`);
    }
  } catch (e) {
    await sendMessage(
      chatId,
      `Local API call failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

function buildContextSnapshot(): string {
  const projects = listProjects();
  const dueToday = listAllTasks({ due_status: "today" });
  const pendingApprovals = listApprovals({ status: "pending" });
  const recentSessions: SessionRow[] = listSessions({ limit: 5 });

  const projectLines =
    projects.length > 0
      ? projects
          .map((p) => {
            const desc = (p.description ?? "").substring(0, 120);
            return `- ${p.name} (id: ${p.id}, path: ${p.path}, repo: ${
              p.repo_url ?? "none"
            })${desc ? NL + "  " + desc : ""}`;
          })
          .join(NL)
      : "None";

  const taskLines =
    dueToday.length > 0
      ? dueToday
          .map((t) => `- [${t.priority}] ${t.title} (project: ${t.project_id})`)
          .join(NL)
      : "None";

  const approvalLines =
    pendingApprovals.length > 0
      ? pendingApprovals.map((a) => `- ${a.title} (id: ${a.id})`).join(NL)
      : "None";

  const sessionLines =
    recentSessions.length > 0
      ? recentSessions
          .map((s) => {
            const when = s.started_at
              ? new Date(s.started_at).toLocaleString()
              : "unknown";
            return `- ${s.title ?? "Untitled"} (project: ${
              s.project_id ?? "—"
            }) at ${when}`;
          })
          .join(NL)
      : "None";

  return [
    "Current Gaia context snapshot:",
    "",
    "--- Active projects ---",
    projectLines,
    "",
    "--- Tasks due today ---",
    taskLines,
    "",
    "--- Pending approvals ---",
    approvalLines,
    "",
    "--- Recent sessions ---",
    sessionLines,
  ].join(NL);
}

async function handleNaturalLanguage(
  chatId: number,
  text: string,
): Promise<void> {
  const snapshot = buildContextSnapshot();
  const sessionId = getChatSession(chatId);

  const gaiaDir = path.join(PATHS.agentsDir, "gaia");

  // Default to Sonnet for Telegram chat — Opus burns subscription too fast
  // for casual queries. Override with GAIA_BOT_CLAUDE_MODEL env if needed.
  const model = process.env.GAIA_BOT_CLAUDE_MODEL || "sonnet";

  const args: string[] = ["-p", "--model", model];
  if (sessionId) args.push("--resume", sessionId);
  args.push("--tools", "Bash", "--append-system-prompt", snapshot, text);

  // Show "typing…" in Telegram while Claude is thinking. The action expires
  // after ~5s, so refresh on an interval until the child exits.
  void sendChatAction(chatId, "typing");
  const typingTimer = setInterval(() => {
    void sendChatAction(chatId, "typing");
  }, 4000);

  const child = spawn("claude", args, { cwd: gaiaDir, timeout: 60_000 });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (data: Buffer) => {
    const s = data.toString();
    stdout += s;
    if (!sessionId) {
      // Best-effort: extract session id from any JSON line that surfaces it.
      for (const line of s.split(NL)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("{")) continue;
        try {
          const json = JSON.parse(trimmed) as {
            session_id?: string;
            type?: string;
          };
          if (json.session_id) {
            setChatSession(chatId, json.session_id);
            break;
          }
        } catch {
          // ignore non-JSON lines
        }
      }
    }
  });

  child.stderr.on("data", (data: Buffer) => {
    stderr += data.toString();
  });

  child.on("close", async (code) => {
    clearInterval(typingTimer);
    if (code === 0) {
      const reply = stdout.trim();
      if (reply) {
        await sendMessage(chatId, reply);
      } else {
        await sendMessage(chatId, "(Claude returned no text.)");
      }
    } else {
      const msg = (stderr || "no error output").trim().substring(0, 1500);
      await sendMessage(chatId, `Claude failed (exit ${code ?? "?"}): ${msg}`);
    }
  });

  child.on("error", async (err) => {
    clearInterval(typingTimer);
    await sendMessage(chatId, `Claude failed to start: ${err.message}`);
  });
}

async function getUpdates(offset: number): Promise<Update[]> {
  const url = `${API_BASE}/getUpdates?offset=${offset}&timeout=25`;
  const response = await fetch(url);
  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Telegram getUpdates ${response.status}: ${errBody}`);
  }
  const data = (await response.json()) as { ok: boolean; result: Update[] };
  if (!data.ok) throw new Error(`Telegram returned ok=false`);
  return data.result;
}

async function processMessage(
  message: TgMessage,
  allowedIds: number[],
): Promise<void> {
  const chatId = message.chat.id;
  if (!allowedIds.includes(chatId)) return;
  const text = message.text;
  if (!text) return;

  console.log(
    `[${new Date().toISOString()}] chat ${chatId}: ${text.substring(0, 80)}`,
  );

  if (text.startsWith("/")) {
    const command = text.split(" ")[0];
    switch (command) {
      case "/help":
        await handleHelp(chatId);
        break;
      case "/status":
        await handleStatus(chatId);
        break;
      case "/projects":
        await handleProjects(chatId);
        break;
      case "/tasks":
        await handleTasks(chatId);
        break;
      case "/approvals":
        await handleApprovals(chatId);
        break;
      case "/approve":
      case "/reject":
        await handleApprovalAction(chatId, command, text);
        break;
      case "/task":
        await handleCreateTask(chatId, text);
        break;
      default:
        await sendMessage(chatId, "Unknown command. /help for the list.");
    }
  } else {
    await handleNaturalLanguage(chatId, text);
  }
}

let shuttingDown = false;

async function main(): Promise<void> {
  const dbConfig = getTelegramConfig();
  const token = process.env.TELEGRAM_BOT_TOKEN || dbConfig.token;
  const allowedChatIdsRaw =
    process.env.TELEGRAM_ALLOWED_CHAT_IDS || dbConfig.allowed_chat_ids;

  if (!token || !allowedChatIdsRaw) {
    console.error(
      "Missing Telegram bot token or allowed chat IDs.",
      "Set TELEGRAM_BOT_TOKEN and TELEGRAM_ALLOWED_CHAT_IDS in .env.local,",
      "or configure them in Settings -> Telegram.",
    );
    process.exit(1);
  }

  API_BASE = `https://api.telegram.org/bot${token}`;

  const allowedIds = allowedChatIdsRaw
    .split(",")
    .map((s: string) => parseInt(s.trim(), 10))
    .filter((n: number) => Number.isFinite(n));
  if (allowedIds.length === 0) {
    console.error("TELEGRAM_ALLOWED_CHAT_IDS is empty after parse.");
    process.exit(1);
  }

  console.log(`Bot listening (allow-list: ${allowedIds.join(", ")})`);

  let offset = 0;
  while (!shuttingDown) {
    try {
      const updates = await getUpdates(offset);
      for (const update of updates) {
        offset = update.update_id + 1;
        if (update.message) {
          await processMessage(update.message, allowedIds);
        }
      }
    } catch (err) {
      console.error("Long-polling cycle failed:", err);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

function handleShutdown(signal: string): void {
  console.log(`${signal} received. Stopping bot…`);
  shuttingDown = true;
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));

main().catch((err) => {
  console.error("Bot crashed:", err);
  process.exit(1);
});
