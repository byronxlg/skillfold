import { ConfigError, ResolveError } from "./errors.js";

const GITHUB_TREE_RE =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)$/;

const HEX_RE = /^[0-9a-f]+$/i;

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

/**
 * Extract an @ref suffix from the end of a URL path.
 * The @ref must appear after the last `/` to avoid splitting on `@` in
 * earlier path segments (e.g. org names).
 *
 * Returns [urlWithoutRef, pinnedRef | undefined].
 */
export function extractPinnedRef(url: string): [string, string | undefined] {
  const lastSlash = url.lastIndexOf("/");
  const tail = url.slice(lastSlash + 1);
  const atIndex = tail.lastIndexOf("@");
  if (atIndex === -1) return [url, undefined];

  const ref = tail.slice(atIndex + 1);
  if (ref.length === 0) {
    throw new Error("Empty version ref after @ in URL");
  }

  // If the ref looks like a SHA (all hex), validate length 7-40
  if (HEX_RE.test(ref) && (ref.length < 7 || ref.length > 40)) {
    throw new Error(
      `Invalid commit SHA "${ref}": must be 7-40 hex characters`
    );
  }

  const base = url.slice(0, lastSlash + 1) + tail.slice(0, atIndex);
  return [base, ref];
}

export function parseGitHubUrl(url: string): GitHubUrlParts {
  const [cleanUrl, pinnedRef] = extractPinnedRef(url);

  const match = GITHUB_TREE_RE.exec(cleanUrl);
  if (!match) {
    throw new Error("URL does not match GitHub tree URL pattern");
  }
  return {
    owner: match[1],
    repo: match[2],
    ref: pinnedRef ?? match[3],
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Surface specific validation errors (empty ref, bad SHA) rather than
    // replacing them with the generic "Unsupported URL" message.
    if (msg.includes("Empty version ref") || msg.includes("Invalid commit SHA")) {
      throw new ResolveError(name, msg);
    }
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Empty version ref") || msg.includes("Invalid commit SHA")) {
      throw new ConfigError(msg);
    }
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
