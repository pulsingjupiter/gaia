"use client";
/**
 * IconGlyph — render a small set of curated lucide icons by name string.
 * Falls back to a letter avatar when no icon name matches.
 */
import {
  Briefcase,
  Camera,
  Code,
  Database,
  Globe,
  Heart,
  Music,
  Rocket,
  type LucideIcon,
} from "lucide-react";

export const PROJECT_ICON_OPTIONS = [
  { name: "Code", icon: Code },
  { name: "Briefcase", icon: Briefcase },
  { name: "Rocket", icon: Rocket },
  { name: "Heart", icon: Heart },
  { name: "Globe", icon: Globe },
  { name: "Database", icon: Database },
  { name: "Music", icon: Music },
  { name: "Camera", icon: Camera },
] as const;

const ICON_BY_NAME: Record<string, LucideIcon> = Object.fromEntries(
  PROJECT_ICON_OPTIONS.map((o) => [o.name, o.icon]),
);

export function IconGlyph({
  icon,
  fallback,
  color,
  size = 36,
}: {
  icon: string | null | undefined;
  fallback: string; // first letter
  color: string;
  size?: number;
}) {
  const Icon = icon ? ICON_BY_NAME[icon] : undefined;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-xl text-white"
      style={{
        width: size,
        height: size,
        background: color,
      }}
    >
      {Icon ? (
        <Icon size={Math.round(size * 0.5)} strokeWidth={2} />
      ) : (
        <span style={{ fontSize: Math.round(size * 0.4) }} className="font-semibold">
          {fallback.toUpperCase().slice(0, 1)}
        </span>
      )}
    </span>
  );
}
