"use client";
/**
 * AgentLaunchButton — split-button to launch / continue a Claude Code session
 * from an agent's directory (`agents/<slug>/`). Each agent dir already has
 * its own `CLAUDE.md` + `.claude/skills/`, so running `claude` there auto-
 * loads the persona — that's the most natural workflow for the user.
 *
 * Mirrors `<ResumeSessionButton>` but is keyed by employee/agent rather than
 * session. Talks to the agent-keyed `POST /api/agents/[id]/launch` endpoint.
 *
 * Variants:
 *   - "primary": filled indigo button (agent detail header)
 *   - "compact": small text + icon split (agent list cards)
 *   - "icon":    icon-only split (future surfaces)
 *
 * Main-click default = "Continue last session" using the user's saved terminal
 * preference (`appearance.terminal`). The chevron menu always exposes all the
 * options so the user can override per click.
 *
 * Includes a "Quick run a skill…" entry that opens an inline modal calling
 * the existing `POST /api/runs` endpoint, then mounts `<LiveRunDrawer>` for
 * the live event stream.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  Clipboard,
  Loader2,
  Play,
  Sparkles,
  Terminal,
  TerminalSquare,
  X,
} from "lucide-react";

import { cn } from "@/lib/cn";
import { useAgentSkills } from "@/lib/hooks/use-agent-skills";
import { LiveRunDrawer } from "@/components/shared/live-run-drawer";
import type { EmployeeRuntime } from "@/lib/types";
import { RUNTIME_LABELS } from "@/lib/types";

type Variant = "primary" | "compact" | "inline" | "icon";

/** Saved appearance.terminal value. */
type TerminalPref = "terminal" | "iterm2" | "copy";

type LaunchMode = "open" | "continue" | "copy";
type LaunchTerminal = "Terminal" | "iTerm2";

type ActionId =
  | "open-terminal"
  | "open-iterm2"
  | "continue-terminal"
  | "continue-iterm2"
  | "copy-continue"
  | "quick-run";

type MenuItem = {
  id: ActionId;
  label: string;
  Icon: typeof Terminal;
  divider?: boolean;
};

const MENU: MenuItem[] = [
  { id: "open-terminal", label: "Open in Terminal (new session)", Icon: Terminal },
  { id: "open-iterm2", label: "Open in iTerm2 (new session)", Icon: TerminalSquare },
  { id: "continue-terminal", label: "Continue last session", Icon: Terminal },
  { id: "continue-iterm2", label: "Continue last session in iTerm2", Icon: TerminalSquare },
  { id: "copy-continue", label: "Copy continue command", Icon: Clipboard },
  { id: "quick-run", label: "Quick run a skill…", Icon: Sparkles, divider: true },
];

/** Cached terminal pref shared across instances. */
let _prefCache: { value: TerminalPref; fetchedAt: number } | null = null;
const _PREF_TTL_MS = 30_000;

async function loadTerminalPref(force = false): Promise<TerminalPref> {
  if (!force && _prefCache && Date.now() - _prefCache.fetchedAt < _PREF_TTL_MS) {
    return _prefCache.value;
  }
  try {
    const res = await fetch("/api/settings", { cache: "no-store" });
    if (!res.ok) throw new Error(`GET /api/settings ${res.status}`);
    const data = (await res.json()) as {
      settings?: { appearance?: { terminal?: TerminalPref } };
    };
    const value: TerminalPref =
      data.settings?.appearance?.terminal ?? "terminal";
    _prefCache = { value, fetchedAt: Date.now() };
    return value;
  } catch {
    return _prefCache?.value ?? "terminal";
  }
}

function defaultActionFor(
  pref: TerminalPref,
  runtime: EmployeeRuntime,
): ActionId {
  // Non-Claude runtimes have no resumable session — collapse the default
  // action to a new-session "open" instead of "continue".
  if (runtime !== "claude") return openActionFor(pref);
  if (pref === "iterm2") return "continue-iterm2";
  if (pref === "copy") return "copy-continue";
  return "continue-terminal";
}

function openActionFor(pref: TerminalPref): ActionId {
  if (pref === "iterm2") return "open-iterm2";
  return "open-terminal";
}

function defaultLabelFor(
  pref: TerminalPref,
  runtime: EmployeeRuntime,
): string {
  if (runtime !== "claude") return `Launch ${RUNTIME_LABELS[runtime]}`;
  if (pref === "iterm2") return "Continue in iTerm2";
  if (pref === "copy") return "Copy continue command";
  return "Continue last session";
}

