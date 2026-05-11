/**
 * Resolves a string icon name from `DOCS[*].icon` to a lucide React
 * component. Centralizing the lookup avoids dynamic-import overhead and
 * keeps the doc TS file decoupled from the lucide import surface.
 */
import {
  Clock,
  FileText,
  Layers,
  Rocket,
  Sunrise,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Clock,
  FileText,
  Layers,
  Rocket,
  Sunrise,
  Users,
  Wrench,
};

export function DocIcon({
  name,
  size = 18,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const Icon = ICONS[name] ?? FileText;
  return <Icon size={size} className={className} />;
}
