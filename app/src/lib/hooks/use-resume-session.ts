"use client";
/**
 * useResumeSession — small client hook that posts to
 * `POST /api/sessions/:id/resume` using the user's saved terminal preference
 * from `/api/settings` (`appearance.terminal`).
 *
 * Caches the preference for the lifetime of the page; refetches on window
 * focus so flipping the radio in another tab takes effect quickly.
 *
 * Exposes:
 *   - `resume(sessionId)` → uses the saved pref. For "copy", writes the
 *     returned command to the clipboard.
 *   - `copy(sessionId)`   → forces "copy" mode regardless of pref.
 *   - `mode`              → the current cached pref (for label hints).
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type TerminalPref = "terminal" | "iterm2" | "copy";

/** Map our settings ID → resume route's expected token. */
function toRouteTerminal(pref: TerminalPref): "Terminal" | "iTerm2" | "copy" {
  if (pref === "iterm2") return "iTerm2";
  if (pref === "copy") return "copy";
  return "Terminal";
}

export type ResumeResult = {
  ok: boolean;
  mode: TerminalPref;
  command?: string;
  error?: string;
};

type CachedPref = { value: TerminalPref; fetchedAt: number };

let _cache: CachedPref | null = null;
const _CACHE_TTL_MS = 30_000;

async function loadPref(force = false): Promise<TerminalPref> {
  if (!force && _cache && Date.now() - _cache.fetchedAt < _CACHE_TTL_MS) {
    return _cache.value;
  }
  try {
    const res = await fetch("/api/settings", { cache: "no-store" });
    if (!res.ok) throw new Error(`GET /api/settings ${res.status}`);
    const data = (await res.json()) as {
      settings?: { appearance?: { terminal?: TerminalPref } };
    };
    const value: TerminalPref =
      data.settings?.appearance?.terminal ?? "terminal";
    _cache = { value, fetchedAt: Date.now() };
    return value;
  } catch {
    const fallback: TerminalPref = _cache?.value ?? "terminal";
    return fallback;
  }
}

export function useResumeSession(): {
  mode: TerminalPref;
  resume: (
    sessionId: string,
    override?: TerminalPref,
  ) => Promise<ResumeResult>;
  copy: (sessionId: string) => Promise<ResumeResult>;
  refresh: () => Promise<void>;
} {
  const [mode, setMode] = useState<TerminalPref>(_cache?.value ?? "terminal");
  // Track latest mode in a ref so callbacks always see the freshest value
  // without re-creating themselves.
  const modeRef = useRef<TerminalPref>(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const refresh = useCallback(async () => {
    const v = await loadPref(true);
    modeRef.current = v;
    setMode(v);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadPref(false).then((v) => {
      if (cancelled) return;
      modeRef.current = v;
      setMode(v);
    });
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const post = useCallback(
    async (
      sessionId: string,
      pref: TerminalPref,
    ): Promise<ResumeResult> => {
      try {
        const res = await fetch(
          `/api/sessions/${encodeURIComponent(sessionId)}/resume`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ terminal: toRouteTerminal(pref) }),
          },
        );
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          command?: string;
          error?: string;
        };
        if (!res.ok) {
          return {
            ok: false,
            mode: pref,
            command: data.command,
            error: data.error ?? `HTTP ${res.status}`,
          };
        }
        if (
          pref === "copy" &&
          data.command &&
          typeof navigator !== "undefined" &&
          navigator.clipboard?.writeText
        ) {
          await navigator.clipboard.writeText(data.command).catch(() => {});
        }
        return { ok: true, mode: pref, command: data.command };
      } catch (err) {
        return {
          ok: false,
          mode: pref,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    [],
  );

  const resume = useCallback(
    (sessionId: string, override?: TerminalPref) =>
      post(sessionId, override ?? modeRef.current),
    [post],
  );
  const copy = useCallback(
    (sessionId: string) => post(sessionId, "copy"),
    [post],
  );

  return { mode, resume, copy, refresh };
}

/** Human label for the in-progress action, e.g. "Opening iTerm2…". */
export function resumeLabel(mode: TerminalPref): string {
  if (mode === "iterm2") return "Opening iTerm2…";
  if (mode === "copy") return "Copying command…";
  return "Opening Terminal…";
}

/** Success label after the action completes. */
export function resumeSuccessLabel(mode: TerminalPref): string {
  if (mode === "iterm2") return "Opened in iTerm2";
  if (mode === "copy") return "Resume command copied";
  return "Opened in Terminal";
}
