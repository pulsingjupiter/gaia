"use client";
/**
 * SettingsShell — left mini-nav, right pane container.
 */
import { cn } from "@/lib/cn";
import type { LucideIcon } from "lucide-react";

export type SettingsSectionId =
  | "profile"
  | "agents"
  | "planner"
  | "projects"
  | "terminal"
  | "hooks"
  | "data"
  | "about";

export type SettingsSectionDef = {
  id: SettingsSectionId;
  label: string;
  description: string;
  icon: LucideIcon;
};

export function SettingsShell({
  sections,
  active,
  onSelect,
  children,
}: {
  sections: SettingsSectionDef[];
  active: SettingsSectionId;
  onSelect: (id: SettingsSectionId) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px,1fr]">
      <nav className="card-surface h-fit p-2">
        <ul className="flex flex-col gap-0.5">
          {sections.map((s) => {
            const Icon = s.icon;
            const on = s.id === active;
            return (
              <li key={s.id}>
                <button
                  onClick={() => onSelect(s.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs font-medium",
                    on
                      ? "bg-accent-soft text-accent"
                      : "text-secondary hover:bg-surface-muted",
                  )}
                >
                  <Icon size={14} />
                  <span>{s.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function SectionPanel({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="card-surface flex flex-col">
      <div className="border-b border-subtle px-5 py-4">
        <div className="text-sm font-semibold text-primary">
          {title}
        </div>
        {description ? (
          <p className="mt-1 text-xs text-secondary">{description}</p>
        ) : null}
      </div>
      <div className="px-5 py-4">{children}</div>
      {footer ? (
        <div className="flex items-center justify-end gap-2 border-t border-subtle bg-surface-muted px-5 py-3">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 py-2 md:grid-cols-[180px,1fr] md:gap-4 md:py-3">
      <div>
        <div className="text-xs font-semibold text-primary">{label}</div>
        {hint ? (
          <div className="mt-0.5 text-[11px] text-muted">{hint}</div>
        ) : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      type={type}
      disabled={disabled}
      className="w-full rounded-lg border border-strong bg-white px-3 py-1.5 text-xs text-primary placeholder:text-muted focus:border-accent focus:outline-none disabled:opacity-50"
    />
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  const t = tone ?? "default";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50",
        t === "danger"
          ? "border-[#FECACA] bg-white text-status-error hover:bg-[#FEF2F2]"
          : "border-strong bg-white text-secondary hover:bg-surface-muted",
      )}
    >
      {children}
    </button>
  );
}
