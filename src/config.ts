import { readFileSync } from "node:fs";

import { parse } from "yaml";

import { ConfigError } from "./errors.js";
import { Graph, parseGraph, validateGraph } from "./graph.js";
import { parseState, StateSchema } from "./state.js";

export interface AtomicSkill {
  path: string;
}

export interface ComposedSkill {
  compose: string[];
}

export type SkillEntry = AtomicSkill | ComposedSkill;

export interface Config {
  name: string;
  skills: Record<string, SkillEntry>;
  state?: StateSchema;
  graph?: Graph;
  orchestrator?: string;
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
      skills[name] = { compose };
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

export function readConfig(configPath: string): Config {
  let content: string;
  try {
    content = readFileSync(configPath, "utf-8");
  } catch {
    throw new ConfigError(`Cannot read config file: ${configPath}`);
  }

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
  validateReferences(skills);
  detectCycles(skills);

  const config: Config = { name: raw.name, skills };

  if (raw.state !== undefined) {
    if (typeof raw.state !== "object" || raw.state === null) {
      throw new ConfigError("State must be a YAML object");
    }
    const skillNames = new Set(Object.keys(skills));
    config.state = parseState(raw.state as Record<string, unknown>, skillNames);
  }

  if (raw.graph !== undefined) {
    if (!Array.isArray(raw.graph)) {
      throw new ConfigError("Graph must be a YAML array");
    }
    const graph = parseGraph(raw.graph);
    validateGraph(graph, skills, config.state);
    config.graph = graph;
  }

  if (raw.orchestrator !== undefined) {
    if (typeof raw.orchestrator !== "string") {
      throw new ConfigError("Orchestrator must be a string (skill name)");
    }
    if (!(raw.orchestrator in skills)) {
      throw new ConfigError(
        `Orchestrator references unknown skill "${raw.orchestrator}"`
      );
    }
    config.orchestrator = raw.orchestrator;
  }

  return config;
}
