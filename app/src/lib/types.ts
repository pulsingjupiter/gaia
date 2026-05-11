export type AgentSlug =
  | "professor-adrian"
  | "nova"
  | "atlas"
  | "king-henry"
  | "rack";

export type EmployeeStatus = "Online" | "Busy" | "Idle";

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
