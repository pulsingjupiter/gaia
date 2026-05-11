"use client";
import { useEffect, useState } from "react";
import { BellOff, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import {
  SectionPanel,
  SecondaryButton,
} from "@/components/settings/settings-shell";

export function DataSection() {
  const [armed, setArmed] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [clearArmed, setClearArmed] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  // Test-instance detection — only render the "Reset onboarding" card when
  // the server reports we're on the 9898 dev:test instance.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/system/mode", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { test_mode?: boolean };
        if (!cancelled) setTestMode(Boolean(data.test_mode));
      } catch {
        // ignore — prod stays as-is
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function resetOnboarding(): Promise<void> {
    if (resetBusy) return;
    setResetBusy(true);
    try {
      const res = await fetch("/api/system/reset-test-data", {
        method: "POST",
      });
      if (!res.ok) {
        setToast(`Reset failed (HTTP ${res.status})`);
        return;
      }
      // Hard-navigate so the layout's onboarding gate runs against the
      // freshly-emptied DB and bounces us to the wizard.
      window.location.href = "/onboarding";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setToast(`Reset failed: ${msg}`);
    } finally {
      setResetBusy(false);
    }
  }

  async function clearAllNotifications(): Promise<void> {
    if (clearBusy) return;
    setClearBusy(true);
    try {
      const res = await fetch("/api/notifications/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        setToast(`Failed to clear (HTTP ${res.status})`);
        return;
      }
      const data = (await res.json()) as { deleted?: number };
      const n = data?.deleted ?? 0;
      setToast(
        n === 0
          ? "No notifications to clear"
          : `Cleared ${n} notification${n === 1 ? "" : "s"}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setToast(`Failed: ${msg}`);
    } finally {
      setClearArmed(false);
      setClearBusy(false);
      window.setTimeout(() => setToast(null), 3000);
    }
  }

  async function createTestApproval(): Promise<void> {
    if (testBusy) return;
    setTestBusy(true);
    try {
      const res = await fetch("/api/approvals/test", { method: "POST" });
      if (!res.ok) {
        setToast(`Failed to create approval (HTTP ${res.status})`);
        return;
      }
      setToast("Approval created — check Inbox");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setToast(`Failed: ${msg}`);
    } finally {
      setTestBusy(false);
      window.setTimeout(() => setToast(null), 3000);
    }
  }

  return (
    <SectionPanel
      title="Data"
      description="Manage Gaia’s local SQLite store."
    >
      <div className="space-y-4 text-xs">
        <div>
          <div className="font-semibold text-primary">
            Database path
          </div>
          <div className="mt-1 rounded-lg border border-subtle bg-surface-muted px-3 py-2 font-mono text-[11px] text-secondary">
            app/data/gaia.db
          </div>
        </div>

        {testMode ? (
          <div className="rounded-lg border border-accent/30 bg-accent-soft p-3">
            <div className="font-semibold text-primary">
              Reset onboarding
            </div>
            <p className="mt-1 text-[11px] text-secondary">
              Wipes the test DB + agents-test/ scaffolds and sends you back
              through the welcome wizard. Test instance only.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!resetArmed ? (
                <button
                  type="button"
                  onClick={() => setResetArmed(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-strong bg-white px-3 py-1.5 text-xs font-semibold text-accent hover:bg-white/80"
                >
                  <RotateCcw size={12} />
                  Reset onboarding
                </button>
              ) : (
                <div className="inline-flex items-center gap-1.5 rounded-lg border border-status-error/40 bg-white px-2 py-1">
                  <span className="text-[11px] font-medium text-status-error">
                    Wipe test data and re-run wizard?
                  </span>
                  <button
                    type="button"
                    onClick={resetOnboarding}
                    disabled={resetBusy}
                    className="rounded-md bg-status-error px-2 py-0.5 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
                  >
                    {resetBusy ? "Resetting…" : "Yes, reset"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetArmed(false)}
                    disabled={resetBusy}
                    className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-secondary hover:bg-surface-muted"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : null}

        <div className="rounded-lg border border-subtle bg-white p-3">
          <div className="font-semibold text-primary">
            Approval queue
          </div>
          <p className="mt-1 text-[11px] text-muted">
            Inject a synthetic approval to see the autonomy loop end-to-end.
            It lands in your inbox so you can Approve or Skip.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={createTestApproval}
              disabled={testBusy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-strong bg-white px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent-soft disabled:opacity-50"
            >
              <Sparkles size={12} />
              {testBusy ? "Creating…" : "+ Test approval"}
            </button>
            {!clearArmed ? (
              <button
                type="button"
                onClick={() => setClearArmed(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-strong bg-white px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-surface-muted"
              >
                <BellOff size={12} />
                Clear all notifications
              </button>
            ) : (
              <div className="inline-flex items-center gap-1.5 rounded-lg border border-status-error/40 bg-status-error/5 px-2 py-1">
                <span className="text-[11px] font-medium text-status-error">
                  Clear every notification?
                </span>
                <button
                  type="button"
                  onClick={clearAllNotifications}
                  disabled={clearBusy}
                  className="rounded-md bg-status-error px-2 py-0.5 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {clearBusy ? "Clearing…" : "Yes, clear"}
                </button>
                <button
                  type="button"
                  onClick={() => setClearArmed(false)}
                  disabled={clearBusy}
                  className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-secondary hover:bg-white"
                >
                  Cancel
                </button>
              </div>
            )}
            {toast ? (
              <span className="text-[11px] text-secondary">
                {toast}
              </span>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-3">
          <div className="font-semibold text-status-error">
            Reset all data
          </div>
          <p className="mt-1 text-[11px] text-status-error/80">
            Wipes runs, sessions, files index, and settings. Cannot be undone.
          </p>
          {!armed ? (
            <button
              onClick={() => setArmed(true)}
              disabled
              className="mt-3 inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-subtle bg-white px-3 py-1.5 text-xs font-semibold text-status-error opacity-60"
            >
              <Trash2 size={12} />
              Reset all data (TODO)
            </button>
          ) : (
            <div className="mt-3 space-y-2">
              <div className="text-[11px] text-secondary">
                Type <span className="font-mono">RESET</span> to confirm:
              </div>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="w-full rounded-lg border border-strong bg-white px-3 py-1.5 text-xs"
              />
              <div className="flex items-center gap-2">
                <SecondaryButton
                  tone="danger"
                  disabled={confirmText !== "RESET"}
                  onClick={() => {
                    /* endpoint not implemented in V1 */
                    setArmed(false);
                    setConfirmText("");
                  }}
                >
                  Confirm reset
                </SecondaryButton>
                <SecondaryButton
                  onClick={() => {
                    setArmed(false);
                    setConfirmText("");
                  }}
                >
                  Cancel
                </SecondaryButton>
              </div>
              <div className="text-[11px] text-muted">
                Endpoint not implemented in V1.
              </div>
            </div>
          )}
        </div>
      </div>
    </SectionPanel>
  );
}
