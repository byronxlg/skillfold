import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { parse as parseYaml } from "yaml";

import { ResolveError } from "./errors.js";

/** A single file inside a skill directory. Paths are posix-style, relative to the skill root. */
export interface SkillFile {
  path: string;
  content: Buffer;
}

/** A fully-materialized skill: metadata plus every file in its directory. */
export interface SkillContent {
  /** From SKILL.md frontmatter; falls back to the directory name. */
  name: string;
  description: string;
  /** SKILL.md body with frontmatter stripped. */
  body: string;
  /** All files, sorted by path. Always includes SKILL.md. */
  files: SkillFile[];
}

export interface Frontmatter {
  attrs: Record<string, unknown>;
  body: string;
}

const SKILL_MD = "SKILL.md";

/** Directories never copied into an install. */
const IGNORED_DIRS = new Set([".git", "node_modules"]);

export function parseFrontmatter(content: string): Frontmatter {
  const trimmed = content.replace(/^\uFEFF/, "");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(trimmed);
  if (!match) {
    return { attrs: {}, body: trimmed.trim() };
  }
  let attrs: Record<string, unknown> = {};
  try {
    const parsed = parseYaml(match[1]);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      attrs = parsed as Record<string, unknown>;
    }
  } catch {
    // Malformed frontmatter: treat as attribute-less rather than failing the read.
  }
  return { attrs, body: trimmed.slice(match[0].length).trim() };
}

function walkFiles(root: string, dir: string, out: SkillFile[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      walkFiles(root, full, out);
    } else if (entry.isFile()) {
      if (entry.name === ".DS_Store") continue;
      const rel = full
        .slice(root.length + 1)
        .split(/[\\/]/)
        .join("/");
      out.push({ path: rel, content: readFileSync(full) });
    }
  }
}

/**
 * Read every file under a directory (for integrity comparison). Returns an
 * empty list if the directory does not exist.
 */
export function readDirFiles(dir: string): SkillFile[] {
  try {
    if (!statSync(dir).isDirectory()) return [];
  } catch {
    return [];
  }
  const files: SkillFile[] = [];
  walkFiles(dir, dir, files);
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return files;
}

/**
 * Read a skill directory into memory: SKILL.md metadata plus every file.
 * Throws ResolveError if the directory or its SKILL.md is missing.
 */
export function readSkillDir(dir: string, skillName: string): SkillContent {
  let stat;
  try {
    stat = statSync(dir);
  } catch {
    throw new ResolveError(skillName, `directory not found: ${dir}`);
  }
  if (!stat.isDirectory()) {
    throw new ResolveError(skillName, `not a directory: ${dir}`);
  }

  const files: SkillFile[] = [];
  walkFiles(dir, dir, files);
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const skillMd = files.find((f) => f.path === SKILL_MD);
  if (!skillMd) {
    throw new ResolveError(skillName, `no ${SKILL_MD} in ${dir}`);
  }

  const { attrs, body } = parseFrontmatter(skillMd.content.toString("utf-8"));
  const name = typeof attrs.name === "string" && attrs.name.trim() ? attrs.name.trim() : skillName;
  const description = typeof attrs.description === "string" ? attrs.description.trim() : "";

  return { name, description, body, files };
}

/**
 * Content hash over a skill's files: for each file (sorted by path), hash
 * `path NUL sha256(content) LF`, then digest the whole list.
 * Format: `sha256-<base64>`. Deterministic across machines.
 */
export function computeIntegrity(files: SkillFile[]): string {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const outer = createHash("sha256");
  for (const file of sorted) {
    const inner = createHash("sha256").update(file.content).digest("hex");
    outer.update(`${file.path}\0${inner}\n`);
  }
  return `sha256-${outer.digest("base64")}`;
}
