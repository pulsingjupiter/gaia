"use client";
/**
 * ResumeSessionButton — split-button to resume a Claude Code session.
 *
 * Main click uses the user's saved default (`appearance.terminal`).
 * The chevron opens a dropdown with all three options so the user can
 * override per click without changing the global preference.
 *
 * Variants:
 *   - "primary": filled indigo button + label, chevron split. Big surfaces.
 *   - "compact": small text + icon split-button (table rows).
 *   - "icon":    icon-only split (right rail / activity rows).
 *
 * Owns its own loading + transient feedback badge ("Opening iTerm2…",
 * "Copied"). Errors surface via console.error + an inline indicator.
 */
import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Clipboard,
  Terminal,
  TerminalSquare,
} from "lucide-react";

import { cn } from "@/lib/cn";
import {
  resumeLabel,
  resumeSuccessLabel,
  useResumeSession,
  type TerminalPref,
} from "@/lib/hooks/use-resume-session";

type Variant = "primary" | "compact" | "icon";

type Props = {
  sessionId: string;
  variant?: Variant;
  /**
   * When provided, replaces the default label on the primary button. The
   * dropdown menu still shows all three terminal options. Useful for
   * surfaces like "Resume Latest" that want a stable label.
   */
  primaryLabelOverride?: string;
  disabled?: boolean;
  className?: string;
  onResolved?: (mode: TerminalPref, ok: boolean) => void;
};

type MenuItem = {
  id: TerminalPref;
  label: string;
  Icon: typeof Terminal;
};

const MENU: MenuItem[] = [
  { id: "terminal", label: "Resume in Terminal", Icon: Terminal },
  { id: "iterm2", label: "Resume in iTerm2", Icon: TerminalSquare },
  { id: "copy", label: "Copy command", Icon: Clipboard },
];

function defaultLabel(mode: TerminalPref): string {
  if (mode === "iterm2") return "Resume in iTerm2";
  if (mode === "copy") return "Copy command";
  return "Resume in Terminal";
}

function iconFor(mode: TerminalPref): typeof Terminal {
  if (mode === "iterm2") return TerminalSquare;
  if (mode === "copy") return Clipboard;
  return Terminal;
}

