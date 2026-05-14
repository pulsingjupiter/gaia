export type AgentSlug =
  | "gaia"
  | "nova"
  | "atlas"
  | "king-henry"
  | "rack";

export type EmployeeStatus = "Online" | "Busy" | "Idle";

export type EmployeeRuntime = "claude" | "jules" | "codex" | "gemini";

/** Display labels for each runtime. Used by badges, picker, and launch button. */
export const RUNTIME_LABELS: Record<EmployeeRuntime, string> = {
  claude: "Claude",
  jules: "Jules",
  codex: "Codex",
  gemini: "Gemini",
};

/** Short one-line description shown in the Add/Edit modal runtime picker. */
export const RUNTIME_HELP: Record<EmployeeRuntime, string> = {
  claude: "Runs locally via Claude Code CLI. Default.",
  jules: "Async cloud executor (Google). Requires `jules` CLI installed.",
  codex: "Cloud executor (OpenAI). Requires `codex` CLI installed.",
  gemini:
    "General-purpose research / reasoning executor (Google Gemini). Requires `gemini` CLI installed.",
};

export const RUNTIME_VALUES: readonly EmployeeRuntime[] = [
  "claude",
  "jules",
  "codex",
  "gemini",
] as const;

export function isEmployeeRuntime(v: unknown): v is EmployeeRuntime {
  return v === "claude" || v === "jules" || v === "codex" || v === "gemini";
}

/**
 * Subset of EmployeeRuntime that can drive Gaia's headless planner /
 * assess flows. Jules is excluded — it's async-cloud and not a fit for
 * synchronous "give me JSON now" calls.
 */
export type PlannerCli = "claude" | "codex" | "gemini";

export const PLANNER_CLI_VALUES: readonly PlannerCli[] = [
  "claude",
  "codex",
  "gemini",
] as const;

export function isPlannerCli(v: unknown): v is PlannerCli {
  return v === "claude" || v === "codex" || v === "gemini";
}

export type Employee = {
  id: string;
  slug: string; // url-friendly
  name: string;
  role: string;
  status: EmployeeStatus;
  accent: string; // hex
  initials: string;
  handle?: string;
  /** Raw value from DB column `avatar_emoji` — preset avatar id, emoji, or null. */
  avatar?: string | null;
  /** Wave 2B: hide from agent-management UIs (Workforce panel) when true. */
  internalOnly?: boolean;
  /** Multi-runtime MVP: which executor launches the agent. Defaults to 'claude'. */
  runtime: EmployeeRuntime;
};

export type PlaybookCategory =
  | "Content"
  | "Research"
  | "Video"
  | "Marketing"
  | "Automation"
  | "Data"
  | "Design";

export type Playbook = {
  id: string;
  title: string;
  category: PlaybookCategory;
  ownerSlug: string;
  ownerName: string;
  entries: number;
  description: string;
  iconBg: string;
  iconColor: string;
};

export type SprintColumn = "todo" | "inprogress" | "review" | "done";

export type SprintTask = {
  id: string;
  title: string;
  playbook?: string;
  column: SprintColumn;
  priority: "high" | "medium" | "low";
  date: string;
  ownerSlug: string;
};

export type ScheduleEvent = {
  id: string;
  title: string;
  day: number; // 0..6 (Thu..Wed)
  startHour: number; // 24h
  durationHours: number;
  tone: "amber" | "blue" | "green" | "peach" | "violet";
  ownerSlug?: string;
  allDay?: boolean;
};

export type Conversation = {
  id: string;
  participants: string[]; // slugs
  preview: string;
  time: string;
  pinned?: boolean;
  unread?: boolean;
};

export type ActivityEntry = {
  id: string;
  ownerSlug: string;
  verb: string;
  target: string;
  time: string;
};

export type { RepoUrlInfo } from "./repo-url";

export type Project = {
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
  repo_url: string | null;
  archived: 0 | 1;
  collaborative: 0 | 1;
  created_at: number;
  updated_at: number;
};

export type SessionStatus = "active" | "idle" | "ended";

export type Session = {
  id: string;
  project_id: string;
  transcript_path: string;
  title: string | null;
  custom_label: string | null;
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

export function sessionDisplayLabel(
  s: Pick<Session, "custom_label" | "title" | "id">,
): string {
  if (s.custom_label && s.custom_label.trim()) return s.custom_label.trim();
  if (s.title && s.title.trim()) return s.title.trim();
  return s.id.slice(0, 8);
}
