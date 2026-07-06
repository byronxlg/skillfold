import { join, resolve as resolvePath } from "node:path";

import type { Lockfile } from "./lock.js";
import type { Manifest } from "./manifest.js";
import { parseSource } from "./source.js";
import { computeIntegrity, normalizeSkillName, readDirFiles } from "./skill.js";

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
  kind: "local" | "github" | "npm" | "compose";
  /** Source as declared; `compose(a, b)` for composed skills. */
  source: string;
  /** Short pinned revision, e.g. "8f3a9c1" or "1.2.3". */
  pinned?: string;
  status: SkillStatus;
}

function shortPin(resolved: string | undefined): string | undefined {
  if (!resolved) return undefined;
  const source = parseSource(resolved);
  if (source.kind === "github" && source.ref) return source.ref.slice(0, 7);
  if (source.kind === "npm" && source.version) return source.version;
  return undefined;
}

export function skillRows(
  manifest: Manifest,
  lock: Lockfile | null,
  baseDir: string,
  skillsDir: string
): SkillRow[] {
  const rows: SkillRow[] = [];

  for (const [name, sourceString] of Object.entries(manifest.skills)) {
    const source = parseSource(sourceString);
    const entry = lock?.skills[name];
    const installedFiles = readDirFiles(join(skillsDir, name));
    let status: SkillStatus;
    if (installedFiles.length === 0) {
      status = "not installed";
    } else if (source.kind === "local") {
      const sourceFiles = readDirFiles(resolvePath(baseDir, source.path));
      status =
        sourceFiles.length > 0 &&
        computeIntegrity(normalizeSkillName(sourceFiles, name)) ===
          computeIntegrity(installedFiles)
          ? "ok"
          : "modified";
    } else if (!entry || entry.source !== sourceString) {
      status = "not locked";
    } else if (entry.integrity && entry.integrity !== computeIntegrity(installedFiles)) {
      status = "modified";
    } else {
      status = "ok";
    }
    rows.push({
      name,
      kind: source.kind,
      source: sourceString,
      pinned: entry && entry.source === sourceString ? shortPin(entry.resolved) : undefined,
      status,
    });
  }

  for (const [name, entry] of Object.entries(manifest.compose)) {
    const locked = lock?.compose[name];
    const installedFiles = readDirFiles(join(skillsDir, name));
    let status: SkillStatus;
    if (installedFiles.length === 0) {
      status = "not installed";
    } else if (!locked) {
      status = "not locked";
    } else if (locked.integrity !== computeIntegrity(installedFiles)) {
      status = "modified";
    } else {
      status = "ok";
    }
    rows.push({
      name,
      kind: "compose",
      source: `compose(${entry.use.join(", ")})`,
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
    row.status,
  ]);
  const widths = headers.map((header, i) =>
    Math.max(header.length, ...table.map((row) => row[i].length))
  );
  const line = (cells: string[]) =>
    "  " + cells.map((cell, i) => cell.padEnd(widths[i])).join("  ").trimEnd();
  return [line(headers), ...table.map(line)].join("\n");
}
