import { Buffer } from "node:buffer";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { githubCacheDir } from "./cache.js";
import { ResolveError } from "./errors.js";
import { isFullSha, type GitHubSource } from "./source.js";
import { readSkillDir, type SkillContent } from "./skill.js";

/** Injectable fetch, so tests never touch the network. */
export type Fetcher = typeof fetch;

export interface GitHubFetchResult {
  /** Full commit SHA the skill was fetched at. */
  sha: string;
  skill: SkillContent;
  /** True if files came over the network rather than from the cache. */
  fetched: boolean;
}

export interface GitHubOptions {
  fetcher?: Fetcher;
  env?: NodeJS.ProcessEnv;
}

function apiHeaders(env: NodeJS.ProcessEnv): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "skillfold",
  };
  const token = env.GITHUB_TOKEN ?? env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function apiGet(
  url: string,
  skillName: string,
  fetcher: Fetcher,
  env: NodeJS.ProcessEnv
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, { headers: apiHeaders(env) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ResolveError(skillName, `network error fetching ${url}: ${msg}`);
  }
  if (response.status === 403 || response.status === 429) {
    throw new ResolveError(
      skillName,
      `GitHub API rate limit hit (${url}). Set GITHUB_TOKEN to raise the limit.`
    );
  }
  if (!response.ok) {
    throw new ResolveError(skillName, `GitHub API returned ${response.status} for ${url}`);
  }
  return response.json();
}

/**
 * Resolve a ref (tag, branch, short SHA, or nothing = default branch) to a
 * full commit SHA via the GitHub API.
 */
export async function resolveGitHubRef(
  source: GitHubSource,
  skillName: string,
  options: GitHubOptions = {}
): Promise<string> {
  if (source.ref && isFullSha(source.ref)) return source.ref.toLowerCase();
  const fetcher = options.fetcher ?? fetch;
  const env = options.env ?? process.env;
  const ref = source.ref ?? "HEAD";
  const url = `https://api.github.com/repos/${source.owner}/${source.repo}/commits/${encodeURIComponent(ref)}`;
  const data = (await apiGet(url, skillName, fetcher, env)) as { sha?: string };
  if (!data.sha || !isFullSha(data.sha)) {
    throw new ResolveError(skillName, `could not resolve ref "${ref}" to a commit SHA`);
  }
  return data.sha.toLowerCase();
}

interface ContentsEntry {
  type: string;
  path: string;
  download_url: string | null;
}

async function listFilesRecursive(
  source: GitHubSource,
  sha: string,
  path: string,
  skillName: string,
  fetcher: Fetcher,
  env: NodeJS.ProcessEnv
): Promise<ContentsEntry[]> {
  const url =
    `https://api.github.com/repos/${source.owner}/${source.repo}/contents/` +
    `${path.split("/").filter(Boolean).map(encodeURIComponent).join("/")}?ref=${sha}`;
  const data = await apiGet(url, skillName, fetcher, env);
  if (!Array.isArray(data)) {
    throw new ResolveError(
      skillName,
      `${path || "repo root"} is not a directory in ${source.owner}/${source.repo}@${sha.slice(0, 7)}`
    );
  }
  const files: ContentsEntry[] = [];
  for (const entry of data as ContentsEntry[]) {
    if (entry.type === "file") {
      files.push(entry);
    } else if (entry.type === "dir") {
      if (entry.path.split("/").pop() === ".git") continue;
      files.push(
        ...(await listFilesRecursive(source, sha, entry.path, skillName, fetcher, env))
      );
    }
    // Symlinks and submodules are skipped.
  }
  return files;
}

async function downloadFile(
  url: string,
  skillName: string,
  fetcher: Fetcher,
  env: NodeJS.ProcessEnv
): Promise<Buffer> {
  let response: Response;
  try {
    response = await fetcher(url, { headers: apiHeaders(env) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ResolveError(skillName, `network error downloading ${url}: ${msg}`);
  }
  if (!response.ok) {
    throw new ResolveError(skillName, `download failed (${response.status}) for ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export interface GitHubFileResult {
  /** Full commit SHA the file was fetched at. */
  sha: string;
  content: Buffer;
  fetched: boolean;
}

/**
 * Fetch a single file from GitHub at an exact commit SHA, using the shared
 * cache (rules are single markdown files, not directories).
 */
export async function fetchGitHubFile(
  source: GitHubSource,
  sha: string,
  ruleName: string,
  options: GitHubOptions = {}
): Promise<GitHubFileResult> {
  const fetcher = options.fetcher ?? fetch;
  const env = options.env ?? process.env;
  if (!source.path) {
    throw new ResolveError(ruleName, "rule sources must point at a file inside the repo");
  }
  const cacheFile = githubCacheDir(source.owner, source.repo, sha, source.path, env);
  if (existsSync(cacheFile)) {
    return { sha, content: readFileSync(cacheFile), fetched: false };
  }
  const rawUrl = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${sha}/${source.path}`;
  const content = await downloadFile(rawUrl, ruleName, fetcher, env);
  const staging = `${cacheFile}.partial-${process.pid}`;
  mkdirSync(dirname(cacheFile), { recursive: true });
  try {
    writeFileSync(staging, content);
    renameSync(staging, cacheFile);
  } finally {
    rmSync(staging, { force: true });
  }
  return { sha, content, fetched: true };
}

/**
 * Fetch a skill directory from GitHub at an exact commit SHA, using the
 * shared cache. Cache hits never touch the network.
 */
export async function fetchGitHubSkill(
  source: GitHubSource,
  sha: string,
  skillName: string,
  options: GitHubOptions = {}
): Promise<GitHubFetchResult> {
  const fetcher = options.fetcher ?? fetch;
  const env = options.env ?? process.env;
  const cacheDir = githubCacheDir(source.owner, source.repo, sha, source.path, env);

  if (existsSync(join(cacheDir, "SKILL.md"))) {
    return { sha, skill: readSkillDir(cacheDir, skillName), fetched: false };
  }

  const entries = await listFilesRecursive(
    source,
    sha,
    source.path,
    skillName,
    fetcher,
    env
  );
  const prefix = source.path ? `${source.path}/` : "";
  const skillMd = entries.find((e) => e.path === `${prefix}SKILL.md`);
  if (!skillMd) {
    throw new ResolveError(
      skillName,
      `no SKILL.md at ${source.path || "repo root"} in ${source.owner}/${source.repo}@${sha.slice(0, 7)}`
    );
  }

  // Download into a staging directory and rename into place, so an
  // interrupted fetch never leaves a partial entry that looks complete.
  const staging = `${cacheDir}.partial-${process.pid}`;
  rmSync(staging, { recursive: true, force: true });
  try {
    for (const entry of entries) {
      const rel = source.path ? entry.path.slice(prefix.length) : entry.path;
      const target = join(staging, ...rel.split("/"));
      // download_url is null for large files; the raw URL works for any size.
      const rawUrl =
        entry.download_url ??
        `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${sha}/${entry.path}`;
      const content = await downloadFile(rawUrl, skillName, fetcher, env);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    mkdirSync(dirname(cacheDir), { recursive: true });
    rmSync(cacheDir, { recursive: true, force: true });
    renameSync(staging, cacheDir);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }

  return { sha, skill: readSkillDir(cacheDir, skillName), fetched: true };
}
