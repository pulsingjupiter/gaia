"use client";
/**
 * useSettings — fetch /api/settings and PATCH partial top-level keys.
 *
 * The shape mirrors what the API merges (profile / models / appearance / …).
 * `save(patch)` does a shallow PATCH — the server merges per top-level key.
 */
import { useCallback, useEffect, useState } from "react";

export type ProfileSettings = {
  name: string;
  email: string;
  timezone: string;
  greeting: string;
};

export type ModelsSettings = {
  default_model: string;
  per_agent: Record<string, string>;
  /** Optional per-agent cost cap (USD). */
  per_agent_cost?: Record<string, number>;
};

export type AppearanceSettings = {
  theme: "light" | "dark" | "system";
  /** Wave 2D — terminal preference. */
  terminal?: "terminal" | "iterm2" | "copy";
};

export type Settings = {
  profile: ProfileSettings;
  models: ModelsSettings;
  appearance: AppearanceSettings;
  [key: string]: unknown;
};

export type UseSettings = {
  settings: Settings | null;
  loading: boolean;
  error: string | null;
  saving: boolean;
  save: (patch: Partial<Settings>) => Promise<Settings | null>;
  refresh: () => Promise<void>;
};

export function useSettings(): UseSettings {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      if (!res.ok) throw new Error(`GET /api/settings ${res.status}`);
      const data = (await res.json()) as { settings: Settings };
      setSettings(data.settings);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save: UseSettings["save"] = useCallback(async (patch) => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `PATCH /api/settings ${res.status}`);
      }
      const data = (await res.json()) as { settings: Settings };
      setSettings(data.settings);
      setError(null);
      return data.settings;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setSaving(false);
    }
  }, []);

  return { settings, loading, error, saving, save, refresh };
}
