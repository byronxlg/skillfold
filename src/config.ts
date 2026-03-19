import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

import { parse } from "yaml";

import { ConfigError } from "./errors.js";
import { Graph, parseGraph, validateGraph } from "./graph.js";
import { fetchRemoteConfig } from "./remote.js";
import { parseState, StateSchema } from "./state.js";

export interface AtomicSkill {
  path: string;
}

export interface ComposedSkill {
  compose: string[];
  description: string;
}

export type SkillEntry = AtomicSkill | ComposedSkill;

export interface Config {
  name: string;
  skills: Record<string, SkillEntry>;
  state?: StateSchema;
  graph?: Graph;
  orchestrator?: string;
}

export interface RawConfig {
  name: string;
  skills: Record<string, SkillEntry>;
  rawState?: Record<string, unknown>;
  rawGraph?: unknown[];
  orchestrator?: string;
  imports?: string[];
}

export function isAtomic(skill: SkillEntry): skill is AtomicSkill {
  return "path" in skill;
}

export function isComposed(skill: SkillEntry): skill is ComposedSkill {
  return "compose" in skill;
}

function normalizeSkills(
  raw: Record<string, unknown>
): Record<string, SkillEntry> {
  const skills: Record<string, SkillEntry> = {};

  for (const [name, value] of Object.entries(raw)) {
    if (typeof value === "string") {
      // Shorthand: skill-name: ./path
      skills[name] = { path: value };
    } else if (
      typeof value === "object" &&
      value !== null &&
      "compose" in value
    ) {
      const compose = (value as { compose: unknown }).compose;
      if (!Array.isArray(compose) || !compose.every((c) => typeof c === "string")) {
        throw new ConfigError(
          `Skill "${name}": compose must be an array of skill names`
        );
      }
      const description = (value as { description?: unknown }).description;
      if (typeof description !== "string" || description.length === 0 || description.length > 1024) {
        throw new ConfigError(
          `Skill "${name}": composed skills must have a description`
        );
      }
      skills[name] = { compose, description };
    } else if (
      typeof value === "object" &&
      value !== null &&
      "path" in value
    ) {
      const path = (value as { path: unknown }).path;
      if (typeof path !== "string") {
        throw new ConfigError(`Skill "${name}": path must be a string`);
      }
      skills[name] = { path };
    } else {
      throw new ConfigError(
        `Skill "${name}": must be a path string, or an object with "path" or "compose"`
      );
    }
  }

  return skills;
}

const SKILL_NAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

function validateNames(skills: Record<string, SkillEntry>): void {
  for (const name of Object.keys(skills)) {
    if (
      name.length > 64 ||
      !SKILL_NAME_RE.test(name) ||
      name.includes("--")
    ) {
      throw new ConfigError(
        `Skill "${name}": name must be lowercase alphanumeric with hyphens, 1-64 characters`
      );
    }
  }
}

function validateReferences(skills: Record<string, SkillEntry>): void {
  for (const [name, skill] of Object.entries(skills)) {
    if (isComposed(skill)) {
      for (const ref of skill.compose) {
        if (!(ref in skills)) {
          throw new ConfigError(
            `Skill "${name}" composes unknown skill "${ref}"`
          );
        }
      }
    }
  }
}

function detectCycles(skills: Record<string, SkillEntry>): void {
  const visited = new Set<string>();
  const stack = new Set<string>();

  function visit(name: string, path: string[]): void {
    if (stack.has(name)) {
      const cycle = [...path.slice(path.indexOf(name)), name].join(" -> ");
      throw new ConfigError(`Circular composition detected: ${cycle}`);
    }
    if (visited.has(name)) return;

    const skill = skills[name];
    if (!isComposed(skill)) {
      visited.add(name);
      return;
    }

    stack.add(name);
    path.push(name);
    for (const ref of skill.compose) {
      visit(ref, path);
    }
    path.pop();
    stack.delete(name);
    visited.add(name);
  }

  for (const name of Object.keys(skills)) {
    visit(name, []);
  }
}

// Phase 1: Parse YAML and normalize structure without cross-validation
export function parseRawConfig(content: string): RawConfig {
  const raw = parse(content);
  if (typeof raw !== "object" || raw === null) {
    throw new ConfigError("Config must be a YAML object");
  }

  if (!raw.name || typeof raw.name !== "string") {
    throw new ConfigError("Config must have a 'name' field (string)");
  }

  if (!raw.skills || typeof raw.skills !== "object") {
    throw new ConfigError("Config must have a 'skills' field (object)");
  }

  const skills = normalizeSkills(raw.skills);
  validateNames(skills);

  const result: RawConfig = { name: raw.name, skills };

  if (raw.state !== undefined) {
    if (typeof raw.state !== "object" || raw.state === null) {
      throw new ConfigError("State must be a YAML object");
    }
    result.rawState = raw.state as Record<string, unknown>;
  }

  if (raw.graph !== undefined) {
    if (!Array.isArray(raw.graph)) {
      throw new ConfigError("Graph must be a YAML array");
    }
    result.rawGraph = raw.graph;
  }

  if (raw.orchestrator !== undefined) {
    if (typeof raw.orchestrator !== "string") {
      throw new ConfigError("Orchestrator must be a string (skill name)");
    }
    result.orchestrator = raw.orchestrator;
  }

  if (raw.imports !== undefined) {
    if (
      !Array.isArray(raw.imports) ||
      !raw.imports.every((v: unknown) => typeof v === "string")
    ) {
      throw new ConfigError("Imports must be an array of strings");
    }
    result.imports = raw.imports;
  }

  return result;
}

