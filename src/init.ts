import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ManifestError } from "./errors.js";
import { MANIFEST_FILENAME } from "./manifest.js";

const STARTER_MANIFEST = `# skillfold.yaml - declare the skills this project uses.
#
# Sources:
#   ./skills/my-skill                          local directory
#   github:owner/repo/path/to/skill@v1.2.0     GitHub repo (tag, branch, or commit)
#   npm:package/skill-name@1.0.0               npm package
#
# Run "skillfold install" to install everything into .claude/skills
# and pin exact versions in skillfold.lock.

skills:
  hello-skillfold: ./skills/hello-skillfold

# Composed skills concatenate other skills into one:
#
# compose:
#   reviewer:
#     description: Review code and its tests together.
#     use: [code-review, testing]
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
