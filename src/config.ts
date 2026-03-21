import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const __pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SELF_IMPORT_PREFIX = "node_modules/skillfold/";

import { ConfigError, didYouMean } from "./errors.js";
import { type Graph, type GraphNode, type SubFlowNode, isMapNode, isSubFlowNode, parseGraph, validateGraph } from "./graph.js";
import { isNpmRef, resolveNpmImportPath } from "./npm.js";
import { fetchRemoteConfig } from "./remote.js";
import { parseState, StateSchema } from "./state.js";

export interface AtomicSkill {
  path: string;
  resources?: Record<string, string>;
}

/** Known Claude Code subagent frontmatter fields that can be set on composed skills. */
export interface AgentFrontmatter {
  tools?: string[];
  disallowedTools?: string[];
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan";
  model?: string;
  memory?: boolean;
  hooks?: Record<string, unknown>;
  isolation?: "worktree" | "none";
  effort?: "low" | "medium" | "high";
  maxTurns?: number;
  background?: boolean;
}

export const VALID_PERMISSION_MODES = ["default", "acceptEdits", "bypassPermissions", "plan"] as const;
export const VALID_ISOLATION_VALUES = ["worktree", "none"] as const;
export const VALID_EFFORT_VALUES = ["low", "medium", "high"] as const;

/** Keys that are recognized as AgentFrontmatter fields on composed skills. */
export const AGENT_FRONTMATTER_KEYS = new Set<string>([
  "tools",
  "disallowedTools",
  "permissionMode",
  "model",
  "memory",
  "hooks",
  "isolation",
  "effort",
  "maxTurns",
  "background",
]);

export interface ComposedSkill {
  compose: string[];
  description: string;
  /** @deprecated Use named agent frontmatter fields (tools, permissionMode, etc.) instead. */
  frontmatter?: Record<string, unknown>;
  agentConfig?: AgentFrontmatter;
}

export type SkillEntry = AtomicSkill | ComposedSkill;

export interface TeamConfig {
  orchestrator?: string;
  flow: Graph;
}

export interface Config {
  name: string;
  skills: Record<string, SkillEntry>;
  resources?: Record<string, Record<string, string>>;
  state?: StateSchema;
  team?: TeamConfig;
}

export interface RawConfig {
  name: string;
  skills: Record<string, SkillEntry>;
  resources?: Record<string, Record<string, string>>;
  rawState?: Record<string, unknown>;
  rawTeam?: {
    orchestrator?: string;
    rawFlow: unknown[];
  };
  imports?: string[];
  /** Pre-parsed graph with resolved sub-flow nodes (set by resolveSubFlows). */
  _resolvedGraph?: Graph;
}

export function isAtomic(skill: SkillEntry): skill is AtomicSkill {
  return "path" in skill;
}

export function isComposed(skill: SkillEntry): skill is ComposedSkill {
  return "compose" in skill;
}

const RESOURCE_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

function parseResources(
  name: string,
  rawResources: unknown,
): Record<string, string> {
  if (typeof rawResources !== "object" || rawResources === null || Array.isArray(rawResources)) {
    throw new ConfigError(
      `Skill "${name}": resources must be a YAML map`
    );
  }
  const resources: Record<string, string> = {};
  for (const [key, val] of Object.entries(rawResources as Record<string, unknown>)) {
    if (!RESOURCE_NAME_RE.test(key)) {
      throw new ConfigError(
        `Skill "${name}": resource name "${key}" must be lowercase alphanumeric with hyphens`
      );
    }
    if (typeof val !== "string" || val.length === 0) {
      throw new ConfigError(
        `Skill "${name}": resource "${key}" must be a non-empty string`
      );
    }
    resources[key] = val;
  }
  return resources;
}

