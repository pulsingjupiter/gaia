import type { LucideIcon } from "lucide-react";
import Link from "next/link";

export function KPICard({
  label,
  value,
  secondary,
  footer,
  icon: Icon,
  iconBg,
  iconFg,
  href,
}: {
  label: string;
  value: string;
  secondary?: string;
  footer?: string;
  icon: LucideIcon;
  iconBg: string;
  iconFg: string;
  href?: string;
}) {
  const content = (
    <>
      <div
        className="flex size-10 items-center justify-center rounded-xl"
        style={{ background: iconBg }}
      >
        <Icon size={18} color={iconFg} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="section-header">{label}</div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-[28px] font-bold leading-none text-primary">
            {value}
          </span>
          {secondary ? (
            <span className="text-xs text-muted">{secondary}</span>
          ) : null}
        </div>
        {footer ? (
          <div className="mt-1 text-[11px] text-muted">{footer}</div>
        ) : null}
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="card-surface flex items-start gap-4 p-4 transition-colors hover:border-strong cursor-pointer"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="card-surface flex items-start gap-4 p-4">
      {content}
    </div>
  );
}
