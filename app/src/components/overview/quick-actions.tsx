import Link from "next/link";
import { BarChart3, Plus, UserPlus, ClipboardList } from "lucide-react";

const ACTIONS = [
  { label: "New Playbook", icon: Plus, href: "/playbooks" },
  { label: "Add Agent", icon: UserPlus, href: "/agents" },
  { label: "Create Task", icon: ClipboardList, href: "/sprint" },
  { label: "View Analytics", icon: BarChart3, href: "/activity" },
];

export function QuickActions() {
  return (
    <div className="card-surface p-4">
      <div className="section-header">Quick Actions</div>
      <ul className="mt-3 flex flex-col gap-1.5">
        {ACTIONS.map((a) => {
          const Icon = a.icon;
          return (
            <li key={a.label}>
              <Link
                href={a.href}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-medium text-secondary hover:bg-surface-muted"
              >
                <Icon size={14} className="text-accent" />
                <span className="flex-1">{a.label}</span>
                <span className="text-muted">›</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
