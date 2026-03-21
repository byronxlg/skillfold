import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { Config } from "./config.js";
import type { Graph } from "./graph.js";
import { type RunResult, type Spawner, parseStateFromOutput, run } from "./run.js";

function makeTmpDir(): string {
  const dir = join(tmpdir(), `skillfold-run-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** A mock spawner that returns predetermined state updates per agent. */
class MockSpawner implements Spawner {
  calls: { agentName: string; skillContent: string; state: Record<string, unknown> }[] = [];
  responses: Map<string, Record<string, unknown>>;

  constructor(responses: Record<string, Record<string, unknown>>) {
    this.responses = new Map(Object.entries(responses));
  }

  async spawn(
    agentName: string,
    skillContent: string,
    state: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.calls.push({ agentName, skillContent, state });
    return this.responses.get(agentName) ?? {};
  }
}

/** A mock spawner that throws on the specified agent. */
class ErrorSpawner implements Spawner {
  errorAgent: string;
  calls: string[] = [];

  constructor(errorAgent: string) {
    this.errorAgent = errorAgent;
  }

  async spawn(
    agentName: string,
    _skillContent: string,
    _state: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.calls.push(agentName);
    if (agentName === this.errorAgent) {
      throw new Error(`Agent "${agentName}" failed`);
    }
    return {};
  }
}

function makeLinearConfig(nodes: { skill: string; reads: string[]; writes: string[] }[]): Config {
  const skills: Config["skills"] = {};

  // Create composed skills for each node
  for (const node of nodes) {
    // Create an atomic skill and a composed skill wrapping it
    skills[`${node.skill}-base`] = { path: `./skills/${node.skill}` };
    skills[node.skill] = {
      compose: [`${node.skill}-base`],
      description: `${node.skill} agent`,
    };
  }

  const flow: Graph = {
    nodes: nodes.map((n) => ({
      skill: n.skill,
      reads: n.reads,
      writes: n.writes,
    })),
  };

  return {
    name: "test-pipeline",
    skills,
    team: { flow },
  };
}

function makeBodies(skills: string[]): Map<string, string> {
  const bodies = new Map<string, string>();
  for (const skill of skills) {
    bodies.set(`${skill}-base`, `You are the ${skill} agent.`);
  }
  return bodies;
}

describe("run", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  describe("linear flow execution", () => {
    it("executes a 3-step linear flow in order", async () => {
      tmpDir = makeTmpDir();
      const config = makeLinearConfig([
        { skill: "planner", reads: [], writes: ["state.plan"] },
        { skill: "engineer", reads: ["state.plan"], writes: ["state.code"] },
        { skill: "reviewer", reads: ["state.code"], writes: ["state.review"] },
      ]);

      const spawner = new MockSpawner({
        planner: { plan: "the plan" },
        engineer: { code: "the code" },
        reviewer: { review: "approved" },
      });

      const result = await run({
        config,
        bodies: makeBodies(["planner", "engineer", "reviewer"]),
        outDir: tmpDir,
        dryRun: false,
        workDir: tmpDir,
        spawner,
      });

      assert.equal(result.steps.length, 3);
      assert.equal(result.steps[0].agent, "planner");
      assert.equal(result.steps[0].status, "ok");
      assert.equal(result.steps[1].agent, "engineer");
      assert.equal(result.steps[1].status, "ok");
      assert.equal(result.steps[2].agent, "reviewer");
      assert.equal(result.steps[2].status, "ok");

      // Verify order
      assert.equal(spawner.calls.length, 3);
      assert.equal(spawner.calls[0].agentName, "planner");
      assert.equal(spawner.calls[1].agentName, "engineer");
      assert.equal(spawner.calls[2].agentName, "reviewer");
    });

    it("accumulates state writes across steps", async () => {
      tmpDir = makeTmpDir();
      const config = makeLinearConfig([
        { skill: "planner", reads: [], writes: ["state.plan"] },
        { skill: "engineer", reads: ["state.plan"], writes: ["state.code"] },
      ]);

      const spawner = new MockSpawner({
        planner: { plan: "the plan" },
        engineer: { code: "the code" },
      });

      const result = await run({
        config,
        bodies: makeBodies(["planner", "engineer"]),
        outDir: tmpDir,
        dryRun: false,
        workDir: tmpDir,
        spawner,
      });

      assert.deepEqual(result.state, { plan: "the plan", code: "the code" });
    });

    it("passes only read fields to spawner", async () => {
      tmpDir = makeTmpDir();
      const config = makeLinearConfig([
        { skill: "planner", reads: [], writes: ["state.plan"] },
        { skill: "engineer", reads: ["state.plan"], writes: ["state.code"] },
      ]);

      const spawner = new MockSpawner({
        planner: { plan: "the plan" },
        engineer: { code: "the code" },
      });

      await run({
        config,
        bodies: makeBodies(["planner", "engineer"]),
        outDir: tmpDir,
        dryRun: false,
        workDir: tmpDir,
        spawner,
      });

      // Planner reads nothing
      assert.deepEqual(spawner.calls[0].state, {});
      // Engineer reads state.plan
      assert.deepEqual(spawner.calls[1].state, { plan: "the plan" });
    });
  });

  describe("state management", () => {
    it("creates state.json if it does not exist", async () => {
      tmpDir = makeTmpDir();
      const config = makeLinearConfig([
        { skill: "planner", reads: [], writes: ["state.plan"] },
      ]);

      const spawner = new MockSpawner({ planner: { plan: "the plan" } });

      await run({
        config,
        bodies: makeBodies(["planner"]),
        outDir: tmpDir,
        dryRun: false,
        workDir: tmpDir,
        spawner,
      });

      const statePath = join(tmpDir, "state.json");
      assert.ok(existsSync(statePath));
      const state = JSON.parse(readFileSync(statePath, "utf-8"));
      assert.deepEqual(state, { plan: "the plan" });
    });

    it("reads existing state.json at startup", async () => {
      tmpDir = makeTmpDir();
      writeFileSync(
        join(tmpDir, "state.json"),
        JSON.stringify({ existing: "value" }),
        "utf-8",
      );

      const config = makeLinearConfig([
        { skill: "planner", reads: ["state.existing"], writes: ["state.plan"] },
      ]);

      const spawner = new MockSpawner({ planner: { plan: "the plan" } });

      await run({
        config,
        bodies: makeBodies(["planner"]),
        outDir: tmpDir,
        dryRun: false,
        workDir: tmpDir,
        spawner,
      });

      // The spawner should have received the existing state field
      assert.deepEqual(spawner.calls[0].state, { existing: "value" });

      // Final state.json should have both
      const state = JSON.parse(readFileSync(join(tmpDir, "state.json"), "utf-8"));
      assert.equal(state.existing, "value");
      assert.equal(state.plan, "the plan");
    });

    it("strips state. prefix from field names", async () => {
      tmpDir = makeTmpDir();
      const config = makeLinearConfig([
        { skill: "planner", reads: [], writes: ["state.plan"] },
      ]);

      const spawner = new MockSpawner({ planner: { plan: "result" } });

      const result = await run({
        config,
        bodies: makeBodies(["planner"]),
        outDir: tmpDir,
        dryRun: false,
        workDir: tmpDir,
        spawner,
      });

      // State uses stripped names (no "state." prefix)
      assert.equal(result.state.plan, "result");
      assert.equal(result.state["state.plan"], undefined);
    });
  });

  describe("dry-run mode", () => {
    it("does not call spawner", async () => {
      tmpDir = makeTmpDir();
      const config = makeLinearConfig([
        { skill: "planner", reads: [], writes: ["state.plan"] },
      ]);

      const spawner = new MockSpawner({ planner: { plan: "x" } });

      await run({
        config,
        bodies: makeBodies(["planner"]),
        outDir: tmpDir,
        dryRun: true,
        workDir: tmpDir,
        spawner,
      });

      assert.equal(spawner.calls.length, 0);
    });

    it("does not create or modify state.json", async () => {
      tmpDir = makeTmpDir();
      const config = makeLinearConfig([
        { skill: "planner", reads: [], writes: ["state.plan"] },
      ]);

      await run({
        config,
        bodies: makeBodies(["planner"]),
        outDir: tmpDir,
        dryRun: true,
        workDir: tmpDir,
        spawner: new MockSpawner({}),
      });

      assert.ok(!existsSync(join(tmpDir, "state.json")));
    });

    it("returns steps with skipped status", async () => {
      tmpDir = makeTmpDir();
      const config = makeLinearConfig([
        { skill: "planner", reads: [], writes: ["state.plan"] },
        { skill: "engineer", reads: ["state.plan"], writes: ["state.code"] },
      ]);

      const result = await run({
        config,
        bodies: makeBodies(["planner", "engineer"]),
        outDir: tmpDir,
        dryRun: true,
        workDir: tmpDir,
        spawner: new MockSpawner({}),
      });

      assert.equal(result.steps.length, 2);
      assert.equal(result.steps[0].status, "skipped");
      assert.equal(result.steps[1].status, "skipped");
    });
  });

  describe("unsupported features", () => {
    it("rejects map nodes with clear error", async () => {
      tmpDir = makeTmpDir();
      const config: Config = {
        name: "test",
        skills: {
          "writer-base": { path: "./skills/writer" },
          writer: { compose: ["writer-base"], description: "Writer agent" },
        },
        team: {
          flow: {
            nodes: [{
              over: "state.topics",
              as: "topic",
              flow: [{ skill: "writer", reads: [], writes: [] }],
            }],
          },
        },
      };

      await assert.rejects(
        () => run({
          config,
          bodies: new Map([["writer-base", "Write."]]),
          outDir: tmpDir!,
          dryRun: false,
          workDir: tmpDir!,
          spawner: new MockSpawner({}),
        }),
        { message: "map nodes not supported in skillfold run MVP - use the orchestrator" },
      );
    });

    it("rejects conditional then with clear error", async () => {
      tmpDir = makeTmpDir();
      const config: Config = {
        name: "test",
        skills: {
          "planner-base": { path: "./skills/planner" },
          planner: { compose: ["planner-base"], description: "Planner" },
          "alt-base": { path: "./skills/alt" },
          alt: { compose: ["alt-base"], description: "Alt" },
        },
        team: {
          flow: {
            nodes: [
              {
                skill: "planner",
                reads: [],
                writes: ["state.plan"],
                then: [{ when: "state.plan == done", to: "end" }],
              },
              { skill: "alt", reads: [], writes: [] },
            ],
          },
        },
      };

      await assert.rejects(
        () => run({
          config,
          bodies: new Map([["planner-base", "Plan."], ["alt-base", "Alt."]]),
          outDir: tmpDir!,
          dryRun: false,
          workDir: tmpDir!,
          spawner: new MockSpawner({}),
        }),
        { message: "conditional routing not supported in skillfold run MVP - use the orchestrator" },
      );
    });

    it("rejects non-linear jump with clear error", async () => {
      tmpDir = makeTmpDir();
      const config: Config = {
        name: "test",
        skills: {
          "a-base": { path: "./skills/a" },
          a: { compose: ["a-base"], description: "A" },
          "b-base": { path: "./skills/b" },
          b: { compose: ["b-base"], description: "B" },
          "c-base": { path: "./skills/c" },
          c: { compose: ["c-base"], description: "C" },
        },
        team: {
          flow: {
            nodes: [
              { skill: "a", reads: [], writes: [], then: "c" },
              { skill: "b", reads: [], writes: [] },
              { skill: "c", reads: [], writes: [] },
            ],
          },
        },
      };

      await assert.rejects(
        () => run({
          config,
          bodies: new Map([["a-base", "A."], ["b-base", "B."], ["c-base", "C."]]),
          outDir: tmpDir!,
          dryRun: false,
          workDir: tmpDir!,
          spawner: new MockSpawner({}),
        }),
        { message: /non-linear jump/ },
      );
    });

    it("rejects sub-flow nodes with clear error", async () => {
      tmpDir = makeTmpDir();
      const config: Config = {
        name: "test",
        skills: {},
        team: {
          flow: {
            nodes: [{
              name: "sub",
              flow: "other.yaml",
              reads: [],
              writes: [],
            }],
          },
        },
      };

      await assert.rejects(
        () => run({
          config,
          bodies: new Map(),
          outDir: tmpDir!,
          dryRun: false,
          workDir: tmpDir!,
          spawner: new MockSpawner({}),
        }),
        { message: "sub-flow nodes not supported in skillfold run MVP - use the orchestrator" },
      );
    });
  });

  describe("async node handling", () => {
    it("skips async nodes with skipped status", async () => {
      tmpDir = makeTmpDir();
      const config: Config = {
        name: "test",
        skills: {
          "planner-base": { path: "./skills/planner" },
          planner: { compose: ["planner-base"], description: "Planner" },
        },
        team: {
          flow: {
            nodes: [
              { skill: "planner", reads: [], writes: ["state.plan"] },
              { name: "human-review", async: true as const, reads: ["state.plan"], writes: ["state.feedback"], policy: "skip" as const },
            ],
          },
        },
      };

      const spawner = new MockSpawner({ planner: { plan: "the plan" } });

      const result = await run({
        config,
        bodies: new Map([["planner-base", "Plan."]]),
        outDir: tmpDir,
        dryRun: false,
        workDir: tmpDir,
        spawner,
      });

      assert.equal(result.steps.length, 2);
      assert.equal(result.steps[0].status, "ok");
      assert.equal(result.steps[1].status, "skipped");
      assert.equal(result.steps[1].agent, "human-review");
    });

    it("continues execution past async nodes", async () => {
      tmpDir = makeTmpDir();
      const config: Config = {
        name: "test",
        skills: {
          "a-base": { path: "./skills/a" },
          a: { compose: ["a-base"], description: "A" },
          "b-base": { path: "./skills/b" },
          b: { compose: ["b-base"], description: "B" },
        },
        team: {
          flow: {
            nodes: [
              { skill: "a", reads: [], writes: ["state.x"] },
              { name: "external", async: true as const, reads: [], writes: [], policy: "skip" as const },
              { skill: "b", reads: ["state.x"], writes: ["state.y"] },
            ],
          },
        },
      };

      const spawner = new MockSpawner({
        a: { x: "hello" },
        b: { y: "world" },
      });

      const result = await run({
        config,
        bodies: new Map([["a-base", "A."], ["b-base", "B."]]),
        outDir: tmpDir,
        dryRun: false,
        workDir: tmpDir,
        spawner,
      });

      assert.equal(result.steps.length, 3);
      assert.equal(result.steps[0].status, "ok");
      assert.equal(result.steps[1].status, "skipped");
      assert.equal(result.steps[2].status, "ok");
      assert.equal(spawner.calls.length, 2);
    });
  });

  describe("error handling", () => {
    it("captures spawner error in step result", async () => {
      tmpDir = makeTmpDir();
      const config = makeLinearConfig([
        { skill: "planner", reads: [], writes: ["state.plan"] },
        { skill: "engineer", reads: ["state.plan"], writes: ["state.code"] },
      ]);

      const spawner = new ErrorSpawner("engineer");

      const result = await run({
        config,
        bodies: makeBodies(["planner", "engineer"]),
        outDir: tmpDir,
        dryRun: false,
        workDir: tmpDir,
        spawner,
      });

      assert.equal(result.steps.length, 2);
      assert.equal(result.steps[0].status, "ok");
      assert.equal(result.steps[1].status, "error");
      assert.ok(result.steps[1].error?.includes("engineer"));
    });

    it("halts execution on spawner error", async () => {
      tmpDir = makeTmpDir();
      const config = makeLinearConfig([
        { skill: "planner", reads: [], writes: ["state.plan"] },
        { skill: "engineer", reads: ["state.plan"], writes: ["state.code"] },
        { skill: "reviewer", reads: ["state.code"], writes: ["state.review"] },
      ]);

      const spawner = new ErrorSpawner("engineer");

      const result = await run({
        config,
        bodies: makeBodies(["planner", "engineer", "reviewer"]),
        outDir: tmpDir,
        dryRun: false,
        workDir: tmpDir,
        spawner,
      });

      // Should stop after engineer fails - reviewer never runs
      assert.equal(result.steps.length, 2);
      assert.equal(spawner.calls.length, 2);
    });

    it("errors when no team flow is defined", async () => {
      tmpDir = makeTmpDir();
      const config: Config = {
        name: "test",
        skills: {},
      };

      await assert.rejects(
        () => run({
          config,
          bodies: new Map(),
          outDir: tmpDir!,
          dryRun: false,
          workDir: tmpDir!,
          spawner: new MockSpawner({}),
        }),
        { message: "No team flow defined in config" },
      );
    });

    it("errors when skill content is not found for a step", async () => {
      tmpDir = makeTmpDir();
      const config: Config = {
        name: "test",
        skills: {
          "missing-base": { path: "./skills/missing" },
          missing: { compose: ["missing-base"], description: "Missing" },
        },
        team: {
          flow: {
            nodes: [{ skill: "missing", reads: [], writes: [] }],
          },
        },
      };

      // No bodies provided - expandComposedBodies throws CompileError
      await assert.rejects(
        () => run({
          config,
          bodies: new Map(),
          outDir: tmpDir!,
          dryRun: false,
          workDir: tmpDir!,
          spawner: new MockSpawner({}),
        }),
        { message: /missing-base/ },
      );
    });
  });

  describe("edge cases", () => {
    it("empty flow completes with no steps", async () => {
      tmpDir = makeTmpDir();
      const config: Config = {
        name: "test",
        skills: {},
        team: { flow: { nodes: [] } },
      };

      const result = await run({
        config,
        bodies: new Map(),
        outDir: tmpDir,
        dryRun: false,
        workDir: tmpDir,
        spawner: new MockSpawner({}),
      });

      assert.equal(result.steps.length, 0);
    });

    it("flow with only async nodes completes with all skipped", async () => {
      tmpDir = makeTmpDir();
      const config: Config = {
        name: "test",
        skills: {},
        team: {
          flow: {
            nodes: [
              { name: "human-a", async: true as const, reads: [], writes: [], policy: "skip" as const },
              { name: "human-b", async: true as const, reads: [], writes: [], policy: "skip" as const },
            ],
          },
        },
      };

      const result = await run({
        config,
        bodies: new Map(),
        outDir: tmpDir,
        dryRun: false,
        workDir: tmpDir,
        spawner: new MockSpawner({}),
      });

      assert.equal(result.steps.length, 2);
      assert.equal(result.steps[0].status, "skipped");
      assert.equal(result.steps[1].status, "skipped");
    });

    it("single-node flow works correctly", async () => {
      tmpDir = makeTmpDir();
      const config = makeLinearConfig([
        { skill: "solo", reads: [], writes: ["state.output"] },
      ]);

      const spawner = new MockSpawner({ solo: { output: "done" } });

      const result = await run({
        config,
        bodies: makeBodies(["solo"]),
        outDir: tmpDir,
        dryRun: false,
        workDir: tmpDir,
        spawner,
      });

      assert.equal(result.steps.length, 1);
      assert.equal(result.steps[0].status, "ok");
      assert.deepEqual(result.state, { output: "done" });
    });

    it("then: end stops execution cleanly", async () => {
      tmpDir = makeTmpDir();
      const config: Config = {
        name: "test",
        skills: {
          "a-base": { path: "./skills/a" },
          a: { compose: ["a-base"], description: "A" },
        },
        team: {
          flow: {
            nodes: [
              { skill: "a", reads: [], writes: ["state.x"], then: "end" },
            ],
          },
        },
      };

      const spawner = new MockSpawner({ a: { x: "val" } });

      const result = await run({
        config,
        bodies: new Map([["a-base", "A."]]),
        outDir: tmpDir,
        dryRun: false,
        workDir: tmpDir,
        spawner,
      });

      assert.equal(result.steps.length, 1);
      assert.equal(result.steps[0].status, "ok");
    });

    it("then: end on a middle node stops execution early", async () => {
      tmpDir = makeTmpDir();
      const config: Config = {
        name: "test",
        skills: {
          "a-base": { path: "./skills/a" },
          a: { compose: ["a-base"], description: "A" },
          "b-base": { path: "./skills/b" },
          b: { compose: ["b-base"], description: "B" },
        },
        team: {
          flow: {
            nodes: [
              { skill: "a", reads: [], writes: ["state.x"], then: "end" },
              { skill: "b", reads: ["state.x"], writes: ["state.y"] },
            ],
          },
        },
      };

      const spawner = new MockSpawner({
        a: { x: "done" },
        b: { y: "should not run" },
      });

      const result = await run({
        config,
        bodies: new Map([["a-base", "A."], ["b-base", "B."]]),
        outDir: tmpDir,
        dryRun: false,
        workDir: tmpDir,
        spawner,
      });

      assert.equal(result.steps.length, 1);
      assert.equal(result.steps[0].status, "ok");
      assert.equal(result.steps[0].agent, "a");
      assert.equal(spawner.calls.length, 1);
      assert.deepEqual(result.state, { x: "done" });
    });
  });
});

describe("parseStateFromOutput", () => {
  it("extracts JSON from a code block", () => {
    const output = 'Some text\n```json\n{"plan": "the plan"}\n```\nMore text';
    const result = parseStateFromOutput(output);
    assert.deepEqual(result, { plan: "the plan" });
  });

  it("uses the last JSON block when multiple are present", () => {
    const output = '```json\n{"first": 1}\n```\n```json\n{"second": 2}\n```';
    const result = parseStateFromOutput(output);
    assert.deepEqual(result, { second: 2 });
  });

  it("returns empty object when no JSON block found", () => {
    const result = parseStateFromOutput("no json here");
    assert.deepEqual(result, {});
  });

  it("returns empty object for invalid JSON", () => {
    const result = parseStateFromOutput('```json\nnot valid json\n```');
    assert.deepEqual(result, {});
  });

  it("returns empty object for non-object JSON", () => {
    const result = parseStateFromOutput('```json\n[1, 2, 3]\n```');
    assert.deepEqual(result, {});
  });
});
