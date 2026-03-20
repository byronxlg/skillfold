#!/usr/bin/env node
// Copies library skills into plugin/skills/ for the Claude Code plugin.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const skills = [
  "code-review",
  "code-writing",
  "decision-making",
  "file-management",
  "github-workflow",
  "planning",
  "research",
  "skillfold-cli",
  "summarization",
  "testing",
  "writing",
];

for (const skill of skills) {
  const dest = join(root, "plugin", "skills", skill);
  mkdirSync(dest, { recursive: true });
  copyFileSync(
    join(root, "library", "skills", skill, "SKILL.md"),
    join(dest, "SKILL.md"),
  );
}

// Update plugin.json version from package.json
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
const pluginJsonPath = join(root, "plugin", ".claude-plugin", "plugin.json");
const pluginJson = JSON.parse(readFileSync(pluginJsonPath, "utf-8"));
pluginJson.version = pkg.version;
mkdirSync(dirname(pluginJsonPath), { recursive: true });
writeFileSync(pluginJsonPath, JSON.stringify(pluginJson, null, 2) + "\n");

console.log(`skillfold: built plugin (${skills.length} skills, v${pkg.version})`);
