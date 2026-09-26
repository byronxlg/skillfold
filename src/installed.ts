import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

import { parse as parseYaml } from "yaml";

import { findInstalledPackage } from "./npm.js";
import { INSTALLED_REF, parseSource } from "./source.js";

/**
 * Which version of an npm package a project has installed, for sources
 * pinned with `@installed` (`npm:pkg/skill@installed`). Offline: it reads
 * lockfiles and node_modules, never the registry.
 *
 * Project mode looks, in order, at:
 *   1. the nearest package-lock.json / npm-shrinkwrap.json / pnpm-lock.yaml,
 *      walking up from the manifest directory to the repository root, so a
 *      fresh clone resolves before "npm ci" and workspaces find the root lock
 *   2. node_modules, via Node's own resolution (covers yarn and bun)
 *
 * Global mode (`-g`) has no project, so it looks at the global npm root
 * (`npm root -g`), and for this CLI's own package, the running CLI.
 */

export interface InstalledLookup {
  /** Global mode: look at globally installed packages instead of a project. */
  global?: boolean;
  /** Injectable global npm root; defaults to `npm root -g`. */
  globalRoot?: () => string | null;
  /** The running CLI's own package: name, version, and directory. */
  self?: { name: string; version: string; dir?: string };
}

export interface InstalledVersion {
  version: string;
  /** Where the version was read from, for messages (a lockfile path, node_modules, ...). */
  from: string;
  /** The package's directory when it is known to be on disk at `version`. */
  dir?: string;
}

const NPM_LOCKS = ["npm-shrinkwrap.json", "package-lock.json"];
const PNPM_LOCK = "pnpm-lock.yaml";

interface NpmLockEntry {
  version?: string;
  resolved?: string;
  link?: boolean;
}

interface NpmLock {
  packages?: Record<string, NpmLockEntry>;
  dependencies?: Record<string, { version?: string }>;
}

type PnpmDep = string | { version?: string };

interface PnpmImporter {
  dependencies?: Record<string, PnpmDep>;
  devDependencies?: Record<string, PnpmDep>;
  optionalDependencies?: Record<string, PnpmDep>;
}

interface PnpmLock extends PnpmImporter {
  importers?: Record<string, PnpmImporter>;
}

/** An exact registry version, not a link, path, or git spec. */
function exactVersion(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return /^\d+\.\d+\.\d+/.test(raw) ? raw : undefined;
}

