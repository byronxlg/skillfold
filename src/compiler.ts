import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { type Config, isComposed } from "./config.js";
import { CompileError } from "./errors.js";
import { generateOrchestrator } from "./orchestrator.js";

function expand(
  name: string,
  config: Config,
  bodies: Map<string, string>,
  seen: Set<string>
): string[] {
  if (seen.has(name)) {
    throw new CompileError(name, "Circular composition during expansion");
  }

  const skill = config.skills[name];
  if (!skill) {
    throw new CompileError(name, "Unknown skill");
  }

  if (!isComposed(skill)) {
    const body = bodies.get(name);
    if (body === undefined) {
      throw new CompileError(name, "No resolved body for atomic skill");
    }
    return [body];
  }

  seen.add(name);
  const parts: string[] = [];
  for (const ref of skill.compose) {
    parts.push(...expand(ref, config, bodies, new Set(seen)));
  }
  return parts;
}

function formatFrontmatter(name: string, description: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n`;
}

export interface CompileResult {
  name: string;
  path: string;
}

export function compile(
  config: Config,
  bodies: Map<string, string>,
  outDir: string
): CompileResult[] {
  mkdirSync(outDir, { recursive: true });

  const results: CompileResult[] = [];

  for (const [name, skill] of Object.entries(config.skills)) {
    if (!isComposed(skill)) continue;

    const parts = expand(name, config, bodies, new Set());
    const body = parts.join("\n\n");
    const skillDir = join(outDir, name);
    mkdirSync(skillDir, { recursive: true });
    const outPath = join(skillDir, "SKILL.md");

    const output = formatFrontmatter(name, skill.description) + "\n" + body + "\n";
    writeFileSync(outPath, output, "utf-8");
    results.push({ name, path: outPath });
  }

  if (config.graph) {
    const orchestratorMd = generateOrchestrator(config);

    if (config.orchestrator) {
      const targetPath = join(outDir, config.orchestrator, "SKILL.md");
      const existing = readFileSync(targetPath, "utf-8");
      writeFileSync(targetPath, existing + "\n" + orchestratorMd, "utf-8");
    } else {
      const orchDir = join(outDir, "orchestrator");
      mkdirSync(orchDir, { recursive: true });
      const outPath = join(orchDir, "SKILL.md");
      writeFileSync(outPath, orchestratorMd, "utf-8");
      results.push({ name: "orchestrator", path: outPath });
    }
  }

  return results;
}
