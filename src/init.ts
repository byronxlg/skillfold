import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ManifestError } from "./errors.js";
import { MANIFEST_FILENAME } from "./manifest.js";

const STARTER_MANIFEST = `# skillfold.yaml - declare the skills this project uses, then run
# "skillfold install" to install them and pin exact revisions in skillfold.lock.
# Commit both files: anyone who clones the repo gets byte-identical skills.
#
# Commands (add -g to manage user-level config in ~/.config/skillfold instead):
#
#   skillfold install             install every declared skill, write the lockfile
#   skillfold add <source>        add a skill to this file and install it
#   skillfold remove <name>       remove a skill and uninstall it
#   skillfold list                show declared skills and their status
#   skillfold info <name>         show details for one skill
#   skillfold check               verify manifest, lockfile, and installed skills agree
#   skillfold update [name...]    re-resolve pinned refs to their latest revision
#   skillfold search <query>      find published skills on npm
#
# Install targets - the agents these skills are installed for. Claude Code only
# when unset. Uncomment and edit the targets line below to change it:
#
#   claude  .claude/skills, .claude/rules
#   codex   .agents/skills, a managed rules block in AGENTS.md
#   cursor  .cursor/skills, .cursor/rules
#
# targets: [claude, codex, cursor]
#
# Sources:
#   ./skills/my-skill                          local directory
#   github:owner/repo/path/to/skill@v1.2.0     GitHub repo (tag, branch, or commit)
#   npm:package/skill-name@1.0.0               npm package
#
# Skills worth starting with:
#   skillfold add npm:skillfold/planning           break work into a plan before coding
#   skillfold add npm:skillfold/code-review        review a diff before it ships
#   skillfold add npm:skillfold/testing            write and run tests
#   skillfold add npm:skillfold/github-workflow    branches, commits, and pull requests

skills:
  # How to drive the skillfold CLI, installed for your agent so it can manage
  # this file for you. Remove it once you would rather read the docs yourself.
  skillfold: ./skills/skillfold

# Composed skills concatenate other skills into one:
#
# compose:
#   reviewer:
#     description: Review code and its tests together.
#     use: [code-review, testing]

# Rules are single markdown files, always-on instructions rather than skills:
#
# rules:
#   style: ./rules/style.md
`;

/** Name the scaffolded skill is declared and installed under. */
const STARTER_SKILL_NAME = "skillfold";

/**
 * The scaffolded skill teaches an agent to drive this CLI, so it is the
 * library's skillfold-cli skill renamed. Reading the shipped copy keeps the
 * two from drifting; the fallback covers an install missing library/.
 */
const FALLBACK_SKILL = `---
name: ${STARTER_SKILL_NAME}
description: Use the skillfold CLI to manage this project's agent skills. Declare them in skillfold.yaml, install them, and commit skillfold.lock.
---

# Skillfold

Skills for this project are declared in \`skillfold.yaml\` and pinned in
\`skillfold.lock\`. Add one with \`skillfold add <source>\`, install everything
with \`skillfold install\`, and commit both files. Never edit installed skills
under the agent directories; edit the source and reinstall.

Full reference: https://byronxlg.com/skillfold/
`;

function starterSkill(): string {
  try {
    const library = readFileSync(
      new URL("../library/skills/skillfold-cli/SKILL.md", import.meta.url),
      "utf-8"
    );
    return library.replace(/^name: .*$/m, `name: ${STARTER_SKILL_NAME}`);
  } catch {
    return FALLBACK_SKILL;
  }
}

export interface InitResult {
  manifestPath: string;
  skillPath: string;
}

/** Scaffold a starter manifest and the skillfold usage skill in `dir`. */
export function initProject(dir: string): InitResult {
  const manifestPath = join(dir, MANIFEST_FILENAME);
  if (existsSync(manifestPath)) {
    throw new ManifestError(`${manifestPath} already exists`);
  }
  const skillDir = join(dir, "skills", STARTER_SKILL_NAME);
  mkdirSync(skillDir, { recursive: true });
  const skillPath = join(skillDir, "SKILL.md");
  if (!existsSync(skillPath)) {
    writeFileSync(skillPath, starterSkill());
  }
  writeFileSync(manifestPath, STARTER_MANIFEST);
  return { manifestPath, skillPath };
}
