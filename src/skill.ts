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
  /** All SKILL.md frontmatter attributes (allowed-tools, license, ...). */
  attrs: Record<string, unknown>;
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

  return { name, description, body, attrs, files };
}

/**
 * Parse an `allowed-tools` frontmatter value: either a comma-separated
 * string (the form Claude Code documents) or a YAML list of strings.
 * Returns undefined when absent or unparseable.
 */
export function parseAllowedTools(attrs: Record<string, unknown>): string[] | undefined {
  const raw = attrs["allowed-tools"];
  let tools: string[];
  if (typeof raw === "string") {
    tools = raw.split(",").map((t) => t.trim());
  } else if (Array.isArray(raw) && raw.every((t) => typeof t === "string")) {
    tools = (raw as string[]).map((t) => t.trim());
  } else {
    return undefined;
  }
  tools = tools.filter(Boolean);
  return tools.length > 0 ? tools : undefined;
}

const FRONTMATTER_RE = /^---(\r?\n)([\s\S]*?)(\r?\n---\r?\n?)/;

/**
 * Rewrite the frontmatter `name` in a SKILL.md so it matches the directory
 * the skill installs into (the spec expects them to agree). Only the `name`
 * line is touched; the rest of the file is preserved byte for byte. Files
 * without a frontmatter block are left alone.
 */
export function normalizeSkillName(files: SkillFile[], name: string): SkillFile[] {
  const index = files.findIndex((f) => f.path === SKILL_MD);
  if (index === -1) return files;
  const text = files[index].content.toString("utf-8");
  const bom = text.startsWith("\uFEFF") ? "\uFEFF" : "";
  const stripped = bom ? text.slice(1) : text;
  const match = FRONTMATTER_RE.exec(stripped);
  if (!match) return files;
  const { attrs } = parseFrontmatter(text);
  if (attrs.name === name) return files;
  // Replace the top-level name line, or insert one after the opening ---.
  // Inside valid frontmatter YAML, only a top-level key can sit at column 0.
  const eol = match[1];
  const block = match[2];
  const newBlock = /^name:/m.test(block)
    ? block.replace(/^name:.*$/m, `name: ${name}`)
    : `name: ${name}${eol}${block}`;
  const rest = stripped.slice(match[0].length);
  const rewritten = `${bom}---${eol}${newBlock}${match[3]}${rest}`;
  const updated = [...files];
  updated[index] = { path: SKILL_MD, content: Buffer.from(rewritten, "utf-8") };
  return updated;
}

/** Apply normalizeSkillName to a SkillContent, re-deriving its metadata. */
export function renameSkill(skill: SkillContent, name: string): SkillContent {
  const files = normalizeSkillName(skill.files, name);
  if (files === skill.files && skill.name === name) return skill;
  const skillMd = files.find((f) => f.path === SKILL_MD)!;
  const { attrs, body } = parseFrontmatter(skillMd.content.toString("utf-8"));
  const description = typeof attrs.description === "string" ? attrs.description.trim() : "";
  return { name, description, body, attrs, files };
}

/** Content hash of a single file (used for rules): `sha256-<base64>`. */
export function computeFileIntegrity(content: Buffer): string {
  return `sha256-${createHash("sha256").update(content).digest("base64")}`;
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
