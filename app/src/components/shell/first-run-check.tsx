"use client";
/**
 * FirstRunCheck — a subtle banner that surfaces unmet setup requirements.
 *
 * Renders only when /api/system-check reports `ok: false` AND the user has
 * not dismissed it. The dismiss flag lives in localStorage so it stays
 * hidden across navigations and refreshes (intentionally sticky — clearing
 * site data brings it back).
 *
 * Sits above the main content area in the root layout. Stays out of the
 * way (yellow/amber tint, 1 line of guidance per failed check) until the
 * environment is healthy, at which point it disappears entirely.
 */
import { useMemo, useState } from "react";
import { AlertCircle, RefreshCw, Terminal, X } from "lucide-react";
import { useSystemCheck } from "@/lib/hooks/use-system-check";

const REMEDIES: Record<string, string> = {
  claude_cli_available:
    "Install the Claude Code CLI: npm install -g @anthropic-ai/claude-code",
  agents_scaffolded: "Re-run ./setup.sh to recreate the agent home directories.",
  db_initialized:
    "The database is created on first request — refresh this page.",
  data_dir_writable: "Make app/data writable: chmod -R u+w app/data",
};

const TERMINAL_SUPPORTED = new Set([
  "agents_scaffolded",
  "data_dir_writable",
  "claude_cli_available",
]);

function remedyFor(name: string, fallback: string): string {
  return REMEDIES[name] ?? fallback;
}

type LaunchState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "ok" }
  | { status: "error" };

export function FirstRunCheck(): React.ReactNode {
  const { ok, checks, loading, refresh, dismissed, dismiss } = useSystemCheck();
  const [launchState, setLaunchState] = useState<Record<string, LaunchState>>(
    {},
  );

  const failed = useMemo(() => checks.filter((c) => !c.ok), [checks]);

  // Hide while loading the very first response (avoid a flash on healthy machines).
  if (loading) return null;
  if (ok) return null;
  if (dismissed) return null;
  if (failed.length === 0) return null;

  async function openTerminal(name: string): Promise<void> {
    setLaunchState((s) => ({ ...s, [name]: { status: "pending" } }));
    try {
      const res = await fetch("/api/system/open-terminal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ check: name }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || data.ok === false) {
        // eslint-disable-next-line no-console
        console.error(
          "FirstRunCheck: open-terminal failed —",
          data.error ?? `HTTP ${res.status}`,
        );
        setLaunchState((s) => ({ ...s, [name]: { status: "error" } }));
      } else {
        setLaunchState((s) => ({ ...s, [name]: { status: "ok" } }));
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("FirstRunCheck: open-terminal threw —", err);
      setLaunchState((s) => ({ ...s, [name]: { status: "error" } }));
    } finally {
      window.setTimeout(() => {
        setLaunchState((s) => ({ ...s, [name]: { status: "idle" } }));
      }, 2000);
    }
  }

  function feedbackLabel(state: LaunchState | undefined): string | null {
    if (!state || state.status === "idle") return null;
    if (state.status === "pending") return "Opening Terminal…";
    if (state.status === "ok") return "Opened";
    return "Failed";
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-amber-300/60 border-l-4 border-l-indigo-500 bg-amber-50/80 px-6 py-3 text-sm text-amber-950"
    >
      <div className="flex items-start gap-3">
        <AlertCircle
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-amber-700"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Setup incomplete</span>
            <span className="text-xs text-amber-800/70">
              {failed.length} {failed.length === 1 ? "issue" : "issues"} to
              resolve
            </span>
          </div>

          <ul className="mt-2 space-y-1.5">
            {failed.map((c) => {
              const supported = TERMINAL_SUPPORTED.has(c.name);
              const state = launchState[c.name];
              const feedback = feedbackLabel(state);
              const pending = state?.status === "pending";
              return (
                <li key={c.name} className="leading-snug">
                  <span className="font-medium">{c.message}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-amber-900/80">
                    <span>{remedyFor(c.name, c.message)}</span>
                    {supported ? (
                      <button
                        type="button"
                        onClick={() => void openTerminal(c.name)}
                        disabled={pending}
                        className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white/70 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-white disabled:opacity-60"
                      >
                        <Terminal aria-hidden="true" className="size-3" />
                        Open Terminal
                      </button>
                    ) : null}
                    {feedback ? (
                      <span
                        className={
                          state?.status === "error"
                            ? "rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-status-error"
                            : "rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent"
                        }
                      >
                        {feedback}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              void refresh();
            }}
            className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white/70 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-white"
          >
            <RefreshCw aria-hidden="true" className="size-3" />
            Re-check
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss setup banner"
            title="Dismiss"
            className="inline-flex size-7 items-center justify-center rounded-md text-amber-900/70 hover:bg-amber-100 hover:text-amber-900"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
