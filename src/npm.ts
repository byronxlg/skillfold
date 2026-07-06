import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { npmCacheDir } from "./cache.js";
import { ResolveError } from "./errors.js";
import type { NpmSource } from "./source.js";
import { readSkillDir, type SkillContent } from "./skill.js";

/**
 * npm skill resolution.
 *
 * `npm:pkg/name@version` finds the skill `name` inside the package `pkg`:
 *
 *   1. If the package.json has an `agentskills` map and `name` is a key,
 *      the mapped path is the skill directory.
 *   2. Otherwise `name` is treated as a literal subpath inside the package.
 *   3. With no `/name` at all, the package root must contain SKILL.md.
 *
 * The package itself comes from the project's node_modules when the
 * installed version satisfies the request; otherwise the exact version is
 * downloaded from the registry into the shared cache with `npm pack`.
 */

export interface NpmResolveResult {
  /** Exact version the skill resolved to. */
  version: string;
  skill: SkillContent;
  fetched: boolean;
}

export interface NpmOptions {
  fetcher?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  /** Injectable for tests: download+extract a tarball into destDir. */
  packDownloader?: (spec: string, destDir: string) => void;
  registryUrl?: string;
}

interface PackageJson {
  version?: string;
  agentskills?: Record<string, string>;
}

function readPackageJson(pkgDir: string): PackageJson | null {
  const path = join(pkgDir, "package.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as PackageJson;
  } catch {
    return null;
  }
}

/** Locate an installed package via Node's resolution, or null if not installed. */
export function findInstalledPackage(pkg: string, baseDir: string): string | null {
  try {
    const require = createRequire(join(baseDir, "package.json"));
    return dirname(require.resolve(`${pkg}/package.json`));
  } catch {
    const direct = join(baseDir, "node_modules", ...pkg.split("/"));
    return existsSync(join(direct, "package.json")) ? direct : null;
  }
}

function skillDirInPackage(
  pkgDir: string,
  pkgJson: PackageJson | null,
  source: NpmSource,
  skillName: string
): string {
  if (!source.subpath) return pkgDir;
  const mapped = pkgJson?.agentskills?.[source.subpath];
  if (mapped) return join(pkgDir, ...mapped.split("/").filter((s) => s !== "." && s !== ""));
  const literal = join(pkgDir, ...source.subpath.split("/"));
  if (existsSync(literal)) return literal;
  const available = Object.keys(pkgJson?.agentskills ?? {});
  const hint = available.length > 0 ? ` (package provides: ${available.join(", ")})` : "";
  throw new ResolveError(
    skillName,
    `"${source.subpath}" not found in package ${source.pkg}${hint}`
  );
}

/** Resolve a version or dist-tag to an exact version via the registry. */
export async function resolveNpmVersion(
  source: NpmSource,
  skillName: string,
  options: NpmOptions = {}
): Promise<string> {
  const fetcher = options.fetcher ?? fetch;
  const registry = options.registryUrl ?? "https://registry.npmjs.org";
  const url = `${registry}/${source.pkg.replace("/", "%2f")}`;
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Accept: "application/vnd.npm.install-v1+json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ResolveError(skillName, `network error reaching npm registry: ${msg}`);
  }
  if (response.status === 404) {
    throw new ResolveError(skillName, `package "${source.pkg}" not found on the npm registry`);
  }
  if (!response.ok) {
    throw new ResolveError(skillName, `npm registry returned ${response.status} for ${source.pkg}`);
  }
  const data = (await response.json()) as {
    versions?: Record<string, unknown>;
    "dist-tags"?: Record<string, string>;
  };
  const requested = source.version ?? "latest";
  const tagged = data["dist-tags"]?.[requested];
  if (tagged) return tagged;
  if (data.versions?.[requested]) return requested;
  throw new ResolveError(
    skillName,
    `version "${requested}" of ${source.pkg} not found (use an exact version or dist-tag)`
  );
}

/** Download and extract a package tarball with `npm pack`. */
function npmPackDownload(spec: string, destDir: string): void {
  const staging = mkdtempSync(join(tmpdir(), "skillfold-npm-"));
  // Extract next to the destination and rename into place, so an
  // interrupted extract never leaves a partial cache entry.
  const extractDir = `${destDir}.partial-${process.pid}`;
  try {
    const output = execFileSync(
      "npm",
      ["pack", spec, "--pack-destination", staging, "--silent"],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }
    );
    const tarball = output.trim().split("\n").pop();
    if (!tarball) {
      throw new Error(`npm pack produced no tarball for ${spec}`);
    }
    mkdirSync(extractDir, { recursive: true });
    // npm tarballs nest everything under "package/".
    execFileSync("tar", ["-xzf", join(staging, tarball), "-C", extractDir, "--strip-components", "1"], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    rmSync(destDir, { recursive: true, force: true });
    renameSync(extractDir, destDir);
  } finally {
    rmSync(staging, { recursive: true, force: true });
    rmSync(extractDir, { recursive: true, force: true });
  }
}

/**
 * Resolve an npm skill source to files on disk.
 *
 * `pinnedVersion` (from the lockfile) forces that exact version. Otherwise
 * the manifest's version/tag is resolved against node_modules first, then
 * the registry.
 */
export async function resolveNpmSkill(
  source: NpmSource,
  skillName: string,
  baseDir: string,
  pinnedVersion?: string,
  options: NpmOptions = {}
): Promise<NpmResolveResult> {
  const env = options.env ?? process.env;

  // 1. The locally installed package, when it satisfies the request.
  const installedDir = findInstalledPackage(source.pkg, baseDir);
  if (installedDir) {
    const pkgJson = readPackageJson(installedDir);
    const installedVersion = pkgJson?.version;
    const wanted = pinnedVersion ?? source.version;
    if (installedVersion && (!wanted || wanted === installedVersion)) {
      const dir = skillDirInPackage(installedDir, pkgJson, source, skillName);
      return { version: installedVersion, skill: readSkillDir(dir, skillName), fetched: false };
    }
  }

  // 2. The shared cache / registry, at an exact version.
  const version =
    pinnedVersion ??
    (source.version && /^\d/.test(source.version)
      ? source.version
      : await resolveNpmVersion(source, skillName, options));

  const cacheDir = npmCacheDir(source.pkg, version, env);
  let fetched = false;
  if (!existsSync(join(cacheDir, "package.json"))) {
    const download = options.packDownloader ?? npmPackDownload;
    try {
      download(`${source.pkg}@${version}`, cacheDir);
    } catch (err) {
      rmSync(cacheDir, { recursive: true, force: true });
      const msg = err instanceof Error ? err.message : String(err);
      throw new ResolveError(skillName, `failed to download ${source.pkg}@${version}: ${msg}`);
    }
    fetched = true;
  }
  const pkgJson = readPackageJson(cacheDir);
  const dir = skillDirInPackage(cacheDir, pkgJson, source, skillName);
  return { version, skill: readSkillDir(dir, skillName), fetched };
}
