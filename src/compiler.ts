import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Config, isComposed } from "./config.js";
import { CompileError } from "./errors.js";

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
    const output = parts.join("\n\n");
    const outPath = join(outDir, `${name}.md`);

    writeFileSync(outPath, output + "\n", "utf-8");
    results.push({ name, path: outPath });
  }

  return results;
}
