import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { Config } from "./config.js";
import { RunError } from "./errors.js";
import type { Graph } from "./graph.js";
import type { Spawner, StepResult } from "./run.js";
import { evaluateWhenClause, getStateValue, run } from "./run.js";

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
});
