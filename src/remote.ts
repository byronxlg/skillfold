import { ConfigError, ResolveError } from "./errors.js";

const GITHUB_TREE_RE =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)$/;

export function getGitHubHeaders(): HeadersInit {
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    return { Authorization: `token ${token}` };
  }
  return {};
}

export interface GitHubUrlParts {
  owner: string;
  repo: string;
  ref: string;
  path: string;
}

export function parseGitHubUrl(url: string): GitHubUrlParts {
  const match = GITHUB_TREE_RE.exec(url);
  if (!match) {
    throw new Error("URL does not match GitHub tree URL pattern");
  }
  return {
    owner: match[1],
    repo: match[2],
    ref: match[3],
    path: match[4],
  };
}

export async function fetchRemoteSkill(
  name: string,
  url: string
): Promise<string> {
  if (!url.startsWith("https://github.com/")) {
    throw new ResolveError(
      name,
      "Unsupported URL format. Only GitHub tree URLs are supported"
    );
  }

  let parts: GitHubUrlParts;
  try {
    parts = parseGitHubUrl(url);
  } catch {
    throw new ResolveError(
      name,
      "Unsupported URL format. Only GitHub tree URLs are supported"
    );
  }

  const rawUrl = `https://raw.githubusercontent.com/${parts.owner}/${parts.repo}/${parts.ref}/${parts.path}/SKILL.md`;

  let response: Response;
  try {
    response = await fetch(rawUrl, { headers: getGitHubHeaders() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ResolveError(name, `Network error fetching ${rawUrl}: ${message}`);
  }

  if (!response.ok) {
    throw new ResolveError(
      name,
      `Failed to fetch ${rawUrl}: HTTP ${response.status}`
    );
  }

  return response.text();
}

export async function fetchRemoteConfig(url: string): Promise<string> {
  if (!url.startsWith("https://github.com/")) {
    throw new ConfigError(
      `Unsupported import URL format: ${url}. Only GitHub tree URLs are supported`
    );
  }

  let parts: GitHubUrlParts;
  try {
    parts = parseGitHubUrl(url);
  } catch {
    throw new ConfigError(
      `Unsupported import URL format: ${url}. Only GitHub tree URLs are supported`
    );
  }

  const rawUrl = `https://raw.githubusercontent.com/${parts.owner}/${parts.repo}/${parts.ref}/${parts.path}/skillfold.yaml`;

  let response: Response;
  try {
    response = await fetch(rawUrl, { headers: getGitHubHeaders() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ConfigError(`Network error fetching import from ${rawUrl}: ${message}`);
  }

  if (!response.ok) {
    throw new ConfigError(
      `Failed to fetch import from ${rawUrl}: HTTP ${response.status}`
    );
  }

  return response.text();
}
