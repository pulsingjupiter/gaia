/**
 * AgentAvatar — unified renderer that handles three input shapes:
 *   1. Preset avatar id ("knight", "wizard", ...) → renders the SVG.
 *   2. Single emoji / 1–2 character string → renders centered in a circle.
 *   3. Anything else (or null) → renders initials from `name` in a circle.
 *
 * Used everywhere an agent / employee / project owner avatar appears so
 * the same `value` from the DB ("avatar_emoji" or "agent_avatar") renders
 * consistently across the app.
 */
import Image from "next/image";
import { cn } from "@/lib/cn";
import { getAvatarById, isAvatarId } from "@/lib/avatars";

export interface AgentAvatarProps {
  /** Raw value from DB — avatar id, emoji, or null. */
  value?: string | null;
  /** Display name — used to derive initials in the fallback path. */
  name: string;
  /** Pixel diameter. Defaults to 32. */
  size?: number;
  /** Hex/CSS color used for the fallback circle background. */
  accent?: string;
  /** Extra classes to apply to the outer span. */
  className?: string;
  /** Adds a soft white ring (used for active / overlapping states). */
  ring?: boolean;
}

const DEFAULT_ACCENT = "#9ca3af"; // neutral grey-400

function deriveInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

/**
 * True when `value` looks like a single emoji or short 1–2 character
 * string. Uses spread-iteration so multi-byte emojis (e.g. "🧙") count
 * as a single grapheme.
 */
function isShortGlyph(value: string): boolean {
  return [...value].length > 0 && [...value].length <= 2;
}

export function AgentAvatar({
  value,
  name,
  size = 32,
  accent = DEFAULT_ACCENT,
  className,
  ring,
}: AgentAvatarProps) {
  const dimension = { width: size, height: size };
  const baseClasses = cn(
    "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full select-none",
    ring && "ring-2 ring-white",
    className,
  );

  // 1. Preset SVG avatar
  if (value && isAvatarId(value)) {
    const avatar = getAvatarById(value)!;
    return (
      <span
        className={baseClasses}
        style={dimension}
        aria-label={`${name} avatar — ${avatar.name}`}
      >
        <Image
          src={avatar.src}
          alt=""
          width={size}
          height={size}
          unoptimized
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  // 2. Emoji / short glyph
  if (value && isShortGlyph(value)) {
    return (
      <span
        className={cn(baseClasses, "font-medium leading-none text-white")}
        style={{
          ...dimension,
          backgroundColor: accent,
          fontSize: Math.max(12, Math.round(size * 0.55)),
        }}
        aria-label={`${name} avatar`}
      >
        <span aria-hidden="true">{value}</span>
      </span>
    );
  }

  // 3. Initials fallback
  const initials = deriveInitials(name);
  return (
    <span
      className={cn(baseClasses, "font-semibold text-white")}
      style={{
        ...dimension,
        backgroundColor: accent,
        fontSize: Math.max(10, Math.round(size * 0.36)),
      }}
      aria-label={`${name} avatar`}
    >
      {initials}
    </span>
  );
}
