"use client";
/**
 * Settings — sectioned page with a left mini-nav.
 *
 * Sections: Profile, Agents, Projects, Terminal, Hooks, Data, About.
 * The left nav stays sticky-relative; pane content is independent per section.
 */
import { useMemo, useState } from "react";
import {
  User,
  Users,
  FolderKanban,
  TerminalSquare,
  Webhook,
  Database,
  Info,
  Loader2,
  Sparkles,
  MessageSquare,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import {
  SettingsShell,
  type SettingsSectionDef,
  type SettingsSectionId,
} from "@/components/settings/settings-shell";
import { ProfileSection } from "@/components/settings/profile-section";
import { AgentsSection } from "@/components/settings/agents-section";
import { PlannerCliSection } from "@/components/settings/planner-cli-section";
import { TelegramSection } from "@/components/settings/telegram-section";
import { ProjectsSection } from "@/components/settings/projects-section";
import { TerminalSection } from "@/components/settings/terminal-section";
import { HooksSection } from "@/components/settings/hooks-section";
import { DataSection } from "@/components/settings/data-section";
import { AboutSection } from "@/components/settings/about-section";
import { useSettings } from "@/lib/hooks/use-settings";
import { useProjects } from "@/lib/hooks/use-projects";
import { useEmployees } from "@/components/employees/employees-context";

const SECTIONS: SettingsSectionDef[] = [
  { id: "profile", label: "Profile", description: "How you appear in Gaia.", icon: User },
  { id: "agents", label: "Agents", description: "Per-agent model & cost cap.", icon: Users },
  { id: "planner", label: "Planner", description: "Default LLM CLI for Plan/Assess.", icon: Sparkles },
  { id: "telegram", label: "Telegram", description: "Configure the Telegram bot.", icon: MessageSquare },
  { id: "projects", label: "Projects", description: "Read-only summary.", icon: FolderKanban },
  { id: "terminal", label: "Terminal", description: "Resume preference.", icon: TerminalSquare },
  { id: "hooks", label: "Hooks", description: "Optional hooks installer.", icon: Webhook },
  { id: "data", label: "Data", description: "Database path & reset.", icon: Database },
  { id: "about", label: "About", description: "Version & links.", icon: Info },
];

export default function SettingsPage() {
  const { settings, loading, save, saving } = useSettings();
  const { projects } = useProjects();
  const { employees } = useEmployees();
  const [active, setActive] = useState<SettingsSectionId>("profile");

  const profile = useMemo(
    () =>
      settings?.profile ?? {
        name: "",
        email: "",
        timezone: "",
        greeting: "",
      },
    [settings],
  );
  const models = useMemo(
    () =>
      settings?.models ?? {
        default_model: "claude-sonnet-4-6",
        per_agent: {},
      },
    [settings],
  );
  const appearance = useMemo(
    () =>
      settings?.appearance ?? {
        theme: "light" as const,
      },
    [settings],
  );

  return (
    <div className="px-6 py-6">
      <PageHeader
        title="Settings"
        subtitle="Workspace, brand, and integration settings for Gaia."
      />
      {loading && !settings ? (
        <div className="card-surface flex items-center justify-center gap-2 py-16 text-xs text-muted">
          <Loader2 className="animate-spin" size={14} />
          Loading settings…
        </div>
      ) : (
        <SettingsShell sections={SECTIONS} active={active} onSelect={setActive}>
          {active === "profile" && (
            <ProfileSection settings={profile} save={save} saving={saving} />
          )}
          {active === "agents" && (
            <AgentsSection
              employees={employees}
              models={models}
              save={save}
              saving={saving}
            />
          )}
          {active === "planner" && <PlannerCliSection />}
          {active === "telegram" && <TelegramSection />}
          {active === "projects" && <ProjectsSection projects={projects} />}
          {active === "terminal" && (
            <TerminalSection
              appearance={appearance}
              save={save}
              saving={saving}
            />
          )}
          {active === "hooks" && <HooksSection />}
          {active === "data" && <DataSection />}
          {active === "about" && <AboutSection />}
        </SettingsShell>
      )}
    </div>
  );
}
