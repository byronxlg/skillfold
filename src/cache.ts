import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Content-addressed download cache, shared across projects.
 *
 *   ~/.cache/skillfold/github/<owner>/<repo>/<sha>/<path...>
 *   ~/.cache/skillfold/npm/<package>/<version>/
 *
 * GitHub entries are keyed by commit SHA and npm entries by exact version,
 * so a cache hit never needs revalidation: same key, same bytes.
 * Override the location with SKILLFOLD_CACHE or XDG_CACHE_HOME.
 */
export function cacheRoot(env: NodeJS.ProcessEnv = process.env): string {
  if (env.SKILLFOLD_CACHE) return env.SKILLFOLD_CACHE;
  if (env.XDG_CACHE_HOME) return join(env.XDG_CACHE_HOME, "skillfold");
  return join(homedir(), ".cache", "skillfold");
}

export function githubCacheDir(
  owner: string,
  repo: string,
  sha: string,
  path: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const base = join(cacheRoot(env), "github", owner, repo, sha);
  return path ? join(base, ...path.split("/")) : base;
}

export function npmCacheDir(
  pkg: string,
  version: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  // Scoped packages contain a slash; keep it as a directory separator.
  return join(cacheRoot(env), "npm", ...pkg.split("/"), version);
}
