import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { Document, parseDocument, YAMLMap } from "yaml";

import { ManifestError } from "./errors.js";
import { formatSource, parseSource } from "./source.js";

/**
 * The skillfold.yaml manifest. Two sections:
 *
 *   skills:                          # name -> source
 *     commit-helper: ./skills/commit-helper
 *     code-review: github:owner/repo/skills/code-review@v1.2.0
 *     planning: npm:skillfold/planning
 *
 *   compose:                         # generated skills, concatenated from others
 *     release-manager:
 *       description: Cut releases end to end.
 *       use: [code-review, planning]
 *
 * Plus one optional setting:
 *
 *   skillsDir: .claude/skills        # where skills are installed
 */

export const MANIFEST_FILENAME = "skillfold.yaml";
export const DEFAULT_SKILLS_DIR = ".claude/skills";

export interface ComposeEntry {
  description?: string;
  use: string[];
}

export interface Manifest {
  /** Skill name -> normalized source string. */
  skills: Record<string, string>;
  /** Composed skill name -> definition. */
  compose: Record<string, ComposeEntry>;
  /** Install directory, relative to the manifest. Undefined = target default. */
  skillsDir?: string;
}

const KNOWN_KEYS = new Set(["skills", "compose", "skillsDir"]);

/** Valid skill names: what Claude Code accepts as a skill directory name. */
const NAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export function validateSkillName(name: string): void {
  if (!NAME_RE.test(name)) {
    throw new ManifestError(
      `Invalid skill name "${name}": use lowercase letters, digits, and hyphens (e.g. "code-review")`
    );
  }
  if (name.length > 64) {
    throw new ManifestError(`Invalid skill name "${name}": longer than 64 characters`);
  }
}

function normalizeSkillEntry(name: string, value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    return formatSource(parseSource(value));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const entry = value as Record<string, unknown>;
    for (const key of Object.keys(entry)) {
      if (key !== "source" && key !== "version") {
        throw new ManifestError(
          `skills.${name}: unknown key "${key}" (expected source, version)`
        );
      }
    }
    if (typeof entry.source !== "string" || !entry.source.trim()) {
      throw new ManifestError(`skills.${name}: missing "source"`);
    }
    let raw = entry.source.trim();
    if (entry.version !== undefined) {
      if (typeof entry.version !== "string" && typeof entry.version !== "number") {
        throw new ManifestError(`skills.${name}: "version" must be a string`);
      }
      raw = `${raw}@${entry.version}`;
    }
    return formatSource(parseSource(raw));
  }
  throw new ManifestError(
    `skills.${name}: expected a source string or { source, version }`
  );
}

function normalizeComposeEntry(name: string, value: unknown): ComposeEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ManifestError(`compose.${name}: expected { use: [...] }`);
  }
  const entry = value as Record<string, unknown>;
  for (const key of Object.keys(entry)) {
    if (key !== "use" && key !== "description") {
      throw new ManifestError(
        `compose.${name}: unknown key "${key}" (expected use, description)`
      );
    }
  }
  if (!Array.isArray(entry.use) || entry.use.length === 0) {
    throw new ManifestError(`compose.${name}: "use" must be a non-empty list of skill names`);
  }
  const use = entry.use.map((item) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new ManifestError(`compose.${name}: "use" entries must be skill names`);
    }
    return item.trim();
  });
  const seen = new Set<string>();
  for (const item of use) {
    if (seen.has(item)) {
      throw new ManifestError(`compose.${name}: "${item}" listed more than once in "use"`);
    }
    seen.add(item);
  }
  let description: string | undefined;
  if (entry.description !== undefined) {
    if (typeof entry.description !== "string") {
      throw new ManifestError(`compose.${name}: "description" must be a string`);
    }
    description = entry.description.trim();
  }
  return { description, use };
}

function detectComposeCycles(compose: Record<string, ComposeEntry>): void {
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (name: string, trail: string[]): void => {
    if (done.has(name)) return;
    if (visiting.has(name)) {
      const cycle = [...trail.slice(trail.indexOf(name)), name].join(" -> ");
      throw new ManifestError(`Compose cycle detected: ${cycle}`);
    }
    visiting.add(name);
    for (const dep of compose[name]?.use ?? []) {
      if (compose[dep]) visit(dep, [...trail, name]);
    }
    visiting.delete(name);
    done.add(name);
  };
  for (const name of Object.keys(compose)) visit(name, []);
}

