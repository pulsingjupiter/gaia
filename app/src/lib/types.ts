export type AgentSlug =
  | "gaia"
  | "nova"
  | "atlas"
  | "king-henry"
  | "rack";

export type EmployeeStatus = "Online" | "Busy" | "Idle";

export type EmployeeRuntime = "claude" | "jules" | "codex";

/** Display labels for each runtime. Used by badges, picker, and launch button. */
export const RUNTIME_LABELS: Record<EmployeeRuntime, string> = {
  claude: "Claude",
  jules: "Jules",
  codex: "Codex",
};

/** Short one-line description shown in the Add/Edit modal runtime picker. */
export const RUNTIME_HELP: Record<EmployeeRuntime, string> = {
  claude: "Runs locally via Claude Code CLI. Default.",
  jules: "Async cloud executor (Google). Requires `jules` CLI installed.",
  codex: "Cloud executor (OpenAI). Requires `codex` CLI installed.",
};

export const RUNTIME_VALUES: readonly EmployeeRuntime[] = [
  "claude",
  "jules",
  "codex",
] as const;

export function isEmployeeRuntime(v: unknown): v is EmployeeRuntime {
  return v === "claude" || v === "jules" || v === "codex";
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
