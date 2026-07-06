import { homedir } from "node:os";
import { join, resolve as resolvePath } from "node:path";

import {
  DEFAULT_RULES_DIR,
  DEFAULT_SKILLS_DIR,
  type Manifest,
  type TargetName,
} from "./manifest.js";

/**
 * Install targets. Skills use the same SKILL.md format everywhere, so a
 * target is just a set of install locations:
 *
 *   claude  skills -> .claude/skills, rules -> .claude/rules
 *           (~/.claude/skills and ~/.claude/rules in global mode)
 *   codex   skills -> .agents/skills (~/.agents/skills in global mode),
 *           rules -> a managed block in AGENTS.md (~/.codex/AGENTS.md in
 *           global mode), which is what Codex reads instead of a rules dir
 *
 * skillsDir / rulesDir in the manifest override the claude locations only;
 * codex scans fixed conventional paths, so those stay put.
 */

export interface TargetLayout {
  target: TargetName;
  /** Absolute skills directory. */
  skillsDir: string;
  /** Absolute rules directory (claude). */
  rulesDir?: string;
  /** Absolute path of the AGENTS.md carrying the managed rules block (codex). */
  agentsMdPath?: string;
}

/** Targets declared in the manifest; claude when unset. */
export function resolveTargets(manifest: Manifest): TargetName[] {
  return manifest.targets ?? ["claude"];
}

export function targetLayouts(
  manifest: Manifest,
  root: string,
  globalMode: boolean,
  env: NodeJS.ProcessEnv = process.env
): TargetLayout[] {
  return resolveTargets(manifest).map((target): TargetLayout => {
    if (target === "claude") {
      const skills = manifest.skillsDir ?? (globalMode ? "skills" : DEFAULT_SKILLS_DIR);
      const rules = manifest.rulesDir ?? (globalMode ? "rules" : DEFAULT_RULES_DIR);
      return {
        target,
        skillsDir: resolvePath(root, skills),
        rulesDir: resolvePath(root, rules),
      };
    }
    // codex
    if (globalMode) {
      const codexHome = env.CODEX_HOME ?? join(homedir(), ".codex");
      return {
        target,
        skillsDir: join(homedir(), ".agents", "skills"),
        agentsMdPath: join(codexHome, "AGENTS.md"),
      };
    }
    return {
      target,
      skillsDir: resolvePath(root, ".agents/skills"),
      agentsMdPath: resolvePath(root, "AGENTS.md"),
    };
  });
}
