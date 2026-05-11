"use client";
/**
 * AppShell — client wrapper that decides whether to render the chrome
 * (sidebar + main column) or render children full-bleed.
 *
 * Why this is a client component: the root layout is a server component and
 * its `isChrome` decision (computed from the `x-gaia-pathname` header) is only
 * recomputed on a full page load. App Router does NOT re-execute the root
 * layout on client-side soft navigations within the same layout boundary, so
 * a soft `router.push("/")` from the onboarding wizard would leave the chrome
 * frozen as "hidden" until a hard reload.
 *
 * Moving the path-dependent chrome decision to a client component that calls
 * `usePathname()` makes it reactive to every soft nav.
 */
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/shell/sidebar";
import { FirstRunCheck } from "@/components/shell/first-run-check";

export function AppShell({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const pathname = usePathname();
  const isChrome = !pathname.startsWith("/onboarding");

  if (!isChrome) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen w-full">
      <Sidebar />
      <main className="flex h-screen flex-1 flex-col overflow-hidden">
        <FirstRunCheck />
        <div className="flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
