import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { readConfig } from "./config.js";
import { compile } from "./compiler.js";
import { resolveSkills } from "./resolver.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, "..", "test", "fixtures", "dev-pipeline");
const configPath = join(fixtureDir, "skillfold.yaml");

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `skillfold-e2e-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Assert that all substrings appear in content, in the given order.
 * Reports which substring failed and its expected position relative to the previous match.
 */
function assertOrderedSubstrings(content: string, substrings: string[]): void {
  let lastIndex = -1;
  for (const sub of substrings) {
    const idx = content.indexOf(sub, lastIndex + 1);
    assert.ok(
      idx > lastIndex,
      `Expected "${sub}" to appear after index ${lastIndex} in content, but ${idx === -1 ? "it was not found" : `found at ${idx}`}`
    );
    lastIndex = idx;
  }
}

describe("e2e: dev-pipeline", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("reads config, resolves skills, and compiles without errors", () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");

    const config = readConfig(configPath);
    const bodies = resolveSkills(config, fixtureDir);
    const results = compile(config, bodies, outDir);

    assert.ok(results.length > 0);
  });

  it("produces output files for all composed skills", () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");

    const config = readConfig(configPath);
    const bodies = resolveSkills(config, fixtureDir);
    compile(config, bodies, outDir);

    const expected = [
      "strategy.md",
      "tech-lead.md",
      "senior-engineer.md",
      "reviewer.md",
      "orchestrator.md",
    ];

    for (const file of expected) {
      assert.ok(
        existsSync(join(outDir, file)),
        `Expected output file "${file}" to exist`
      );
    }
  });

  it("strategy.md contains Strategic Thinking then Slack Integration", () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");

    const config = readConfig(configPath);
    const bodies = resolveSkills(config, fixtureDir);
    compile(config, bodies, outDir);

    const content = readFileSync(join(outDir, "strategy.md"), "utf-8");
    assertOrderedSubstrings(content, [
      "Strategic Thinking",
      "Slack Integration",
    ]);
  });

  it("tech-lead.md contains all four skills in order", () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");

    const config = readConfig(configPath);
    const bodies = resolveSkills(config, fixtureDir);
    compile(config, bodies, outDir);

    const content = readFileSync(join(outDir, "tech-lead.md"), "utf-8");
    assertOrderedSubstrings(content, [
      "Strategic Thinking",
      "Task Decomposition",
      "Slack Integration",
      "Jira Integration",
    ]);
  });

  it("senior-engineer.md contains Task Decomposition then Code Generation", () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");

    const config = readConfig(configPath);
    const bodies = resolveSkills(config, fixtureDir);
    compile(config, bodies, outDir);

    const content = readFileSync(join(outDir, "senior-engineer.md"), "utf-8");
    assertOrderedSubstrings(content, [
      "Task Decomposition",
      "Code Generation",
    ]);
  });

  it("reviewer.md contains Code Review", () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");

    const config = readConfig(configPath);
    const bodies = resolveSkills(config, fixtureDir);
    compile(config, bodies, outDir);

    const content = readFileSync(join(outDir, "reviewer.md"), "utf-8");
    assert.ok(
      content.includes("Code Review"),
      "reviewer.md should contain Code Review"
    );
  });

  it("orchestrator.md contains composed bodies before orchestrator plan", () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");

    const config = readConfig(configPath);
    const bodies = resolveSkills(config, fixtureDir);
    compile(config, bodies, outDir);

    const content = readFileSync(join(outDir, "orchestrator.md"), "utf-8");

    // Composed bodies (Slack, Confluence, Jira) should appear before the orchestrator header
    assertOrderedSubstrings(content, [
      "Slack Integration",
      "Confluence Integration",
      "Jira Integration",
      "# Orchestrator: dev-pipeline",
    ]);
  });

  it("orchestrator.md contains pipeline header and description", () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");

    const config = readConfig(configPath);
    const bodies = resolveSkills(config, fixtureDir);
    compile(config, bodies, outDir);

    const content = readFileSync(join(outDir, "orchestrator.md"), "utf-8");

    assert.ok(content.includes("# Orchestrator: dev-pipeline"));
    assert.ok(content.includes("**dev-pipeline** pipeline"));
  });

  it("orchestrator.md contains state table with correct fields and locations", () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");

    const config = readConfig(configPath);
    const bodies = resolveSkills(config, fixtureDir);
    compile(config, bodies, outDir);

    const content = readFileSync(join(outDir, "orchestrator.md"), "utf-8");

    assert.ok(content.includes("## State"));
    assert.ok(content.includes("| Field | Type | Location |"));
    assert.ok(
      content.includes("| goal | string | slack: dev-pipeline-channel |")
    );
    assert.ok(
      content.includes(
        "| plan | string | slack: dev-pipeline-channel (reply) |"
      )
    );
    assert.ok(
      content.includes("| tasks | list<Task> | jira: DEV/dev-board |")
    );
  });

  it("orchestrator.md contains execution plan with correct steps", () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");

    const config = readConfig(configPath);
    const bodies = resolveSkills(config, fixtureDir);
    compile(config, bodies, outDir);

    const content = readFileSync(join(outDir, "orchestrator.md"), "utf-8");

    assert.ok(content.includes("## Execution Plan"));

    // Step 1: strategy
    assert.ok(content.includes("### Step 1: strategy"));
    assert.ok(content.includes("Invoke **strategy**."));
    assert.ok(content.includes("Writes: `state.goal`"));
    assert.ok(content.includes("Then: proceed to step 2."));

    // Step 2: tech-lead
    assert.ok(content.includes("### Step 2: tech-lead"));
    assert.ok(content.includes("Invoke **tech-lead**."));
    assert.ok(content.includes("Reads: `state.goal`"));
    assert.ok(content.includes("Writes: `state.plan`, `state.tasks`"));
    assert.ok(content.includes("Then: proceed to step 3."));

    // Step 3: map over state.tasks
    assert.ok(content.includes("### Step 3: map over state.tasks"));
    assert.ok(
      content.includes(
        "For each item in `state.tasks` (as `task`), run the following subgraph:"
      )
    );
  });

  it("orchestrator.md contains map subgraph steps with correct sub-numbering", () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");

    const config = readConfig(configPath);
    const bodies = resolveSkills(config, fixtureDir);
    compile(config, bodies, outDir);

    const content = readFileSync(join(outDir, "orchestrator.md"), "utf-8");

    // Step 3.1: senior-engineer
    assert.ok(content.includes("#### Step 3.1: senior-engineer"));
    assert.ok(content.includes("Invoke **senior-engineer**."));
    assert.ok(content.includes("Reads: `task.description`"));
    assert.ok(content.includes("Writes: `task.output`"));
    assert.ok(content.includes("Then: proceed to step 3.2."));

    // Step 3.2: reviewer
    assert.ok(content.includes("#### Step 3.2: reviewer"));
    assert.ok(content.includes("Invoke **reviewer**."));
    assert.ok(content.includes("Reads: `task.output`"));
    assert.ok(content.includes("Writes: `task.approved`"));
  });

  it("orchestrator.md contains conditional branches for reviewer", () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");

    const config = readConfig(configPath);
    const bodies = resolveSkills(config, fixtureDir);
    compile(config, bodies, outDir);

    const content = readFileSync(join(outDir, "orchestrator.md"), "utf-8");

    assert.ok(
      content.includes("- If `task.approved == false`: go to step 3.1")
    );
    assert.ok(content.includes("- If `task.approved == true`: end"));
  });
});
