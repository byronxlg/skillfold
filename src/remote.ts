import { ConfigError, ResolveError } from "./errors.js";

const GITHUB_TREE_RE =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)$/;

const SHA_RE = /^[0-9a-f]+$/i;

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
  pinnedRef?: string;
}

/**
 * Validate a version pin ref. Tags can be any non-empty string.
 * If the ref looks like a commit SHA (all hex chars), it must be 7-40 chars.
 */
function validatePinnedRef(ref: string): void {
  if (ref.length === 0) {
    throw new Error("Version pin ref cannot be empty (trailing @ with no ref)");
  }
  if (SHA_RE.test(ref) && (ref.length < 7 || ref.length > 40)) {
    throw new Error(
      `Invalid commit SHA "${ref}": must be 7-40 hex characters`
    );
  }
}

export function parseGitHubUrl(url: string): GitHubUrlParts {
  const match = GITHUB_TREE_RE.exec(url);
  if (!match) {
    throw new Error("URL does not match GitHub tree URL pattern");
  }

  let path = match[4];
  let ref = match[3];
  let pinnedRef: string | undefined;

  // Check for @ref version pin at the end of the path
  const atIndex = path.lastIndexOf("@");
  if (atIndex !== -1) {
    const pin = path.slice(atIndex + 1);
    validatePinnedRef(pin);
    pinnedRef = pin;
    path = path.slice(0, atIndex);
    ref = pin;
  }

  const parts: GitHubUrlParts = {
    owner: match[1],
    repo: match[2],
    ref,
    path,
  };

  if (pinnedRef !== undefined) {
    parts.pinnedRef = pinnedRef;
  }

  return parts;
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ResolveError(
      name,
      message.includes("Version pin") || message.includes("Invalid commit SHA")
        ? message
        : "Unsupported URL format. Only GitHub tree URLs are supported"
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ConfigError(
      message.includes("Version pin") || message.includes("Invalid commit SHA")
        ? message
        : `Unsupported import URL format: ${url}. Only GitHub tree URLs are supported`
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
