import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildPlugin } from "./plugin.js";

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `skillfold-plugin-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeConfig(dir: string, config: string): string {
  const configPath = join(dir, "skillfold.yaml");
  writeFileSync(configPath, config, "utf-8");
  return configPath;
}

function writeSkill(dir: string, name: string, content: string): void {
  const skillDir = join(dir, "skills", name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), content, "utf-8");
}

describe("buildPlugin", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("generates plugin.json in .claude-plugin directory", async () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "plugin-out");

    writeSkill(tmpDir, "planning", "---\nname: planning\ndescription: Plan.\n---\n\nPlan body.");
    const configPath = writeConfig(tmpDir, `
name: test-plugin
skills:
  atomic:
    planning: ./skills/planning
  composed:
    planner:
      compose: [planning]
      description: "Plans the work."
`);

    await buildPlugin(configPath, outDir, "2.0.0");

    const pluginJsonPath = join(outDir, ".claude-plugin", "plugin.json");
    assert.ok(existsSync(pluginJsonPath));

    const pluginJson = JSON.parse(readFileSync(pluginJsonPath, "utf-8"));
    assert.equal(pluginJson.name, "test-plugin");
    assert.equal(pluginJson.version, "2.0.0");
    assert.ok(pluginJson.keywords.includes("skillfold"));
  });

  it("generates skills in skills/ subdirectory", async () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "plugin-out");

    writeSkill(tmpDir, "planning", "---\nname: planning\ndescription: Plan.\n---\n\nPlan body.");
    const configPath = writeConfig(tmpDir, `
name: test-plugin
skills:
  atomic:
    planning: ./skills/planning
  composed:
    planner:
      compose: [planning]
      description: "Plans the work."
`);

    await buildPlugin(configPath, outDir, "1.0.0");

    assert.ok(existsSync(join(outDir, "skills", "planner", "SKILL.md")));
  });

  it("generates agents in agents/ subdirectory", async () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "plugin-out");

    writeSkill(tmpDir, "planning", "---\nname: planning\ndescription: Plan.\n---\n\nPlan body.");
    const configPath = writeConfig(tmpDir, `
name: test-plugin
skills:
  atomic:
    planning: ./skills/planning
  composed:
    planner:
      compose: [planning]
      description: "Plans the work."
`);

    await buildPlugin(configPath, outDir, "1.0.0");

    assert.ok(existsSync(join(outDir, "agents", "planner.md")));
  });

  it("generates orchestrator command when orchestrator is configured", async () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "plugin-out");

    writeSkill(tmpDir, "planning", "---\nname: planning\ndescription: Plan.\n---\n\nPlan body.");
    writeSkill(tmpDir, "coding", "---\nname: coding\ndescription: Code.\n---\n\nCode body.");
    const configPath = writeConfig(tmpDir, `
name: my-pipeline
skills:
  atomic:
    planning: ./skills/planning
    coding: ./skills/coding
  composed:
    planner:
      compose: [planning]
      description: "Plans the work."
    engineer:
      compose: [planning, coding]
      description: "Writes code."
    orchestrator:
      compose: [planning]
      description: "Coordinates."
team:
  orchestrator: orchestrator
  flow:
    - planner:
        writes: [state.plan]
      then: engineer
    - engineer:
        reads: [state.plan]
state:
  plan:
    type: string
`);

    await buildPlugin(configPath, outDir, "1.0.0");

    const commandPath = join(outDir, "commands", "my-pipeline.md");
    assert.ok(existsSync(commandPath));

    const content = readFileSync(commandPath, "utf-8");
    assert.ok(content.includes("description: Run the my-pipeline pipeline"));
    assert.ok(content.includes("# /my-pipeline"));
  });

  it("does not generate command when no orchestrator is configured", async () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "plugin-out");

    writeSkill(tmpDir, "planning", "---\nname: planning\ndescription: Plan.\n---\n\nPlan body.");
    const configPath = writeConfig(tmpDir, `
name: test-plugin
skills:
  atomic:
    planning: ./skills/planning
  composed:
    planner:
      compose: [planning]
      description: "Plans the work."
`);

    await buildPlugin(configPath, outDir, "1.0.0");

    assert.ok(!existsSync(join(outDir, "commands")));
  });
});