export function parseManifest(content: string, filePath: string): Manifest {
  let raw: unknown;
  const doc = parseDocument(content);
  if (doc.errors.length > 0) {
    throw new ManifestError(`${filePath}: ${doc.errors[0].message}`);
  }
  raw = doc.toJS() ?? {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ManifestError(`${filePath}: manifest must be a YAML mapping`);
  }
  const top = raw as Record<string, unknown>;
  for (const key of Object.keys(top)) {
    if (!KNOWN_KEYS.has(key)) {
      throw new ManifestError(
        `${filePath}: unknown top-level key "${key}" (expected skills, compose, skillsDir)`
      );
    }
  }

  const skills: Record<string, string> = {};
  if (top.skills !== undefined && top.skills !== null) {
    if (typeof top.skills !== "object" || Array.isArray(top.skills)) {
      throw new ManifestError(`${filePath}: "skills" must be a mapping of name -> source`);
    }
    for (const [name, value] of Object.entries(top.skills as Record<string, unknown>)) {
      validateSkillName(name);
      skills[name] = normalizeSkillEntry(name, value);
    }
  }

  const compose: Record<string, ComposeEntry> = {};
  if (top.compose !== undefined && top.compose !== null) {
    if (typeof top.compose !== "object" || Array.isArray(top.compose)) {
      throw new ManifestError(`${filePath}: "compose" must be a mapping of name -> definition`);
    }
    for (const [name, value] of Object.entries(top.compose as Record<string, unknown>)) {
      validateSkillName(name);
      if (skills[name]) {
        throw new ManifestError(
          `"${name}" is defined in both skills and compose; names must be unique`
        );
      }
      compose[name] = normalizeComposeEntry(name, value);
    }
  }

  for (const [name, entry] of Object.entries(compose)) {
    for (const dep of entry.use) {
      if (!skills[dep] && !compose[dep]) {
        throw new ManifestError(
          `compose.${name}: uses unknown skill "${dep}" (not in skills or compose)`
        );
      }
      if (dep === name) {
        throw new ManifestError(`compose.${name}: cannot use itself`);
      }
    }
  }
  detectComposeCycles(compose);

  let skillsDir: string | undefined;
  if (top.skillsDir !== undefined) {
    if (typeof top.skillsDir !== "string" || !top.skillsDir.trim()) {
      throw new ManifestError(`${filePath}: "skillsDir" must be a path string`);
    }
    skillsDir = top.skillsDir.trim();
  }

  return { skills, compose, skillsDir };
}

export function loadManifest(manifestPath: string): Manifest {
  const abs = resolve(manifestPath);
  if (!existsSync(abs)) {
    throw new ManifestError(
      `No ${MANIFEST_FILENAME} found at ${abs}. Run "skillfold init" to create one.`
    );
  }
  return parseManifest(readFileSync(abs, "utf-8"), abs);
}

/**
 * Add a skill entry to the manifest file, preserving comments and formatting.
 * Creates the file if it does not exist.
 */
export function addSkillToManifest(manifestPath: string, name: string, source: string): void {
  validateSkillName(name);
  let doc: Document;
  if (existsSync(manifestPath)) {
    doc = parseDocument(readFileSync(manifestPath, "utf-8"));
    if (doc.errors.length > 0) {
      throw new ManifestError(`${manifestPath}: ${doc.errors[0].message}`);
    }
  } else {
    doc = new Document({});
  }
  if (doc.contents === null || doc.contents === undefined) {
    doc.contents = doc.createNode({}) as unknown as typeof doc.contents;
  }
  const existing = doc.getIn(["skills", name]);
  if (existing !== undefined) {
    throw new ManifestError(
      `Skill "${name}" already exists in the manifest (source: ${String(existing)}). ` +
        `Use "skillfold update ${name}" or pick another name with --name.`
    );
  }
  if (doc.getIn(["compose", name]) !== undefined) {
    throw new ManifestError(`"${name}" already exists in compose; names must be unique`);
  }
  if (!doc.has("skills")) {
    doc.set("skills", doc.createNode({}));
  }
  doc.setIn(["skills", name], source);
  writeFileSync(manifestPath, doc.toString());
}

/** Remove a skill (or composed skill) from the manifest file. Returns which section it was in. */
export function removeSkillFromManifest(
  manifestPath: string,
  name: string
): "skills" | "compose" {
  if (!existsSync(manifestPath)) {
    throw new ManifestError(`No ${MANIFEST_FILENAME} found at ${manifestPath}`);
  }
  const doc = parseDocument(readFileSync(manifestPath, "utf-8"));
  if (doc.errors.length > 0) {
    throw new ManifestError(`${manifestPath}: ${doc.errors[0].message}`);
  }
  let section: "skills" | "compose";
  if (doc.hasIn(["skills", name])) {
    section = "skills";
  } else if (doc.hasIn(["compose", name])) {
    section = "compose";
  } else {
    throw new ManifestError(`Skill "${name}" is not in the manifest`);
  }
  doc.deleteIn([section, name]);
  // Drop the section entirely if it is now empty.
  const sectionNode = doc.get(section, true);
  if (sectionNode instanceof YAMLMap && sectionNode.items.length === 0) {
    doc.delete(section);
  }
  writeFileSync(manifestPath, doc.toString());
  return section;
}

/** Directory a manifest lives in (used to resolve relative paths). */
export function manifestDir(manifestPath: string): string {
  return dirname(resolve(manifestPath));
}
