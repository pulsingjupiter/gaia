"use client";
import { useEffect, useState } from "react";
import {
  PrimaryButton,
  SectionPanel,
} from "@/components/settings/settings-shell";
import type { AppearanceSettings, UseSettings } from "@/lib/hooks/use-settings";
import { cn } from "@/lib/cn";

const OPTIONS: { id: NonNullable<AppearanceSettings["terminal"]>; label: string; hint: string }[] = [
  { id: "terminal", label: "Terminal.app", hint: "Apple’s default macOS terminal." },
  { id: "iterm2", label: "iTerm2", hint: "Use iTerm2 if installed." },
  { id: "copy", label: "Copy command only", hint: "No terminal launch — just copy the resume command to your clipboard." },
];

export function TerminalSection({
  appearance,
  save,
  saving,
}: {
  appearance: AppearanceSettings;
  save: UseSettings["save"];
  saving: boolean;
}) {
  const [draft, setDraft] = useState<NonNullable<AppearanceSettings["terminal"]>>(
    appearance.terminal ?? "terminal",
  );
  useEffect(() => setDraft(appearance.terminal ?? "terminal"), [appearance.terminal]);
  const dirty = draft !== (appearance.terminal ?? "terminal");

  return (
    <SectionPanel
      title="Terminal preference"
      description="Where “Resume in terminal” opens session transcripts."
      footer={
        <>
          <span className="mr-auto text-[11px] text-muted">
            {dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <PrimaryButton
            disabled={!dirty || saving}
            onClick={() =>
              void save({
                appearance: { ...appearance, terminal: draft },
              })
            }
          >
            {saving ? "Saving…" : "Save preference"}
          </PrimaryButton>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {OPTIONS.map((o) => {
          const on = draft === o.id;
          return (
            <label
              key={o.id}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3",
                on
                  ? "border-accent bg-accent-soft"
                  : "border-subtle bg-white hover:bg-surface-muted",
              )}
            >
              <input
                type="radio"
                name="terminal"
                checked={on}
                onChange={() => setDraft(o.id)}
                className="mt-1 accent-accent"
              />
              <div>
                <div className="text-xs font-semibold text-primary">
                  {o.label}
                </div>
                <div className="text-[11px] text-muted">
                  {o.hint}
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </SectionPanel>
  );
}
