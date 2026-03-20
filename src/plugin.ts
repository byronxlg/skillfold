import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "./config.js";
import { compile } from "./compiler.js";
import { resolveSkills } from "./resolver.js";

interface PluginJson {
  name: string;
  version: string;
  description: string;
  author: string;
  repository: string;
  keywords: string[];
}

/**
 * Generate a slash command markdown file for the orchestrator.
 * This provides a /pipeline-name command in Claude Code.
 */
function generateCommand(pipelineName: string): string {
  return `---
description: Run the ${pipelineName} pipeline
allowed-tools: Bash, Read, Write, Glob, Grep
---

# /${pipelineName}

Run the **${pipelineName}** pipeline. This command coordinates the team flow
defined in the pipeline configuration.

Use \`npx skillfold list\` to see the pipeline structure or
\`npx skillfold validate\` to check config validity.
`;
}

/**
 * Build a distributable Claude Code plugin from a pipeline config.
 *
 * Output structure:
 *   {outDir}/
 *     .claude-plugin/plugin.json
 *     agents/{name}.md
 *     skills/{name}/SKILL.md
 *     commands/{pipeline-name}.md  (if orchestrator defined)
 */
export async function buildPlugin(
  configPath: string,
  outDir: string,
  version: string,
): Promise<void> {
  const config = await loadConfig(configPath);
  const baseDir = dirname(configPath);
  const bodies = await resolveSkills(config, baseDir);
  const configFile = basename(configPath);

  // Compile with claude-code target into the output directory
  const results = compile(config, bodies, outDir, version, configFile, "claude-code");

  // Write plugin.json
  const pluginJson: PluginJson = {
    name: config.name,
    version,
    description: `Claude Code plugin generated from ${config.name} pipeline`,
    author: "",
    repository: "",
    keywords: ["skillfold", "pipeline", config.name],
  };

  const pluginDir = join(outDir, ".claude-plugin");
  mkdirSync(pluginDir, { recursive: true });
  writeFileSync(
    join(pluginDir, "plugin.json"),
    JSON.stringify(pluginJson, null, 2) + "\n",
    "utf-8",
  );

  // Generate orchestrator command if configured
  if (config.team?.orchestrator) {
    const commandsDir = join(outDir, "commands");
    mkdirSync(commandsDir, { recursive: true });
    writeFileSync(
      join(commandsDir, `${config.name}.md`),
      generateCommand(config.name),
      "utf-8",
    );
  }

  console.log(`skillfold: built plugin ${config.name}`);
  for (const result of results) {
    console.log(`  -> ${result.path}`);
  }
  console.log(`  -> ${join(pluginDir, "plugin.json")}`);
  if (config.team?.orchestrator) {
    console.log(`  -> ${join(outDir, "commands", `${config.name}.md`)}`);
  }
}