function defaultIconFor(pref: TerminalPref): typeof Terminal {
  if (pref === "iterm2") return TerminalSquare;
  if (pref === "copy") return Clipboard;
  return Terminal;
}

function actionToRequest(
  action: ActionId,
): { mode: LaunchMode; terminal?: LaunchTerminal } | null {
  switch (action) {
    case "open-terminal":
      return { mode: "open", terminal: "Terminal" };
    case "open-iterm2":
      return { mode: "open", terminal: "iTerm2" };
    case "continue-terminal":
      return { mode: "continue", terminal: "Terminal" };
    case "continue-iterm2":
      return { mode: "continue", terminal: "iTerm2" };
    case "copy-continue":
      return { mode: "copy" };
    default:
      return null;
  }
}

function inProgressLabel(action: ActionId): string {
  if (action === "open-iterm2" || action === "continue-iterm2")
    return "Opening iTerm2…";
  if (action === "copy-continue") return "Copying command…";
  if (action === "open-terminal" || action === "continue-terminal")
    return "Opening Terminal…";
  return "Working…";
}

function successLabel(action: ActionId): string {
  if (action === "open-iterm2") return "Opened in iTerm2";
  if (action === "continue-iterm2") return "Continued in iTerm2";
  if (action === "copy-continue") return "Command copied";
  if (action === "open-terminal") return "Opened in Terminal";
  if (action === "continue-terminal") return "Continued in Terminal";
  return "Done";
}

type Props = {
  agentId: string;
  agentName?: string;
  /**
   * Multi-runtime MVP: when this is 'jules' or 'codex' the button label
   * becomes "Launch Jules" / "Launch Codex", the menu hides Claude-only
   * actions (continue/copy-continue), and the inline variant collapses
   * its New/Continue pair to a single Launch button.
   */
  runtime?: EmployeeRuntime;
  variant?: Variant;
  disabled?: boolean;
  className?: string;
};

