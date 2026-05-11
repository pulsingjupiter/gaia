"use client";
/**
 * /agents/[id] — three-column detail surface (sidebar + main pane + right rail).
 *
 * Tabs are tracked with internal state (no nested routes) so we don't conflict
 * with the existing /api/employees/[id] segment and stay symmetric with how
 * /projects/[id] handles its tabs.
 */
import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  LayoutDashboard,
  Loader2,
  Settings as SettingsIcon,
  Sparkles,
  User,
} from "lucide-react";

import { useAgentDetail } from "@/lib/hooks/use-agent-detail";
import { useEmployees } from "@/components/employees/employees-context";
import { rowToEmployee } from "@/lib/hooks/use-employees";
import { EmployeeModal } from "@/components/employees/employee-modal";
import { cn } from "@/lib/cn";
import { AgentHeader } from "@/components/agents/agent-header";
import { AgentRail } from "@/components/agents/agent-rail";
import { ProfileTab } from "@/components/agents/profile-tab";
import { SkillsTab } from "@/components/agents/skills-tab";
import { RunsTab } from "@/components/agents/runs-tab";
import { AgentSettingsTab } from "@/components/agents/settings-tab";
import { WorkloadTab } from "@/components/agents/workload-tab";

type TabId = "workload" | "profile" | "skills" | "runs" | "settings";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "workload", label: "Workload", icon: LayoutDashboard },
  { id: "profile", label: "Profile", icon: User },
  { id: "skills", label: "Skills", icon: Sparkles },
  // The underlying file/component is still RunsTab — only the user-facing
  // label flips to "History" to reflect that the new Workload tab now owns
  // the live "what's happening right now" surface.
  { id: "runs", label: "History", icon: Activity },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const detail = useAgentDetail(id);
  const { remove } = useEmployees();
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("workload");
  const [editOpen, setEditOpen] = useState(false);

  // The shared employee-modal speaks the legacy `Employee` shape, so map
  // the DB row before opening it for editing.
  const employeeForModal = useMemo(
    () => (detail.employee ? rowToEmployee(detail.employee) : null),
    [detail.employee],
  );

  if (detail.loading && !detail.employee) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-xs text-muted">
        <Loader2 size={16} className="mr-2 animate-spin" />
        Loading agent…
      </div>
    );
  }

  if (!detail.employee) {
    return (
      <div className="px-6 py-6">
        <div className="card-surface p-8 text-center">
          <h2 className="text-lg font-semibold text-primary">
            Agent not found
          </h2>
          <p className="mt-2 text-sm text-secondary">
            {detail.error ?? `No agent with id '${id}'.`}
          </p>
        </div>
      </div>
    );
  }

  const employee = detail.employee;

  const handleArchive = () => {
    if (typeof window === "undefined") return;
    const ok = window.confirm(
      `Archive ${employee.name}? They will be hidden from the active list.`,
    );
    if (!ok) return;
    // The context's remove() fires the DELETE and updates state in the
    // background. We navigate optimistically — the list page will reflect
    // the archive on next render.
    remove(employee.id);
    router.push("/agents");
  };

  return (
    <div className="px-6 py-6">
      <div className="flex items-start gap-6">
        <div className="min-w-0 flex-1">
          <AgentHeader
            employee={employee}
            onEdit={() => setEditOpen(true)}
            onArchive={handleArchive}
          />

          <div className="border-b border-subtle">
            <div className="flex gap-6">
              {TABS.map((t) => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 pb-2 text-sm transition",
                      active
                        ? "border-b-2 border-accent font-semibold text-accent"
                        : "text-secondary hover:text-primary",
                    )}
                  >
                    <Icon size={14} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5">
            {tab === "workload" ? (
              <WorkloadTab employee={employee} />
            ) : tab === "profile" ? (
              <ProfileTab
                persona={detail.persona}
                agentId={employee.id}
                onSave={detail.savePersona}
              />
            ) : tab === "skills" ? (
              <SkillsTab
                skills={detail.skills}
                agentId={employee.id}
                getSkill={detail.getSkill}
                addSkill={detail.addSkill}
                saveSkill={detail.saveSkill}
                deleteSkill={detail.deleteSkill}
              />
            ) : tab === "runs" ? (
              <RunsTab runs={detail.recentRuns} />
            ) : (
              <AgentSettingsTab
                employee={employee}
                onSaved={() => {
                  void detail.refresh();
                }}
              />
            )}
          </div>
        </div>

        <AgentRail
          employee={employee}
          totalRuns={detail.totalRuns}
          totalCost={detail.totalCost}
        />
      </div>

      <EmployeeModal
        open={editOpen}
        onOpenChange={(v) => {
          setEditOpen(v);
          // After the modal closes a successful save will have updated
          // employees-context — re-pull the detail bundle to refresh
          // persona/skills/runs in case anything changed.
          if (!v) void detail.refresh();
        }}
        employee={employeeForModal}
      />
    </div>
  );
}
