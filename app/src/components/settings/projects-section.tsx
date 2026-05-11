"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SectionPanel } from "@/components/settings/settings-shell";
import type { ProjectRow } from "@/lib/hooks/use-projects";

export function ProjectsSection({ projects }: { projects: ProjectRow[] }) {
  return (
    <SectionPanel
      title="Projects"
      description="Read-only — manage projects in the Projects page."
    >
      <div className="overflow-hidden rounded-lg border border-subtle">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface-muted text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Path</th>
              <th className="px-3 py-2 font-medium">Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-subtle">
            {projects.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="px-3 py-6 text-center text-muted"
                >
                  No projects yet.
                </td>
              </tr>
            ) : (
              projects.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2.5 font-medium text-primary">
                    {p.name}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-secondary truncate">
                    {p.path}
                  </td>
                  <td className="px-3 py-2.5 text-muted">
                    {p.is_internal ? "Internal" : "External"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3 text-[11px] text-muted">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
        >
          Manage projects in the Projects page <ArrowUpRight size={11} />
        </Link>
      </div>
    </SectionPanel>
  );
}
