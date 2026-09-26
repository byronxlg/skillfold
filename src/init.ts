import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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

const STARTER_SKILL = `---
name: hello-skillfold
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

/** Scaffold a starter manifest and example skill in `dir`. */
export function initProject(dir: string): InitResult {
  const manifestPath = join(dir, MANIFEST_FILENAME);
  if (existsSync(manifestPath)) {
    throw new ManifestError(`${manifestPath} already exists`);
  }
  const skillDir = join(dir, "skills", "hello-skillfold");
  mkdirSync(skillDir, { recursive: true });
  const skillPath = join(skillDir, "SKILL.md");
  if (!existsSync(skillPath)) {
    writeFileSync(skillPath, STARTER_SKILL);
  }
  writeFileSync(manifestPath, STARTER_MANIFEST);
  return { manifestPath, skillPath };
}