/** Nearest directory at or above `start` holding a lockfile, stopping at the repo root. */
function findLockDir(start: string): string | null {
  let dir = start;
  for (;;) {
    if ([...NPM_LOCKS, PNPM_LOCK].some((name) => existsSync(join(dir, name)))) return dir;
    if (existsSync(join(dir, ".git"))) return null;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

function fromNpmLock(lock: NpmLock, pkg: string, rel: string): string | undefined {
  if (lock.packages) {
    // Walk up the importer's path the way Node resolution does, ending at
    // the hoisted root entry.
    const segments = rel ? rel.split("/") : [];
    for (let i = segments.length; i >= 0; i--) {
      const prefix = segments.slice(0, i).join("/");
      const key = `${prefix ? `${prefix}/` : ""}node_modules/${pkg}`;
      const entry = lock.packages[key];
      if (!entry) continue;
      if (entry.link && entry.resolved) {
        return exactVersion(lock.packages[entry.resolved]?.version);
      }
      return exactVersion(entry.version);
    }
    return undefined;
  }
  // lockfileVersion 1: top-level dependencies only.
  return exactVersion(lock.dependencies?.[pkg]?.version);
}

function fromPnpmLock(lock: PnpmLock, pkg: string, rel: string): string | undefined {
  const importer = lock.importers ? lock.importers[rel || "."] : rel ? undefined : lock;
  if (!importer) return undefined;
  for (const group of [importer.dependencies, importer.devDependencies, importer.optionalDependencies]) {
    const dep = group?.[pkg];
    if (dep === undefined) continue;
    const raw = typeof dep === "string" ? dep : dep.version;
    // Strip peer suffixes: "1.2.3(react@18.0.0)" (v6+) and "1.2.3_react@18.0.0" (v5).
    return exactVersion(raw?.split("(")[0].split("_")[0]);
  }
  return undefined;
}

function fromLockfile(pkg: string, baseDir: string): InstalledVersion | null {
  const lockDir = findLockDir(baseDir);
  if (!lockDir) return null;
  const rel = toPosix(relative(lockDir, baseDir));
  for (const name of NPM_LOCKS) {
    const path = join(lockDir, name);
    if (!existsSync(path)) continue;
    let lock: NpmLock;
    try {
      lock = JSON.parse(readFileSync(path, "utf-8")) as NpmLock;
    } catch {
      return null;
    }
    const version = fromNpmLock(lock, pkg, rel);
    return version ? { version, from: relative(baseDir, path) } : null;
  }
  const path = join(lockDir, PNPM_LOCK);
  let lock: PnpmLock | null;
  try {
    lock = parseYaml(readFileSync(path, "utf-8")) as PnpmLock | null;
  } catch {
    return null;
  }
  const version = lock ? fromPnpmLock(lock, pkg, rel) : undefined;
  return version ? { version, from: relative(baseDir, path) } : null;
}

function fromPackageDir(dir: string | null): string | undefined {
  if (!dir) return undefined;
  try {
    const pkgJson = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8")) as { version?: string };
    return exactVersion(pkgJson.version);
  } catch {
    return undefined;
  }
}

/** `npm root -g` per npm prefix, so one command asks npm at most once. */
const globalRoots = new Map<string, string | null>();

function npmGlobalRoot(): string | null {
  const key = process.env.npm_config_prefix ?? "";
  if (!globalRoots.has(key)) {
    let root: string | null;
    try {
      root = execFileSync("npm", ["root", "-g"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || null;
    } catch {
      root = null;
    }
    globalRoots.set(key, root);
  }
  return globalRoots.get(key) ?? null;
}

/** Version of `pkg` installed for the project at `baseDir` (or globally), or null. */
export function installedVersion(
  pkg: string,
  baseDir: string,
  lookup: InstalledLookup = {}
): InstalledVersion | null {
  if (lookup.global) {
    const root = (lookup.globalRoot ?? npmGlobalRoot)();
    if (root) {
      const dir = join(root, ...pkg.split("/"));
      const version = fromPackageDir(existsSync(join(dir, "package.json")) ? dir : null);
      if (version) return { version, from: dir, dir };
    }
    if (lookup.self?.name === pkg) {
      return { version: lookup.self.version, from: "the running skillfold CLI", dir: lookup.self.dir };
    }
    return null;
  }
  const locked = fromLockfile(pkg, baseDir);
  if (locked) return locked;
  const dir = findInstalledPackage(pkg, baseDir);
  const version = fromPackageDir(dir);
  if (!version || !dir) return null;
  // Node resolution returns real paths (/private/var on macOS), so compare real to real.
  let realBase = baseDir;
  try {
    realBase = realpathSync(baseDir);
  } catch {
    // A missing baseDir keeps the path as given.
  }
  return { version, from: relative(realBase, dir), dir };
}

/** Why an `@installed` source cannot be resolved, as a message tail. */
export function notInstalledMessage(pkg: string, lookup: InstalledLookup = {}): string {
  return lookup.global
    ? `${pkg}@${INSTALLED_REF} needs ${pkg} installed globally ("npm install -g ${pkg}"), or pin a version instead`
    : `${pkg}@${INSTALLED_REF} needs ${pkg} as a dependency of this project ` +
        `(no lockfile entry or node_modules copy found); install it, or pin a version instead`;
}

/**
 * Drift between an `@installed` source's lockfile pin and the installed
 * package, as a problem message; null when in step or not an `@installed`
 * source. `label` names the skill or rule in the message.
 */
export function installedDrift(
  label: string,
  sourceString: string,
  resolved: string | undefined,
  baseDir: string,
  lookup: InstalledLookup = {}
): string | null {
  let source;
  try {
    source = parseSource(sourceString);
  } catch {
    return null;
  }
  if (source.kind !== "npm" || source.version !== INSTALLED_REF) return null;
  const found = installedVersion(source.pkg, baseDir, lookup);
  if (!found) return `${label}: ${notInstalledMessage(source.pkg, lookup)}`;
  const pinned = resolved ? parseSource(resolved) : undefined;
  const locked = pinned?.kind === "npm" ? pinned.version : undefined;
  if (locked === found.version) return null;
  return (
    `${label} follows ${source.pkg}@${INSTALLED_REF}: ${found.version} is installed ` +
    `(${found.from}) but the lockfile pins ${locked ?? "nothing"} (run "skillfold install")`
  );
}
