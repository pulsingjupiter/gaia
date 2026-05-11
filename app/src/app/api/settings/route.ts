/**
 * GET   /api/settings → { settings: { profile, models, appearance, ...customKeys } }
 *                        Defaults are filled in for any missing top-level key.
 * PATCH /api/settings → body is partial top-level keys, e.g. { profile: { name: 'X' } }.
 *                        Each top-level key is shallow-merged with whatever is
 *                        already persisted (or with the default).
 *
 * Wave 1.
 */
import { getAllSettings, setSetting } from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type ProfileSettings = {
  name: string;
  email: string;
  timezone: string;
  greeting: string;
};

export type ModelsSettings = {
  default_model: string;
  per_agent: Record<string, string>;
};

export type AppearanceSettings = {
  theme: "light" | "dark" | "system";
};

export const DEFAULT_SETTINGS = {
  profile: {
    name: "Adrian",
    email: "adrianlee2026@gmail.com",
    timezone: "Asia/Singapore",
    greeting: "Adrian",
  } satisfies ProfileSettings,
  models: {
    default_model: "claude-sonnet-4-6",
    per_agent: {},
  } satisfies ModelsSettings,
  appearance: {
    theme: "light",
  } satisfies AppearanceSettings,
} as const;

const TOP_LEVEL_KEYS = ["profile", "models", "appearance", "integrations"] as const;
type TopLevelKey = (typeof TOP_LEVEL_KEYS)[number];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readMergedSettings(): Record<string, unknown> {
  const stored = getAllSettings();
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(stored)) {
    const def = (DEFAULT_SETTINGS as Record<string, unknown>)[key];
    const val = stored[key];
    if (isPlainObject(def) && isPlainObject(val)) {
      out[key] = { ...def, ...val };
    } else {
      out[key] = val;
    }
  }
  return out;
}

function badRequest(msg: string): Response {
  return Response.json({ error: msg }, { status: 400 });
}

export async function GET(): Promise<Response> {
  ensureSeeded();
  return Response.json({ settings: readMergedSettings() });
}

export async function PATCH(request: Request): Promise<Response> {
  ensureSeeded();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("invalid JSON body");
  }
  if (!isPlainObject(body)) return badRequest("body must be object");

  const stored = getAllSettings();

  for (const key of Object.keys(body)) {
    const incoming = (body as Record<string, unknown>)[key];

    // Allow any top-level key, but for the well-known ones do shallow merge.
    const isWellKnown = (TOP_LEVEL_KEYS as readonly string[]).includes(key);
    if (isWellKnown) {
      if (!isPlainObject(incoming)) {
        return badRequest(`'${key}' must be object`);
      }
      const def = (DEFAULT_SETTINGS as Record<string, unknown>)[key as TopLevelKey];
      const current = stored[key];
      const base = isPlainObject(current) ? current : isPlainObject(def) ? def : {};
      const merged = { ...base, ...incoming };
      setSetting(key, merged);
    } else {
      // Unknown keys: store as-is (no merge semantics defined).
      setSetting(key, incoming);
    }
  }

  return Response.json({ settings: readMergedSettings() });
}
