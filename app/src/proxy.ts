/**
 * proxy.ts — Next 16's renamed-from-middleware. Runs before every page render.
 *
 * Today it does one job: stamp the incoming pathname onto a request header
 * (`x-gaia-pathname`) so server components in the root layout can read it via
 * `headers()`. We need this to gate the test-instance onboarding redirect (we
 * must skip the redirect when the user is already on `/onboarding`, but the
 * root layout otherwise has no way to know the current URL).
 *
 * Path-aware DB checks happen in the layout, not here, so this stays cheap
 * and side-effect-free.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-gaia-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Skip API + static assets — they don't render pages and don't need the header.
  matcher: ["/((?!api|_next|favicon.ico|avatars|.*\\..*).*)"],
};
