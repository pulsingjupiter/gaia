/**
 * POST /api/onboarding/skip
 *
 * Marks the test instance as having opted out of the wizard. Setting key:
 * `onboarding_skipped`. The root layout reads this and stops force-redirecting
 * to /onboarding once it's been set. Only operates in test mode.
 */
import { setSetting } from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  if (process.env.GAIA_TEST_MODE !== "1") {
    return Response.json(
      { error: "onboarding endpoint is test-mode only" },
      { status: 403 },
    );
  }
  ensureSeeded();
  setSetting("onboarding_skipped", true);
  return Response.json({ ok: true });
}
