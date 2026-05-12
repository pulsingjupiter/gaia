/**
 * Boot-time seed.
 *
 * Idempotent: opens the SQLite DB (which auto-creates schema on first call).
 * Demo employees from DEFAULT_EMPLOYEES are only seeded when the operator
 * explicitly opts in via `GAIA_SEED_DEMO=1`. Fresh clones start with an
 * empty employees table so a stranger who clones the repo sees a clean
 * onboarding flow, not somebody else's roster.
 *
 * Called at process start via `instrumentation.ts` and defensively by every
 * API route via `ensureSeeded()`. The first request on any route is therefore
 * guaranteed to see schema + (optionally) seeded employees.
 */
import { ensureSystemEmployee, getDb, seedEmployeesIfEmpty } from "./db.ts";

// Pinned to globalThis so Turbopack's per-route module instances share the
// "already seeded" flag — otherwise we'd run the seeder more than once and
// occasionally double-write the system pseudo-agent.
const SEED_KEY = "__gaia_seeded__";
type GlobalWithSeed = typeof globalThis & { [SEED_KEY]?: boolean };

/**
 * Test-mode runtime reset hook. Pairs with `_resetDb()` so the next call to
 * `ensureSeeded()` runs the schema + system pseudo-agent setup against the
 * fresh DB instead of short-circuiting on the cached seeded flag.
 */
export function _resetSeed(): void {
  (globalThis as GlobalWithSeed)[SEED_KEY] = false;
}

/**
 * Ensure the DB schema exists and the default employees are seeded.
 * Cheap to call repeatedly — guarded by an in-process flag.
 */
export function ensureSeeded(): void {
  const g = globalThis as GlobalWithSeed;
  if (g[SEED_KEY]) return;
  // getDb() initialises the schema as a side-effect.
  getDb();
  // Default: do NOT seed demo employees. A fresh clone should land on an
  // empty roster with the "Add your first agent" prompt — not on somebody
  // else's personal team.
  //
  // Opt-in: set GAIA_SEED_DEMO=1 to populate DEFAULT_EMPLOYEES (the canonical
  // 5-agent demo: king-henry, atlas, nova, rack, gaia). Useful for the
  // maintainer's local dev instance and for the demo / screenshot flows.
  //
  // Legacy: GAIA_SKIP_SEED=1 is still honored as a no-op (the new default is
  // already "skip"), kept so existing scripts that set it don't surprise.
  // The schema + system pseudo-agent are always created so API routes don't
  // crash on FK joins regardless of seed mode.
  const seedDemo = process.env.GAIA_SEED_DEMO === "1";
  if (seedDemo) {
    seedEmployeesIfEmpty();
  }
  ensureSystemEmployee();
  g[SEED_KEY] = true;
}
