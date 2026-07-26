import { Buffer } from "node:buffer";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";

import { extractRulesBlock } from "./agentsmd.js";
import { ruleFile } from "./install.js";
import type { Lockfile, LockSkillEntry } from "./lock.js";
import type { Manifest } from "./manifest.js";
import { parseSource } from "./source.js";
import {
  computeFileIntegrity,
  computeIntegrity,
  frontmatterIssue,
  normalizeSkillName,
  readDirFiles,
} from "./skill.js";
import type { TargetLayout } from "./targets.js";

/**
 * Status of one skill, computed offline from manifest + lockfile + disk.
 *
 *   ok            installed and matching
 *   not installed nothing at <skillsDir>/<name>
 *   modified      installed files differ from the lock / source
 *   not locked    manifest entry has no lockfile pin yet
 */
export type SkillStatus = "ok" | "not installed" | "modified" | "not locked";

export interface SkillRow {
  name: string;
  kind: "local" | "github" | "npm" | "compose" | "rule";
  /** Source as declared; `compose(a, b)` for composed skills. */
  source: string;
  /** Short pinned revision, e.g. "8f3a9c1" or "1.2.3". */
  pinned?: string;
  status: SkillStatus;
  /** Non-fatal frontmatter problem with the installed SKILL.md, if any. */
  warning?: string;
}

/**
 * Frontmatter problem with a skill's installed SKILL.md, read from the first
 * layout that has it. Rules are single markdown files with no frontmatter
 * contract, so this is skills-only.
 */
function installedSkillWarning(name: string, layouts: TargetLayout[]): string | undefined {
  for (const layout of layouts) {
    const skillMd = join(layout.skillsDir, name, "SKILL.md");
    if (existsSync(skillMd)) {
      return frontmatterIssue(readFileSync(skillMd, "utf-8")) ?? undefined;
    }
  }
  return undefined;
}

function shortPin(resolved: string | undefined): string | undefined {
  if (!resolved) return undefined;
  const source = parseSource(resolved);
  if (source.kind === "github" && source.ref) return source.ref.slice(0, 7);
  if (source.kind === "npm" && source.version) return source.version;
  return undefined;
}

/** Later statuses are worse; rows show the worst status across layouts. */
const SEVERITY: Record<SkillStatus, number> = {
  ok: 0,
  "not locked": 1,
  modified: 2,
  "not installed": 3,
};

function worst(statuses: SkillStatus[]): SkillStatus {
  return statuses.reduce((a, b) => (SEVERITY[b] > SEVERITY[a] ? b : a), "ok");
}

function skillStatus(
  name: string,
  sourceString: string,
  entry: LockSkillEntry | undefined,
  baseDir: string,
  skillsDir: string
): SkillStatus {
  const source = parseSource(sourceString);
  const installedFiles = readDirFiles(join(skillsDir, name));
  if (installedFiles.length === 0) return "not installed";
  if (source.kind === "local") {
    const sourceFiles = readDirFiles(resolvePath(baseDir, source.path));
    return sourceFiles.length > 0 &&
      computeIntegrity(normalizeSkillName(sourceFiles, name)) ===
        computeIntegrity(installedFiles)
      ? "ok"
      : "modified";
  }
  if (!entry || entry.source !== sourceString) return "not locked";
  if (entry.integrity && entry.integrity !== computeIntegrity(installedFiles)) {
    return "modified";
  }
  return "ok";
}

function ruleStatus(
  name: string,
  sourceString: string,
  entry: LockSkillEntry | undefined,
  baseDir: string,
  installed: Buffer | undefined
): SkillStatus {
  if (!installed) return "not installed";
  const source = parseSource(sourceString);
  if (source.kind === "local") {
    const sourcePath = resolvePath(baseDir, source.path);
    return existsSync(sourcePath) && readFileSync(sourcePath).equals(installed)
      ? "ok"
      : "modified";
  }
  if (!entry || entry.source !== sourceString) return "not locked";
  if (entry.integrity && entry.integrity !== computeFileIntegrity(installed)) {
    return "modified";
  }
  return "ok";
}

/** Rule contents installed in a layout, keyed by rule name. */
function installedRules(layout: TargetLayout, names: string[]): Map<string, Buffer> {
  const map = new Map<string, Buffer>();
  if (layout.rulesDir) {
    for (const name of names) {
      const target = ruleFile(layout.rulesDir, name);
      if (existsSync(target)) map.set(name, readFileSync(target));
    }
  }
  if (layout.agentsMdPath && existsSync(layout.agentsMdPath)) {
    try {
      const block = extractRulesBlock(
        readFileSync(layout.agentsMdPath, "utf-8"),
        layout.agentsMdPath
      );
      for (const rule of block ?? []) map.set(rule.name, rule.content);
    } catch {
      // Malformed markers surface via `check`; list just shows "not installed".
    }
  }
  return map;
}

export function skillRows(
  manifest: Manifest,
  lock: Lockfile | null,
  baseDir: string,
  layouts: TargetLayout[]
): SkillRow[] {
  const rows: SkillRow[] = [];

  for (const [name, sourceString] of Object.entries(manifest.skills)) {
    const source = parseSource(sourceString);
    const entry = lock?.skills[name];
    const status = worst(
      layouts.map((layout) => skillStatus(name, sourceString, entry, baseDir, layout.skillsDir))
    );
    rows.push({
      name,
      kind: source.kind,
      source: sourceString,
      pinned: entry && entry.source === sourceString ? shortPin(entry.resolved) : undefined,
      status,
      warning: installedSkillWarning(name, layouts),
    });
  }

  for (const [name, entry] of Object.entries(manifest.compose)) {
    const locked = lock?.compose[name];
    const status = worst(
      layouts.map((layout): SkillStatus => {
        const installedFiles = readDirFiles(join(layout.skillsDir, name));
        if (installedFiles.length === 0) return "not installed";
        if (!locked) return "not locked";
        return locked.integrity === computeIntegrity(installedFiles) ? "ok" : "modified";
      })
    );
    rows.push({
      name,
      kind: "compose",
      source: `compose(${entry.use.join(", ")})`,
      status,
    });
  }

  const ruleNames = Object.keys(manifest.rules);
  const perLayoutRules = layouts.map((layout) => installedRules(layout, ruleNames));
  for (const [name, sourceString] of Object.entries(manifest.rules)) {
    const entry = lock?.rules[name];
    const status = worst(
      perLayoutRules.map((installed) =>
        ruleStatus(name, sourceString, entry, baseDir, installed.get(name))
      )
    );
    rows.push({
      name,
      kind: "rule",
      source: sourceString,
      pinned: entry && entry.source === sourceString ? shortPin(entry.resolved) : undefined,
      status,
    });
  }

  return rows;
}

/** Render rows as an aligned table. */
export function renderRows(rows: SkillRow[]): string {
  if (rows.length === 0) {
    return "no skills declared (add one with \"skillfold add <source>\")";
  }
  const headers = ["name", "source", "pinned", "status"];
  const table = rows.map((row) => [
    row.name,
    row.source,
    row.pinned ?? "-",
    // A frontmatter warning is only shown when nothing worse (drift, missing
    // install) is going on - those statuses are more urgent.
    row.status === "ok" && row.warning ? `warn: ${row.warning}` : row.status,
  ]);
  const widths = headers.map((header, i) =>
    Math.max(header.length, ...table.map((row) => row[i].length))
  );
  const line = (cells: string[]) =>
    "  " + cells.map((cell, i) => cell.padEnd(widths[i])).join("  ").trimEnd();
  return [line(headers), ...table.map(line)].join("\n");
}
