import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import "./globals.css";
import { AppShell } from "@/components/shell/app-shell";
import { EmployeesProvider } from "@/components/employees/employees-context";
import { getDb } from "@/server/db";
import { ensureSeeded } from "@/server/seed";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Gaia — AI Workforce Platform",
  description: "Operate your AI workforce from one calm cockpit.",
};

/**
 * Test-instance onboarding gate. Returns the pathname we should redirect to,
 * or `null` to render normally. Only runs on the test instance.
 *
 * The user is forced into the wizard when:
 *   - GAIA_TEST_MODE=1
 *   - the `employees` table has no real rows (system pseudo-agent excluded)
 *   - they haven't already opted out via the `onboarding_skipped` setting
 *   - they're not already on /onboarding
 */
function onboardingTarget(pathname: string): string | null {
  if (process.env.GAIA_TEST_MODE !== "1") return null;
  if (pathname.startsWith("/onboarding")) return null;
  // /api routes are excluded by proxy.ts matcher and don't go through the
  // layout, but guard defensively.
  if (pathname.startsWith("/api")) return null;
  try {
    ensureSeeded();
    const db = getDb();
    const row = db
      .prepare(`SELECT COUNT(*) AS n FROM employees WHERE id != 'system'`)
      .get() as { n: number };
    if (row.n > 0) return null;
    const skipped = db
      .prepare(`SELECT value FROM settings WHERE key = ?`)
      .get("onboarding_skipped") as { value: string } | undefined;
    if (skipped?.value === "true") return null;
    return "/onboarding";
  } catch {
    // If DB is somehow unhealthy, don't trap the user — render normally.
    return null;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const h = await headers();
  const pathname = h.get("x-gaia-pathname") ?? "/";
  const target = onboardingTarget(pathname);
  if (target) redirect(target);

  // Onboarding is a full-bleed flow; skip the app shell so the wizard owns
  // the viewport. The chrome-vs-full-bleed decision lives in <AppShell> (a
  // client component) so it stays reactive to client-side soft navigations.
  // Computing it here from the `x-gaia-pathname` header would freeze it at
  // the value from the initial page load — leaving the sidebar hidden after
  // the wizard does router.push("/") at the end of onboarding.
  //
  // IMPORTANT: <EmployeesProvider> always wraps children. Conditionally
  // rendering the provider breaks client-side navigation from /onboarding
  // back to /, because the App Router caches the root layout segment and
  // does not re-mount it when the pathname changes — the new page tries to
  // call useEmployees() against a tree that was rendered without the
  // provider on the initial /onboarding render. Always-on provider sidesteps
  // that entire class of bug; the provider itself is cheap (just a
  // useEmployees hook) and the wizard never reads from it.

  return (
    <html lang="en" className={`${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full bg-page text-primary">
        <EmployeesProvider>
          <AppShell>{children}</AppShell>
        </EmployeesProvider>
      </body>
    </html>
  );
}
