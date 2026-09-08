import { existsSync, lstatSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

import { parseDocument } from "yaml";

import { SkillfoldError } from "./errors.js";
import { LOCK_FILENAME, readLockfile, serializeLockfile } from "./lock.js";
import { loadManifest, MANIFEST_FILENAME } from "./manifest.js";
import { parseSource } from "./source.js";

export function globalConfigDir(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  const xdg = env.XDG_CONFIG_HOME;
  return join(xdg && isAbsolute(xdg) ? xdg : join(home, ".config"), "skillfold");
}

function present(path: string): boolean {
  return lstatSync(path, { throwIfNoEntry: false }) !== undefined;
}

/** Prefer the independent config directory; retain legacy configs until migrated. */
export function globalConfigRoot(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  const current = globalConfigDir(env, home);
  if (present(join(current, MANIFEST_FILENAME)) || present(join(current, LOCK_FILENAME))) return current;
  const legacy = join(home, ".claude");
  return existsSync(join(legacy, MANIFEST_FILENAME)) ? legacy : current;
}

/** Copy config without moving installed skills or breaking local source paths. */
export function migrateGlobalConfig(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  const legacy = join(home, ".claude");
  const destination = globalConfigDir(env, home);
  const manifestPath = join(legacy, MANIFEST_FILENAME);
  const manifest = loadManifest(manifestPath);
  for (const name of [MANIFEST_FILENAME, LOCK_FILENAME]) {
    if (present(join(destination, name))) {
      throw new SkillfoldError(`${join(destination, name)} already exists; migration will not overwrite it`);
    }
  }
  const original = readFileSync(manifestPath, "utf8");
  const doc = parseDocument(original);
  let changed = false;
  const rebasePath = (path: string): string => {
    if (isAbsolute(path)) return path;
    const rebased = relative(destination, resolve(legacy, path)).replaceAll("\\", "/");
    return rebased.startsWith(".") ? rebased : `./${rebased}`;
  };
  const rebaseSource = (source: string): string => {
    const parsed = parseSource(source);
    return parsed.kind === "local" ? rebasePath(parsed.path) : source;
  };
  for (const section of ["skills", "rules"] as const) {
    for (const name of Object.keys(manifest[section])) {
      const path = typeof doc.getIn([section, name]) === "string"
        ? [section, name] : [section, name, "source"];
      const source = doc.getIn(path);
      if (typeof source !== "string") continue;
      const rebased = rebaseSource(source);
      if (rebased !== source) { doc.setIn(path, rebased); changed = true; }
    }
  }
  for (const key of ["skillsDir", "rulesDir"] as const) {
    const path = manifest[key];
    if (path && rebasePath(path) !== path) {
      doc.set(key, rebasePath(path));
      changed = true;
    }
  }
  const lock = readLockfile(join(legacy, LOCK_FILENAME));
  if (lock) {
    for (const entry of [...Object.values(lock.skills), ...Object.values(lock.rules)]) {
      entry.source = rebaseSource(entry.source);
    }
  }
  mkdirSync(destination, { recursive: true });
  const written: string[] = [];
  try {
    // Publish the manifest last so a failed copy never activates half a config.
    if (lock) {
      const path = join(destination, LOCK_FILENAME);
      writeFileSync(path, serializeLockfile(lock), { flag: "wx" });
      written.push(path);
    }
    const path = join(destination, MANIFEST_FILENAME);
    writeFileSync(path, changed ? doc.toString({ flowCollectionPadding: false }) : original, { flag: "wx" });
    written.push(path);
  } catch (error) {
    for (const path of written) unlinkSync(path);
    throw error;
  }
  return destination;
}
