import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const __pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SELF_IMPORT_PREFIX = "node_modules/skillfold/";

import { ConfigError, didYouMean } from "./errors.js";
import { Graph, GraphNode, isSubFlowNode, parseGraph, validateGraph } from "./graph.js";
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
  state?: StateSchema;
  team?: TeamConfig;
}

export interface RawConfig {
  name: string;
  skills: Record<string, SkillEntry>;
  rawState?: Record<string, unknown>;
  rawTeam?: {
    orchestrator?: string;
    rawFlow: unknown[];
  };
  imports?: string[];
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

// Variant of validateAndBuild that uses a pre-parsed/resolved graph (for sub-flow support)
function validateAndBuildWithGraph(raw: RawConfig, graph: Graph): Config {
  validateReferences(raw.skills);
  detectCycles(raw.skills);

  const config: Config = { name: raw.name, skills: raw.skills };

  if (raw.rawState !== undefined) {
    const skillsForState: Record<string, { resources?: Record<string, string> }> = {};
    for (const [name, skill] of Object.entries(raw.skills)) {
      skillsForState[name] = isAtomic(skill) ? { resources: skill.resources } : {};
    }
    config.state = parseState(raw.rawState, skillsForState);
  }

  validateGraph(graph, raw.skills, config.state);
  const team: TeamConfig = { flow: graph };

  if (raw.rawTeam?.orchestrator !== undefined) {
    if (!(raw.rawTeam.orchestrator in raw.skills)) {
      const hint = didYouMean(raw.rawTeam.orchestrator, Object.keys(raw.skills));
      throw new ConfigError(
        `Orchestrator references unknown skill "${raw.rawTeam.orchestrator}"${hint}`
      );
    }
    team.orchestrator = raw.rawTeam.orchestrator;
  }

  config.team = team;
  return config;
}

// Phase 2: Run full validation on a (possibly merged) RawConfig
export function validateAndBuild(raw: RawConfig): Config {
  validateReferences(raw.skills);
  detectCycles(raw.skills);

  const config: Config = { name: raw.name, skills: raw.skills };

  if (raw.rawState !== undefined) {
    const skillsForState: Record<string, { resources?: Record<string, string> }> = {};
    for (const [name, skill] of Object.entries(raw.skills)) {
      skillsForState[name] = isAtomic(skill) ? { resources: skill.resources } : {};
    }
    config.state = parseState(raw.rawState, skillsForState);
  }

  if (raw.rawTeam !== undefined) {
    const graph = parseGraph(raw.rawTeam.rawFlow);
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
      const rebasedSkill: AtomicSkill = { path: rebased };
      if (skill.resources) {
        rebasedSkill.resources = skill.resources;
      }
      result[name] = rebasedSkill;
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

  for (const importPath of raw.imports) {
    let content: string;
    let importDir: string | undefined;

    if (importPath.startsWith("https://")) {
      content = await fetchRemoteConfig(importPath);
      // Remote imports keep their paths as-is (already URLs or relative to remote)
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
  }

  // Apply local on top (last-write-wins)
  mergedSkills = mergeSkills(mergedSkills, raw.skills);
  mergedState = mergeRawState(mergedState, raw.rawState);

  return {
    name: raw.name,
    skills: mergedSkills,
    rawState: mergedState,
    rawTeam: raw.rawTeam,
    // imports consumed
  };
}

// Resolve sub-flow nodes in a parsed graph: load referenced configs, merge skills/state, populate inner graphs
async function resolveSubFlowsInGraph(
  nodes: GraphNode[],
  raw: RawConfig,
  baseDir: string,
  loadChain: string[] = [],
): Promise<void> {
  for (const node of nodes) {
    if (!isSubFlowNode(node)) continue;

    const flowPath = node.flow;

    // Resolve the config path
    let resolvedPath: string;
    if (flowPath.startsWith("https://")) {
      resolvedPath = flowPath;
    } else {
      resolvedPath = resolve(baseDir, flowPath);
      if (!existsSync(resolvedPath) && flowPath.startsWith(SELF_IMPORT_PREFIX)) {
        const tail = flowPath.slice(SELF_IMPORT_PREFIX.length);
        resolvedPath = resolve(__pkgRoot, tail);
      }
    }

    // Cycle detection
    const normalizedPath = flowPath.startsWith("https://") ? flowPath : resolvedPath;
    if (loadChain.includes(normalizedPath)) {
      const cycle = [...loadChain, normalizedPath].join(" -> ");
      throw new ConfigError(`Circular sub-flow reference: ${cycle}`);
    }

    // Load the referenced config
    let content: string;
    if (flowPath.startsWith("https://")) {
      content = await fetchRemoteConfig(flowPath);
    } else {
      try {
        content = readFileSync(resolvedPath, "utf-8");
      } catch {
        throw new ConfigError(
          `Sub-flow "${node.name}": cannot read config: ${resolvedPath}`
        );
      }
    }

    const imported = parseRawConfig(content);
    const importDir = flowPath.startsWith("https://") ? undefined : dirname(resolvedPath);

    // The imported config must have a team.flow
    if (!imported.rawTeam?.rawFlow || !Array.isArray(imported.rawTeam.rawFlow) || imported.rawTeam.rawFlow.length === 0) {
      throw new ConfigError(
        `Sub-flow "${node.name}": referenced config "${flowPath}" has no team.flow`
      );
    }

    // Merge skills (rebase paths if local)
    const skills = importDir
      ? rebaseSkillPaths(imported.skills, importDir, baseDir)
      : imported.skills;
    raw.skills = mergeSkills(raw.skills, skills);

    // Merge state
    raw.rawState = mergeRawState(raw.rawState, imported.rawState);

    // Parse the imported flow and populate the sub-flow node's graph
    const subGraph = parseGraph(imported.rawTeam.rawFlow);
    node.graph = subGraph.nodes;

    // Recursively resolve any sub-flows within the imported flow
    await resolveSubFlowsInGraph(
      node.graph,
      raw,
      importDir ?? baseDir,
      [...loadChain, normalizedPath],
    );
  }
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

    // If the config has a team flow, parse it, resolve sub-flows, then validate with the resolved graph
    if (merged.rawTeam?.rawFlow) {
      const graph = parseGraph(merged.rawTeam.rawFlow);
      await resolveSubFlowsInGraph(graph.nodes, merged, dirname(configPath));
      return validateAndBuildWithGraph(merged, graph);
    }

    return validateAndBuild(merged);
  } catch (err) {
    if (err instanceof ConfigError && !err.message.includes(configPath)) {
      throw new ConfigError(`${configPath}: ${err.message}`);
    }
    throw err;
  }
}
