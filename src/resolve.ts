import { readFileSync, statSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import {
  composeOrder,
  generateComposedSkill,
  type ComposeInput,
} from "./compose.js";
import { LockError, ResolveError } from "./errors.js";
import type { Fetcher } from "./github.js";
import { fetchGitHubFile, fetchGitHubSkill, resolveGitHubRef } from "./github.js";
import { emptyLockfile, lockfileProblems, type Lockfile } from "./lock.js";
import type { Manifest } from "./manifest.js";
import { resolveNpmFile, resolveNpmSkill, type NpmOptions } from "./npm.js";
import {
  defaultSkillName,
  formatSource,
  parseSource,
  type Source,
} from "./source.js";
import {
  computeFileIntegrity,
  computeIntegrity,
  parseAllowedTools,
  readSkillDir,
  renameSkill,
  type SkillContent,
} from "./skill.js";

/** A skill resolved to concrete files, ready to install. */
export interface ResolvedSkill {
  name: string;
  /** Source string as written in the manifest; "compose" for composed skills. */
  source: string;
  kind: "local" | "github" | "npm" | "compose";
  /** Exact pinned source (commit SHA / exact version). Absent for local and composed. */
  resolved?: string;
  /** Content hash. Absent for local sources (they change freely). */
  integrity?: string;
  skill: SkillContent;
  /** True if bytes came over the network rather than cache/disk. */
  fetched: boolean;
}

export interface ResolveOptions {
  /** Directory the manifest lives in; local paths resolve against it. */
  baseDir: string;
  /** Existing lockfile; pins are reused unless `update` says otherwise. */
  lock?: Lockfile | null;
  /** Install exactly what the lockfile pins; fail on any drift. */
  frozen?: boolean;
  /** Skill names to re-resolve past their lockfile pins ("all" = every skill). */
  update?: string[] | "all";
  fetcher?: Fetcher;
  env?: NodeJS.ProcessEnv;
  npmOptions?: NpmOptions;
  onProgress?: (message: string) => void;
}

/** A rule resolved to a single markdown file's contents, ready to install. */
export interface ResolvedRule {
  name: string;
  /** Source string as written in the manifest. */
  source: string;
  kind: "local" | "github" | "npm";
  /** Exact pinned source (commit SHA / exact version). Absent for local. */
  resolved?: string;
  /** Content hash. Absent for local sources (they change freely). */
  integrity?: string;
  content: Buffer;
  /** True if bytes came over the network rather than cache/disk. */
  fetched: boolean;
}

export interface ResolveResult {
  resolved: ResolvedSkill[];
  rules: ResolvedRule[];
  lock: Lockfile;
}

function shouldReusePin(
  name: string,
  sourceString: string,
  lock: Lockfile | null | undefined,
  update: string[] | "all" | undefined,
  section: "skills" | "rules" = "skills"
): string | undefined {
  if (update === "all" || (Array.isArray(update) && update.includes(name))) {
    return undefined;
  }
  const entry = lock?.[section][name];
  if (entry && entry.source === sourceString && entry.resolved) {
    return entry.resolved;
  }
  return undefined;
}

function pinnedGitHubSha(resolved: string, name: string): string {
  const source = parseSource(resolved);
  if (source.kind !== "github" || !source.ref) {
    throw new LockError(`lockfile entry for "${name}" has an invalid resolved pin: ${resolved}`);
  }
  return source.ref;
}

function pinnedNpmVersion(resolved: string, name: string): string {
  const source = parseSource(resolved);
  if (source.kind !== "npm" || !source.version) {
    throw new LockError(`lockfile entry for "${name}" has an invalid resolved pin: ${resolved}`);
  }
  return source.version;
}

async function resolveOne(
  name: string,
  sourceString: string,
  options: ResolveOptions,
  keepName = false
): Promise<ResolvedSkill> {
  const source: Source = parseSource(sourceString);
  const { baseDir, lock, frozen, update, fetcher, env, npmOptions } = options;
  // Installed skills live at <skillsDir>/<name>; the frontmatter name is
  // rewritten to match so directory and frontmatter always agree.
  const normalize = (skill: SkillContent): SkillContent =>
    keepName ? skill : renameSkill(skill, name);

  if (source.kind === "local") {
    const dir = resolvePath(baseDir, source.path);
    return {
      name,
      source: sourceString,
      kind: "local",
      skill: normalize(readSkillDir(dir, name)),
      fetched: false,
    };
  }

  const lockEntry = lock?.skills[name];
  if (frozen && (!lockEntry || lockEntry.source !== sourceString || !lockEntry.resolved)) {
    throw new LockError(
      `--frozen: "${name}" is not pinned in the lockfile. Run "skillfold install" and commit the lockfile.`
    );
  }

  if (source.kind === "github") {
    const reused = frozen
      ? lockEntry!.resolved
      : shouldReusePin(name, sourceString, lock, update);
    const sha = reused
      ? pinnedGitHubSha(reused, name)
      : await resolveGitHubRef(source, name, { fetcher, env });
    const result = await fetchGitHubSkill(source, sha, name, { fetcher, env });
    const skill = normalize(result.skill);
    const integrity = computeIntegrity(skill.files);
    if (frozen && lockEntry?.integrity && integrity !== lockEntry.integrity) {
      throw new LockError(
        `--frozen: "${name}" content hash does not match the lockfile ` +
          `(expected ${lockEntry.integrity}, got ${integrity})`
      );
    }
    return {
      name,
      source: sourceString,
      kind: "github",
      resolved: formatSource({ ...source, ref: sha }),
      integrity,
      skill,
      fetched: result.fetched,
    };
  }

  // npm
  const reused = frozen
    ? lockEntry!.resolved
    : shouldReusePin(name, sourceString, lock, update);
  const pinnedVersion = reused ? pinnedNpmVersion(reused, name) : undefined;
  const result = await resolveNpmSkill(source, name, baseDir, pinnedVersion, {
    fetcher,
    env,
    ...npmOptions,
  });
  const skill = normalize(result.skill);
  const integrity = computeIntegrity(skill.files);
  if (frozen && lockEntry?.integrity && integrity !== lockEntry.integrity) {
    throw new LockError(
      `--frozen: "${name}" content hash does not match the lockfile ` +
        `(expected ${lockEntry.integrity}, got ${integrity})`
    );
  }
  return {
    name,
    source: sourceString,
    kind: "npm",
    resolved: formatSource({ ...source, version: result.version }),
    integrity,
    skill,
    fetched: result.fetched,
  };
}

async function resolveRule(
  name: string,
  sourceString: string,
  options: ResolveOptions
): Promise<ResolvedRule> {
  const source = parseSource(sourceString);
  const { baseDir, lock, frozen, update, fetcher, env, npmOptions } = options;

  if (source.kind === "local") {
    const path = resolvePath(baseDir, source.path);
    let stat;
    try {
      stat = statSync(path);
    } catch {
      throw new ResolveError(name, `file not found: ${source.path}`);
    }
    if (!stat.isFile()) {
      throw new ResolveError(name, `not a file: ${source.path} (rules are single files)`);
    }
    return {
      name,
      source: sourceString,
      kind: "local",
      content: readFileSync(path),
      fetched: false,
    };
  }

  const lockEntry = lock?.rules[name];
  if (frozen && (!lockEntry || lockEntry.source !== sourceString || !lockEntry.resolved)) {
    throw new LockError(
      `--frozen: rule "${name}" is not pinned in the lockfile. Run "skillfold install" and commit the lockfile.`
    );
  }
  const reused = frozen
    ? lockEntry!.resolved
    : shouldReusePin(name, sourceString, lock, update, "rules");

  let resolved: string;
  let content: Buffer;
  let fetched: boolean;
  if (source.kind === "github") {
    const sha = reused
      ? pinnedGitHubSha(reused, name)
      : await resolveGitHubRef(source, name, { fetcher, env });
    const result = await fetchGitHubFile(source, sha, name, { fetcher, env });
    resolved = formatSource({ ...source, ref: sha });
    content = result.content;
    fetched = result.fetched;
  } else {
    const pinnedVersion = reused ? pinnedNpmVersion(reused, name) : undefined;
    const result = await resolveNpmFile(source, name, options.baseDir, pinnedVersion, {
      fetcher,
      env,
      ...npmOptions,
    });
    resolved = formatSource({ ...source, version: result.version });
    content = result.content;
    fetched = result.fetched;
  }

  const integrity = computeFileIntegrity(content);
  if (frozen && lockEntry?.integrity && integrity !== lockEntry.integrity) {
    throw new LockError(
      `--frozen: rule "${name}" content hash does not match the lockfile ` +
        `(expected ${lockEntry.integrity}, got ${integrity})`
    );
  }
  return { name, source: sourceString, kind: source.kind, resolved, integrity, content, fetched };
}

/**
 * Resolve every skill in the manifest to concrete files, honoring the
 * lockfile, and generate composed skills. Returns the resolved set plus the
 * lockfile that pins it.
 */
export async function resolveManifest(
  manifest: Manifest,
  options: ResolveOptions
): Promise<ResolveResult> {
  if (options.frozen) {
    const problems = lockfileProblems(manifest, options.lock ?? null);
    if (problems.length > 0) {
      throw new LockError(
        `--frozen: lockfile is out of sync with the manifest:\n  - ${problems.join("\n  - ")}`
      );
    }
  }

  const resolved: ResolvedSkill[] = [];
  const byName = new Map<string, ResolvedSkill>();

  for (const [name, sourceString] of Object.entries(manifest.skills)) {
    options.onProgress?.(`resolving ${name} (${sourceString})`);
    const one = await resolveOne(name, sourceString, options);
    resolved.push(one);
    byName.set(name, one);
  }

  // Composed skills, dependencies first.
  const composedBodies = new Map<string, ComposeInput>();
  const toComposeInput = (dep: string, skill: SkillContent): ComposeInput => ({
    name: dep,
    description: skill.description,
    body: skill.body,
    allowedTools: parseAllowedTools(skill.attrs),
    files: skill.files.filter((f) => f.path !== "SKILL.md"),
  });
  for (const name of composeOrder(manifest.compose)) {
    const entry = manifest.compose[name];
    const inputs: ComposeInput[] = entry.use.map((dep) => {
      const composedDep = composedBodies.get(dep);
      if (composedDep) return composedDep;
      const skillDep = byName.get(dep);
      if (!skillDep) {
        // Unreachable after manifest validation; guard for safety.
        throw new ResolveError(name, `composed dependency "${dep}" was not resolved`);
      }
      return toComposeInput(dep, skillDep.skill);
    });
    const skill = generateComposedSkill(name, entry, inputs);
    composedBodies.set(name, toComposeInput(name, skill));
    const integrity = computeIntegrity(skill.files);
    if (options.frozen) {
      const locked = options.lock?.compose[name];
      if (locked && locked.integrity !== integrity) {
        throw new LockError(
          `--frozen: composed skill "${name}" would generate different content than the lockfile pins`
        );
      }
    }
    const one: ResolvedSkill = {
      name,
      source: "compose",
      kind: "compose",
      integrity,
      skill,
      fetched: false,
    };
    resolved.push(one);
    byName.set(name, one);
  }

  const rules: ResolvedRule[] = [];
  for (const [name, sourceString] of Object.entries(manifest.rules)) {
    options.onProgress?.(`resolving rule ${name} (${sourceString})`);
    rules.push(await resolveRule(name, sourceString, options));
  }

  const lock: Lockfile = emptyLockfile();
  lock.targets = [...(manifest.targets ?? ["claude"])];
  for (const one of resolved) {
    if (one.kind === "compose") {
      lock.compose[one.name] = {
        use: manifest.compose[one.name].use,
        integrity: one.integrity!,
      };
    } else {
      lock.skills[one.name] = {
        source: one.source,
        resolved: one.resolved,
        integrity: one.integrity,
      };
    }
  }
  for (const rule of rules) {
    lock.rules[rule.name] = {
      source: rule.source,
      resolved: rule.resolved,
      integrity: rule.integrity,
    };
  }

  return { resolved, rules, lock };
}

/**
 * Resolve a single source string outside any manifest (used by `add` to
 * fetch the skill and infer its name before editing the manifest).
 */
export async function resolveSingle(
  sourceString: string,
  baseDir: string,
  options: Omit<ResolveOptions, "baseDir"> = { }
): Promise<ResolvedSkill> {
  const source = parseSource(sourceString);
  const tempName = defaultSkillName(source);
  // keepName: the caller reads the original frontmatter name to pick the
  // manifest name, so the skill must not be renamed to the placeholder.
  return resolveOne(tempName, formatSource(source), { ...options, baseDir, lock: null }, true);
}
