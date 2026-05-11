"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BookOpen,
  Calendar,
  ChevronDown,
  DollarSign,
  FileText,
  Folder,
  Folders,
  Inbox,
  Kanban,
  LayoutGrid,
  Settings,
  Users2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { GaiaLogo } from "./gaia-logo";
import { AgentAvatar } from "@/components/shared/agent-avatar";
import { useEmployees } from "@/components/employees/employees-context";
import { useUnreadCount } from "@/lib/hooks/use-unread-count";
import { useTaskDueSummary } from "@/lib/hooks/use-task-due-summary";
import { cn } from "@/lib/cn";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** When set, the sidebar will render a live unread-count badge on this row. */
  showUnreadBadge?: boolean;
  /** When set, the sidebar renders a pulsing red overdue-count badge. */
  showOverdueBadge?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/agents", label: "Agents", icon: Users2 },
  { href: "/projects", label: "Projects", icon: Folders },
  { href: "/tasks", label: "Tasks", icon: Kanban, showOverdueBadge: true },
  { href: "/playbooks", label: "Playbooks", icon: BookOpen },
  { href: "/schedule", label: "Schedule", icon: Calendar },
  { href: "/conversations", label: "Inbox", icon: Inbox, showUnreadBadge: true },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/docs", label: "Docs", icon: FileText },
  { href: "/cost", label: "Cost", icon: DollarSign },
  { href: "/files", label: "Files", icon: Folder },
  { href: "/settings", label: "Settings", icon: Settings },
];

function formatBadgeCount(n: number): string {
  if (n > 99) return "99+";
  return String(n);
}

export function Sidebar() {
  const pathname = usePathname();
  const { employees } = useEmployees();
  // Live unread totals (chat + notification messages). 8s poll under the hood.
  const { total: unreadTotal, byKind: unreadByKind } = useUnreadCount();
  // Global overdue-task count for the Tasks row pulse. 60s poll.
  const { summary: taskSummary } = useTaskDueSummary(null);
  const overdueCount = taskSummary.overdue;
  // DB 'idle' status is mapped to UI 'Online' — these agents are awaiting
  // work and considered online for the workforce footer.
  const onlineCount = employees.filter((e) => e.status === "Online").length;
  const me =
    employees.find((e) => e.slug === "professor-adrian") ??
    employees.find((e) => e.id === "professor-adrian") ??
    employees[0];

  // When the unread mix is "only chat messages" we use a muted slate badge so
  // the eye-catching indigo accent remains reserved for true notifications.
  const hasNotifications = unreadByKind.notification > 0;

  return (
    <aside className="flex h-screen w-[200px] shrink-0 flex-col border-r border-subtle bg-sidebar py-4">
      <div className="flex items-center gap-2 px-4">
        <GaiaLogo size={26} />
        <div className="leading-tight">
          <div className="text-[15px] font-bold text-primary">Gaia</div>
          <div className="text-[10px] text-muted">AI Workforce Platform</div>
        </div>
      </div>

      <div className="mt-6 px-3">
        <div className="px-2 pb-2 section-header">Navigation</div>
        <nav className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const showBadge = item.showUnreadBadge && unreadTotal > 0;
            const showOverdue = item.showOverdueBadge && overdueCount > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-full px-3 py-2 text-sm transition",
                  active
                    ? "bg-surface-hover font-semibold text-primary"
                    : "text-secondary hover:bg-surface-muted",
                )}
              >
                <Icon size={16} />
                <span className="flex-1 truncate">{item.label}</span>
                {showBadge ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-px text-[10px] font-semibold text-white",
                      hasNotifications
                        ? "bg-accent"
                        : "bg-slate-400",
                    )}
                    aria-label={`${unreadTotal} unread`}
                  >
                    {formatBadgeCount(unreadTotal)}
                  </span>
                ) : null}
                {showOverdue ? (
                  <span
                    className="animate-pulse rounded-full bg-status-error px-1.5 py-px text-[10px] font-semibold text-white"
                    aria-label={`${overdueCount} overdue`}
                  >
                    {formatBadgeCount(overdueCount)}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto px-3">
        <div className="rounded-xl bg-surface-muted p-3">
          <div className="flex items-center gap-2 text-[11px] text-secondary">
            <span className="size-2 rounded-full bg-status-online" />
            {onlineCount} agents online
          </div>
          <div className="mt-2 flex items-center -space-x-1.5">
            {employees.slice(0, 4).map((e) => (
              <AgentAvatar
                key={e.id}
                value={e.avatar}
                name={e.name}
                size={22}
                accent={e.accent}
                ring
              />
            ))}
            {employees.length > 4 && (
              <span className="inline-flex size-[22px] items-center justify-center rounded-full bg-white text-[9px] font-semibold text-secondary ring-2 ring-white">
                +{employees.length - 4}
              </span>
            )}
          </div>
        </div>

        {me ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl px-1 py-1">
            <AgentAvatar value={me.avatar} name={me.name} size={28} accent={me.accent} />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[12px] font-semibold text-primary">
                {me.name}
              </div>
              <div className="truncate text-[10px] text-muted">
                {me.handle ?? `@${me.slug}`}
              </div>
            </div>
            <ChevronDown size={14} className="text-muted" />
          </div>
        ) : null}
      </div>
    </aside>
  );
}