export function ResumeSessionButton({
  sessionId,
  variant = "primary",
  primaryLabelOverride,
  disabled = false,
  className,
  onResolved,
}: Props) {
  const { resume, mode } = useResumeSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Click outside closes the menu.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function fire(target: TerminalPref): Promise<void> {
    if (busy) return;
    setOpen(false);
    setBusy(true);
    setError(false);
    setFeedback(resumeLabel(target));
    try {
      const result = await resume(sessionId, target);
      if (!result.ok) {
        // eslint-disable-next-line no-console
        console.error(
          "ResumeSessionButton: resume failed —",
          result.error ?? "unknown error",
        );
        setError(true);
        setFeedback("Failed");
        onResolved?.(target, false);
      } else {
        setFeedback(resumeSuccessLabel(result.mode));
        onResolved?.(target, true);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("ResumeSessionButton: resume threw —", err);
      setError(true);
      setFeedback("Failed");
      onResolved?.(target, false);
    } finally {
      setBusy(false);
      window.setTimeout(() => {
        setFeedback((cur) => (cur === null ? cur : null));
        setError(false);
      }, 2000);
    }
  }

  const ActiveIcon = iconFor(mode);
  const label = primaryLabelOverride ?? defaultLabel(mode);

  return (
    <div
      ref={wrapRef}
      className={cn("relative inline-flex items-center", className)}
    >
      {variant === "primary" ? (
        <PrimarySplit
          ActiveIcon={ActiveIcon}
          label={busy ? resumeLabel(mode) : label}
          busy={busy}
          disabled={disabled}
          onMain={() => void fire(mode)}
          onChevron={() => setOpen((v) => !v)}
        />
      ) : variant === "compact" ? (
        <CompactSplit
          ActiveIcon={ActiveIcon}
          busy={busy}
          disabled={disabled}
          onMain={() => void fire(mode)}
          onChevron={() => setOpen((v) => !v)}
        />
      ) : (
        <IconSplit
          ActiveIcon={ActiveIcon}
          busy={busy}
          disabled={disabled}
          onMain={() => void fire(mode)}
          onChevron={() => setOpen((v) => !v)}
        />
      )}

      {open ? (
        <Menu
          activeMode={mode}
          onPick={(id) => void fire(id)}
          align={variant === "primary" ? "right" : "right"}
        />
      ) : null}

      {feedback ? (
        <span
          aria-live="polite"
          className={cn(
            "ml-2 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold",
            error
              ? "bg-red-50 text-status-error"
              : "bg-accent-soft text-accent",
          )}
        >
          {feedback}
        </span>
      ) : null}
    </div>
  );
}

// ── variants ─────────────────────────────────────────────────────────────

function PrimarySplit({
  ActiveIcon,
  label,
  busy,
  disabled,
  onMain,
  onChevron,
}: {
  ActiveIcon: typeof Terminal;
  label: string;
  busy: boolean;
  disabled: boolean;
  onMain: () => void;
  onChevron: () => void;
}) {
  return (
    <span className="inline-flex overflow-hidden rounded-lg shadow-sm">
      <button
        type="button"
        onClick={onMain}
        disabled={busy || disabled}
        className="inline-flex items-center gap-2 bg-accent px-3.5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {busy ? <Spinner /> : <ActiveIcon size={14} />}
        {label}
      </button>
      <button
        type="button"
        onClick={onChevron}
        disabled={disabled}
        aria-label="Choose terminal"
        className="inline-flex items-center justify-center border-l border-white/20 bg-accent px-2 text-white hover:opacity-90 disabled:opacity-60"
      >
        <ChevronDown size={14} />
      </button>
    </span>
  );
}

function CompactSplit({
  ActiveIcon,
  busy,
  disabled,
  onMain,
  onChevron,
}: {
  ActiveIcon: typeof Terminal;
  busy: boolean;
  disabled: boolean;
  onMain: () => void;
  onChevron: () => void;
}) {
  return (
    <span className="inline-flex overflow-hidden rounded-md border border-strong bg-white">
      <button
        type="button"
        onClick={onMain}
        disabled={busy || disabled}
        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-secondary hover:bg-surface-muted disabled:opacity-50"
      >
        {busy ? <Spinner small /> : <ActiveIcon size={11} />}
        {busy ? "…" : "Resume"}
      </button>
      <button
        type="button"
        onClick={onChevron}
        disabled={disabled}
        aria-label="Choose terminal"
        className="inline-flex items-center justify-center border-l border-strong px-1 text-secondary hover:bg-surface-muted disabled:opacity-50"
      >
        <ChevronDown size={11} />
      </button>
    </span>
  );
}

function IconSplit({
  ActiveIcon,
  busy,
  disabled,
  onMain,
  onChevron,
}: {
  ActiveIcon: typeof Terminal;
  busy: boolean;
  disabled: boolean;
  onMain: () => void;
  onChevron: () => void;
}) {
  return (
    <span className="inline-flex overflow-hidden rounded-md border border-strong bg-white">
      <button
        type="button"
        onClick={onMain}
        disabled={busy || disabled}
        aria-label="Resume session"
        title="Resume session"
        className="p-1 text-secondary hover:bg-surface-hover disabled:opacity-50"
      >
        {busy ? <Spinner small /> : <ActiveIcon size={11} />}
      </button>
      <button
        type="button"
        onClick={onChevron}
        disabled={disabled}
        aria-label="Choose terminal"
        className="inline-flex items-center justify-center border-l border-strong px-0.5 text-secondary hover:bg-surface-hover disabled:opacity-50"
      >
        <ChevronDown size={10} />
      </button>
    </span>
  );
}

// ── menu ─────────────────────────────────────────────────────────────────

function Menu({
  activeMode,
  onPick,
  align,
}: {
  activeMode: TerminalPref;
  onPick: (id: TerminalPref) => void;
  align: "left" | "right";
}) {
  return (
    <div
      role="menu"
      className={cn(
        "absolute top-full z-20 mt-1.5 min-w-[200px] overflow-hidden rounded-lg border border-subtle bg-white shadow-lg",
        align === "right" ? "right-0" : "left-0",
      )}
    >
      {MENU.map(({ id, label, Icon }) => {
        const active = id === activeMode;
        return (
          <button
            key={id}
            type="button"
            role="menuitem"
            onClick={() => onPick(id)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-primary hover:bg-surface-hover"
          >
            <Icon size={13} className="text-secondary" />
            <span className="flex-1">{label}</span>
            {active ? (
              <Check size={12} className="text-accent" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ── spinner ──────────────────────────────────────────────────────────────

function Spinner({ small = false }: { small?: boolean }) {
  const size = small ? 11 : 14;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="animate-spin"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="3"
        fill="none"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
