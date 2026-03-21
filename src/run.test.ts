import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { Config } from "./config.js";
import { RunError } from "./errors.js";
import type { Graph } from "./graph.js";
import type { Checkpoint, OnErrorMode, Spawner, StepResult } from "./run.js";
import { evaluateWhenClause, formatDuration, getStateValue, run } from "./run.js";

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
 * Useful for testing loops where the same agent returns different results each time.
 */
function sequenceSpawner(
  sequences: Record<string, Record<string, unknown>[]>,
): { spawner: Spawner; calls: Array<{ agent: string; state: Record<string, unknown> }> } {
  const calls: Array<{ agent: string; state: Record<string, unknown> }> = [];
  const counters = new Map<string, number>();
  return {
    calls,
    spawner: {
      async spawn(agentName: string, _skillContent: string, state: Record<string, unknown>) {
        calls.push({ agent: agentName, state: { ...state } });
        const seq = sequences[agentName];
        if (!seq) return {};
        const idx = counters.get(agentName) ?? 0;
        counters.set(agentName, idx + 1);
        return seq[idx] ?? seq[seq.length - 1] ?? {};
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

/**
 * Mock spawner that fails N times then succeeds for a specific agent.
 * Records all spawn attempts.
 */
function retrySpawner(
  failOn: string,
  failCount: number,
  successUpdate: Record<string, unknown>,
): { spawner: Spawner; attempts: number[] } {
  const state = { count: 0 };
  const attempts: number[] = [];
  return {
    attempts,
    spawner: {
      async spawn(agentName: string, _skillContent: string, _state: Record<string, unknown>) {
        if (agentName === failOn) {
          state.count++;
          attempts.push(state.count);
          if (state.count <= failCount) {
            throw new Error(`Agent ${agentName} failed (attempt ${state.count})`);
          }
          return successUpdate;
        }
        return {};
      },
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

    it("non-linear then jumps to the correct node", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: [], writes: ["state.plan"], then: "reviewer" },
          { skill: "engineer", reads: ["state.plan"], writes: ["state.code"] },
          { skill: "reviewer", reads: ["state.plan"], writes: ["state.review"] },
        ],
      });

      const { spawner, calls } = recordingSpawner({
        planner: { plan: "skip engineer" },
        reviewer: { review: "reviewed" },
      });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        spawner,
      );

      assert.equal(calls.length, 2);
      assert.equal(calls[0].agent, "planner");
      assert.equal(calls[1].agent, "reviewer");
      assert.equal(result.state.review, "reviewed");
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

  describe("conditional routing", () => {
    it("routes to the correct branch when condition matches", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          {
            skill: "reviewer",
            reads: ["state.code"],
            writes: ["state.review"],
            then: [
              { when: "review.approved == true", to: "end" },
              { when: "review.approved == false", to: "engineer" },
            ],
          },
          { skill: "engineer", reads: ["state.review"], writes: ["state.code"] },
        ],
      });

      // Reviewer returns approved = true, so should go to "end"
      const { spawner, calls } = recordingSpawner({
        reviewer: { review: { approved: true } },
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

    it("routes to alternative branch when first condition does not match", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          {
            skill: "reviewer",
            reads: ["state.code"],
            writes: ["state.review"],
            then: [
              { when: "review.approved == true", to: "end" },
              { when: "review.approved == false", to: "engineer" },
            ],
          },
          { skill: "engineer", reads: ["state.review"], writes: ["state.code"] },
        ],
      });

      // First call: reviewer returns approved = false -> routes to engineer
      // Second call: engineer returns code
      // Then engineer falls through to end (no more nodes after it)
      const { spawner, calls } = sequenceSpawner({
        reviewer: [{ review: { approved: false } }],
        engineer: [{ code: "fixed" }],
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

    it("throws when no conditional branch matches", async () => {
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
            ],
          },
          { skill: "engineer", reads: [], writes: ["state.code"] },
        ],
      });

      // Reviewer returns approved = false, but there's no branch for that
      await assert.rejects(
        () => run(
          { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
          mockSpawner({ reviewer: { review: { approved: false } } }),
        ),
        (err: Error) => {
          assert.ok(err instanceof RunError);
          assert.ok(err.message.includes("no conditional branch matched"));
          return true;
        },
      );
    });

    it("string equality in when clause", async () => {
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
              { when: 'plan.status == "ready"', to: "engineer" },
              { when: 'plan.status == "needs-work"', to: "planner" },
            ],
          },
          { skill: "engineer", reads: ["state.plan"], writes: ["state.code"] },
        ],
      });

      const { spawner, calls } = sequenceSpawner({
        planner: [{ plan: { status: "ready" } }],
        engineer: [{ code: "done" }],
      });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        spawner,
      );

      assert.equal(calls.length, 2);
      assert.equal(calls[0].agent, "planner");
      assert.equal(calls[1].agent, "engineer");
    });

    it("inequality operator in when clause", async () => {
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
              { when: "review.approved != false", to: "end" },
              { when: "review.approved == false", to: "engineer" },
            ],
          },
          { skill: "engineer", reads: [], writes: ["state.code"] },
        ],
      });

      // approved = true, which != false, so routes to "end"
      const { spawner, calls } = recordingSpawner({
        reviewer: { review: { approved: true } },
      });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        spawner,
      );

      assert.equal(calls.length, 1);
      assert.equal(result.steps.length, 1);
    });

    it("dry-run falls through sequentially for conditionals", async () => {
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

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: true },
        mockSpawner({}),
      );

      // Dry-run should fall through sequentially since we have no real state
      assert.equal(result.steps.length, 2);
      assert.ok(result.steps.every(s => s.status === "skipped"));
    });
  });

  describe("loop execution", () => {
    it("loops back to a previous node and exits on condition", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      // Flow: engineer -> reviewer -> (if approved: end, else: engineer)
      const config = makeConfig({
        nodes: [
          { skill: "engineer", reads: [], writes: ["state.code"], then: "reviewer" },
          {
            skill: "reviewer",
            reads: ["state.code"],
            writes: ["state.review"],
            then: [
              { when: "review.approved == true", to: "end" },
              { when: "review.approved == false", to: "engineer" },
            ],
          },
        ],
      });

      // First iteration: engineer writes code, reviewer rejects
      // Second iteration: engineer fixes code, reviewer approves
      const { spawner, calls } = sequenceSpawner({
        engineer: [
          { code: "v1" },
          { code: "v2" },
        ],
        reviewer: [
          { review: { approved: false } },
          { review: { approved: true } },
        ],
      });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        spawner,
      );

      // engineer -> reviewer -> engineer -> reviewer -> end
      assert.equal(calls.length, 4);
      assert.equal(calls[0].agent, "engineer");
      assert.equal(calls[1].agent, "reviewer");
      assert.equal(calls[2].agent, "engineer");
      assert.equal(calls[3].agent, "reviewer");
      assert.equal(result.steps.length, 4);
      assert.deepEqual(result.state.review, { approved: true });
    });

    it("max-iterations stops infinite loops", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      // A loop that never exits
      const config = makeConfig({
        nodes: [
          {
            skill: "engineer",
            reads: [],
            writes: ["state.code"],
            then: [
              { when: "code.done == true", to: "end" },
              { when: "code.done != true", to: "engineer" },
            ],
          },
        ],
      });

      // Engineer never sets done = true
      await assert.rejects(
        () => run(
          {
            config,
            bodies: makeBodies(),
            target: "claude-code",
            outDir: "build",
            dryRun: false,
            maxIterations: 3,
          },
          mockSpawner({ engineer: { code: { done: false } } }),
        ),
        (err: Error) => {
          assert.ok(err instanceof RunError);
          assert.ok(err.message.includes("exceeded max iterations (3)"));
          return true;
        },
      );
    });

    it("default max-iterations is 10", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          {
            skill: "engineer",
            reads: [],
            writes: ["state.code"],
            then: [
              { when: "code.done == true", to: "end" },
              { when: "code.done != true", to: "engineer" },
            ],
          },
        ],
      });

      await assert.rejects(
        () => run(
          { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
          mockSpawner({ engineer: { code: { done: false } } }),
        ),
        (err: Error) => {
          assert.ok(err instanceof RunError);
          assert.ok(err.message.includes("exceeded max iterations (10)"));
          return true;
        },
      );
    });

    it("loop accumulates state across iterations", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          {
            skill: "engineer",
            reads: [],
            writes: ["state.code"],
            then: [
              { when: "code.version == 3", to: "end" },
              { when: "code.version != 3", to: "engineer" },
            ],
          },
        ],
      });

      let callCount = 0;
      const spawner: Spawner = {
        async spawn(_agentName: string, _skillContent: string, _state: Record<string, unknown>) {
          callCount++;
          return { code: { version: callCount } };
        },
      };

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        spawner,
      );

      assert.equal(callCount, 3);
      assert.deepEqual(result.state.code, { version: 3 });
    });
  });

  describe("unsupported features", () => {
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
    it("spawner error is captured in step result (abort mode)", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: [], writes: ["state.plan"] },
        ],
      });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false, onError: "abort" },
        errorSpawner("planner"),
      );

      assert.equal(result.steps[0].status, "error");
      assert.ok(result.steps[0].error?.includes("Agent planner failed"));
    });

    it("execution halts on spawner error in abort mode", async () => {
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
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false, onError: "abort" },
        errorSpawner("planner"),
      );

      assert.equal(result.steps.length, 1);
      assert.equal(result.steps[0].status, "error");
    });

    it("default onError mode is abort", async () => {
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

      // Default abort: stops at first error
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

  describe("onError: retry", () => {
    it("retries a failed step and succeeds", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: [], writes: ["state.plan"] },
        ],
      });

      // Fails once, then succeeds
      const { spawner, attempts } = retrySpawner("planner", 1, { plan: "recovered" });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false, onError: "retry", maxRetries: 3 },
        spawner,
      );

      assert.equal(result.steps[0].status, "ok");
      assert.equal(result.steps[0].attempts, 2);
      assert.equal(result.state.plan, "recovered");
      assert.equal(attempts.length, 2);
    });

    it("exhausts retries and fails", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: [], writes: ["state.plan"], then: "engineer" },
          { skill: "engineer", reads: ["state.plan"], writes: ["state.code"] },
        ],
      });

      // Fails 5 times, maxRetries is 3 so never succeeds
      const { spawner, attempts } = retrySpawner("planner", 5, { plan: "never" });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false, onError: "retry", maxRetries: 3 },
        spawner,
      );

      assert.equal(result.steps.length, 1);
      assert.equal(result.steps[0].status, "error");
      assert.equal(result.steps[0].attempts, 3);
      assert.equal(attempts.length, 3);
    });

    it("records errors in state._errors on retry exhaustion", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: [], writes: ["state.plan"] },
        ],
      });

      const { spawner } = retrySpawner("planner", 5, {});

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false, onError: "retry", maxRetries: 2 },
        spawner,
      );

      assert.ok(Array.isArray(result.state._errors));
      const errors = result.state._errors as Array<{ step: number; agent: string; attempts: number }>;
      assert.equal(errors.length, 1);
      assert.equal(errors[0].step, 1);
      assert.equal(errors[0].agent, "planner");
      assert.equal(errors[0].attempts, 2);
    });

    it("successful step on first attempt does not record attempts count", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: [], writes: ["state.plan"] },
        ],
      });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false, onError: "retry" },
        mockSpawner({ planner: { plan: "done" } }),
      );

      assert.equal(result.steps[0].status, "ok");
      assert.equal(result.steps[0].attempts, undefined);
    });
  });

  describe("onError: skip", () => {
    it("skips failed step and continues pipeline", async () => {
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
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false, onError: "skip" },
        errorSpawner("planner"),
      );

      assert.equal(result.steps.length, 2);
      assert.equal(result.steps[0].status, "skipped");
      assert.ok(result.steps[0].error?.includes("Agent planner failed"));
      assert.equal(result.steps[1].status, "ok");
    });

    it("records skipped errors in state._errors", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: [], writes: ["state.plan"] },
        ],
      });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false, onError: "skip" },
        errorSpawner("planner"),
      );

      assert.ok(Array.isArray(result.state._errors));
      const errors = result.state._errors as Array<{ agent: string }>;
      assert.equal(errors[0].agent, "planner");
    });

    it("multiple errors are accumulated in state._errors", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: [], writes: ["state.plan"], then: "engineer" },
          { skill: "engineer", reads: ["state.plan"], writes: ["state.code"] },
        ],
      });

      // Both agents fail
      const spawner: Spawner = {
        async spawn(agentName: string) {
          throw new Error(`${agentName} broke`);
        },
      };

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false, onError: "skip" },
        spawner,
      );

      assert.equal(result.steps.length, 2);
      assert.equal(result.steps[0].status, "skipped");
      assert.equal(result.steps[1].status, "skipped");
      const errors = result.state._errors as Array<{ agent: string }>;
      assert.equal(errors.length, 2);
    });
  });

  describe("step timing", () => {
    it("records durationMs for each step", async () => {
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
          planner: { plan: "done" },
          engineer: { code: "done" },
        }),
      );

      assert.equal(result.steps.length, 2);
      for (const step of result.steps) {
        assert.equal(typeof step.durationMs, "number");
        assert.ok(step.durationMs! >= 0);
      }
    });

    it("records total pipeline durationMs", async () => {
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
        mockSpawner({ planner: { plan: "done" } }),
      );

      assert.equal(typeof result.durationMs, "number");
      assert.ok(result.durationMs >= 0);
    });

    it("records durationMs for failed steps", async () => {
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
      assert.equal(typeof result.steps[0].durationMs, "number");
    });
  });

  describe("formatDuration", () => {
    it("formats milliseconds", () => {
      assert.equal(formatDuration(50), "50ms");
      assert.equal(formatDuration(999), "999ms");
    });

    it("formats seconds", () => {
      assert.equal(formatDuration(1000), "1s");
      assert.equal(formatDuration(5000), "5s");
      assert.equal(formatDuration(59000), "59s");
    });

    it("formats minutes and seconds", () => {
      assert.equal(formatDuration(60000), "1m");
      assert.equal(formatDuration(90000), "1m 30s");
      assert.equal(formatDuration(151000), "2m 31s");
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

  describe("evaluateWhenClause", () => {
    it("equals with boolean true", () => {
      const state = { review: { approved: true } };
      assert.equal(evaluateWhenClause("review.approved == true", state), true);
    });

    it("equals with boolean false", () => {
      const state = { review: { approved: false } };
      assert.equal(evaluateWhenClause("review.approved == false", state), true);
    });

    it("not-equals with boolean", () => {
      const state = { review: { approved: true } };
      assert.equal(evaluateWhenClause("review.approved != false", state), true);
    });

    it("equals with string value", () => {
      const state = { plan: { status: "ready" } };
      assert.equal(evaluateWhenClause('plan.status == "ready"', state), true);
    });

    it("not-equals with string value", () => {
      const state = { plan: { status: "ready" } };
      assert.equal(evaluateWhenClause('plan.status != "draft"', state), true);
    });

    it("returns false when value does not match", () => {
      const state = { review: { approved: false } };
      assert.equal(evaluateWhenClause("review.approved == true", state), false);
    });

    it("handles missing path gracefully", () => {
      const state = {};
      assert.equal(evaluateWhenClause("review.approved == true", state), false);
    });

    it("handles state. prefix in path", () => {
      const state = { review: { approved: true } };
      assert.equal(evaluateWhenClause("state.review.approved == true", state), true);
    });

    it("number comparison", () => {
      const state = { count: 5 };
      assert.equal(evaluateWhenClause("count == 5", state), true);
      assert.equal(evaluateWhenClause("count != 3", state), true);
      assert.equal(evaluateWhenClause("count == 3", state), false);
    });
  });

  describe("getStateValue", () => {
    it("reads top-level field", () => {
      assert.equal(getStateValue({ name: "test" }, "name"), "test");
    });

    it("reads nested field with dot-path", () => {
      assert.deepEqual(
        getStateValue({ review: { approved: true } }, "review.approved"),
        true,
      );
    });

    it("strips state. prefix", () => {
      assert.equal(getStateValue({ name: "test" }, "state.name"), "test");
    });

    it("returns undefined for missing path", () => {
      assert.equal(getStateValue({}, "missing.field"), undefined);
    });

    it("returns undefined for partially missing path", () => {
      assert.equal(getStateValue({ a: { b: 1 } }, "a.c"), undefined);
    });

    it("handles deeply nested paths", () => {
      const state = { a: { b: { c: { d: "deep" } } } };
      assert.equal(getStateValue(state, "a.b.c.d"), "deep");
    });
  });

  describe("checkpoint and resume", () => {
    it("resumes from mid-pipeline when checkpoint exists", async () => {
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

      // Write a checkpoint indicating planner and engineer are done
      const checkpointDir = join(tmpDir, ".skillfold", "run");
      mkdirSync(checkpointDir, { recursive: true });
      const checkpoint: Checkpoint = {
        configHash: "abc123",
        completedSteps: ["planner", "engineer"],
        currentStepIndex: 2,
        state: { plan: "the plan", code: "the code" },
        startedAt: "2026-03-22T00:00:00.000Z",
      };
      writeFileSync(join(checkpointDir, "checkpoint.json"), JSON.stringify(checkpoint));

      // Also write state.json (which would exist from the previous partial run)
      writeFileSync(join(tmpDir, "state.json"), JSON.stringify({ plan: "the plan", code: "the code" }));

      const { spawner, calls } = recordingSpawner({
        reviewer: { review: "LGTM" },
      });

      const result = await run(
        {
          config,
          bodies: makeBodies(),
          target: "claude-code",
          outDir: "build",
          dryRun: false,
          resume: true,
          configHash: "abc123",
        },
        spawner,
      );

      // Only the reviewer should have been called
      assert.equal(calls.length, 1);
      assert.equal(calls[0].agent, "reviewer");
      // State from checkpoint should have been passed to the spawner
      assert.equal(calls[0].state.plan, "the plan");
      assert.equal(calls[0].state.code, "the code");
      assert.equal(result.steps.length, 1);
      assert.equal(result.steps[0].status, "ok");
      assert.equal(result.state.review, "LGTM");
    });

    it("throws RunError when resuming with no checkpoint", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: [], writes: ["state.plan"] },
        ],
      });

      await assert.rejects(
        () => run(
          {
            config,
            bodies: makeBodies(),
            target: "claude-code",
            outDir: "build",
            dryRun: false,
            resume: true,
          },
          mockSpawner({}),
        ),
        (err: Error) => {
          assert.ok(err instanceof RunError);
          assert.ok(err.message.includes("No checkpoint found"));
          return true;
        },
      );
    });

    it("throws RunError when config hash does not match checkpoint", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: [], writes: ["state.plan"] },
        ],
      });

      // Write checkpoint with one hash
      const checkpointDir = join(tmpDir, ".skillfold", "run");
      mkdirSync(checkpointDir, { recursive: true });
      const checkpoint: Checkpoint = {
        configHash: "original-hash",
        completedSteps: [],
        currentStepIndex: 0,
        state: {},
        startedAt: "2026-03-22T00:00:00.000Z",
      };
      writeFileSync(join(checkpointDir, "checkpoint.json"), JSON.stringify(checkpoint));

      // Resume with a different hash
      await assert.rejects(
        () => run(
          {
            config,
            bodies: makeBodies(),
            target: "claude-code",
            outDir: "build",
            dryRun: false,
            resume: true,
            configHash: "different-hash",
          },
          mockSpawner({}),
        ),
        (err: Error) => {
          assert.ok(err instanceof RunError);
          assert.ok(err.message.includes("Config has changed"));
          return true;
        },
      );
    });

    it("clean run clears previous checkpoint", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      // Write an existing checkpoint
      const checkpointDir = join(tmpDir, ".skillfold", "run");
      mkdirSync(checkpointDir, { recursive: true });
      writeFileSync(
        join(checkpointDir, "checkpoint.json"),
        JSON.stringify({ configHash: "old", completedSteps: ["planner"], currentStepIndex: 1, state: {}, startedAt: "" }),
      );

      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: [], writes: ["state.plan"] },
        ],
      });

      await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        mockSpawner({ planner: { plan: "fresh" } }),
      );

      // The old checkpoint dir should have been cleared and a new checkpoint written
      const newCheckpoint = JSON.parse(readFileSync(join(checkpointDir, "checkpoint.json"), "utf-8")) as Checkpoint;
      assert.equal(newCheckpoint.completedSteps.length, 1);
      assert.equal(newCheckpoint.completedSteps[0], "planner");
    });

    it("checkpoint is written after each successful step", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: [], writes: ["state.plan"], then: "engineer" },
          { skill: "engineer", reads: ["state.plan"], writes: ["state.code"] },
        ],
      });

      // Use a spawner that checks checkpoint after planner runs
      let checkpointAfterPlanner: Checkpoint | undefined;
      const spawner: Spawner = {
        async spawn(agentName: string, _skillContent: string, _state: Record<string, unknown>) {
          if (agentName === "engineer") {
            // Read checkpoint that was written after planner completed
            const cpPath = join(tmpDir!, ".skillfold", "run", "checkpoint.json");
            if (existsSync(cpPath)) {
              checkpointAfterPlanner = JSON.parse(readFileSync(cpPath, "utf-8")) as Checkpoint;
            }
          }
          if (agentName === "planner") return { plan: "done" };
          return { code: "done" };
        },
      };

      await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        spawner,
      );

      // After planner ran but before engineer, checkpoint should show planner completed
      assert.ok(checkpointAfterPlanner);
      assert.deepEqual(checkpointAfterPlanner!.completedSteps, ["planner"]);
      assert.equal(checkpointAfterPlanner!.state.plan, "done");

      // Final checkpoint should show both steps completed
      const finalCheckpoint = JSON.parse(
        readFileSync(join(tmpDir, ".skillfold", "run", "checkpoint.json"), "utf-8"),
      ) as Checkpoint;
      assert.deepEqual(finalCheckpoint.completedSteps, ["planner", "engineer"]);
      assert.equal(finalCheckpoint.state.code, "done");
    });
  });

  describe("map execution", () => {
    it("executes subgraph for each item in parallel", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      // Pre-seed state with a list of items
      writeFileSync(join(tmpDir, "state.json"), JSON.stringify({
        tasks: [
          { title: "task-a", output: "" },
          { title: "task-b", output: "" },
        ],
      }));

      const config = makeConfig({
        nodes: [
          {
            over: "state.tasks",
            as: "task",
            flow: [
              { skill: "engineer", reads: ["task.title"], writes: ["task.output"] },
            ],
          },
        ],
      });

      const { spawner, calls } = recordingSpawner({
        engineer: { output: "done" },
      });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        spawner,
      );

      // Both items should have been processed
      assert.equal(calls.length, 2);
      assert.equal(result.steps.length, 1);
      assert.equal(result.steps[0].agent, "map");
      assert.equal(result.steps[0].status, "ok");
      assert.ok(result.steps[0].mapItems);
      assert.equal(result.steps[0].mapItems!.length, 2);
      assert.equal(result.steps[0].mapItems![0].status, "ok");
      assert.equal(result.steps[0].mapItems![1].status, "ok");

      // State should have updated items
      const tasks = result.state.tasks as Array<{ title: string; output: string }>;
      assert.equal(tasks[0].output, "done");
      assert.equal(tasks[1].output, "done");
    });

    it("scopes item state correctly per item", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      writeFileSync(join(tmpDir, "state.json"), JSON.stringify({
        tasks: [
          { title: "first" },
          { title: "second" },
        ],
      }));

      const config = makeConfig({
        nodes: [
          {
            over: "state.tasks",
            as: "task",
            flow: [
              { skill: "engineer", reads: ["task.title"], writes: ["task.output"] },
            ],
          },
        ],
      });

      // Return different output per call to verify scoped state
      const callStates: Array<Record<string, unknown>> = [];
      const spawner: Spawner = {
        async spawn(_agentName: string, _skillContent: string, state: Record<string, unknown>) {
          callStates.push(JSON.parse(JSON.stringify(state)));
          const task = state.task as Record<string, unknown>;
          return { output: `processed-${task.title}` };
        },
      };

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        spawner,
      );

      // Each call should have received scoped state with the task variable
      assert.equal(callStates.length, 2);
      assert.deepEqual((callStates[0].task as Record<string, unknown>).title, "first");
      assert.deepEqual((callStates[1].task as Record<string, unknown>).title, "second");

      const tasks = result.state.tasks as Array<{ title: string; output: string }>;
      assert.equal(tasks[0].output, "processed-first");
      assert.equal(tasks[1].output, "processed-second");
    });

    it("handles empty list gracefully", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      writeFileSync(join(tmpDir, "state.json"), JSON.stringify({ tasks: [] }));

      const config = makeConfig({
        nodes: [
          {
            over: "state.tasks",
            as: "task",
            flow: [
              { skill: "engineer", reads: [], writes: ["task.output"] },
            ],
          },
        ],
      });

      const { spawner, calls } = recordingSpawner({});

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        spawner,
      );

      assert.equal(calls.length, 0);
      assert.equal(result.steps[0].status, "ok");
      assert.equal(result.steps[0].mapItems!.length, 0);
    });

    it("map with multi-step subgraph executes steps in order per item", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      writeFileSync(join(tmpDir, "state.json"), JSON.stringify({
        tasks: [{ title: "task-1" }],
      }));

      const config = makeConfig({
        nodes: [
          {
            over: "state.tasks",
            as: "task",
            flow: [
              { skill: "engineer", reads: ["task.title"], writes: ["task.output"], then: "reviewer" },
              { skill: "reviewer", reads: ["task.output"], writes: ["task.approved"] },
            ],
          },
        ],
      });

      const callOrder: string[] = [];
      const spawner: Spawner = {
        async spawn(agentName: string) {
          callOrder.push(agentName);
          if (agentName === "engineer") return { output: "code" };
          return { approved: true };
        },
      };

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        spawner,
      );

      assert.deepEqual(callOrder, ["engineer", "reviewer"]);
      assert.equal(result.steps[0].mapItems![0].steps.length, 2);
      assert.equal(result.steps[0].mapItems![0].steps[0].agent, "engineer");
      assert.equal(result.steps[0].mapItems![0].steps[1].agent, "reviewer");

      const tasks = result.state.tasks as Array<{ output: string; approved: boolean }>;
      assert.equal(tasks[0].output, "code");
      assert.equal(tasks[0].approved, true);
    });

    it("map with conditional routing in subgraph", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      writeFileSync(join(tmpDir, "state.json"), JSON.stringify({
        tasks: [{ title: "task-1" }],
      }));

      const config = makeConfig({
        nodes: [
          {
            over: "state.tasks",
            as: "task",
            flow: [
              { skill: "engineer", reads: ["task.title"], writes: ["task.output"], then: "reviewer" },
              {
                skill: "reviewer",
                reads: ["task.output"],
                writes: ["task.approved"],
                then: [
                  { when: "task.approved == false", to: "engineer" },
                  { when: "task.approved == true", to: "end" },
                ],
              },
            ],
          },
        ],
      });

      // Engineer runs twice, reviewer approves on second pass
      let engineerCalls = 0;
      let reviewerCalls = 0;
      const spawner: Spawner = {
        async spawn(agentName: string) {
          if (agentName === "engineer") {
            engineerCalls++;
            return { output: `code-v${engineerCalls}` };
          }
          reviewerCalls++;
          return { approved: reviewerCalls >= 2 };
        },
      };

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        spawner,
      );

      assert.equal(result.steps[0].status, "ok");
      assert.equal(engineerCalls, 2);
      assert.equal(reviewerCalls, 2);
      const tasks = result.state.tasks as Array<{ approved: boolean }>;
      assert.equal(tasks[0].approved, true);
    });

    it("per-item error handling with abort mode", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      writeFileSync(join(tmpDir, "state.json"), JSON.stringify({
        tasks: [{ title: "good" }, { title: "bad" }],
      }));

      const config = makeConfig({
        nodes: [
          {
            over: "state.tasks",
            as: "task",
            flow: [
              { skill: "engineer", reads: ["task.title"], writes: ["task.output"] },
            ],
          },
        ],
      });

      const spawner: Spawner = {
        async spawn(_agentName: string, _skillContent: string, state: Record<string, unknown>) {
          const task = state.task as Record<string, unknown>;
          if (task.title === "bad") throw new Error("Item failed");
          return { output: "ok" };
        },
      };

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false, onError: "abort" },
        spawner,
      );

      // Map step should report error because at least one item failed
      assert.equal(result.steps[0].status, "error");
      const items = result.steps[0].mapItems!;
      // One should be ok, one should be error (order may vary since parallel)
      const okItems = items.filter(i => i.status === "ok");
      const errorItems = items.filter(i => i.status === "error");
      assert.equal(okItems.length, 1);
      assert.equal(errorItems.length, 1);
    });

    it("per-item error handling with skip mode", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      writeFileSync(join(tmpDir, "state.json"), JSON.stringify({
        tasks: [{ title: "good" }, { title: "bad" }],
      }));

      const config = makeConfig({
        nodes: [
          {
            over: "state.tasks",
            as: "task",
            flow: [
              { skill: "engineer", reads: ["task.title"], writes: ["task.output"] },
            ],
          },
        ],
      });

      const spawner: Spawner = {
        async spawn(_agentName: string, _skillContent: string, state: Record<string, unknown>) {
          const task = state.task as Record<string, unknown>;
          if (task.title === "bad") throw new Error("Item failed");
          return { output: "ok" };
        },
      };

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false, onError: "skip" },
        spawner,
      );

      // With skip mode, overall map step should be ok
      assert.equal(result.steps[0].status, "ok");
    });

    it("map before and after linear steps", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      writeFileSync(join(tmpDir, "state.json"), JSON.stringify({
        plan: "",
        tasks: [{ title: "task-1" }],
      }));

      const config = makeConfig({
        nodes: [
          { skill: "planner", reads: [], writes: ["state.plan", "state.tasks"] },
          {
            over: "state.tasks",
            as: "task",
            flow: [
              { skill: "engineer", reads: ["task.title"], writes: ["task.output"] },
            ],
            then: "reviewer",
          },
          { skill: "reviewer", reads: ["state.tasks"], writes: ["state.review"] },
        ],
      });

      const spawner: Spawner = {
        async spawn(agentName: string) {
          if (agentName === "planner") return { plan: "planned", tasks: [{ title: "task-1" }] };
          if (agentName === "engineer") return { output: "coded" };
          return { review: "approved" };
        },
      };

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        spawner,
      );

      assert.equal(result.steps.length, 3);
      assert.equal(result.steps[0].agent, "planner");
      assert.equal(result.steps[0].status, "ok");
      assert.equal(result.steps[1].agent, "map");
      assert.equal(result.steps[1].status, "ok");
      assert.equal(result.steps[2].agent, "reviewer");
      assert.equal(result.steps[2].status, "ok");
    });

    it("dry run logs map steps without executing", async () => {
      const config = makeConfig({
        nodes: [
          {
            over: "state.tasks",
            as: "task",
            flow: [
              { skill: "engineer", reads: ["task.title"], writes: ["task.output"] },
            ],
          },
        ],
      });

      // Pre-set state for dry run to read
      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: true },
        mockSpawner({}),
      );

      assert.equal(result.steps.length, 1);
      assert.equal(result.steps[0].agent, "map");
      assert.equal(result.steps[0].status, "skipped");
    });

    it("errors when over field is not an array", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      writeFileSync(join(tmpDir, "state.json"), JSON.stringify({
        tasks: "not-an-array",
      }));

      const config = makeConfig({
        nodes: [
          {
            over: "state.tasks",
            as: "task",
            flow: [
              { skill: "engineer", reads: [], writes: ["task.output"] },
            ],
          },
        ],
      });

      await assert.rejects(
        () => run(
          { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
          mockSpawner({}),
        ),
        (err: Error) => {
          assert.ok(err instanceof RunError);
          assert.ok(err.message.includes("not an array"));
          return true;
        },
      );
    });

    it("map item timing is recorded", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      writeFileSync(join(tmpDir, "state.json"), JSON.stringify({
        tasks: [{ title: "a" }, { title: "b" }],
      }));

      const config = makeConfig({
        nodes: [
          {
            over: "state.tasks",
            as: "task",
            flow: [
              { skill: "engineer", reads: [], writes: ["task.output"] },
            ],
          },
        ],
      });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        mockSpawner({ engineer: { output: "done" } }),
      );

      assert.ok(result.steps[0].durationMs! >= 0);
      for (const item of result.steps[0].mapItems!) {
        assert.equal(typeof item.durationMs, "number");
        assert.ok(item.durationMs! >= 0);
      }
    });

    it("map with retry on per-item error", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      writeFileSync(join(tmpDir, "state.json"), JSON.stringify({
        tasks: [{ title: "flaky" }],
      }));

      const config = makeConfig({
        nodes: [
          {
            over: "state.tasks",
            as: "task",
            flow: [
              { skill: "engineer", reads: ["task.title"], writes: ["task.output"] },
            ],
          },
        ],
      });

      let attempts = 0;
      const spawner: Spawner = {
        async spawn() {
          attempts++;
          if (attempts < 2) throw new Error("Transient failure");
          return { output: "recovered" };
        },
      };

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false, onError: "retry", maxRetries: 3 },
        spawner,
      );

      assert.equal(result.steps[0].status, "ok");
      const tasks = result.state.tasks as Array<{ output: string }>;
      assert.equal(tasks[0].output, "recovered");
    });

    it("map writes state.json after completion", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      writeFileSync(join(tmpDir, "state.json"), JSON.stringify({
        tasks: [{ title: "a" }],
      }));

      const config = makeConfig({
        nodes: [
          {
            over: "state.tasks",
            as: "task",
            flow: [
              { skill: "engineer", reads: [], writes: ["task.output"] },
            ],
          },
        ],
      });

      await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        mockSpawner({ engineer: { output: "done" } }),
      );

      const saved = JSON.parse(readFileSync(join(tmpDir, "state.json"), "utf-8")) as { tasks: Array<{ output: string }> };
      assert.equal(saved.tasks[0].output, "done");
    });

    it("async nodes inside map subgraph are skipped", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      writeFileSync(join(tmpDir, "state.json"), JSON.stringify({
        tasks: [{ title: "a" }],
      }));

      const config = makeConfig({
        nodes: [
          {
            over: "state.tasks",
            as: "task",
            flow: [
              { skill: "engineer", reads: [], writes: ["task.output"], then: "human" },
              { name: "human", async: true as const, reads: [], writes: ["task.feedback"], policy: "skip" as const, then: "reviewer" },
              { skill: "reviewer", reads: ["task.feedback"], writes: ["task.approved"] },
            ],
          },
        ],
      });

      const spawner: Spawner = {
        async spawn(agentName: string) {
          if (agentName === "engineer") return { output: "code" };
          return { approved: true };
        },
      };

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        spawner,
      );

      assert.equal(result.steps[0].status, "ok");
      const itemSteps = result.steps[0].mapItems![0].steps;
      assert.equal(itemSteps.length, 3);
      assert.equal(itemSteps[0].agent, "engineer");
      assert.equal(itemSteps[0].status, "ok");
      assert.equal(itemSteps[1].agent, "human");
      assert.equal(itemSteps[1].status, "skipped");
      assert.equal(itemSteps[2].agent, "reviewer");
      assert.equal(itemSteps[2].status, "ok");
    });
  });

  describe("state backends", () => {
    it("reads initial state from backends on fresh run", async () => {
      tmpDir = makeTmpDir();
      origCwd = process.cwd();
      process.chdir(tmpDir);

      // Config with state schema that has integration locations
      const config: Config = {
        name: "test-pipeline",
        skills: {
          planning: { path: "./skills/planning" },
          planner: { compose: ["planning"], description: "Plans work" },
        },
        state: {
          types: {
            Task: { fields: { title: "string", description: "string" } },
          },
          fields: {
            tasks: {
              type: { kind: "list", element: "Task" },
              location: {
                integration: { type: "github-issues", config: { repo: "org/repo", label: "task" } },
              },
            },
          },
        },
        team: {
          flow: {
            nodes: [
              {
                name: "planner",
                skill: "planner",
                reads: [],
                writes: ["state.tasks"],
              },
            ],
          },
        },
      };

      const { spawner, calls } = recordingSpawner({
        planner: { tasks: [{ title: "Updated" }] },
      });

      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: false },
        spawner,
      );

      // The run should succeed - backends are resolved but gh CLI isn't available
      // in test, so readStateFromBackends will fail gracefully (empty state)
      assert.equal(result.steps.length, 1);
      assert.equal(result.steps[0].status, "ok");
    });

    it("skips backends in dry-run mode", async () => {
      const config: Config = {
        name: "test-pipeline",
        skills: {
          planning: { path: "./skills/planning" },
          planner: { compose: ["planning"], description: "Plans work" },
        },
        state: {
          types: {},
          fields: {
            direction: {
              type: { kind: "primitive", value: "string" },
              location: {
                integration: { type: "github-discussions", config: { repo: "org/repo" } },
              },
            },
          },
        },
        team: {
          flow: {
            nodes: [
              {
                name: "planner",
                skill: "planner",
                reads: ["state.direction"],
                writes: [],
              },
            ],
          },
        },
      };

      // Dry run should not attempt to read from backends
      const result = await run(
        { config, bodies: makeBodies(), target: "claude-code", outDir: "build", dryRun: true },
      );

      assert.equal(result.steps.length, 1);
      assert.equal(result.steps[0].status, "skipped"); // dry-run skips execution
    });
  });
});