function parseTopLevelResources(
  rawResources: unknown,
): Record<string, Record<string, string>> {
  if (typeof rawResources !== "object" || rawResources === null || Array.isArray(rawResources)) {
    throw new ConfigError("Top-level resources must be a YAML map");
  }
  const result: Record<string, Record<string, string>> = {};
  for (const [groupName, groupValue] of Object.entries(rawResources as Record<string, unknown>)) {
    if (!RESOURCE_NAME_RE.test(groupName)) {
      throw new ConfigError(
        `Resource group "${groupName}" must be lowercase alphanumeric with hyphens`
      );
    }
    result[groupName] = parseResources(groupName, groupValue);
  }
  return result;
}

function normalizeAtomicSkills(
  raw: Record<string, unknown>
): Record<string, AtomicSkill> {
  const skills: Record<string, AtomicSkill> = {};

  for (const [name, value] of Object.entries(raw)) {
    if (typeof value === "string") {
      skills[name] = { path: value };
    } else if (
      typeof value === "object" &&
      value !== null &&
      "path" in value
    ) {
      const path = (value as { path: unknown }).path;
      if (typeof path !== "string") {
        throw new ConfigError(`Skill "${name}": path must be a string`);
      }
      const skill: AtomicSkill = { path };
      const rawObj = value as Record<string, unknown>;
      if ("resources" in rawObj && rawObj.resources !== undefined) {
        skill.resources = parseResources(name, rawObj.resources);
      }
      skills[name] = skill;
    } else {
      throw new ConfigError(
        `Skill "${name}": must be a path string, or an object with "path"`
      );
    }
  }

  return skills;
}

function validateStringArray(name: string, field: string, value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
    throw new ConfigError(
      `Skill "${name}": ${field} must be an array of strings`
    );
  }
  return value;
}

function parseAgentFrontmatter(
  name: string,
  raw: Record<string, unknown>,
): AgentFrontmatter | undefined {
  const config: AgentFrontmatter = {};
  let hasFields = false;

  if ("tools" in raw) {
    config.tools = validateStringArray(name, "tools", raw.tools);
    hasFields = true;
  }

  if ("disallowedTools" in raw) {
    config.disallowedTools = validateStringArray(name, "disallowedTools", raw.disallowedTools);
    hasFields = true;
  }

  if ("permissionMode" in raw) {
    const v = raw.permissionMode;
    if (typeof v !== "string" || !(VALID_PERMISSION_MODES as readonly string[]).includes(v)) {
      throw new ConfigError(
        `Skill "${name}": permissionMode must be one of: ${VALID_PERMISSION_MODES.join(", ")}`
      );
    }
    config.permissionMode = v as AgentFrontmatter["permissionMode"];
    hasFields = true;
  }

  if ("model" in raw) {
    if (typeof raw.model !== "string") {
      throw new ConfigError(`Skill "${name}": model must be a string`);
    }
    config.model = raw.model;
    hasFields = true;
  }

  if ("memory" in raw) {
    if (typeof raw.memory !== "boolean") {
      throw new ConfigError(`Skill "${name}": memory must be a boolean`);
    }
    config.memory = raw.memory;
    hasFields = true;
  }

  if ("hooks" in raw) {
    if (typeof raw.hooks !== "object" || raw.hooks === null || Array.isArray(raw.hooks)) {
      throw new ConfigError(`Skill "${name}": hooks must be a YAML map`);
    }
    config.hooks = raw.hooks as Record<string, unknown>;
    hasFields = true;
  }

  if ("isolation" in raw) {
    const v = raw.isolation;
    if (typeof v !== "string" || !(VALID_ISOLATION_VALUES as readonly string[]).includes(v)) {
      throw new ConfigError(
        `Skill "${name}": isolation must be one of: ${VALID_ISOLATION_VALUES.join(", ")}`
      );
    }
    config.isolation = v as AgentFrontmatter["isolation"];
    hasFields = true;
  }

  if ("effort" in raw) {
    const v = raw.effort;
    if (typeof v !== "string" || !(VALID_EFFORT_VALUES as readonly string[]).includes(v)) {
      throw new ConfigError(
        `Skill "${name}": effort must be one of: ${VALID_EFFORT_VALUES.join(", ")}`
      );
    }
    config.effort = v as AgentFrontmatter["effort"];
    hasFields = true;
  }

  if ("maxTurns" in raw) {
    if (typeof raw.maxTurns !== "number" || !Number.isInteger(raw.maxTurns) || raw.maxTurns < 1) {
      throw new ConfigError(
        `Skill "${name}": maxTurns must be a positive integer`
      );
    }
    config.maxTurns = raw.maxTurns;
    hasFields = true;
  }

  if ("background" in raw) {
    if (typeof raw.background !== "boolean") {
      throw new ConfigError(`Skill "${name}": background must be a boolean`);
    }
    config.background = raw.background;
    hasFields = true;
  }

  return hasFields ? config : undefined;
}

