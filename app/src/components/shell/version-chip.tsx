"use client";
/**
 * VersionChip — sidebar-footer chip that surfaces local vs. upstream-main
 * commit drift. Three states:
 *
 *   1. up-to-date: muted "v <shortSha>" text — minimal weight.
 *   2. behind:     small pill "Update available" + click → confirm popover
 *      → POST /api/system/update (opens Terminal and runs git pull + npm i).
 *   3. loading / unknown / error: renders null so the chip silently hides
 *      (e.g. user downloaded a tarball, is offline, or has no git remote).
 *
 * Hidden entirely in test mode. The confirm popover mirrors the modal pattern
 * used elsewhere in the dashboard (see add-project-modal.tsx).
 */
import { useEffect, useState } from "react";
import { ArrowUp, X } from "lucide-react";
import { useVersionCheck } from "@/lib/hooks/use-version-check";

type LaunchState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "ok" }
  | { status: "error"; message: string };

export function VersionChip(): React.ReactNode {
  const { data, loading } = useVersionCheck();
  const [testMode, setTestMode] = useState<boolean | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [launch, setLaunch] = useState<LaunchState>({ status: "idle" });

  // Detect test instance (GAIA_TEST_MODE=1) so we can hide the update chip on
  // the test dashboard — it shares the same checkout as the real one, so
  // there's nothing meaningful to pull.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/system/mode", { cache: "no-store" });
        if (!res.ok) return;
        const payload = (await res.json()) as { test_mode?: boolean };
        if (!cancelled) setTestMode(Boolean(payload.test_mode));
      } catch {
        if (!cancelled) setTestMode(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Wait for the test-mode probe so we never flash the chip on the test
  // dashboard. (One-shot fetch — should resolve well before the first poll.)
  if (testMode === null) return null;
  if (testMode) return null;

  // Hide while loading the very first response, and any time the route
  // returned an error (no .git, no internet, etc.) — the chip should
  // degrade silently per spec.
  if (loading || !data) return null;
  if (data.error) return null;
  if (!data.current) return null;

  const behind = data.behind;
  const hasUpdate = typeof behind === "number" && behind > 0;

  async function runUpdate(): Promise<void> {
    setLaunch({ status: "pending" });
    try {
      const res = await fetch("/api/system/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || payload.ok === false) {
        setLaunch({
          status: "error",
          message: payload.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      setLaunch({ status: "ok" });
      // Brief success blip, then close.
      window.setTimeout(() => {
        setConfirmOpen(false);
        setLaunch({ status: "idle" });
      }, 800);
    } catch (err) {
      setLaunch({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function closeConfirm(): void {
    if (launch.status === "pending") return;
    setConfirmOpen(false);
    setLaunch({ status: "idle" });
  }

  return (
    <>
      {hasUpdate ? (
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          title={`${behind} ${behind === 1 ? "commit" : "commits"} behind main`}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent hover:opacity-90"
        >
          <ArrowUp aria-hidden="true" className="size-3" />
          Update available
        </button>
      ) : (
        <div
          className="mt-2 text-center text-[10px] text-muted"
          title={`Up to date with ${data.repo}@main`}
        >
          v {data.current}
        </div>
      )}

      {confirmOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Update Gaia"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={closeConfirm}
        >
          <div
            className="card-surface w-full max-w-md p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-primary">
                  Update Gaia
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  {behind} {behind === 1 ? "commit" : "commits"} behind{" "}
                  {data.repo}@main.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={closeConfirm}
                disabled={launch.status === "pending"}
                className="rounded-md p-1 text-muted hover:bg-surface-muted disabled:opacity-60"
              >
                <X size={16} />
              </button>
            </div>

            <p className="mt-4 text-sm text-secondary">
              Pulls the latest commits from main and runs{" "}
              <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[11px]">
                npm install
              </code>
              . This opens Terminal so you can see progress.
            </p>

            {launch.status === "error" ? (
              <div className="mt-3 rounded-lg border border-status-error/40 bg-red-50 px-3 py-2 text-xs text-status-error">
                {launch.message}
              </div>
            ) : null}
            {launch.status === "ok" ? (
              <div className="mt-3 rounded-lg border border-subtle bg-surface-muted px-3 py-2 text-xs text-secondary">
                Terminal opened — follow along there.
              </div>
            ) : null}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeConfirm}
                disabled={launch.status === "pending"}
                className="rounded-lg border border-strong bg-white px-3 py-2 text-xs font-medium text-secondary hover:bg-surface-muted disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void runUpdate()}
                disabled={
                  launch.status === "pending" || launch.status === "ok"
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {launch.status === "pending"
                  ? "Opening Terminal…"
                  : "Open Terminal & Update"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
