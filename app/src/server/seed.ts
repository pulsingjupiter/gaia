/**
 * Boot-time seed.
 *
 * Idempotent: opens the SQLite DB (which auto-creates schema on first call)
 * and seeds the employees table from DEFAULT_EMPLOYEES if it is empty.
 *
 * Called at process start via `instrumentation.ts` and defensively by every
 * API route via `ensureSeeded()`. The first request on any route is therefore
 * guaranteed to see schema + seeded employees.
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
  // Test-instance escape hatch: when GAIA_SKIP_SEED=1, leave the employees
  // table empty so the user gets a true first-run "Add your first agent"
  // experience. The schema + system pseudo-agent are still created so API
  // routes don't crash on FK joins.
  if (process.env.GAIA_SKIP_SEED === "1") {
    ensureSystemEmployee();
    g[SEED_KEY] = true;
    return;
  }
  seedEmployeesIfEmpty();
  ensureSystemEmployee();
  g[SEED_KEY] = true;
}
