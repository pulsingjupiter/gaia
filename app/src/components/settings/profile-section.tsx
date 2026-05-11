"use client";
import { useEffect, useState } from "react";
import {
  FieldRow,
  PrimaryButton,
  SectionPanel,
  TextInput,
} from "@/components/settings/settings-shell";
import type { ProfileSettings, UseSettings } from "@/lib/hooks/use-settings";

export function ProfileSection({
  settings,
  save,
  saving,
}: {
  settings: ProfileSettings;
  save: UseSettings["save"];
  saving: boolean;
}) {
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);
  const dirty =
    draft.name !== settings.name ||
    draft.email !== settings.email ||
    draft.timezone !== settings.timezone ||
    draft.greeting !== settings.greeting;

  return (
    <SectionPanel
      title="Profile"
      description="How you appear inside Gaia."
      footer={
        <>
          <span className="mr-auto text-[11px] text-muted">
            {dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <PrimaryButton
            disabled={!dirty || saving}
            onClick={() => void save({ profile: draft })}
          >
            {saving ? "Saving…" : "Save profile"}
          </PrimaryButton>
        </>
      }
    >
      <div className="divide-y divide-subtle">
        <FieldRow label="Display name" hint="Used in the header greeting.">
          <TextInput value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
        </FieldRow>
        <FieldRow label="Email">
          <TextInput
            value={draft.email}
            type="email"
            onChange={(v) => setDraft({ ...draft, email: v })}
          />
        </FieldRow>
        <FieldRow label="Timezone" hint="IANA timezone, e.g. Asia/Singapore.">
          <TextInput
            value={draft.timezone}
            onChange={(v) => setDraft({ ...draft, timezone: v })}
          />
        </FieldRow>
        <FieldRow label="Greeting label" hint="What agents call you in conversations.">
          <TextInput
            value={draft.greeting}
            onChange={(v) => setDraft({ ...draft, greeting: v })}
          />
        </FieldRow>
      </div>
    </SectionPanel>
  );
}
