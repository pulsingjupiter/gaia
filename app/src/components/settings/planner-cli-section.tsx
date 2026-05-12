"use client";
/**
 * PlannerCliSection — picks the default headless LLM CLI used by
 * "Plan with Gaia" and "Gaia AI Assess".
 *
 * Stored under the `default_llm_cli` settings key (see
 * `/api/settings/default-llm-cli`). Jules is excluded — it's async-cloud
 * and not a fit for sync planning calls.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { SectionPanel } from "@/components/settings/settings-shell";
import { cn } from "@/lib/cn";
import {
  PLANNER_CLI_VALUES,
  RUNTIME_HELP,
  RUNTIME_LABELS,
  isPlannerCli,
  type PlannerCli,
} from "@/lib/types";

type Phase = "loading" | "idle" | "saving" | "error";

export function PlannerCliSection() {
  const [value, setValue] = useState<PlannerCli>("claude");
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/settings/default-llm-cli", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`GET ${res.status}`);
        const data = (await res.json()) as { value: unknown };
        if (cancelled) return;
        if (isPlannerCli(data.value)) setValue(data.value);
        setPhase("idle");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const choose = useCallback(
    async (next: PlannerCli) => {
      if (next === value) return;
      const prev = value;
      setValue(next);
      setPhase("saving");
      setError(null);
      try {
        const res = await fetch("/api/settings/default-llm-cli", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ value: next }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(
            (data as { error?: string } | null)?.error ?? `PATCH ${res.status}`,
          );
        }
        const data = (await res.json()) as { value: unknown };
        if (isPlannerCli(data.value)) setValue(data.value);
        setPhase("idle");
      } catch (err) {
        setValue(prev);
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    },
    [value],
  );

  return (
    <SectionPanel
      title="Default planner CLI"
      description="Used by ‘Plan with Gaia’ and ‘Gaia AI Assess’ to call out to your installed LLM CLI."
      footer={
        <span className="text-[11px] text-muted">
          {phase === "loading" ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 size={11} className="animate-spin" />
              Loading…
            </span>
          ) : phase === "saving" ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 size={11} className="animate-spin" />
              Saving…
            </span>
          ) : phase === "error" ? (
            <span className="text-status-error">
              {error ?? "Could not save preference."}
            </span>
          ) : (
            "Saved automatically."
          )}
        </span>
      }
    >
      <div className="flex flex-col gap-2">
        {PLANNER_CLI_VALUES.map((cli) => {
          const on = value === cli;
          const disabled = phase === "loading";
          return (
            <label
              key={cli}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3",
                on
                  ? "border-accent bg-accent-soft"
                  : "border-subtle bg-white hover:bg-surface-muted",
                disabled ? "pointer-events-none opacity-60" : "",
              )}
            >
              <input
                type="radio"
                name="default-llm-cli"
                checked={on}
                disabled={disabled}
                onChange={() => void choose(cli)}
                className="mt-1 accent-accent"
              />
              <div>
                <div className="text-xs font-semibold text-primary">
                  {RUNTIME_LABELS[cli]}
                </div>
                <div className="text-[11px] text-muted">
                  {RUNTIME_HELP[cli]}
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </SectionPanel>
  );
}
