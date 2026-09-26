import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ManifestError } from "./errors.js";
import { MANIFEST_FILENAME } from "./manifest.js";

/** The usage skill when skillfold is not installed: resolved from the registry, moved by update. */
const LATEST_STARTER = `  # How to drive this CLI, pulled from the skillfold package so your agent can
  # manage this file for you. "skillfold update skillfold" moves it forward.
  # Straight from the repo instead:
  #   github:byronxlg/skillfold/library/skills/skillfold-cli
  skillfold: npm:skillfold/skillfold-cli`;

/** The usage skill when skillfold is installed: it follows that version. */
const FOLLOWING_STARTER = `  # How to drive this CLI, pulled from the skillfold package so your agent can
  # manage this file for you. @installed keeps it at the version of skillfold
  # you have installed: upgrade skillfold, run "skillfold install", and the
  # skill follows. "skillfold check" fails if the two drift apart.
  skillfold: npm:skillfold/skillfold-cli@installed`;

const starterManifest = (usageSkill: string): string => `# skillfold.yaml - declare the skills this project uses, then run
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
# Sources:
#   ./skills/my-skill                          local directory
#   github:owner/repo/path/to/skill@v1.2.0     GitHub repo (tag, branch, or commit)
#   npm:package/skill-name@1.0.0               npm package
#   npm:package/skill-name@installed           npm package, at the version this
#                                              project has installed
#
# Skills worth starting with:
#   skillfold add npm:skillfold/planning           break work into a plan before coding
#   skillfold add npm:skillfold/code-review        review a diff before it ships
#   skillfold add npm:skillfold/testing            write and run tests
#   skillfold add npm:skillfold/github-workflow    branches, commits, and pull requests

# Install targets - the agents these skills are installed for:
#
#   claude  .claude/skills, .claude/rules
#   codex   .agents/skills, a managed rules block in AGENTS.md
#   cursor  .cursor/skills, .cursor/rules

targets: [claude]  # codex, cursor

skills:
${usageSkill}

  # An example local skill. Edit it, rename it, or drop this line.
  hello-skillfold: ./skills/hello-skillfold

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

/** Name and directory of the example skill scaffolded alongside the manifest. */
const STARTER_SKILL_NAME = "hello-skillfold";

const STARTER_SKILL = `---
name: ${STARTER_SKILL_NAME}
description: Example skill scaffolded by skillfold init. Replace it with your own.
---

# Hello from skillfold

This skill was created by \`skillfold init\`. Edit it, rename it, or remove it
from skillfold.yaml. After any change, run:

\`\`\`sh
skillfold install
\`\`\`
`;

export interface InitResult {
  manifestPath: string;
  skillPath: string;
}

export interface InitOptions {
  /**
   * skillfold is installed (a project dependency, or globally): declare the
   * usage skill as npm:skillfold/skillfold-cli@installed so it tracks the
   * CLI version instead of whatever was latest on the day of init.
   */
  followInstalled?: boolean;
}

/** Scaffold a starter manifest and example skill in `dir`. */
export function initProject(dir: string, options: InitOptions = {}): InitResult {
  const manifestPath = join(dir, MANIFEST_FILENAME);
  if (existsSync(manifestPath)) {
    throw new ManifestError(`${manifestPath} already exists`);
  }
  const skillDir = join(dir, "skills", STARTER_SKILL_NAME);
  mkdirSync(skillDir, { recursive: true });
  const skillPath = join(skillDir, "SKILL.md");
  if (!existsSync(skillPath)) {
    writeFileSync(skillPath, STARTER_SKILL);
  }
  writeFileSync(manifestPath, starterManifest(options.followInstalled ? FOLLOWING_STARTER : LATEST_STARTER));
  return { manifestPath, skillPath };
}
