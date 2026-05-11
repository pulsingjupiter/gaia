/**
 * GET /api/system/mode → { test_mode: boolean }
 *
 * Read-only flag the client uses to decide whether to render test-only UI
 * (e.g. the "Reset onboarding" card in Settings → Data). Process-level env
 * var, so cheap to compute and safe to surface.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json({
    test_mode: process.env.GAIA_TEST_MODE === "1",
  });
}
