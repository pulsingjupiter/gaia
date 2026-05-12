"use client";

import type { ReactNode } from "react";
import { CircleDot, Clock3, GitBranch, Star } from "lucide-react";

import { useProjectRepoMetadata } from "@/lib/hooks/use-project-repo-metadata";
import { relativeTime } from "./format";

type Props = {
  projectId: string;
};

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString();
}

function Pill({
  icon,
  label,
  title,
}: {
  icon: ReactNode;
  label: string;
  title?: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-secondary"
      title={title}
    >
      {icon}
      {label}
    </span>
  );
}

export function RepoMetadataPills({ projectId }: Props) {
  const { data } = useProjectRepoMetadata(projectId);
  if (!data?.available) return null;

  const pushedAtMs = Date.parse(data.pushed_at);
  const pushedLabel = Number.isFinite(pushedAtMs)
    ? `Updated ${relativeTime(pushedAtMs)}`
    : "Updated unknown";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Pill
        icon={<GitBranch size={11} />}
        label={data.default_branch}
        title="Default branch"
      />
      <Pill
        icon={<Star size={11} />}
        label={formatCount(data.stargazers_count)}
        title="Stars"
      />
      <Pill
        icon={<CircleDot size={11} />}
        label={`${formatCount(data.open_issues_count)} open`}
        title="Open issues and pull requests"
      />
      <Pill
        icon={<Clock3 size={11} />}
        label={pushedLabel}
        title={data.pushed_at}
      />
    </div>
  );
}