export function AgentLaunchButton({
  agentId,
  agentName,
  runtime: agentRuntime = "claude",
  variant = "primary",
  disabled = false,
  className,
}: Props) {
  const [pref, setPref] = useState<TerminalPref>(_prefCache?.value ?? "terminal");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [quickRunOpen, setQuickRunOpen] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Load pref + refresh on focus.
  useEffect(() => {
    let cancelled = false;
    void loadTerminalPref(false).then((v) => {
      if (!cancelled) setPref(v);
    });
    const onFocus = () => {
      void loadTerminalPref(true).then((v) => {
        if (!cancelled) setPref(v);
      });
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

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

  async function fire(action: ActionId): Promise<void> {
    if (action === "quick-run") {
      setOpen(false);
      setQuickRunOpen(true);
      return;
    }
    if (busy) return;
    setOpen(false);
    setBusy(true);
    setError(false);
    setFeedback(inProgressLabel(action));
    const req = actionToRequest(action);
    if (!req) {
      setBusy(false);
      return;
    }
    try {
      const res = await fetch(
        `/api/agents/${encodeURIComponent(agentId)}/launch`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(req),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        command?: string;
        error?: string;
      };
      if (!res.ok || data.ok === false) {
        // eslint-disable-next-line no-console
        console.error(
          "AgentLaunchButton: launch failed —",
          data.error ?? `HTTP ${res.status}`,
        );
        setError(true);
        setFeedback("Failed");
      } else {
        if (
          action === "copy-continue" &&
          data.command &&
          typeof navigator !== "undefined" &&
          navigator.clipboard?.writeText
        ) {
          await navigator.clipboard.writeText(data.command).catch(() => {});
        }
        setFeedback(successLabel(action));
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("AgentLaunchButton: launch threw —", err);
      setError(true);
      setFeedback("Failed");
    } finally {
      setBusy(false);
      window.setTimeout(() => {
        setFeedback((cur) => (cur === null ? cur : null));
        setError(false);
      }, 2000);
    }
  }

  const ActiveIcon = defaultIconFor(pref);
  const label = defaultLabelFor(pref, agentRuntime);
  const defaultAction = defaultActionFor(pref, agentRuntime);
  // Filter the dropdown for non-Claude runtimes: continue/copy-continue
  // resume a Claude-specific JSONL session which Jules/Codex don't have.
  const menuItems = MENU.filter((m) => {
    if (agentRuntime === "claude") return true;
    return (
      m.id === "open-terminal" ||
      m.id === "open-iterm2" ||
      m.id === "quick-run"
    );
  });

  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <>
      <div
        ref={wrapRef}
        className={cn("relative inline-flex items-center", className)}
        onClick={stop}
      >
        {variant === "primary" ? (
          <PrimarySplit
            ActiveIcon={ActiveIcon}
            label={busy ? inProgressLabel(defaultAction) : label}
            busy={busy}
            disabled={disabled}
            onMain={() => void fire(defaultAction)}
            onChevron={() => setOpen((v) => !v)}
          />
        ) : variant === "compact" ? (
          <CompactSplit
            ActiveIcon={ActiveIcon}
            busy={busy}
            disabled={disabled}
            onMain={() => void fire(defaultAction)}
            onChevron={() => setOpen((v) => !v)}
          />
        ) : variant === "inline" ? (
          agentRuntime === "claude" ? (
            <InlineSplit
              ContinueIcon={ActiveIcon}
              busy={busy}
              disabled={disabled}
              onNew={() => void fire(openActionFor(pref))}
              onContinue={() => void fire(defaultAction)}
              onChevron={() => setOpen((v) => !v)}
            />
          ) : (
            <InlineLaunchOnly
              busy={busy}
              disabled={disabled}
              onLaunch={() => void fire(defaultAction)}
              onChevron={() => setOpen((v) => !v)}
            />
          )
        ) : (
          <IconSplit
            ActiveIcon={ActiveIcon}
            busy={busy}
            disabled={disabled}
            onMain={() => void fire(defaultAction)}
            onChevron={() => setOpen((v) => !v)}
          />
        )}

        {open ? (
          <Menu
            activeAction={defaultAction}
            items={menuItems}
            onPick={(id) => void fire(id)}
            align="right"
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

      {quickRunOpen && typeof document !== "undefined"
        ? createPortal(
            <QuickRunModal
              agentId={agentId}
              agentName={agentName}
              onClose={() => setQuickRunOpen(false)}
              onStarted={(runId) => {
                setQuickRunOpen(false);
                setActiveRunId(runId);
                setDrawerOpen(true);
              }}
            />,
            document.body,
          )
        : null}

      {typeof document !== "undefined"
        ? createPortal(
            <LiveRunDrawer
              runId={activeRunId}
              open={drawerOpen}
              onClose={() => {
                setDrawerOpen(false);
                // Keep activeRunId around so the drawer can fade out — clear
                // on next open.
              }}
            />,
            document.body,
          )
        : null}
    </>
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
        aria-label="Choose launch action"
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
        {busy ? "…" : "Launch"}
      </button>
      <button
        type="button"
        onClick={onChevron}
        disabled={disabled}
        aria-label="Choose launch action"
        className="inline-flex items-center justify-center border-l border-strong px-1 text-secondary hover:bg-surface-muted disabled:opacity-50"
      >
        <ChevronDown size={11} />
      </button>
    </span>
  );
}

function InlineSplit({
  ContinueIcon,
  busy,
  disabled,
  onNew,
  onContinue,
  onChevron,
}: {
  ContinueIcon: typeof Terminal;
  busy: boolean;
  disabled: boolean;
  onNew: () => void;
  onContinue: () => void;
  onChevron: () => void;
}) {
  return (
    <span className="inline-flex overflow-hidden rounded-md border border-strong bg-white">
      <button
        type="button"
        onClick={onNew}
        disabled={busy || disabled}
        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-secondary hover:bg-surface-muted disabled:opacity-50"
      >
        {busy ? <Spinner small /> : <Play size={11} />}
        New
      </button>
      <button
        type="button"
        onClick={onContinue}
        disabled={busy || disabled}
        className="inline-flex items-center gap-1 border-l border-strong px-2 py-1 text-[11px] font-medium text-secondary hover:bg-surface-muted disabled:opacity-50"
      >
        {busy ? <Spinner small /> : <ContinueIcon size={11} />}
        Continue
      </button>
      <button
        type="button"
        onClick={onChevron}
        disabled={disabled}
        aria-label="Choose launch action"
        className="inline-flex items-center justify-center border-l border-strong px-1 text-secondary hover:bg-surface-muted disabled:opacity-50"
      >
        <ChevronDown size={11} />
      </button>
    </span>
  );
}

function InlineLaunchOnly({
  busy,
  disabled,
  onLaunch,
  onChevron,
}: {
  busy: boolean;
  disabled: boolean;
  onLaunch: () => void;
  onChevron: () => void;
}) {
  return (
    <span className="inline-flex overflow-hidden rounded-md border border-strong bg-white">
      <button
        type="button"
        onClick={onLaunch}
        disabled={busy || disabled}
        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-secondary hover:bg-surface-muted disabled:opacity-50"
      >
        {busy ? <Spinner small /> : <Play size={11} />}
        Launch
      </button>
      <button
        type="button"
        onClick={onChevron}
        disabled={disabled}
        aria-label="Choose launch action"
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
        aria-label="Launch agent session"
        title="Launch agent session"
        className="p-1 text-secondary hover:bg-surface-hover disabled:opacity-50"
      >
        {busy ? <Spinner small /> : <ActiveIcon size={11} />}
      </button>
      <button
        type="button"
        onClick={onChevron}
        disabled={disabled}
        aria-label="Choose launch action"
        className="inline-flex items-center justify-center border-l border-strong px-0.5 text-secondary hover:bg-surface-hover disabled:opacity-50"
      >
        <ChevronDown size={10} />
      </button>
    </span>
  );
}

// ── menu ─────────────────────────────────────────────────────────────────

function Menu({
  activeAction,
  items,
  onPick,
  align,
}: {
  activeAction: ActionId;
  items: MenuItem[];
  onPick: (id: ActionId) => void;
  align: "left" | "right";
}) {
  return (
    <div
      role="menu"
      className={cn(
        "absolute top-full z-20 mt-1.5 min-w-[260px] overflow-hidden rounded-lg border border-subtle bg-white shadow-lg",
        align === "right" ? "right-0" : "left-0",
      )}
    >
      {items.map(({ id, label, Icon, divider }) => {
        const active = id === activeAction;
        return (
          <div key={id}>
            {divider ? (
              <div className="my-1 border-t border-subtle" />
            ) : null}
            <button
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
          </div>
        );
      })}
    </div>
  );
}

// ── quick-run modal ──────────────────────────────────────────────────────

function QuickRunModal({
  agentId,
  agentName,
  onClose,
  onStarted,
}: {
  agentId: string;
  agentName?: string;
  onClose: () => void;
  onStarted: (runId: string) => void;
}) {
  const { skills, loading, error } = useAgentSkills(agentId);
  const [skill, setSkill] = useState<string>("");
  const [input, setInput] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Default the skill picker to the first available skill once loaded.
  const firstSkill = useMemo(() => skills[0]?.name ?? "", [skills]);
  useEffect(() => {
    if (!skill && firstSkill) setSkill(firstSkill);
  }, [firstSkill, skill]);

  // Dismiss on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock body scroll while modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function submit() {
    if (!skill || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employee_id: agentId,
          skill,
          input: input.trim() ? input : null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        run_id?: string;
        error?: string;
      };
      if (!res.ok || !data.run_id) {
        setSubmitError(data.error ?? `HTTP ${res.status}`);
        setSubmitting(false);
        return;
      }
      onStarted(data.run_id);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-subtle bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-subtle px-4 py-3">
          <h2 className="text-sm font-semibold text-primary">
            Quick Run{agentName ? ` — ${agentName}` : ""}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted hover:bg-surface-muted"
          >
            <X size={14} />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          <div>
            <label
              htmlFor="quick-run-skill"
              className="mb-1 block text-xs font-medium text-secondary"
            >
              Skill
            </label>
            {loading ? (
              <div className="inline-flex items-center gap-2 text-xs text-muted">
                <Loader2 size={12} className="animate-spin" />
                Loading skills…
              </div>
            ) : error ? (
              <div className="text-xs text-status-error">{error}</div>
            ) : skills.length === 0 ? (
              <div className="text-xs text-muted">
                No skills found in this agent's `.claude/skills/` directory.
              </div>
            ) : (
              <select
                id="quick-run-skill"
                value={skill}
                onChange={(e) => setSkill(e.target.value)}
                className="w-full rounded-lg border border-strong bg-white px-3 py-2 text-sm outline-none focus:border-accent"
              >
                {skills.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label
              htmlFor="quick-run-input"
              className="mb-1 block text-xs font-medium text-secondary"
            >
              Input
            </label>
            <textarea
              id="quick-run-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={4}
              placeholder="Optional context for the skill"
              className="w-full resize-y rounded-lg border border-strong bg-white px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
            />
          </div>

          {submitError ? (
            <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-status-error">
              {submitError}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-subtle bg-surface-muted px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-strong bg-white px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-white/80"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || !skill || skills.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? <Spinner small /> : <Play size={12} />}
            Run
          </button>
        </div>
      </div>
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