function normalizeComposedSkills(
  raw: Record<string, unknown>
): Record<string, ComposedSkill> {
  const skills: Record<string, ComposedSkill> = {};

  for (const [name, value] of Object.entries(raw)) {
    if (
      typeof value !== "object" ||
      value === null ||
      !("compose" in value)
    ) {
      throw new ConfigError(
        `Skill "${name}": composed skills must have a "compose" field. Add a "compose" list of skill names to this skill definition`
      );
    }
    const compose = (value as { compose: unknown }).compose;
    if (!Array.isArray(compose) || !compose.every((c) => typeof c === "string")) {
      throw new ConfigError(
        `Skill "${name}": compose must be an array of skill names`
      );
    }
    const description = (value as { description?: unknown }).description;
    if (typeof description !== "string" || description.length === 0 || description.length > 1024) {
      throw new ConfigError(
        `Skill "${name}": composed skills must have a "description" field (non-empty string, max 1024 chars). Add a description explaining what this composed skill does`
      );
    }
    const entry: ComposedSkill = { compose, description };

    const frontmatter = (value as { frontmatter?: unknown }).frontmatter;
    if (frontmatter !== undefined) {
      if (typeof frontmatter !== "object" || frontmatter === null || Array.isArray(frontmatter)) {
        throw new ConfigError(
          `Skill "${name}": frontmatter must be a YAML map of key-value pairs`
        );
      }
      entry.frontmatter = frontmatter as Record<string, unknown>;
    }

    // Parse named agent frontmatter fields
    const agentConfig = parseAgentFrontmatter(name, value as Record<string, unknown>);
    if (agentConfig) {
      entry.agentConfig = agentConfig;
    }

    skills[name] = entry;
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
  const allNames = Object.keys(skills);
  for (const [name, skill] of Object.entries(skills)) {
    if (isComposed(skill)) {
      for (const ref of skill.compose) {
        if (!(ref in skills)) {
          const hint = didYouMean(ref, allNames);
          throw new ConfigError(
            `Skill "${name}" composes unknown skill "${ref}"${hint}`
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

  if (!raw.skills.atomic && !raw.skills.composed) {
    throw new ConfigError(
      "Skills must have 'atomic' and/or 'composed' sub-sections"
    );
  }

  let skills: Record<string, SkillEntry> = {};

  if (raw.skills.atomic !== undefined) {
    if (typeof raw.skills.atomic !== "object" || raw.skills.atomic === null) {
      throw new ConfigError("skills.atomic must be an object");
    }
    skills = normalizeAtomicSkills(raw.skills.atomic as Record<string, unknown>);
  }

  if (raw.skills.composed !== undefined) {
    if (typeof raw.skills.composed !== "object" || raw.skills.composed === null) {
      throw new ConfigError("skills.composed must be an object");
    }
    const composed = normalizeComposedSkills(raw.skills.composed as Record<string, unknown>);
    for (const name of Object.keys(composed)) {
      if (name in skills) {
        throw new ConfigError(
          `Skill "${name}" appears in both atomic and composed sections`
        );
      }
    }
    skills = { ...skills, ...composed };
  }

  validateNames(skills);

  const result: RawConfig = { name: raw.name, skills };

  // Parse top-level resources
  if (raw.resources !== undefined) {
    result.resources = parseTopLevelResources(raw.resources);
  }

  // Check for deprecated skill-level resources and merge into top-level
  let mergedResources: Record<string, Record<string, string>> = result.resources ? { ...result.resources } : {};
  let hasSkillLevelResources = false;
  for (const [name, skill] of Object.entries(skills)) {
    if (isAtomic(skill) && skill.resources && Object.keys(skill.resources).length > 0) {
      hasSkillLevelResources = true;
      process.stderr.write(
        `Warning: resources on skills.atomic.${name} is deprecated, move to top-level "resources" section\n`
      );
      // Skill-level provides defaults; top-level overrides
      if (!(name in mergedResources)) {
        mergedResources[name] = { ...skill.resources };
      } else {
        mergedResources[name] = { ...skill.resources, ...mergedResources[name] };
      }
    }
  }
  if (Object.keys(mergedResources).length > 0) {
    result.resources = mergedResources;
  } else if (hasSkillLevelResources) {
    result.resources = mergedResources;
  }

  if (raw.state !== undefined) {
    if (typeof raw.state !== "object" || raw.state === null) {
      throw new ConfigError("State must be a YAML object");
    }
    result.rawState = raw.state as Record<string, unknown>;
  }

  if (raw.graph !== undefined) {
    throw new ConfigError(
      "Top-level 'graph' is no longer supported. Move it to 'team.flow'."
    );
  }

  if (raw.orchestrator !== undefined) {
    throw new ConfigError(
      "Top-level 'orchestrator' is no longer supported. Move it to 'team.orchestrator'."
    );
  }

  if (raw.team !== undefined) {
    if (typeof raw.team !== "object" || raw.team === null) {
      throw new ConfigError("Team must be a YAML object");
    }
    if (!raw.team.flow) {
      throw new ConfigError("Team must have a 'flow' field");
    }
    if (!Array.isArray(raw.team.flow)) {
      throw new ConfigError("team.flow must be a YAML array");
    }
    const rawTeam: NonNullable<RawConfig["rawTeam"]> = { rawFlow: raw.team.flow };
    if (raw.team.orchestrator !== undefined) {
      if (typeof raw.team.orchestrator !== "string") {
        throw new ConfigError("team.orchestrator must be a string (skill name)");
      }
      rawTeam.orchestrator = raw.team.orchestrator;
    }
    result.rawTeam = rawTeam;
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

  if (raw.resources && Object.keys(raw.resources).length > 0) {
    config.resources = raw.resources;
  }

  if (raw.rawState !== undefined) {
    const skillsForState: Record<string, { resources?: Record<string, string> }> = {};
    for (const [name, skill] of Object.entries(raw.skills)) {
      if (config.resources && config.resources[name]) {
        skillsForState[name] = { resources: config.resources[name] };
      } else if (isAtomic(skill) && skill.resources) {
        skillsForState[name] = { resources: skill.resources };
      } else {
        skillsForState[name] = {};
      }
    }
    config.state = parseState(raw.rawState, skillsForState);
  }

  if (raw.rawTeam !== undefined) {
    // Use the pre-resolved graph (with sub-flow data) if available,
    // otherwise parse from the raw flow YAML.
    const graph = raw._resolvedGraph ?? parseGraph(raw.rawTeam.rawFlow);
    validateGraph(graph, raw.skills, config.state);
    const team: TeamConfig = { flow: graph };

    if (raw.rawTeam.orchestrator !== undefined) {
      if (!(raw.rawTeam.orchestrator in raw.skills)) {
        const hint = didYouMean(raw.rawTeam.orchestrator, Object.keys(raw.skills));
        throw new ConfigError(
          `Orchestrator references unknown skill "${raw.rawTeam.orchestrator}"${hint}`
        );
      }
      team.orchestrator = raw.rawTeam.orchestrator;
    }

    config.team = team;
  }

  return config;
}

// Rebase imported atomic skill paths from importDir-relative to targetDir-relative.
// Remote (https://) and npm: paths are left unchanged.
function rebaseSkillPaths(
  skills: Record<string, SkillEntry>,
  importDir: string,
  targetDir: string,
): Record<string, SkillEntry> {
  const result: Record<string, SkillEntry> = {};
  for (const [name, skill] of Object.entries(skills)) {
    if (isAtomic(skill) && !skill.path.startsWith("https://") && !isNpmRef(skill.path)) {
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

function mergeResources(
  base: Record<string, Record<string, string>> | undefined,
  overlay: Record<string, Record<string, string>> | undefined,
): Record<string, Record<string, string>> | undefined {
  if (!base) return overlay;
  if (!overlay) return base;
  const merged = { ...base };
  for (const [group, resources] of Object.entries(overlay)) {
    merged[group] = group in merged
      ? { ...merged[group], ...resources }
      : { ...resources };
  }
  return merged;
}

// Derive the local config filename from the main config path.
// skillfold.yaml -> skillfold.local.yaml
// my-pipeline.yaml -> my-pipeline.local.yaml
export function getLocalConfigName(configPath: string): string {
  const base = basename(configPath);
  const ext = extname(base);
  const name = base.slice(0, -ext.length);
  return `${name}.local${ext}`;
}

// Parse a local override config. Unlike parseRawConfig, this does not require
// a name field or a skills section - any section is optional.
function parseLocalConfig(content: string): Partial<RawConfig> {
  const raw = parse(content);
  if (typeof raw !== "object" || raw === null) {
    throw new ConfigError("Local config must be a YAML object");
  }

  const result: Partial<RawConfig> = {};

  if (raw.imports !== undefined) {
    throw new ConfigError(
      "Local config cannot have imports. Imports come from the main config only."
    );
  }

  if (raw.skills !== undefined) {
    if (typeof raw.skills !== "object" || raw.skills === null) {
      throw new ConfigError("Local config: skills must be an object");
    }

    let skills: Record<string, SkillEntry> = {};

    if (raw.skills.atomic !== undefined) {
      if (typeof raw.skills.atomic !== "object" || raw.skills.atomic === null) {
        throw new ConfigError("Local config: skills.atomic must be an object");
      }
      skills = normalizeAtomicSkills(raw.skills.atomic as Record<string, unknown>);
    }

    if (raw.skills.composed !== undefined) {
      if (typeof raw.skills.composed !== "object" || raw.skills.composed === null) {
        throw new ConfigError("Local config: skills.composed must be an object");
      }
      const composed = normalizeComposedSkills(raw.skills.composed as Record<string, unknown>);
      for (const name of Object.keys(composed)) {
        if (name in skills) {
          throw new ConfigError(
            `Local config: skill "${name}" appears in both atomic and composed sections`
          );
        }
      }
      skills = { ...skills, ...composed };
    }

    if (!raw.skills.atomic && !raw.skills.composed) {
      throw new ConfigError(
        "Local config: skills must have 'atomic' and/or 'composed' sub-sections"
      );
    }

    validateNames(skills);
    result.skills = skills;
  }

  if (raw.state !== undefined) {
    if (typeof raw.state !== "object" || raw.state === null) {
      throw new ConfigError("Local config: state must be a YAML object");
    }
    result.rawState = raw.state as Record<string, unknown>;
  }

  if (raw.team !== undefined) {
    if (typeof raw.team !== "object" || raw.team === null) {
      throw new ConfigError("Local config: team must be a YAML object");
    }
    if (!raw.team.flow) {
      throw new ConfigError("Local config: team must have a 'flow' field");
    }
    if (!Array.isArray(raw.team.flow)) {
      throw new ConfigError("Local config: team.flow must be a YAML array");
    }
    const rawTeam: NonNullable<RawConfig["rawTeam"]> = { rawFlow: raw.team.flow };
    if (raw.team.orchestrator !== undefined) {
      if (typeof raw.team.orchestrator !== "string") {
        throw new ConfigError("Local config: team.orchestrator must be a string (skill name)");
      }
      rawTeam.orchestrator = raw.team.orchestrator;
    }
    result.rawTeam = rawTeam;
  }

  return result;
}

// Merge a local override on top of a (possibly already import-merged) RawConfig.
function mergeLocalOverride(raw: RawConfig, localPath: string): RawConfig {
  let content: string;
  try {
    content = readFileSync(localPath, "utf-8");
  } catch {
    throw new ConfigError(`Cannot read local config file: ${localPath}`);
  }

  const local = parseLocalConfig(content);

  return {
    name: raw.name,
    skills: local.skills ? mergeSkills(raw.skills, local.skills) : raw.skills,
    resources: raw.resources,
    rawState: local.rawState !== undefined
      ? mergeRawState(raw.rawState, local.rawState)
      : raw.rawState,
    rawTeam: local.rawTeam !== undefined ? local.rawTeam : raw.rawTeam,
    _resolvedGraph: local.rawTeam !== undefined ? undefined : raw._resolvedGraph,
  };
}

// Resolve imports: load each import, merge skills and state, ignore team/imports
async function resolveImports(
  raw: RawConfig,
  baseDir: string,
): Promise<RawConfig> {
  if (!raw.imports || raw.imports.length === 0) {
    return raw;
  }

  let mergedSkills: Record<string, SkillEntry> = {};
  let mergedState: Record<string, unknown> | undefined;
  let mergedResources: Record<string, Record<string, string>> | undefined;

  for (const importPath of raw.imports) {
    let content: string;
    let importDir: string | undefined;

    if (importPath.startsWith("https://")) {
      content = await fetchRemoteConfig(importPath);
      // Remote imports keep their paths as-is (already URLs or relative to remote)
    } else if (isNpmRef(importPath)) {
      const resolved = resolveNpmImportPath(importPath, baseDir);
      importDir = dirname(resolved);
      try {
        content = readFileSync(resolved, "utf-8");
      } catch {
        throw new ConfigError(`Cannot read npm imported config: ${importPath} (resolved to ${resolved})`);
      }
    } else {
      let resolved = resolve(baseDir, importPath);
      // When running via npx, node_modules/skillfold/ won't exist in the
      // project directory. Fall back to the CLI's own package root so that
      // template-generated imports work without a local install.
      if (!existsSync(resolved) && importPath.startsWith(SELF_IMPORT_PREFIX)) {
        const tail = importPath.slice(SELF_IMPORT_PREFIX.length);
        resolved = resolve(__pkgRoot, tail);
      }
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
    mergedResources = mergeResources(mergedResources, imported.resources);
  }

  // Apply local on top (last-write-wins)
  mergedSkills = mergeSkills(mergedSkills, raw.skills);
  mergedState = mergeRawState(mergedState, raw.rawState);
  mergedResources = mergeResources(mergedResources, raw.resources);

  return {
    name: raw.name,
    skills: mergedSkills,
    resources: mergedResources,
    rawState: mergedState,
    rawTeam: raw.rawTeam,
    // imports consumed
  };
}

// Collect all SubFlowNode references from a graph node list (non-recursive into sub-flows).
function collectSubFlowNodes(nodes: GraphNode[]): SubFlowNode[] {
  const result: SubFlowNode[] = [];
  for (const node of nodes) {
    if (isSubFlowNode(node)) {
      result.push(node);
    } else if (isMapNode(node)) {
      result.push(...collectSubFlowNodes(node.flow));
    }
  }
  return result;
}

// Resolve sub-flow references: load each referenced config, merge its skills/state
// into the parent, and populate the SubFlowNode.graph with the referenced flow.
async function resolveSubFlows(
  raw: RawConfig,
  baseDir: string,
  visited?: Set<string>,
): Promise<RawConfig> {
  if (!raw.rawTeam) return raw;

  // Parse the flow to find sub-flow nodes (will be re-parsed in validateAndBuild,
  // but we need it here to discover flow: references)
  const graph = parseGraph(raw.rawTeam.rawFlow);
  const subFlowNodes = collectSubFlowNodes(graph.nodes);

  if (subFlowNodes.length === 0) return raw;

  const resolvedPaths = visited ?? new Set<string>();
  let mergedSkills = { ...raw.skills };
  let mergedState = raw.rawState ? { ...raw.rawState } : undefined;
  let mergedResources = raw.resources ? { ...raw.resources } : undefined;

  for (const sfNode of subFlowNodes) {
    const configPath = resolve(baseDir, sfNode.flow);

    // Circular sub-flow detection
    if (resolvedPaths.has(configPath)) {
      throw new ConfigError(
        `Circular sub-flow reference: "${sfNode.flow}" has already been resolved in the import chain`
      );
    }

    let content: string;
    try {
      content = readFileSync(configPath, "utf-8");
    } catch {
      throw new ConfigError(
        `Sub-flow node "${sfNode.name}": cannot read config file "${sfNode.flow}"`
      );
    }

    const subRaw = parseRawConfig(content);

    // The sub-flow config must have a team.flow section
    if (!subRaw.rawTeam) {
      throw new ConfigError(
        `Sub-flow node "${sfNode.name}": referenced config "${sfNode.flow}" has no team.flow`
      );
    }

    // Recursively resolve imports and sub-flows in the sub-config
    const subDir = dirname(configPath);
    const subMerged = await resolveImports(subRaw, subDir);
    const nextVisited = new Set(resolvedPaths);
    nextVisited.add(configPath);
    const subResolved = await resolveSubFlows(subMerged, subDir, nextVisited);

    // Rebase and merge skills from the sub-flow config
    const rebasedSkills = rebaseSkillPaths(subResolved.skills, subDir, baseDir);
    mergedSkills = mergeSkills(mergedSkills, rebasedSkills);

    // Merge state from the sub-flow config
    if (subResolved.rawState) {
      mergedState = mergeRawState(mergedState, subResolved.rawState);
    }

    // Merge resources from the sub-flow config
    mergedResources = mergeResources(mergedResources, subResolved.resources);

    // Parse the sub-flow's flow graph and attach it to the node.
    // We mutate the sfNode.graph here; this is safe because parseGraph
    // created fresh objects from the raw YAML.
    const subGraph = parseGraph(subResolved.rawTeam!.rawFlow);
    sfNode.graph = subGraph.nodes;
  }

  // Rebuild the rawFlow from the now-populated graph nodes so that
  // validateAndBuild re-parses with sub-flow data intact.
  // Instead, we store the parsed graph directly and re-parse from rawFlow.
  // The trick: we need the raw team flow to carry the sub-flow data through.
  // Since rawTeam.rawFlow is re-parsed in validateAndBuild, we need a different
  // approach: store the pre-parsed graph on the RawConfig.

  return {
    name: raw.name,
    skills: mergedSkills,
    resources: mergedResources,
    rawState: mergedState,
    rawTeam: raw.rawTeam,
    _resolvedGraph: graph,
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

  try {
    const raw = parseRawConfig(content);
    return validateAndBuild(raw);
  } catch (err) {
    if (err instanceof ConfigError && !err.message.includes(configPath)) {
      throw new ConfigError(`${configPath}: ${err.message}`);
    }
    throw err;
  }
}

// Async entry point that resolves imports before validation
export async function loadConfig(configPath: string): Promise<Config> {
  let content: string;
  try {
    content = readFileSync(configPath, "utf-8");
  } catch {
    throw new ConfigError(`Cannot read config file: ${configPath}`);
  }

  try {
    const raw = parseRawConfig(content);
    const merged = await resolveImports(raw, dirname(configPath));
    let resolved = await resolveSubFlows(merged, dirname(configPath));

    // Check for local override file (e.g. skillfold.local.yaml)
    const localName = getLocalConfigName(configPath);
    const localPath = resolve(dirname(configPath), localName);
    if (existsSync(localPath)) {
      process.stderr.write(`skillfold: using local override from ${localName}\n`);
      resolved = mergeLocalOverride(resolved, localPath);
    }

    return validateAndBuild(resolved);
  } catch (err) {
    if (err instanceof ConfigError && !err.message.includes(configPath)) {
      throw new ConfigError(`${configPath}: ${err.message}`);
    }
    throw err;
  }
}
