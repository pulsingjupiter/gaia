export interface RepoUrlInfo {
  url: string;
  owner: string;
  repo: string;
}

function stripGitSuffix(value: string): string {
  return value.endsWith(".git") ? value.slice(0, -4) : value;
}

function cleanPath(pathname: string): string[] {
  return pathname
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseRepoUrl(
  input: string | null | undefined,
): RepoUrlInfo | null {
  const trimmed = input?.trim();
  if (!trimmed) return null;

  const ssh = trimmed.match(/^git@([^:]+):([^/]+)\/(.+)$/);
  if (ssh) {
    const host = ssh[1]?.trim();
    const owner = ssh[2]?.trim();
    const repo = stripGitSuffix(ssh[3]?.trim() ?? "");
    if (!host || !owner || !repo || repo.includes("/")) return null;
    return {
      url: `https://${host}/${owner}/${repo}`,
      owner,
      repo,
    };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    const parts = cleanPath(parsed.pathname);
    if (parts.length !== 2) return null;
    const owner = parts[0];
    const repo = stripGitSuffix(parts[1]);
    if (!owner || !repo) return null;
    return {
      url: `${parsed.protocol}//${parsed.host}/${owner}/${repo}`,
      owner,
      repo,
    };
  } catch {
    return null;
  }
}
