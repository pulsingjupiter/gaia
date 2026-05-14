"use client";
/**
 * /approvals — human-in-the-loop decision queue.
 *
 * Lists actions requested by agents that require human sign-off.
 * Supports optimistic approve/reject (skip) actions.
 */
import { useState, useMemo } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { useApprovals, type ApprovalStatus } from "@/lib/hooks/use-approvals";
import { useEmployees } from "@/components/employees/employees-context";
import { Check, X, Loader2, Clock, Inbox, ChevronDown } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";

type StatusFilter = ApprovalStatus | "all";

export default function ApprovalsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const { employees } = useEmployees();
  
  const { approvals, loading, approve, skip } = useApprovals({
    status: statusFilter === "all" ? undefined : (statusFilter as ApprovalStatus),
  });

  const sortedApprovals = useMemo(() => {
    return [...approvals].sort((a, b) => b.created_at - a.created_at);
  }, [approvals]);

  return (
    <div className="px-6 py-6">
      <PageHeader
        title="Approvals"
        subtitle="Review and sign off on agent-requested actions."
        right={
          <StatusFilterMenu 
            selected={statusFilter} 
            onSelect={setStatusFilter} 
          />
        }
      />

      <div className="mt-6">
        {loading && approvals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted">
            <Loader2 className="size-6 animate-spin" />
            <p className="mt-2 text-xs">Loading approvals…</p>
          </div>
        ) : sortedApprovals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-surface-muted text-muted">
              <Inbox size={24} />
            </div>
            <p className="mt-4 text-sm font-medium text-primary">No approvals pending.</p>
            <p className="mt-1 text-xs text-muted">
              Agents will surface decisions here when they need a human in the loop.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {sortedApprovals.map((approval) => {
              const agent = employees.find((e) => e.id === approval.agent_id);
              return (
                <div
                  key={approval.id}
                  className="card-surface flex items-center gap-4 p-4"
                >
                  <div className="shrink-0">
                    <Avatar
                      initials={agent?.initials ?? "??"}
                      color={agent?.accent ?? "#ccc"}
                      size={32}
                    />
                  </div>
                  
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-primary">
                        {agent?.name ?? "Unknown Agent"}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-muted">
                        • {approval.action_type.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="mt-0.5 text-sm font-medium text-primary truncate">
                      {approval.title}
                    </div>
                    {approval.body && (
                      <div className="mt-1 text-xs text-muted line-clamp-2">
                        {approval.body}
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted">
                      <Clock size={10} />
                      <span>
                        Created {formatDistanceToNow(approval.created_at)} ago
                      </span>
                      {approval.status !== "pending" && (
                        <>
                          <span className="mx-1">•</span>
                          <span className={cn(
                            "font-medium capitalize",
                            approval.status === "approved" ? "text-green-600" : "text-amber-600"
                          )}>
                            {approval.status === "skipped" ? "rejected" : approval.status}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {approval.status === "pending" && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => skip(approval.id)}
                        className="inline-flex h-8 items-center justify-center rounded-lg border border-strong bg-white px-3 text-xs font-medium text-secondary hover:bg-surface-muted transition-colors"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => approve(approval.id)}
                        className="inline-flex h-8 items-center justify-center rounded-lg bg-accent px-3 text-xs font-medium text-white hover:opacity-90 transition-opacity"
                      >
                        Approve
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusFilterMenu({
  selected,
  onSelect,
}: {
  selected: StatusFilter;
  onSelect: (v: StatusFilter) => void;
}) {
  const [open, setOpen] = useState(false);

  const options: { value: StatusFilter; label: string }[] = [
    { value: "pending", label: "Pending" },
    { value: "approved", label: "Approved" },
    { value: "skipped", label: "Rejected" },
    { value: "all", label: "All" },
  ];

  const currentLabel = options.find((o) => o.value === selected)?.label ?? "All";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 rounded-lg border border-strong bg-white px-3 py-2 text-xs font-medium text-secondary hover:bg-surface-muted"
      >
        <span>Status: <span className="text-primary">{currentLabel}</span></span>
        <ChevronDown size={14} className={cn("text-muted transition-transform", open && "rotate-180")} />
      </button>
      
      {open && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setOpen(false)} 
          />
          <div className="absolute right-0 z-20 mt-1 w-32 overflow-hidden rounded-lg border border-strong bg-white shadow-lg">
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  onSelect(opt.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center px-3 py-2 text-left text-xs hover:bg-surface-muted",
                  selected === opt.value ? "bg-surface-muted font-semibold text-primary" : "text-secondary"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
