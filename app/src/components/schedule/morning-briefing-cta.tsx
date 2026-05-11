"use client";
/**
 * MorningBriefingCta — one-click setup for the autonomous morning-briefing
 * demo. Renders above the Scheduled Tasks table on /schedule.
 *
 * Visibility rule:
 *   - 0 of 5 morning-briefing-* tasks exist  → full-strength CTA
 *   - 1-4 exist (partial)                    → CTA with "complete" copy
 *   - 5 exist                                → component returns null
 *
 * Click → POST /api/morning-briefing (idempotent on the server). On success
 * we call `onCreated()` so the parent can refresh its cron list; the new
 * disabled tasks then surface in the table on the very next render.
 */
import { useState } from "react";
import Link from "next/link";
import { Sunrise } from "lucide-react";

const BRIEFING_IDS = [
  "morning-briefing-atlas",
  "morning-briefing-king-henry",
  "morning-briefing-rack",
  "morning-briefing-nova",
  "morning-briefing-professor-adrian",
] as const;

export type MorningBriefingCtaProps = {
  /** Live tasks list — used to count how many briefing rows already exist. */
  taskIds: string[];
  /** Called after a successful POST so the parent can refresh its list. */
  onCreated: () => void | Promise<void>;
};

export function MorningBriefingCta({ taskIds, onCreated }: MorningBriefingCtaProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idSet = new Set(taskIds);
  const existingCount = BRIEFING_IDS.reduce(
    (n, id) => n + (idSet.has(id) ? 1 : 0),
    0,
  );

  // All five already there — nothing to show.
  if (existingCount >= BRIEFING_IDS.length) return null;

  const partial = existingCount > 0;

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/morning-briefing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        throw new Error(`POST /api/morning-briefing ${res.status}`);
      }
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-6">
      <div className="card-surface flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Sunrise size={18} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-primary">
            {partial
              ? `Complete your morning briefing — ${existingCount} of ${BRIEFING_IDS.length} tasks set up. Add the rest?`
              : "Set up your morning briefing"}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-secondary">
            Pre-fill 5 staggered cron tasks: research, inbox triage, infra
            check, content idea, architecture review. All start{" "}
            <span className="font-medium text-primary">
              DISABLED
            </span>{" "}
            — review, then enable.
          </p>
          {error ? (
            <p className="mt-2 text-xs text-accent-danger">{error}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void handleCreate();
              }}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy
                ? "Creating…"
                : partial
                  ? "Add missing tasks"
                  : "Create demo briefing tasks"}
            </button>
            <Link
              href="/docs/morning-briefing"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-secondary hover:text-primary"
            >
              Learn more →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
