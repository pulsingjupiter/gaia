"use client";
import Link from "next/link";
import { AgentAvatar } from "@/components/shared/agent-avatar";
import type { Employee } from "@/lib/types";

export function ConversationsRightRail({
  employee,
}: {
  employee: Employee | null;
}) {
  const profileHref = employee?.id ? `/playbooks/${employee.id}` : null;
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 scroll-thin">
      <div className="card-surface p-4">
        <div className="section-header">Agent Context</div>
        {employee ? (
          <div className="mt-3 flex items-center gap-2.5">
            <AgentAvatar
              value={employee.avatar ?? null}
              name={employee.name}
              size={36}
              accent={employee.accent}
            />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold text-primary">
                {employee.name}
              </div>
              <div className="truncate text-[11px] text-muted">
                {employee.role}
              </div>
            </div>
          </div>
        ) : null}
        <dl className="mt-3 space-y-1.5 text-xs">
          <Row k="Name" v={employee?.name ?? "—"} />
          <Row k="Role" v={employee?.role ?? "—"} />
          <Row k="Status" v={employee?.status ?? "—"} />
          <Row k="Handle" v={employee?.handle ?? "—"} />
          <Row k="Timezone" v="UTC+8 SGT" />
        </dl>
        {profileHref ? (
          <Link
            href={profileHref}
            className="mt-3 block w-full rounded-lg border border-strong bg-white py-1.5 text-center text-xs font-medium text-secondary hover:bg-surface-muted"
          >
            View Agent
          </Link>
        ) : (
          <button
            type="button"
            disabled
            title="Select a conversation"
            className="mt-3 w-full cursor-not-allowed rounded-lg border border-strong bg-white py-1.5 text-xs font-medium text-muted opacity-60"
          >
            View Agent
          </button>
        )}
      </div>

      <ComingSoonCard
        title="Active Playbooks"
        body="Live playbook status will land alongside the runs streaming work."
        version="V5"
      />
      <ComingSoonCard
        title="Memory Snapshot"
        body="Topics from this agent's last few conversations will surface here."
        version="V5"
      />
      <ComingSoonCard
        title="Files & Outputs"
        body="Files this agent produced in the conversation will appear here. Open the Files page for the full shared bucket."
        version="V5"
        cta={{ label: "Open Files", href: "/files" }}
      />
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{k}</dt>
      <dd className="truncate font-medium text-secondary">{v}</dd>
    </div>
  );
}

function ComingSoonCard({
  title,
  body,
  version,
  cta,
}: {
  title: string;
  body: string;
  version: string;
  cta?: { label: string; href: string };
}) {
  return (
    <div className="card-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="section-header">{title}</div>
        <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted">
          {version}
        </span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-secondary">
        {body}
      </p>
      {cta ? (
        <Link
          href={cta.href}
          className="mt-3 inline-flex text-[11px] font-medium text-accent hover:underline"
        >
          {cta.label} ›
        </Link>
      ) : null}
    </div>
  );
}
