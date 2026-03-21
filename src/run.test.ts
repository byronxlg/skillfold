import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { Config } from "./config.js";
import { RunError } from "./errors.js";
import type { Graph } from "./graph.js";
import type { Spawner, StepResult } from "./run.js";
import { run } from "./run.js";

function makeTmpDir(): string {
  const dir = join(tmpdir(), `skillfold-run-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Mock spawner that returns predetermined state updates. */
function mockSpawner(updates: Record<string, Record<string, unknown>>): Spawner {
  return {
    async spawn(agentName: string, _skillContent: string, _state: Record<string, unknown>) {
      return updates[agentName] ?? {};
    },
  };
}

/** Mock spawner that records calls in order. */
function recordingSpawner(
  updates: Record<string, Record<string, unknown>>,
): { spawner: Spawner; calls: Array<{ agent: string; state: Record<string, unknown> }> } {
  const calls: Array<{ agent: string; state: Record<string, unknown> }> = [];
  return {
    calls,
    spawner: {
      async spawn(agentName: string, _skillContent: string, state: Record<string, unknown>) {
        calls.push({ agent: agentName, state: { ...state } });
        return updates[agentName] ?? {};
      },
    },
  };
}

/** Mock spawner that throws on a specific agent. */
function errorSpawner(failOn: string): Spawner {
  return {
    async spawn(agentName: string, _skillContent: string, _state: Record<string, unknown>) {
      if (agentName === failOn) {
        throw new Error(`Agent ${agentName} failed`);
      }
      return {};
    },
  };
}

function makeConfig(flow: Graph): Config {
  return {
    name: "test-pipeline",
    skills: {
      planning: { path: "./skills/planning" },
      coding: { path: "./skills/coding" },
      reviewing: { path: "./skills/reviewing" },
      planner: { compose: ["planning"], description: "Plans work" },
      engineer: { compose: ["coding"], description: "Writes code" },
      reviewer: { compose: ["reviewing"], description: "Reviews code" },
    },
    team: {
      flow,
    },
  };
}

function makeBodies(): Map<string, string> {
  const bodies = new Map<string, string>();
  bodies.set("planning", "Plan the work.");
  bodies.set("coding", "Write the code.");
  bodies.set("reviewing", "Review the code.");
  return bodies;
}

describe("run", () => {
  let origCwd: string;
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
    if (origCwd) {
      process.chdir(origCwd);
    }
  });

  describe("linear flow execution", () => {
    it("executes a 3-step linear flow with mock spawner", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: [], writes: ["state.plan"], then: "engineer" },
          { skill: "engineer", reads: ["state.plan"], writes: ["state.code"], then: "reviewer" },
          { skill: "reviewer", reads: ["state.code"], writes: ["state.review"] },
        ],
      });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        mockSpawner({
          planner: { plan: "Build feature X" },
          engineer: { code: "function x() {}" },
          reviewer: { review: "LGTM" },
        }),
      );

      assert.equal(result.steps.length, 3);
      assert.equal(result.steps[0].status, "ok");
      assert.equal(result.steps[1].status, "ok");
      assert.equal(result.steps[2].status, "ok");
    });

    it("executes steps in order", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: [], writes: ["state.plan"], then: "engineer" },
          { skill: "engineer", reads: ["state.plan"], writes: ["state.code"] },
        ],
      });

      const { spawner, calls } = recordingSpawner({
        planner: { plan: "the plan" },
        engineer: { code: "the code" },
      });

      await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        spawner,
      );

      assert.equal(calls.length, 2);
      assert.equal(calls[0].agent, "planner");
      assert.equal(calls[1].agent, "engineer");
    });

    it("final state contains all accumulated writes", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: [], writes: ["state.plan"], then: "engineer" },
          { skill: "engineer", reads: ["state.plan"], writes: ["state.code"] },
        ],
      });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        mockSpawner({
          planner: { plan: "build it" },
          engineer: { code: "done" },
        }),
      );

      assert.equal(result.state.plan, "build it");
      assert.equal(result.state.code, "done");
    });
  });

  describe("state management", () => {
    it("creates state.json if it does not exist", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: [], writes: ["state.plan"] },
        ],
      });

      await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        mockSpawner({ planner: { plan: "created" } }),
      );

      assert.ok(existsSync(join(tmpDir, "state.json")));
      const content = JSON.parse(readFileSync(join(tmpDir, "state.json"), "utf-8"));
      assert.equal(content.plan, "created");
    });

    it("reads state.json at startup if it exists", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);
      writeFileSync(join(tmpDir, "state.json"), JSON.stringify({ existing: "data" }));

      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: ["state.existing"], writes: ["state.plan"] },
        ],
      });

      const { spawner, calls } = recordingSpawner({ planner: { plan: "updated" } });

      await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        spawner,
      );

      assert.equal(calls[0].state.existing, "data");
    });

    it("state is updated after each step", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: [], writes: ["state.plan"], then: "engineer" },
          { skill: "engineer", reads: ["state.plan"], writes: ["state.code"] },
        ],
      });

      const { spawner, calls } = recordingSpawner({
        planner: { plan: "the plan" },
        engineer: { code: "the code" },
      });

      await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        spawner,
      );

      // Engineer should see the plan that planner wrote
      assert.equal(calls[1].state.plan, "the plan");
    });

    it("strips state. prefix from field names", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: [], writes: ["state.plan"] },
        ],
      });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        mockSpawner({ planner: { plan: "stripped" } }),
      );

      assert.equal(result.state.plan, "stripped");
      assert.equal(result.state["state.plan"], undefined);
    });
  });

  describe("dry-run mode", () => {
    it("does not call spawner", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: [], writes: ["state.plan"] },
        ],
      });

      const { spawner, calls } = recordingSpawner({});

      await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: true },
        spawner,
      );

      assert.equal(calls.length, 0);
    });

    it("does not create state.json", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: [], writes: ["state.plan"] },
        ],
      });

      await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: true },
        mockSpawner({}),
      );

      assert.ok(!existsSync(join(tmpDir, "state.json")));
    });

    it("returns all steps with status skipped", async () => {
      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: [], writes: ["state.plan"], then: "engineer" },
          { skill: "engineer", reads: ["state.plan"], writes: ["state.code"] },
        ],
      });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: true },
        mockSpawner({}),
      );

      assert.equal(result.steps.length, 2);
      assert.ok(result.steps.every(s => s.status === "skipped"));
    });
  });

  describe("unsupported features", () => {
    it("map node produces clear error", async () => {
      const config = makeConfig({
        nodes: [
          { over: "state.items", as: "item", flow: [] },
        ],
      });

      await assert.rejects(
        () => run(
          { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
          mockSpawner({}),
        ),
        (err: Error) => {
          assert.ok(err instanceof RunError);
          assert.ok(err.message.includes("map nodes not supported"));
          return true;
        },
      );
    });

    it("conditional then produces clear error", async () => {
      const config = makeConfig({
        nodes: [
          {
            skill: "planner",
            reads: [],
            writes: ["state.plan"],
            then: [
              { when: 'state.plan == "good"', to: "engineer" },
              { when: 'state.plan != "good"', to: "planner" },
            ],
          },
          { skill: "engineer", reads: ["state.plan"], writes: ["state.code"] },
        ],
      });

      await assert.rejects(
        () => run(
          { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
          mockSpawner({}),
        ),
        (err: Error) => {
          assert.ok(err instanceof RunError);
          assert.ok(err.message.includes("conditional routing not supported"));
          return true;
        },
      );
    });

    it("non-linear jump produces clear error", async () => {
      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: [], writes: ["state.plan"], then: "reviewer" },
          { skill: "engineer", reads: ["state.plan"], writes: ["state.code"] },
          { skill: "reviewer", reads: ["state.code"], writes: ["state.review"] },
        ],
      });

      await assert.rejects(
        () => run(
          { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
          mockSpawner({}),
        ),
        (err: Error) => {
          assert.ok(err instanceof RunError);
          assert.ok(err.message.includes("non-linear jump"));
          return true;
        },
      );
    });

    it("sub-flow node produces clear error", async () => {
      const config = makeConfig({
        nodes: [
          { name: "sub", flow: "./other.yaml", reads: [], writes: [] },
        ],
      });

      await assert.rejects(
        () => run(
          { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
          mockSpawner({}),
        ),
        (err: Error) => {
          assert.ok(err instanceof RunError);
          assert.ok(err.message.includes("sub-flow nodes not supported"));
          return true;
        },
      );
    });
  });

  describe("async node handling", () => {
    it("async nodes are skipped with skipped status", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: [], writes: ["state.plan"], then: "human-review" },
          { name: "human-review", async: true as const, reads: ["state.plan"], writes: ["state.feedback"], policy: "skip" as const, then: "engineer" },
          { skill: "engineer", reads: ["state.feedback"], writes: ["state.code"] },
        ],
      });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        mockSpawner({
          planner: { plan: "planned" },
          engineer: { code: "coded" },
        }),
      );

      assert.equal(result.steps.length, 3);
      assert.equal(result.steps[0].status, "ok");
      assert.equal(result.steps[1].status, "skipped");
      assert.equal(result.steps[1].agent, "human-review");
      assert.equal(result.steps[2].status, "ok");
    });

    it("execution continues past async nodes", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          { name: "external", async: true as const, reads: [], writes: ["state.data"], policy: "skip" as const, then: "planner" },
          { skill: "planner", reads: [], writes: ["state.plan"] },
        ],
      });

      const { spawner, calls } = recordingSpawner({ planner: { plan: "done" } });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        spawner,
      );

      assert.equal(calls.length, 1);
      assert.equal(calls[0].agent, "planner");
      assert.equal(result.steps[0].status, "skipped");
      assert.equal(result.steps[1].status, "ok");
    });
  });

  describe("error handling", () => {
    it("spawner error is captured in step result", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: [], writes: ["state.plan"] },
        ],
      });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        errorSpawner("planner"),
      );

      assert.equal(result.steps[0].status, "error");
      assert.ok(result.steps[0].error?.includes("Agent planner failed"));
    });

    it("execution halts on spawner error", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: [], writes: ["state.plan"], then: "engineer" },
          { skill: "engineer", reads: ["state.plan"], writes: ["state.code"] },
        ],
      });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        errorSpawner("planner"),
      );

      assert.equal(result.steps.length, 1);
      assert.equal(result.steps[0].status, "error");
    });

    it("no team.flow throws RunError", async () => {
      const config: Config = {
        name: "test",
        skills: {},
      };

      await assert.rejects(
        () => run(
          { config, bodies: new Map(), target: "claude-code", outDir: "build", dryRun: false },
          mockSpawner({}),
        ),
        (err: Error) => {
          assert.ok(err instanceof RunError);
          assert.ok(err.message.includes("no team.flow"));
          return true;
        },
      );
    });
  });

  describe("edge cases", () => {
    it("empty flow completes with no steps", async () => {
      const config = makeConfig({ nodes: [] });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        mockSpawner({}),
      );

      assert.equal(result.steps.length, 0);
    });

    it("flow with only async nodes completes with all skipped", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          { name: "human-a", async: true as const, reads: [], writes: [], policy: "skip" as const, then: "human-b" },
          { name: "human-b", async: true as const, reads: [], writes: [], policy: "skip" as const },
        ],
      });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        mockSpawner({}),
      );

      assert.equal(result.steps.length, 2);
      assert.ok(result.steps.every(s => s.status === "skipped"));
    });

    it("single-node flow works correctly", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: [], writes: ["state.plan"] },
        ],
      });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        mockSpawner({ planner: { plan: "only step" } }),
      );

      assert.equal(result.steps.length, 1);
      assert.equal(result.steps[0].status, "ok");
      assert.equal(result.state.plan, "only step");
    });

    it("then: end is accepted as valid linear flow", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: [], writes: ["state.plan"], then: "end" },
        ],
      });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        mockSpawner({ planner: { plan: "done" } }),
      );

      assert.equal(result.steps.length, 1);
      assert.equal(result.steps[0].status, "ok");
    });
  });
});
