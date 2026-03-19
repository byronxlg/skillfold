import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { type Config, isAtomic } from "./config.js";
import { ResolveError } from "./errors.js";

export function resolveSkills(
  config: Config,
  baseDir: string
): Map<string, string> {
  const bodies = new Map<string, string>();

  for (const [name, skill] of Object.entries(config.skills)) {
    if (!isAtomic(skill)) continue;

    const skillDir = resolve(baseDir, skill.path);
    const skillFile = join(skillDir, "SKILL.md");

    if (!existsSync(skillDir)) {
      throw new ResolveError(name, `Directory not found: ${skillDir}`);
    }

    if (!existsSync(skillFile)) {
      throw new ResolveError(name, `SKILL.md not found in ${skillDir}`);
    }

    let content: string;
    try {
      content = readFileSync(skillFile, "utf-8");
    } catch {
      throw new ResolveError(name, `Cannot read ${skillFile}`);
    }

    bodies.set(name, content.trim());
  }

  return bodies;
}
