import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { Config } from "./config.js";
import { RunError } from "./errors.js";
import type { Graph } from "./graph.js";
import type { Spawner, StepResult } from "./run.js";
import {
  DEFAULT_MAX_ITERATIONS,
  evaluateConditionalBranches,
  evaluateWhenClause,
  readStatePath,
  run,
} from "./run.js";

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

/**
 * Mock spawner that returns different updates based on call count per agent.
 * The updatesPerCall map keys are agent names and values are arrays of updates
 * for each successive call. If calls exceed the array length, the last element is used.
 */
function sequentialSpawner(
  updatesPerCall: Record<string, Record<string, unknown>[]>,
): { spawner: Spawner; calls: Array<{ agent: string; state: Record<string, unknown> }> } {
  const calls: Array<{ agent: string; state: Record<string, unknown> }> = [];
  const callCounts = new Map<string, number>();
  return {
    calls,
    spawner: {
      async spawn(agentName: string, _skillContent: string, state: Record<string, unknown>) {
        calls.push({ agent: agentName, state: { ...state } });
        const count = callCounts.get(agentName) ?? 0;
        callCounts.set(agentName, count + 1);
        const seq = updatesPerCall[agentName];
        if (!seq || seq.length === 0) return {};
        return seq[Math.min(count, seq.length - 1)];
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

    it("dry-run with conditionals falls through sequentially", async () => {
      const config = makeConfig({
        nodes: [
          {
            skill: "planner",
            reads: [],
            writes: ["state.plan"],
            then: [
              { when: "state.plan == true", to: "engineer" },
              { when: "state.plan == false", to: "reviewer" },
            ],
          },
          { skill: "engineer", reads: ["state.plan"], writes: ["state.code"] },
          { skill: "reviewer", reads: ["state.code"], writes: ["state.review"] },
        ],
      });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: true },
        mockSpawner({}),
      );

      // Should walk through all nodes sequentially in dry-run
      assert.equal(result.steps.length, 3);
      assert.ok(result.steps.every(s => s.status === "skipped"));
    });
  });

  describe("conditional routing", () => {
    it("routes to the correct branch based on state (== true)", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          {
            skill: "reviewer",
            reads: [],
            writes: ["state.review"],
            then: [
              { when: "state.review == true", to: "end" },
              { when: "state.review == false", to: "engineer" },
            ],
          },
          { skill: "engineer", reads: [], writes: ["state.code"] },
        ],
      });

      // Reviewer approves -> routes to end, engineer never runs
      const { spawner, calls } = recordingSpawner({
        reviewer: { review: true },
      });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        spawner,
      );

      assert.equal(calls.length, 1);
      assert.equal(calls[0].agent, "reviewer");
      assert.equal(result.steps.length, 1);
      assert.equal(result.steps[0].status, "ok");
    });

    it("routes to the correct branch based on state (== false)", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          {
            skill: "reviewer",
            reads: [],
            writes: ["state.review"],
            then: [
              { when: "state.review == true", to: "end" },
              { when: "state.review == false", to: "engineer" },
            ],
          },
          { skill: "engineer", reads: [], writes: ["state.code"] },
        ],
      });

      // Reviewer rejects -> routes to engineer
      const { spawner, calls } = recordingSpawner({
        reviewer: { review: false },
        engineer: { code: "fixed" },
      });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        spawner,
      );

      assert.equal(calls.length, 2);
      assert.equal(calls[0].agent, "reviewer");
      assert.equal(calls[1].agent, "engineer");
      assert.equal(result.steps.length, 2);
    });

    it("routes based on string comparison", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          {
            skill: "planner",
            reads: [],
            writes: ["state.plan"],
            then: [
              { when: 'state.plan == "approved"', to: "engineer" },
              { when: 'state.plan != "approved"', to: "end" },
            ],
          },
          { skill: "engineer", reads: ["state.plan"], writes: ["state.code"] },
        ],
      });

      const { spawner, calls } = recordingSpawner({
        planner: { plan: "approved" },
        engineer: { code: "built" },
      });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        spawner,
      );

      assert.equal(calls.length, 2);
      assert.equal(result.steps[0].agent, "planner");
      assert.equal(result.steps[1].agent, "engineer");
    });

    it("routes based on != operator", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          {
            skill: "planner",
            reads: [],
            writes: ["state.plan"],
            then: [
              { when: 'state.plan != "rejected"', to: "engineer" },
              { when: 'state.plan == "rejected"', to: "end" },
            ],
          },
          { skill: "engineer", reads: ["state.plan"], writes: ["state.code"] },
        ],
      });

      const { spawner, calls } = recordingSpawner({
        planner: { plan: "approved" },
        engineer: { code: "built" },
      });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        spawner,
      );

      assert.equal(calls.length, 2);
      assert.equal(result.steps[1].agent, "engineer");
    });

    it("supports nested state paths in when-clauses", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          {
            skill: "reviewer",
            reads: [],
            writes: ["state.review"],
            then: [
              { when: "review.approved == true", to: "end" },
              { when: "review.approved == false", to: "engineer" },
            ],
          },
          { skill: "engineer", reads: [], writes: ["state.code"] },
        ],
      });

      // Reviewer writes nested state: { review: { approved: true } }
      const { spawner, calls } = recordingSpawner({
        reviewer: { review: { approved: true } },
      });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        spawner,
      );

      assert.equal(calls.length, 1);
      assert.equal(result.steps.length, 1);
      assert.equal(result.steps[0].agent, "reviewer");
    });

    it("errors when no branch matches", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          {
            skill: "planner",
            reads: [],
            writes: ["state.plan"],
            then: [
              { when: 'state.plan == "a"', to: "engineer" },
              { when: 'state.plan == "b"', to: "end" },
            ],
          },
          { skill: "engineer", reads: [], writes: ["state.code"] },
        ],
      });

      await assert.rejects(
        () => run(
          { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
          mockSpawner({ planner: { plan: "c" } }),
        ),
        (err: Error) => {
          assert.ok(err instanceof RunError);
          assert.ok(err.message.includes("no conditional branch matched"));
          return true;
        },
      );
    });

    it("non-linear jump with simple then works", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      // planner -> reviewer (skipping engineer)
      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: [], writes: ["state.plan"], then: "reviewer" },
          { skill: "engineer", reads: ["state.plan"], writes: ["state.code"] },
          { skill: "reviewer", reads: ["state.plan"], writes: ["state.review"] },
        ],
      });

      const { spawner, calls } = recordingSpawner({
        planner: { plan: "done" },
        reviewer: { review: "reviewed" },
      });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        spawner,
      );

      assert.equal(calls.length, 2);
      assert.equal(calls[0].agent, "planner");
      assert.equal(calls[1].agent, "reviewer");
      assert.equal(result.steps.length, 2);
    });
  });

  describe("loops", () => {
    it("re-executes a node when conditional routes back to it", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      // engineer -> reviewer -> (if rejected) back to engineer -> reviewer -> (if approved) end
      const config = makeConfig({
        nodes: [
          { skill: "engineer", reads: [], writes: ["state.code"], then: "reviewer" },
          {
            skill: "reviewer",
            reads: ["state.code"],
            writes: ["state.review"],
            then: [
              { when: "state.review == true", to: "end" },
              { when: "state.review == false", to: "engineer" },
            ],
          },
        ],
      });

      // First call: reviewer rejects. Second call: reviewer approves.
      const { spawner, calls } = sequentialSpawner({
        engineer: [
          { code: "v1" },
          { code: "v2" },
        ],
        reviewer: [
          { review: false },
          { review: true },
        ],
      });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        spawner,
      );

      // engineer(1) -> reviewer(1, reject) -> engineer(2) -> reviewer(2, approve) -> end
      assert.equal(calls.length, 4);
      assert.equal(calls[0].agent, "engineer");
      assert.equal(calls[1].agent, "reviewer");
      assert.equal(calls[2].agent, "engineer");
      assert.equal(calls[3].agent, "reviewer");
      assert.equal(result.steps.length, 4);
      assert.ok(result.steps.every(s => s.status === "ok"));
      assert.equal(result.state.review, true);
      assert.equal(result.state.code, "v2");
    });

    it("loop carries updated state between iterations", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          { skill: "engineer", reads: [], writes: ["state.code"], then: "reviewer" },
          {
            skill: "reviewer",
            reads: ["state.code"],
            writes: ["state.review"],
            then: [
              { when: "state.review == true", to: "end" },
              { when: "state.review == false", to: "engineer" },
            ],
          },
        ],
      });

      const { spawner, calls } = sequentialSpawner({
        engineer: [
          { code: "draft1" },
          { code: "draft2" },
        ],
        reviewer: [
          { review: false },
          { review: true },
        ],
      });

      await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        spawner,
      );

      // On second iteration, engineer sees the state from the first iteration
      assert.equal(calls[2].state.code, "draft1");
      assert.equal(calls[2].state.review, false);
      // On second review, reviewer sees draft2
      assert.equal(calls[3].state.code, "draft2");
    });
  });

  describe("max-iterations", () => {
    it("throws RunError when max iterations exceeded", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      // A loop that never exits (reviewer always returns false)
      const config = makeConfig({
        nodes: [
          { skill: "engineer", reads: [], writes: ["state.code"], then: "reviewer" },
          {
            skill: "reviewer",
            reads: ["state.code"],
            writes: ["state.review"],
            then: [
              { when: "state.review == true", to: "end" },
              { when: "state.review == false", to: "engineer" },
            ],
          },
        ],
      });

      await assert.rejects(
        () => run(
          { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false, maxIterations: 3 },
          mockSpawner({
            engineer: { code: "forever" },
            reviewer: { review: false },
          }),
        ),
        (err: Error) => {
          assert.ok(err instanceof RunError);
          assert.ok(err.message.includes("exceeded max iterations (3)"));
          return true;
        },
      );
    });

    it("respects custom max-iterations value", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          { skill: "engineer", reads: [], writes: ["state.code"], then: "reviewer" },
          {
            skill: "reviewer",
            reads: ["state.code"],
            writes: ["state.review"],
            then: [
              { when: "state.review == true", to: "end" },
              { when: "state.review == false", to: "engineer" },
            ],
          },
        ],
      });

      // With max-iterations=1, the first node can only be visited once
      // engineer(1) -> reviewer(1, reject) -> engineer(2, exceeds limit)
      await assert.rejects(
        () => run(
          { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false, maxIterations: 1 },
          mockSpawner({
            engineer: { code: "nope" },
            reviewer: { review: false },
          }),
        ),
        (err: Error) => {
          assert.ok(err instanceof RunError);
          assert.ok(err.message.includes("exceeded max iterations (1)"));
          return true;
        },
      );
    });

    it("default max iterations is 10", () => {
      assert.equal(DEFAULT_MAX_ITERATIONS, 10);
    });

    it("loop completes within max-iterations limit", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      // Loop that exits after 2 iterations (within limit of 3)
      const config = makeConfig({
        nodes: [
          { skill: "engineer", reads: [], writes: ["state.code"], then: "reviewer" },
          {
            skill: "reviewer",
            reads: ["state.code"],
            writes: ["state.review"],
            then: [
              { when: "state.review == true", to: "end" },
              { when: "state.review == false", to: "engineer" },
            ],
          },
        ],
      });

      const { spawner } = sequentialSpawner({
        engineer: [{ code: "v1" }, { code: "v2" }],
        reviewer: [{ review: false }, { review: true }],
      });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false, maxIterations: 3 },
        spawner,
      );

      assert.equal(result.steps.length, 4);
      assert.ok(result.steps.every(s => s.status === "ok"));
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

    it("then: end is accepted as valid flow", async () => {
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

    it("then: end on a middle node stops execution", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: [], writes: ["state.plan"], then: "end" },
          { skill: "engineer", reads: ["state.plan"], writes: ["state.code"] },
        ],
      });

      const { spawner, calls } = recordingSpawner({
        planner: { plan: "done" },
        engineer: { code: "should not run" },
      });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        spawner,
      );

      assert.equal(result.steps.length, 1);
      assert.equal(result.steps[0].status, "ok");
      assert.equal(result.steps[0].agent, "planner");
      assert.equal(calls.length, 1);
      assert.equal(result.state.plan, "done");
      assert.equal(result.state.code, undefined);
    });
  });

  describe("readStatePath", () => {
    it("reads top-level field", () => {
      assert.equal(readStatePath({ plan: "hello" }, "state.plan"), "hello");
    });

    it("reads nested field", () => {
      assert.equal(readStatePath({ review: { approved: true } }, "review.approved"), true);
    });

    it("returns undefined for missing field", () => {
      assert.equal(readStatePath({}, "state.missing"), undefined);
    });

    it("returns undefined for nested missing field", () => {
      assert.equal(readStatePath({ review: {} }, "review.approved"), undefined);
    });

    it("strips state. prefix", () => {
      assert.equal(readStatePath({ plan: "x" }, "state.plan"), "x");
    });
  });

  describe("evaluateWhenClause", () => {
    it("== true matches true", () => {
      assert.equal(evaluateWhenClause({ path: "state.x", operator: "==", value: true }, { x: true }), true);
    });

    it("== true does not match false", () => {
      assert.equal(evaluateWhenClause({ path: "state.x", operator: "==", value: true }, { x: false }), false);
    });

    it("!= false matches true", () => {
      assert.equal(evaluateWhenClause({ path: "state.x", operator: "!=", value: false }, { x: true }), true);
    });

    it("== string matches", () => {
      assert.equal(evaluateWhenClause({ path: "state.x", operator: "==", value: "yes" }, { x: "yes" }), true);
    });

    it("== string does not match different string", () => {
      assert.equal(evaluateWhenClause({ path: "state.x", operator: "==", value: "yes" }, { x: "no" }), false);
    });

    it("handles nested path", () => {
      assert.equal(
        evaluateWhenClause({ path: "review.approved", operator: "==", value: true }, { review: { approved: true } }),
        true,
      );
    });
  });

  describe("evaluateConditionalBranches", () => {
    it("returns target of first matching branch", () => {
      const branches = [
        { when: "state.x == true", to: "a" },
        { when: "state.x == false", to: "b" },
      ];
      assert.equal(evaluateConditionalBranches(branches, { x: true }), "a");
    });

    it("returns target of second branch when first does not match", () => {
      const branches = [
        { when: "state.x == true", to: "a" },
        { when: "state.x == false", to: "b" },
      ];
      assert.equal(evaluateConditionalBranches(branches, { x: false }), "b");
    });

    it("returns undefined when no branch matches", () => {
      const branches = [
        { when: 'state.x == "a"', to: "a" },
        { when: 'state.x == "b"', to: "b" },
      ];
      assert.equal(evaluateConditionalBranches(branches, { x: "c" }), undefined);
    });
  });
});
