import type { NextConfig } from "next";

/**
 * `distDir` is honored as a per-instance build/cache root. We let the test
 * instance (`npm run dev:test`) override it via `GAIA_DIST_DIR=.next-test`
 * so its dev-server lockfile + Turbopack cache don't collide with the real
 * 7878 instance running off `.next/`. Without this, Next 16 refuses to
 * start a second `next dev` against the same project dir.
 */
const nextConfig: NextConfig = {
  distDir: process.env.GAIA_DIST_DIR || ".next",
};

export default nextConfig;
