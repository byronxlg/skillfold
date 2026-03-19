import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { type Config, isAtomic } from "./config.js";
import { ResolveError } from "./errors.js";
import { fetchRemoteSkill } from "./remote.js";

export function stripFrontmatter(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("---\n") || trimmed.startsWith("---\r\n")) {
    const endIndex = trimmed.indexOf("\n---", 3);
    if (endIndex !== -1) {
      return trimmed.slice(endIndex + 4).trim();
    }
  }
  return trimmed;
}

export async function resolveSkills(
  config: Config,
  baseDir: string
): Promise<Map<string, string>> {
  const bodies = new Map<string, string>();
  const remotePromises: { name: string; promise: Promise<string> }[] = [];

  for (const [name, skill] of Object.entries(config.skills)) {
    if (!isAtomic(skill)) continue;

    if (skill.path.startsWith("https://")) {
      remotePromises.push({
        name,
        promise: fetchRemoteSkill(name, skill.path),
      });
      continue;
    }

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

    bodies.set(name, stripFrontmatter(content));
  }

  if (remotePromises.length > 0) {
    const results = await Promise.all(
      remotePromises.map(({ name, promise }) =>
        promise.then((content) => ({ name, content }))
      )
    );
    for (const { name, content } of results) {
      bodies.set(name, stripFrontmatter(content));
    }
  }

  return bodies;
}
