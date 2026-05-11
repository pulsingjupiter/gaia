/**
 * AGENT_TEAMS — preset bundles of agent templates that ship together.
 *
 * Used by the "Add Team" button on /agents. Each team references templates
 * in `agent-templates.ts` by id. The "apply team" API route iterates the
 * template_ids and scaffolds each missing agent (skipping any whose slug
 * already exists in the DB).
 */

import { AGENT_TEMPLATES, getTemplateById } from "@/lib/agent-templates";

export type AgentTeam = {
  /** Stable id used by the API. */
  id: string;
  /** Display name on the tile. */
  name: string;
  /** One-line description for the tile + preview. */
  description: string;
  /** Templates to scaffold. Must each match an id in AGENT_TEMPLATES. */
  template_ids: string[];
};

export const AGENT_TEAMS: AgentTeam[] = [
  {
    id: "content",
    name: "Content",
    description: "Editor, scriptwriter, and researcher for marketing/social.",
    template_ids: ["editor", "scriptwriter", "researcher"],
  },
  {
    id: "engineering",
    name: "Engineering",
    description: "Engineer, PM, and designer for shipping product.",
    template_ids: ["engineer", "project-manager", "designer"],
  },
  {
    id: "research",
    name: "Research",
    description: "Researcher, data analyst, and editor for findings → writeup.",
    template_ids: ["researcher", "data-analyst", "editor"],
  },
  {
    id: "sales",
    name: "Sales / BD",
    description: "Sales, researcher, and editor for outbound.",
    template_ids: ["sales-bd", "researcher", "editor"],
  },
  {
    id: "exec-support",
    name: "Exec Support",
    description: "Chief of Staff, editor, and data analyst around the principal.",
    template_ids: ["chief-of-staff", "editor", "data-analyst"],
  },
];

const TEAM_INDEX: Map<string, AgentTeam> = new Map(
  AGENT_TEAMS.map((t) => [t.id, t]),
);

export function getTeamById(id: string): AgentTeam | undefined {
  return TEAM_INDEX.get(id);
}

/**
 * Dev-time sanity check — every template_id must resolve. Catches typos
 * when the templates registry and teams registry get out of sync.
 */
for (const team of AGENT_TEAMS) {
  for (const tid of team.template_ids) {
    if (!getTemplateById(tid)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[agent-teams] team '${team.id}' references unknown template_id '${tid}'`,
      );
    }
  }
}
// Touch AGENT_TEMPLATES to keep the import marked as used even when only
// the registry warning loop runs (tree-shakers can drop this otherwise).
void AGENT_TEMPLATES;
