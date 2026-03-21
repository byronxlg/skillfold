import { join } from "node:path";

const SKILLS_PREFIX = "skills:";

export function isSkillsRef(ref: string): boolean {
  return ref.startsWith(SKILLS_PREFIX);
}

export function parseSkillsRef(ref: string): string {
  return ref.slice(SKILLS_PREFIX.length);
}

export function resolveSkillsPath(ref: string, baseDir: string): string {
  const name = parseSkillsRef(ref);
  return join(baseDir, ".skills", name);
}
