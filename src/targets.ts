import { existsSync } from "node:fs";
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

/** Shorten a home-relative path to ~/... for display. */
function displayPath(path: string): string {
  const home = homedir();
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

/**
 * Warn when a project skill name is also installed at the user level: the
 * tools layer both scopes at runtime, so same-named skills show up twice
 * (or shadow each other). Informational only, never a failure.
 */
export function shadowedSkillWarnings(
  manifest: Manifest,
  globalLayouts: TargetLayout[]
): string[] {
  const names = [...Object.keys(manifest.skills), ...Object.keys(manifest.compose)];
  const warnings: string[] = [];
  for (const name of names) {
    const locations = [
      ...new Set(
        globalLayouts
          .filter((layout) => existsSync(join(layout.skillsDir, name)))
          .map((layout) => displayPath(layout.skillsDir))
      ),
    ];
    if (locations.length > 0) {
      warnings.push(
        `skill "${name}" is also installed at the user level (${locations.join(", ")}); ` +
          `the tool sees both copies`
      );
    }
  }
  return warnings;
}
