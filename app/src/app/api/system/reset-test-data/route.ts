/**
 * POST /api/system/reset-test-data
 *
 * Test-instance only. Wipes the SQLite store + the test agents dir (preserving
 * `_shared/` and `_system/`), closes the in-process DB connection, and returns
 * a hint for the client to navigate back through /onboarding. Mirrors what the
 * `GAIA_FRESH=1` env wipe does at boot but at runtime — so the user can re-run
 * the wizard without restarting the dev server.
 *
 * Refuses on prod (when GAIA_TEST_MODE != '1' OR GAIA_DATA_DIR unset).
 */
import path from "node:path";
import fs from "node:fs";

import { PATHS, _resetDb, setSetting } from "@/server/db.ts";
import { _resetSeed, ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  if (process.env.GAIA_TEST_MODE !== "1" || !process.env.GAIA_DATA_DIR) {
    return Response.json(
      { error: "reset endpoint refuses to run outside test mode" },
      { status: 403 },
    );
  }

  try {
    _resetDb();
    _resetSeed();
    for (const f of ["gaia.db", "gaia.db-shm", "gaia.db-wal"]) {
      const p = path.join(PATHS.dataDir, f);
      if (fs.existsSync(p)) fs.rmSync(p, { force: true });
    }
    if (fs.existsSync(PATHS.agentsDir)) {
      for (const entry of fs.readdirSync(PATHS.agentsDir)) {
        if (entry === "_shared" || entry === "_system") continue;
        fs.rmSync(path.join(PATHS.agentsDir, entry), {
          recursive: true,
          force: true,
        });
      }
    }
    // Re-init schema + system pseudo-agent so the next request works without
    // a 500. The 'onboarding_skipped' setting is intentionally left unset so
    // the user lands back on the wizard.
    ensureSeeded();
    // Defensive: nuke any lingering skip flag (would be wiped by the DB delete
    // above, but harmless to overwrite).
    setSetting("onboarding_skipped", false);
    return Response.json({ ok: true, redirect: "/onboarding" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
