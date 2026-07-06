import { SourceError } from "./errors.js";

/**
 * Source strings identify where a skill comes from. Three kinds:
 *
 *   Local path   ./skills/commit-helper
 *   GitHub       github:owner/repo/path/to/skill@ref
 *                https://github.com/owner/repo/tree/main/path/to/skill
 *   npm          npm:package/skill-name@version
 *                npm:@scope/package/skill-name@version
 *
 * A trailing `@ref` (after the last `/`) pins a version: a git tag, branch,
 * or commit SHA for GitHub; an exact version or dist-tag for npm.
 */

export interface LocalSource {
  kind: "local";
  /** Path as written in the manifest, relative to the manifest directory. */
  path: string;
}

export interface GitHubSource {
  kind: "github";
  owner: string;
  repo: string;
  /** Path to the skill directory inside the repo. Empty string = repo root. */
  path: string;
  /** Tag, branch, or commit SHA. Undefined = default branch. */
  ref?: string;
}

export interface NpmSource {
  kind: "npm";
  /** Full package name, including scope if present. */
  pkg: string;
  /**
   * Skill selector inside the package: an `agentskills` key from the
   * package.json, or a literal subpath. Undefined = package root.
   */
  subpath?: string;
  /** Exact version or dist-tag. Undefined = latest. */
  version?: string;
}

export type Source = LocalSource | GitHubSource | NpmSource;

const GITHUB_TREE_RE =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)(?:\/(.*))?$/;

const HEX_RE = /^[0-9a-f]+$/i;

/**
 * Split a trailing `@ref` off a source string. The `@` must appear after the
 * last `/` so that scoped npm packages (`@scope/pkg`) and `@` in earlier path
 * segments are never split.
 */
export function extractRef(raw: string): [string, string | undefined] {
  const lastSlash = raw.lastIndexOf("/");
  const tail = raw.slice(lastSlash + 1);
  const atIndex = tail.lastIndexOf("@");
  if (atIndex <= 0) {
    // -1: no @ present. 0: the whole tail starts with @ (a scope), not a ref.
    return [raw, undefined];
  }
  const ref = tail.slice(atIndex + 1);
  if (ref.length === 0) {
    throw new SourceError(raw, "empty version ref after @");
  }
  return [raw.slice(0, lastSlash + 1) + tail.slice(0, atIndex), ref];
}

/** True if a ref looks like a full or abbreviated commit SHA. */
export function isCommitSha(ref: string): boolean {
  return HEX_RE.test(ref) && ref.length >= 7 && ref.length <= 40;
}

export function isFullSha(ref: string): boolean {
  return HEX_RE.test(ref) && ref.length === 40;
}

function parseGitHubShorthand(raw: string): GitHubSource {
  const [base, ref] = extractRef(raw);
  const parts = base.slice("github:".length).split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new SourceError(raw, "expected github:owner/repo[/path][@ref]");
  }
  const [owner, repo, ...rest] = parts;
  return { kind: "github", owner, repo, path: rest.join("/"), ref };
}

function parseGitHubUrl(raw: string): GitHubSource {
  const [base, pinnedRef] = extractRef(raw);
  const match = GITHUB_TREE_RE.exec(base);
  if (!match) {
    throw new SourceError(
      raw,
      "GitHub URLs must be tree URLs: https://github.com/owner/repo/tree/ref/path"
    );
  }
  return {
    kind: "github",
    owner: match[1],
    repo: match[2],
    path: match[4] ?? "",
    ref: pinnedRef ?? match[3],
  };
}

function parseNpm(raw: string): NpmSource {
  // Strip the scheme before ref extraction so `npm:@scope` is never split
  // on the scope's @.
  const [body, version] = extractRef(raw.slice("npm:".length));
  if (body.length === 0) {
    throw new SourceError(raw, "expected npm:package[/skill][@version]");
  }
  let pkg: string;
  let subpath: string;
  if (body.startsWith("@")) {
    const parts = body.split("/");
    if (parts.length < 2 || parts[1].length === 0) {
      throw new SourceError(raw, "scoped packages need a name: npm:@scope/package");
    }
    pkg = parts.slice(0, 2).join("/");
    subpath = parts.slice(2).join("/");
  } else {
    const slash = body.indexOf("/");
    pkg = slash === -1 ? body : body.slice(0, slash);
    subpath = slash === -1 ? "" : body.slice(slash + 1);
  }
  if (pkg.length === 0) {
    throw new SourceError(raw, "missing package name");
  }
  return { kind: "npm", pkg, subpath: subpath || undefined, version };
}

export function parseSource(raw: string): Source {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new SourceError(String(raw), "source must be a non-empty string");
  }
  const trimmed = raw.trim();
  if (trimmed.startsWith("github:")) return parseGitHubShorthand(trimmed);
  if (trimmed.startsWith("https://github.com/")) return parseGitHubUrl(trimmed);
  if (trimmed.startsWith("npm:")) return parseNpm(trimmed);
  if (/^[a-z0-9-]+:/.test(trimmed) && !/^[a-zA-Z]:[\\/]/.test(trimmed)) {
    // Unknown scheme prefix (but not a Windows drive path).
    throw new SourceError(
      trimmed,
      `unknown source scheme "${trimmed.split(":")[0]}:" (expected github:, npm:, or a local path)`
    );
  }
  return { kind: "local", path: trimmed };
}

/** Canonical string form of a source, as written to the lockfile. */
export function formatSource(source: Source): string {
  switch (source.kind) {
    case "local":
      return source.path;
    case "github": {
      const path = source.path ? `/${source.path}` : "";
      const ref = source.ref ? `@${source.ref}` : "";
      return `github:${source.owner}/${source.repo}${path}${ref}`;
    }
    case "npm": {
      const subpath = source.subpath ? `/${source.subpath}` : "";
      const version = source.version ? `@${source.version}` : "";
      return `npm:${source.pkg}${subpath}${version}`;
    }
  }
}

/**
 * Default skill name inferred from a source: the last path segment, or the
 * package name for bare npm sources.
 */
export function defaultSkillName(source: Source): string {
  switch (source.kind) {
    case "local": {
      const segments = source.path.replace(/\/+$/, "").split("/").filter(Boolean);
      return segments[segments.length - 1] ?? source.path;
    }
    case "github": {
      const segments = source.path.split("/").filter(Boolean);
      return segments[segments.length - 1] ?? source.repo;
    }
    case "npm": {
      if (source.subpath) {
        const segments = source.subpath.split("/").filter(Boolean);
        return segments[segments.length - 1];
      }
      // Strip the scope from @scope/pkg.
      const slash = source.pkg.indexOf("/");
      return slash === -1 ? source.pkg : source.pkg.slice(slash + 1);
    }
  }
}
