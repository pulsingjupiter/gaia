"use client";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { useEmployees } from "@/components/employees/employees-context";

const ROWS = [
  { ids: ["professor-adrian", "king-henry"], threads: 1, time: "7m" },
  { ids: ["atlas", "king-henry"], threads: 1, time: "17m", active: true },
  { ids: ["nova", "professor-adrian"], threads: 1, time: "1d" },
  { ids: ["nova", "professor-adrian"], threads: 1, time: "1d" },
  { ids: ["nova", "professor-adrian"], threads: 1, time: "1d" },
];

export function ConversationsList() {
  const { employees } = useEmployees();
  const lookup = (slug: string) =>
    employees.find((e) => e.slug === slug) ?? {
      name: slug,
      initials: slug.slice(0, 2).toUpperCase(),
      accent: "#9CA3AF",
    };

  return (
    <div className="card-surface p-4">
      <div className="flex items-center justify-between">
        <div className="section-header">Conversations</div>
        <Link
          href="/conversations"
          className="text-[11px] font-medium text-accent hover:underline"
        >
          View all →
        </Link>
      </div>
      <ul className="mt-3 flex flex-col gap-1">
        {ROWS.map((row, i) => {
          const a = lookup(row.ids[0]);
          const b = lookup(row.ids[1]);
          return (
            <li
              key={i}
              className={
                row.active
                  ? "rounded-lg bg-surface-hover px-2 py-2"
                  : "rounded-lg px-2 py-2 hover:bg-surface-muted"
              }
            >
              <div className="flex items-center gap-2">
                <div className="flex -space-x-1.5">
                  <Avatar initials={a.initials} color={a.accent} size={22} ring />
                  <Avatar initials={b.initials} color={b.accent} size={22} ring />
                </div>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-xs font-semibold text-primary">
                    {a.name} & {b.name}
                  </div>
                  <div className="truncate text-[10px] text-muted">
                    {row.threads} thread • {row.time}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
