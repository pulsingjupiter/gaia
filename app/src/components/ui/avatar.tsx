import { cn } from "@/lib/cn";

export function Avatar({
  initials,
  color,
  size = 28,
  ring,
  className,
}: {
  initials: string;
  color: string;
  size?: number;
  ring?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        ring && "ring-2 ring-white",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: color,
        fontSize: Math.max(10, Math.round(size * 0.36)),
      }}
    >
      {initials}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 4,
  size = 24,
}: {
  people: { initials: string; color: string; name?: string }[];
  max?: number;
  size?: number;
}) {
  const visible = people.slice(0, max);
  const overflow = people.length - visible.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {visible.map((p, i) => (
        <Avatar
          key={i}
          initials={p.initials}
          color={p.color}
          size={size}
          ring
        />
      ))}
      {overflow > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-full bg-surface-hover text-[10px] font-semibold text-secondary ring-2 ring-white"
          style={{ width: size, height: size }}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
