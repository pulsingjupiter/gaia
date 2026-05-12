/**
 * GET /api/system/version
 *   → {
 *       current:     string,            // local HEAD short SHA
 *       currentFull: string,            // local HEAD full SHA
 *       latest:      string | null,     // remote main short SHA
 *       latestFull:  string | null,     // remote main full SHA
 *       behind:      number | null,     // commits local is behind upstream main
 *       upToDate:    boolean,           // behind === 0
 *       checkedAt:   string,            // ISO timestamp
 *       repo:        string,            // "owner/repo"
 *       error?:      string,            // present only on remote-lookup failure
 *     }
 *
 * Cheap-to-poll version probe used by the sidebar update chip. Local SHA comes
 * from `git rev-parse HEAD` at the project root; remote SHA + behind count
 * come from the GitHub REST API (unauthenticated — 60 req/hr per IP is plenty
 * for the 30-min client poll).
 *
 * Cached in-process for 10 minutes keyed by `owner/repo`. Pass `?refresh=1` to
 * force a fresh remote lookup (the local SHA is always re-read — it's free).
 *
 * Errors are never thrown — if the .git dir is missing, git isn't installed,
 * or GitHub is unreachable, we return a degraded payload with `error` set and
 * sensible defaults so the client can hide the chip silently.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { PATHS } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const FALLBACK_REPO = "pulsingjupiter/gaia";

type RemoteInfo = {
  latest: string | null;
  latestFull: string | null;
  behind: number | null;
  error?: string;
};

type VersionPayload = {
  current: string;
  currentFull: string;
  latest: string | null;
  latestFull: string | null;
  behind: number | null;
  upToDate: boolean;
  checkedAt: string;
  repo: string;
  error?: string;
};

const remoteCache = new Map<string, { at: number; data: RemoteInfo }>();

function shortSha(full: string): string {
  return full.slice(0, 7);
}

function readLocalHead(): { full: string; error?: string } {
  // Bail early when there's no .git — downloading a tarball or running inside
  // a non-git checkout shouldn't trigger spawning git binaries.
  const gitDir = path.join(PATHS.projectRoot, ".git");
  if (!existsSync(gitDir)) {
    return { full: "", error: "not a git repo" };
  }
  try {
    const out = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: PATHS.projectRoot,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
    if (!out) return { full: "", error: "git rev-parse returned empty" };
    return { full: out };
  } catch (err) {
    return {
      full: "",
      error: err instanceof Error ? err.message : "git rev-parse failed",
    };
  }
}

/**
 * Parse `owner/repo` out of any of:
 *   https://github.com/owner/repo.git
 *   git@github.com:owner/repo.git
 *   https://github.com/owner/repo
 * Returns null if the URL doesn't look like a GitHub remote.
 */
function parseGithubSlug(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  // SSH form: git@github.com:owner/repo(.git)?
  const ssh = trimmed.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (ssh) return `${ssh[1]}/${ssh[2]}`;
  // HTTPS / git URL: ...github.com/owner/repo(.git)?
  const https = trimmed.match(
    /github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?(?:[/?#]|$)/,
  );
  if (https) return `${https[1]}/${https[2]}`;
  return null;
}

function detectRepo(): string {
  // 1) Prefer package.json `repository.url` at the project root.
  try {
    const pkgPath = path.join(PATHS.projectRoot, "package.json");
    if (existsSync(pkgPath)) {
      const raw = readFileSync(pkgPath, "utf8");
      const pkg = JSON.parse(raw) as {
        repository?: string | { url?: string };
      };
      const repoField = pkg.repository;
      const url =
        typeof repoField === "string" ? repoField : repoField?.url ?? null;
      if (url) {
        const slug = parseGithubSlug(url);
        if (slug) return slug;
      }
    }
  } catch {
    // ignore — fall through
  }

  // 2) Fall back to `git config --get remote.origin.url`.
  try {
    const out = execFileSync(
      "git",
      ["config", "--get", "remote.origin.url"],
      {
        cwd: PATHS.projectRoot,
        stdio: ["ignore", "pipe", "ignore"],
        encoding: "utf8",
      },
    ).trim();
    const slug = parseGithubSlug(out);
    if (slug) return slug;
  } catch {
    // ignore — fall through
  }

  return FALLBACK_REPO;
}

async function fetchRemote(repo: string): Promise<RemoteInfo> {
  const headers: Record<string, string> = {
    "user-agent": "gaia-version-check",
    accept: "application/vnd.github+json",
  };

  // Latest main commit.
  let latestFull: string | null = null;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/commits/main`,
      { headers, cache: "no-store" },
    );
    if (!res.ok) {
      return {
        latest: null,
        latestFull: null,
        behind: null,
        error: `github commits/main ${res.status}`,
      };
    }
    const data = (await res.json()) as { sha?: string };
    if (!data.sha) {
      return {
        latest: null,
        latestFull: null,
        behind: null,
        error: "github response missing sha",
      };
    }
    latestFull = data.sha;
  } catch (err) {
    return {
      latest: null,
      latestFull: null,
      behind: null,
      error: err instanceof Error ? err.message : "github fetch failed",
    };
  }

  return {
    latest: shortSha(latestFull),
    latestFull,
  // behind is filled in by the caller using the local SHA + /compare endpoint.
    behind: null,
  };
}

async function fetchBehindCount(
  repo: string,
  localFull: string,
  latestFull: string,
): Promise<number | null> {
  if (!localFull || !latestFull) return null;
  if (localFull === latestFull) return 0;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/compare/${localFull}...${latestFull}`,
      {
        headers: {
          "user-agent": "gaia-version-check",
          accept: "application/vnd.github+json",
        },
        cache: "no-store",
      },
    );
    // 404: local SHA isn't reachable from upstream (fork, dirty checkout,
    // pushed-but-not-merged). Treat as "unknown" rather than an error.
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = (await res.json()) as { behind_by?: number };
    return typeof data.behind_by === "number" ? data.behind_by : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const force = url.searchParams.get("refresh") === "1";

  const repo = detectRepo();
  const head = readLocalHead();
  const checkedAt = new Date().toISOString();

  // No local SHA = no git repo (or git is missing). Surface error + bail —
  // the client treats this as "hide the chip".
  if (head.error || !head.full) {
    return Response.json({
      current: "",
      currentFull: "",
      latest: null,
      latestFull: null,
      behind: null,
      upToDate: false,
      checkedAt,
      repo,
      error: head.error ?? "no local HEAD",
    } satisfies VersionPayload);
  }

  // Cache the remote lookup only (local SHA is always fresh).
  const now = Date.now();
  const cacheEntry = remoteCache.get(repo);
  let remote: RemoteInfo;
  if (!force && cacheEntry && now - cacheEntry.at < CACHE_TTL_MS) {
    remote = cacheEntry.data;
  } else {
    remote = await fetchRemote(repo);
    // Only cache successful lookups so transient failures don't stick around
    // for 10 minutes.
    if (!remote.error) {
      remoteCache.set(repo, { at: now, data: remote });
    }
  }

  let behind: number | null = null;
  if (remote.latestFull && !remote.error) {
    behind = await fetchBehindCount(repo, head.full, remote.latestFull);
  }

  const payload: VersionPayload = {
    current: shortSha(head.full),
    currentFull: head.full,
    latest: remote.latest,
    latestFull: remote.latestFull,
    behind,
    upToDate: behind === 0,
    checkedAt,
    repo,
  };
  if (remote.error) payload.error = remote.error;
  return Response.json(payload);
}
