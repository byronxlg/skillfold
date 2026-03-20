import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { Config } from "./config.js";
import { CompileError } from "./errors.js";
import { compile } from "./compiler.js";
import type { Graph } from "./graph.js";
import type { StateSchema } from "./state.js";

function makeTmpDir(): string {
  const dir = join(tmpdir(), `skillfold-compiler-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("compile", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("single composed skill produces file with frontmatter and bodies joined by double newline", () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");

    const config: Config = {
      name: "test",
      skills: {
        lint: { path: "./skills/lint" },
        format: { path: "./skills/format" },
        quality: { compose: ["lint", "format"], description: "Runs quality checks." },
      },
    };

    const bodies = new Map<string, string>();
    bodies.set("lint", "Run the linter.");
    bodies.set("format", "Format the code.");

    const results = compile(config, bodies, outDir);

    assert.equal(results.length, 1);
    assert.equal(results[0].name, "quality");

    const content = readFileSync(results[0].path, "utf-8");
    assert.ok(content.startsWith("---\n"));
    assert.ok(content.includes("name: quality"));
    assert.ok(content.includes("description: Runs quality checks."));
    assert.ok(content.includes("Run the linter.\n\nFormat the code.\n"));
  });

  it("recursive composition flattens to all leaf bodies in correct order", () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");

    const config: Config = {
      name: "test",
      skills: {
        a: { path: "./skills/a" },
        b: { path: "./skills/b" },
        c: { path: "./skills/c" },
        inner: { compose: ["a", "b"], description: "Inner skill." },
        outer: { compose: ["inner", "c"], description: "Outer skill." },
      },
    };

    const bodies = new Map<string, string>();
    bodies.set("a", "Body A");
    bodies.set("b", "Body B");
    bodies.set("c", "Body C");

    const results = compile(config, bodies, outDir);

    const outerResult = results.find((r) => r.name === "outer");
    assert.ok(outerResult);

    const content = readFileSync(outerResult.path, "utf-8");
    assert.ok(content.includes("Body A\n\nBody B\n\nBody C\n"));
  });

  it("output files at {skill-name}/SKILL.md", () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");

    const config: Config = {
      name: "test",
      skills: {
        leaf: { path: "./skills/leaf" },
        bundle: { compose: ["leaf"], description: "A bundle skill." },
      },
    };

    const bodies = new Map<string, string>();
    bodies.set("leaf", "Leaf body");

    const results = compile(config, bodies, outDir);

    assert.equal(results[0].path, join(outDir, "bundle", "SKILL.md"));
    assert.ok(existsSync(join(outDir, "bundle", "SKILL.md")));
  });

  it("atomic skills do not produce output files", () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");

    const config: Config = {
      name: "test",
      skills: {
        leaf: { path: "./skills/leaf" },
        bundle: { compose: ["leaf"], description: "A bundle skill." },
      },
    };

    const bodies = new Map<string, string>();
    bodies.set("leaf", "Leaf body");

    compile(config, bodies, outDir);

    assert.ok(!existsSync(join(outDir, "leaf")));
  });

  it("unknown skill reference throws CompileError", () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");

    const config: Config = {
      name: "test",
      skills: {
        broken: { compose: ["nonexistent"], description: "Broken skill." },
      },
    };

    const bodies = new Map<string, string>();

    assert.throws(() => compile(config, bodies, outDir), (err: unknown) => {
      assert.ok(err instanceof CompileError);
      assert.match(err.message, /Unknown skill/);
      return true;
    });
  });

  it("missing body for atomic skill throws CompileError", () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");

    const config: Config = {
      name: "test",
      skills: {
        leaf: { path: "./skills/leaf" },
        bundle: { compose: ["leaf"], description: "A bundle skill." },
      },
    };

    // Intentionally omit body for "leaf"
    const bodies = new Map<string, string>();

    assert.throws(() => compile(config, bodies, outDir), (err: unknown) => {
      assert.ok(err instanceof CompileError);
      assert.match(err.message, /No resolved body for atomic skill/);
      return true;
    });
  });

  it("config with team and orchestrator key appends orchestrator to composed skill output", () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");

    const state: StateSchema = {
      types: {},
      fields: {
        goal: { type: { kind: "primitive", value: "string" } },
      },
    };

    const graph: Graph = {
      nodes: [
        { skill: "strategy", reads: [], writes: ["state.goal"], then: "lead" },
        { skill: "lead", reads: ["state.goal"], writes: [] },
      ],
    };

    const config: Config = {
      name: "test",
      skills: {
        strategy: { path: "./skills/strategy" },
        lead: { path: "./skills/lead" },
        pipeline: { compose: ["strategy", "lead"], description: "Runs the pipeline." },
      },
      state,
      team: {
        orchestrator: "pipeline",
        flow: graph,
      },
    };

    const bodies = new Map<string, string>();
    bodies.set("strategy", "Strategy body.");
    bodies.set("lead", "Lead body.");

    const results = compile(config, bodies, outDir);

    // The pipeline/SKILL.md should exist (from composed skill output)
    const pipelineResult = results.find((r) => r.name === "pipeline");
    assert.ok(pipelineResult);
    assert.equal(pipelineResult.path, join(outDir, "pipeline", "SKILL.md"));

    const content = readFileSync(pipelineResult.path, "utf-8");
    // Should contain frontmatter
    assert.ok(content.startsWith("---\n"));
    assert.ok(content.includes("name: pipeline"));
    assert.ok(content.includes("description: Runs the pipeline."));
    // Should contain the composed bodies
    assert.ok(content.includes("Strategy body."));
    assert.ok(content.includes("Lead body."));
    // Should also contain orchestrator content
    assert.ok(content.includes("# Orchestrator: test"));
    assert.ok(content.includes("## Execution Plan"));
    assert.ok(content.includes("### Step 1: strategy"));

    // No standalone orchestrator directory should exist
    assert.ok(!existsSync(join(outDir, "orchestrator")));
  });

  it("config with team but no orchestrator key generates standalone orchestrator/SKILL.md", () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");

    const graph: Graph = {
      nodes: [
        { skill: "worker", reads: [], writes: [] },
      ],
    };

    const config: Config = {
      name: "standalone-test",
      skills: {
        worker: { path: "./skills/worker" },
      },
      team: { flow: graph },
    };

    const bodies = new Map<string, string>();

    const results = compile(config, bodies, outDir);

    const orchResult = results.find((r) => r.name === "orchestrator");
    assert.ok(orchResult);
    assert.equal(orchResult.path, join(outDir, "orchestrator", "SKILL.md"));

    const content = readFileSync(orchResult.path, "utf-8");
    assert.ok(content.includes("# Orchestrator: standalone-test"));
    assert.ok(content.includes("### Step 1: worker"));
  });

  it("frontmatter contains correct name and description", () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");

    const config: Config = {
      name: "test",
      skills: {
        leaf: { path: "./skills/leaf" },
        agent: { compose: ["leaf"], description: "An agent that does things." },
      },
    };

    const bodies = new Map<string, string>();
    bodies.set("leaf", "Leaf content.");

    const results = compile(config, bodies, outDir);
    const content = readFileSync(results[0].path, "utf-8");

    // Verify frontmatter structure
    const lines = content.split("\n");
    assert.equal(lines[0], "---");
    assert.equal(lines[1], "name: agent");
    assert.equal(lines[2], "description: An agent that does things.");
    assert.equal(lines[3], "---");
  });
});
