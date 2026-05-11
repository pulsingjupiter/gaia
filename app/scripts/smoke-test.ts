/**
 * Wave 1 smoke test.
 *
 * Seeds employees, kicks off a real run via agent-runner, waits for
 * completion, then prints the final run row + last 5 run_events.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Imports that depend on better-sqlite3 happen via dynamic import so we can
// resolve relative TS paths at runtime under Node's strip-types loader.
const { getRun, listRunEvents, listEmployees, seedEmployeesIfEmpty, getEmployee } =
  await import("../src/server/db.ts");
const { startRun } = await import("../src/server/agent-runner.ts");

async function main() {
  const seed = seedEmployeesIfEmpty();
  console.log(
    `[seed] ${seed.seeded ? "inserted" : "already present"} (${seed.count} rows)`,
  );

  const employees = listEmployees();
  console.log(`[employees] ${employees.length} rows:`);
  for (const e of employees) {
    console.log(`  - ${e.id.padEnd(20)} ${e.role.padEnd(28)} ${e.agent_dir}`);
  }

  const quill = getEmployee("quill");
  if (!quill) throw new Error("quill not seeded");

  console.log("\n[startRun] employee=quill skill=inbox-triage");
  const { runId, done } = await startRun({
    employeeId: "quill",
    skill: "inbox-triage",
    input:
      "You have one email from Mom asking when you'll visit. Triage it.",
  });
  console.log(`[startRun] runId=${runId}`);
  console.log("[startRun] waiting for completion...");

  const finalRun = await done;
  console.log("\n=== final run row ===");
  console.log(JSON.stringify(finalRun, null, 2));

  const events = listRunEvents(runId, { limit: 1000 });
  const last5 = events.slice(-5);
  console.log(`\n=== run_events: ${events.length} total, last 5 ===`);
  for (const ev of last5) {
    let payload = ev.payload;
    if (payload.length > 500) payload = payload.slice(0, 500) + "…";
    console.log(`  [${ev.id}] ${ev.type} @${ev.ts}: ${payload}`);
  }

  if (finalRun.status !== "success") {
    console.error("\n[FAIL] run did not succeed");
    process.exit(1);
  }
  console.log("\n[OK] smoke test passed");
}

main().catch((err) => {
  console.error("[smoke] fatal:", err);
  process.exit(1);
});
