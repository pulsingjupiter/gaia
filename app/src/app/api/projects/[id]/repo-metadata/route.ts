export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getProject, parseRepoUrl } from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

type RouteCtx = { params: Promise<{ id: string }> };

const CACHE_TTL_MS = 10 * 60 * 1000;

type RepoMetadataAvailable = {
  available: true;
  owner: string;
  repo: string;
  default_branch: string;
  stargazers_count: number;
  open_issues_count: number;
  pushed_at: string;
  description: string | null;
  homepage: string | null;
};

type RepoMetadataUnavailable = {
  available: false;
  reason: "no_repo" | "non_github" | "fetch_failed" | "not_found";
  error?: string;
};

type RepoMetadataResponse = RepoMetadataAvailable | RepoMetadataUnavailable;

const metadataCache = new Map<
  string,
  { at: number; data: RepoMetadataResponse }
>();

function getStringField(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || !(key in value)) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : null;
}

function getNumberField(value: unknown, key: string): number | null {
  if (!value || typeof value !== "object" || !(key in value)) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "number" && Number.isFinite(field) ? field : null;
}

function getNullableStringField(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || !(key in value)) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : null;
}

async function fetchGithubMetadata(
  owner: string,
  repo: string,
): Promise<RepoMetadataResponse> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        "user-agent": "gaia-repo-metadata",
        accept: "application/vnd.github+json",
      },
      cache: "no-store",
    });
    if (res.status === 404) return { available: false, reason: "not_found" };
    if (!res.ok) {
      return {
        available: false,
        reason: "fetch_failed",
        error: `github repo ${res.status}`,
      };
    }
    const data: unknown = await res.json();
    const defaultBranch = getStringField(data, "default_branch");
    const stars = getNumberField(data, "stargazers_count");
    const openIssues = getNumberField(data, "open_issues_count");
    const pushedAt = getStringField(data, "pushed_at");
    if (
      !defaultBranch ||
      stars == null ||
      openIssues == null ||
      !pushedAt
    ) {
      return {
        available: false,
        reason: "fetch_failed",
        error: "github response missing metadata",
      };
    }
    return {
      available: true,
      owner,
      repo,
      default_branch: defaultBranch,
      stargazers_count: stars,
      open_issues_count: openIssues,
      pushed_at: pushedAt,
      description: getNullableStringField(data, "description"),
      homepage: getNullableStringField(data, "homepage"),
    };
  } catch (err) {
    return {
      available: false,
      reason: "fetch_failed",
      error: err instanceof Error ? err.message : "github fetch failed",
    };
  }
}

export async function GET(req: Request, ctx: RouteCtx): Promise<Response> {
  try {
    ensureSeeded();
    const { id } = await ctx.params;
    const project = getProject(id);
    if (!project?.repo_url) {
      return Response.json({ available: false, reason: "no_repo" });
    }
    const parsed = parseRepoUrl(project.repo_url);
    if (!parsed) {
      return Response.json({ available: false, reason: "no_repo" });
    }
    const repoUrl = new URL(parsed.url);
    if (repoUrl.hostname.toLowerCase() !== "github.com") {
      return Response.json({ available: false, reason: "non_github" });
    }

    const requestUrl = new URL(req.url);
    const refresh = requestUrl.searchParams.get("refresh") === "1";
    const key = `${parsed.owner}/${parsed.repo}`;
    const cached = metadataCache.get(key);
    if (!refresh && cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return Response.json(cached.data);
    }

    const data = await fetchGithubMetadata(parsed.owner, parsed.repo);
    metadataCache.set(key, { at: Date.now(), data });
    return Response.json(data);
  } catch (err) {
    return Response.json({
      available: false,
      reason: "fetch_failed",
      error: err instanceof Error ? err.message : "repo metadata failed",
    });
  }
}