// Phase 2: Run full validation on a (possibly merged) RawConfig
export function validateAndBuild(raw: RawConfig): Config {
  validateReferences(raw.skills);
  detectCycles(raw.skills);

  const config: Config = { name: raw.name, skills: raw.skills };

  if (raw.rawState !== undefined) {
    const skillNames = new Set(Object.keys(raw.skills));
    config.state = parseState(raw.rawState, skillNames);
  }

  if (raw.rawGraph !== undefined) {
    const graph = parseGraph(raw.rawGraph);
    validateGraph(graph, raw.skills, config.state);
    config.graph = graph;
  }

  if (raw.orchestrator !== undefined) {
    if (!(raw.orchestrator in raw.skills)) {
      throw new ConfigError(
        `Orchestrator references unknown skill "${raw.orchestrator}"`
      );
    }
    config.orchestrator = raw.orchestrator;
  }

  return config;
}

// Rebase imported atomic skill paths from importDir-relative to targetDir-relative.
// Remote (https://) paths are left unchanged.
function rebaseSkillPaths(
  skills: Record<string, SkillEntry>,
  importDir: string,
  targetDir: string,
): Record<string, SkillEntry> {
  const result: Record<string, SkillEntry> = {};
  for (const [name, skill] of Object.entries(skills)) {
    if (isAtomic(skill) && !skill.path.startsWith("https://")) {
      const abs = resolve(importDir, skill.path);
      const rebased = relative(targetDir, abs);
      result[name] = { path: rebased };
    } else {
      result[name] = skill;
    }
  }
  return result;
}

// Merge helpers
function mergeSkills(
  base: Record<string, SkillEntry>,
  overlay: Record<string, SkillEntry>,
): Record<string, SkillEntry> {
  return { ...base, ...overlay };
}

function mergeRawState(
  base: Record<string, unknown> | undefined,
  overlay: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!base) return overlay;
  if (!overlay) return base;
  return { ...base, ...overlay };
}

// Resolve imports: load each import, merge skills and state, ignore graph/orchestrator/imports
async function resolveImports(
  raw: RawConfig,
  baseDir: string,
): Promise<RawConfig> {
  if (!raw.imports || raw.imports.length === 0) {
    return raw;
  }

  let mergedSkills: Record<string, SkillEntry> = {};
  let mergedState: Record<string, unknown> | undefined;

  for (const importPath of raw.imports) {
    let content: string;
    let importDir: string | undefined;

    if (importPath.startsWith("https://")) {
      content = await fetchRemoteConfig(importPath);
      // Remote imports keep their paths as-is (already URLs or relative to remote)
    } else {
      const resolved = resolve(baseDir, importPath);
      importDir = dirname(resolved);
      try {
        content = readFileSync(resolved, "utf-8");
      } catch {
        throw new ConfigError(`Cannot read imported config: ${resolved}`);
      }
    }

    const imported = parseRawConfig(content);
    // Ignore imported config's imports (no recursion in v1)
    // Rebase local skill paths so they resolve correctly from the importing config's dir
    const skills = importDir
      ? rebaseSkillPaths(imported.skills, importDir, baseDir)
      : imported.skills;
    mergedSkills = mergeSkills(mergedSkills, skills);
    mergedState = mergeRawState(mergedState, imported.rawState);
  }

  // Apply local on top (last-write-wins)
  mergedSkills = mergeSkills(mergedSkills, raw.skills);
  mergedState = mergeRawState(mergedState, raw.rawState);

  return {
    name: raw.name,
    skills: mergedSkills,
    rawState: mergedState,
    rawGraph: raw.rawGraph,
    orchestrator: raw.orchestrator,
    // imports consumed
  };
}

// Original synchronous entry point (unchanged API)
export function readConfig(configPath: string): Config {
  let content: string;
  try {
    content = readFileSync(configPath, "utf-8");
  } catch {
    throw new ConfigError(`Cannot read config file: ${configPath}`);
  }

  const raw = parseRawConfig(content);
  return validateAndBuild(raw);
}

// Async entry point that resolves imports before validation
export async function loadConfig(configPath: string): Promise<Config> {
  let content: string;
  try {
    content = readFileSync(configPath, "utf-8");
  } catch {
    throw new ConfigError(`Cannot read config file: ${configPath}`);
  }

  const raw = parseRawConfig(content);
  const merged = await resolveImports(raw, dirname(configPath));
  return validateAndBuild(merged);
}
