/**
 * Avatar registry — 10 preset RPG-style character avatars rendered from
 * DiceBear's `adventurer` style. The SVGs live under
 * `public/avatars/agents/<id>.svg` and are referenced by URL so they stay
 * out of the JS bundle.
 *
 * Wave 2 surfaces (employees, projects, agents) consume this via the
 * `<AgentAvatar />` component and `<IconPicker />` modal. The DB stores
 * either an avatar id (e.g. "knight"), a single emoji, or null — the
 * detection logic in `<AgentAvatar />` chooses the right renderer.
 */

export interface AgentAvatar {
  /** Stable id used in the DB (e.g. `avatar_emoji = "knight"`). */
  id: string;
  /** Friendly display name for tooltips / picker labels. */
  name: string;
  /** Public URL to the SVG (served from `/public`). */
  src: string;
  /** Loose archetype grouping — useful for filtering / future sectioning. */
  archetype:
    | "fighter"
    | "magic-user"
    | "support"
    | "stealth"
    | "nature"
    | "performer"
    | "wildcard"
    | "custom";
  /** Short flavor text shown under the name in the picker. */
  description?: string;
}

export const PRESET_AVATARS: AgentAvatar[] = [
  {
    id: "knight",
    name: "Knight",
    src: "/avatars/agents/knight.svg",
    archetype: "fighter",
    description: "Stalwart frontliner — dependable execution.",
  },
  {
    id: "wizard",
    name: "Wizard",
    src: "/avatars/agents/wizard.svg",
    archetype: "magic-user",
    description: "Arcane analyst — research and reasoning.",
  },
  {
    id: "ranger",
    name: "Ranger",
    src: "/avatars/agents/ranger.svg",
    archetype: "stealth",
    description: "Scout and tracker — discovery and recon.",
  },
  {
    id: "paladin",
    name: "Paladin",
    src: "/avatars/agents/paladin.svg",
    archetype: "fighter",
    description: "Disciplined operator — guardrails and review.",
  },
  {
    id: "rogue",
    name: "Rogue",
    src: "/avatars/agents/rogue.svg",
    archetype: "stealth",
    description: "Quick mover — shortcuts and edge cases.",
  },
  {
    id: "druid",
    name: "Druid",
    src: "/avatars/agents/druid.svg",
    archetype: "nature",
    description: "Adapts to terrain — flexible generalist.",
  },
  {
    id: "bard",
    name: "Bard",
    src: "/avatars/agents/bard.svg",
    archetype: "performer",
    description: "Wordsmith — copy, comms, and storytelling.",
  },
  {
    id: "monk",
    name: "Monk",
    src: "/avatars/agents/monk.svg",
    archetype: "support",
    description: "Focused and minimal — disciplined craftsman.",
  },
  {
    id: "sorcerer",
    name: "Sorcerer",
    src: "/avatars/agents/sorcerer.svg",
    archetype: "magic-user",
    description: "Raw power — bold creative leaps.",
  },
  {
    id: "healer",
    name: "Healer",
    src: "/avatars/agents/healer.svg",
    archetype: "support",
    description: "Restores and supports — QA and care.",
  },
  {
    id: "rascal",
    name: "Rascal",
    src: "/avatars/agents/rascal.svg",
    archetype: "wildcard",
    description: "Cheeky improviser — playful and unpredictable.",
  },
  {
    id: "champion",
    name: "Champion",
    src: "/avatars/agents/champion.jpeg",
    archetype: "wildcard",
    description: "Heroic upstart — bold, focused, ready for the quest.",
  },
];

const AVATAR_INDEX: Map<string, AgentAvatar> = new Map(
  PRESET_AVATARS.map((a) => [a.id, a]),
);

const CUSTOM_PREFIX = "custom:";

/**
 * Returns true when `value` is a user-uploaded custom avatar id
 * (`custom:<uuid>`). The file lives under `/avatars/custom/<uuid>.png`.
 */
export function isCustomAvatarId(value: string | null | undefined): value is string {
  if (typeof value !== "string") return false;
  if (!value.startsWith(CUSTOM_PREFIX)) return false;
  // Must have a uuid suffix — guards against pasted "custom:" with nothing
  // after, which would resolve to /avatars/custom/.png and 404.
  return value.length > CUSTOM_PREFIX.length;
}

/**
 * For custom avatars synthesise a record on the fly — they aren't in the
 * preset index, but the renderer + picker still want the same shape.
 */
export function getAvatarById(id: string): AgentAvatar | undefined {
  const preset = AVATAR_INDEX.get(id);
  if (preset) return preset;
  if (isCustomAvatarId(id)) {
    const uuid = id.slice(CUSTOM_PREFIX.length);
    return {
      id,
      name: "Custom",
      src: `/avatars/custom/${uuid}.png`,
      archetype: "custom",
      description: "Custom upload",
    };
  }
  return undefined;
}

/**
 * Type guard — returns true when `value` is a known preset avatar id OR
 * a user-uploaded custom avatar. Use this to decide whether to render an
 * image vs. fall back to emoji / initials.
 */
export function isAvatarId(value: string | null | undefined): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  if (AVATAR_INDEX.has(value)) return true;
  return isCustomAvatarId(value);
}
