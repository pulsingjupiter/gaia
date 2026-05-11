/**
 * /projects/[id] layout — bare passthrough.
 *
 * Tab routing decision: The four sub-tabs (Sessions, Backlog, Files, Settings)
 * live entirely inside the page component as `useState`, NOT as nested
 * routes. The `/projects/[id]/sessions/[sid]` segment is owned by Wave 2C and
 * is its own page; mixing tab routes here would conflict with that.
 *
 * This layout therefore renders only `{children}` — the project header and
 * tab bar are owned by `page.tsx`, which lets a sibling sub-route (the
 * session detail page) opt out of the tab chrome cleanly.
 */
export default function ProjectDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
