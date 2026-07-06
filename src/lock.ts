import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { LockError } from "./errors.js";
import type { Manifest } from "./manifest.js";

/**
 * skillfold.lock pins every remote skill to an exact, verifiable revision:
 *
 *   lockfileVersion: 1
 *   skills:
 *     code-review:
 *       source: github:owner/repo/skills/code-review@v1.2.0
 *       resolved: github:owner/repo/skills/code-review@<full commit sha>
 *       integrity: sha256-...
 *     commit-helper:
 *       source: ./skills/commit-helper
 *   compose:
 *     release-manager:
 *       use: [code-review, commit-helper]
 *       integrity: sha256-...
 *   rules:
 *     code-style:
 *       source: github:owner/repo/rules/code-style.md@v1.2.0
 *       resolved: github:owner/repo/rules/code-style.md@<full commit sha>
 *       integrity: sha256-...
 *
 * Local sources are recorded without pins (they are expected to change);
 * remote sources carry the exact revision and a content hash so installs
 * are reproducible and tampering is detectable. Commit the lockfile.
 */

export const LOCK_FILENAME = "skillfold.lock";

export interface LockSkillEntry {
  /** Source string exactly as normalized from the manifest. */
  source: string;
  /** Exact pinned form (commit SHA / exact version). Absent for local sources. */
  resolved?: string;
  /** Content hash of the skill files. Absent for local sources. */
  integrity?: string;
}

export interface LockComposeEntry {
  use: string[];
  /** Content hash of the generated skill files. */
  integrity: string;
}

export interface Lockfile {
  lockfileVersion: 1;
  skills: Record<string, LockSkillEntry>;
  compose: Record<string, LockComposeEntry>;
  /** Rule entries share the skill entry shape. */
  rules: Record<string, LockSkillEntry>;
  /**
   * Targets this lockfile has installed for. A layout not listed here has
   * never been synced, so nothing in it is managed yet. Absent in the file
   * means ["claude"] (pre-targets lockfiles).
   */
  targets: string[];
}

export function emptyLockfile(): Lockfile {
  return { lockfileVersion: 1, skills: {}, compose: {}, rules: {}, targets: ["claude"] };
}

export function readLockfile(lockPath: string): Lockfile | null {
  if (!existsSync(lockPath)) return null;
  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(lockPath, "utf-8"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new LockError(`${lockPath} is not valid YAML: ${msg}`);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new LockError(`${lockPath}: lockfile must be a YAML mapping`);
  }
  const top = raw as Record<string, unknown>;
  if (top.lockfileVersion !== 1) {
    throw new LockError(
      `${lockPath}: unsupported lockfileVersion ${String(top.lockfileVersion)} (expected 1). ` +
        `Delete the lockfile and run "skillfold install" to regenerate it.`
    );
  }
  const lock = emptyLockfile();
  for (const section of ["skills", "rules"] as const) {
    const raw = top[section];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new LockError(`${lockPath}: ${section}.${name} must be a mapping`);
      }
      const entry = value as Record<string, unknown>;
      if (typeof entry.source !== "string") {
        throw new LockError(`${lockPath}: ${section}.${name} is missing "source"`);
      }
      const skillEntry: LockSkillEntry = { source: entry.source };
      if (typeof entry.resolved === "string") skillEntry.resolved = entry.resolved;
      if (typeof entry.integrity === "string") skillEntry.integrity = entry.integrity;
      lock[section][name] = skillEntry;
    }
  }
  if (Array.isArray(top.targets) && top.targets.every((t) => typeof t === "string")) {
    lock.targets = top.targets as string[];
  }
  if (top.compose && typeof top.compose === "object" && !Array.isArray(top.compose)) {
    for (const [name, value] of Object.entries(top.compose as Record<string, unknown>)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new LockError(`${lockPath}: compose.${name} must be a mapping`);
      }
      const entry = value as Record<string, unknown>;
      if (!Array.isArray(entry.use) || typeof entry.integrity !== "string") {
        throw new LockError(`${lockPath}: compose.${name} needs "use" and "integrity"`);
      }
      lock.compose[name] = {
        use: entry.use.map(String),
        integrity: entry.integrity,
      };
    }
  }
  return lock;
}

function sortedRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  );
}

export function serializeLockfile(lock: Lockfile): string {
  const body = stringifyYaml(
    {
      lockfileVersion: lock.lockfileVersion,
      skills: sortedRecord(lock.skills),
      compose: sortedRecord(lock.compose),
      // Omitted when empty so pre-rules lockfiles do not churn.
      ...(Object.keys(lock.rules).length > 0 ? { rules: sortedRecord(lock.rules) } : {}),
      // Omitted for the default so pre-targets lockfiles do not churn.
      ...(lock.targets.length === 1 && lock.targets[0] === "claude"
        ? {}
        : { targets: lock.targets }),
    },
    { lineWidth: 0 }
  );
  return `# Generated by skillfold. Commit this file; do not edit it by hand.\n${body}`;
}

export function writeLockfile(lockPath: string, lock: Lockfile): void {
  writeFileSync(lockPath, serializeLockfile(lock));
}

/**
 * Compare a lockfile against the manifest. Returns human-readable problems,
 * empty when the lockfile fully covers the manifest.
 */
export function lockfileProblems(manifest: Manifest, lock: Lockfile | null): string[] {
  if (!lock) return [`missing ${LOCK_FILENAME} (run "skillfold install")`];
  const problems: string[] = [];
  for (const [name, source] of Object.entries(manifest.skills)) {
    const entry = lock.skills[name];
    if (!entry) {
      problems.push(`"${name}" is in the manifest but not the lockfile`);
    } else if (entry.source !== source) {
      problems.push(
        `"${name}" changed source (manifest: ${source}, lockfile: ${entry.source})`
      );
    }
  }
  for (const name of Object.keys(lock.skills)) {
    if (!manifest.skills[name]) {
      problems.push(`"${name}" is in the lockfile but not the manifest`);
    }
  }
  for (const [name, entry] of Object.entries(manifest.compose)) {
    const locked = lock.compose[name];
    if (!locked) {
      problems.push(`composed skill "${name}" is not in the lockfile`);
    } else if (locked.use.join(",") !== entry.use.join(",")) {
      problems.push(`composed skill "${name}" changed its "use" list`);
    }
  }
  for (const name of Object.keys(lock.compose)) {
    if (!manifest.compose[name]) {
      problems.push(`composed skill "${name}" is in the lockfile but not the manifest`);
    }
  }
  for (const [name, source] of Object.entries(manifest.rules)) {
    const entry = lock.rules[name];
    if (!entry) {
      problems.push(`rule "${name}" is in the manifest but not the lockfile`);
    } else if (entry.source !== source) {
      problems.push(
        `rule "${name}" changed source (manifest: ${source}, lockfile: ${entry.source})`
      );
    }
  }
  for (const name of Object.keys(lock.rules)) {
    if (!manifest.rules[name]) {
      problems.push(`rule "${name}" is in the lockfile but not the manifest`);
    }
  }
  const manifestTargets = manifest.targets ?? ["claude"];
  if (manifestTargets.join(",") !== lock.targets.join(",")) {
    problems.push(
      `targets changed (manifest: ${manifestTargets.join(", ")}; ` +
        `lockfile: ${lock.targets.join(", ")})`
    );
  }
  return problems;
}
