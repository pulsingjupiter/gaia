/**
 * Next.js 16 instrumentation hook. Runs once per server boot.
 *
 * Boots, in order: SQLite seed → session watcher → notifier → cron scheduler.
 * Each background service is wrapped in its own try/catch so one failure
 * doesn't stop the rest. Hot-reload does not re-execute this file, so changes
 * to startup logic require a server restart.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Dynamic imports keep the edge bundle lean.
  const { ensureSeeded } = await import("./src/server/seed.ts");
  ensureSeeded();

  const { startWatcher } = await import("./src/server/session-watcher.ts");
  try {
    await startWatcher();
  } catch (err) {
    console.error("[instrumentation] startWatcher failed", err);
  }

  try {
    const { startNotifier } = await import("./src/server/notifier.ts");
    startNotifier();
  } catch (err) {
    console.error("[instrumentation] startNotifier failed", err);
  }

  try {
    const { startCronScheduler } = await import("./src/server/cron.ts");
    startCronScheduler();
  } catch (err) {
    console.error("[instrumentation] startCronScheduler failed", err);
  }
}
