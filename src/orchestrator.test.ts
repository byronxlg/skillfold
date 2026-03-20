import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { Config } from "./config.js";
import { generateOrchestrator } from "./orchestrator.js";

describe("generateOrchestrator", () => {
  it("linear graph - 3 steps with correct numbering, reads/writes, transitions", () => {
    const config: Config = {
      name: "linear-pipeline",
      skills: {
        alpha: { path: "./skills/alpha" },
        beta: { path: "./skills/beta" },
        gamma: { path: "./skills/gamma" },
      },
      state: {
        types: {},
        fields: {
          goal: {
            type: { kind: "primitive", value: "string" },
          },
          plan: {
            type: { kind: "primitive", value: "string" },
          },
          result: {
            type: { kind: "primitive", value: "string" },
          },
        },
      },
      team: {
        flow: {
          nodes: [
            {
              skill: "alpha",
              reads: [],
              writes: ["state.goal"],
              then: "beta",
            },
            {
              skill: "beta",
              reads: ["state.goal"],
              writes: ["state.plan"],
              then: "gamma",
            },
            {
              skill: "gamma",
              reads: ["state.plan"],
              writes: ["state.result"],
            },
          ],
        },
      },
    };

    const output = generateOrchestrator(config);

    // Verify header
    assert.ok(output.includes("# Orchestrator: linear-pipeline"));
    assert.ok(output.includes("**linear-pipeline** pipeline"));

    // Step 1
    assert.ok(output.includes("### Step 1: alpha"));
    assert.ok(output.includes("Invoke **alpha**."));
    assert.ok(output.includes("Writes: `state.goal`"));
    assert.ok(output.includes("Then: proceed to step 2."));

    // Step 2
    assert.ok(output.includes("### Step 2: beta"));
    assert.ok(output.includes("Invoke **beta**."));
    assert.ok(output.includes("Reads: `state.goal`"));
    assert.ok(output.includes("Writes: `state.plan`"));
    assert.ok(output.includes("Then: proceed to step 3."));

    // Step 3
    assert.ok(output.includes("### Step 3: gamma"));
    assert.ok(output.includes("Invoke **gamma**."));
    assert.ok(output.includes("Reads: `state.plan`"));
    assert.ok(output.includes("Writes: `state.result`"));
    // Last node with no then should say "end"
    assert.ok(output.includes("Then: end"));
  });

  it("conditional transitions render If/go to branches", () => {
    const config: Config = {
      name: "cond-pipeline",
      skills: {
        checker: { path: "./skills/checker" },
        fixer: { path: "./skills/fixer" },
        done: { path: "./skills/done" },
      },
      team: {
        flow: {
          nodes: [
            {
              skill: "checker",
              reads: [],
              writes: [],
              then: "fixer",
            },
            {
              skill: "fixer",
              reads: [],
              writes: [],
              then: [
                { when: "result == false", to: "checker" },
                { when: "result == true", to: "done" },
              ],
            },
            {
              skill: "done",
              reads: [],
              writes: [],
            },
          ],
        },
      },
    };

    const output = generateOrchestrator(config);

    assert.ok(output.includes("### Step 2: fixer"));
    assert.ok(
      output.includes("- If `result == false`: go to step 1")
    );
    assert.ok(
      output.includes("- If `result == true`: go to step 3")
    );
  });

  it("map node with sub-numbering and for-each prose", () => {
    const config: Config = {
      name: "map-pipeline",
      skills: {
        planner: { path: "./skills/planner" },
        worker: { path: "./skills/worker" },
        reviewer: { path: "./skills/reviewer" },
      },
      state: {
        types: {
          Task: {
            fields: { description: "string", output: "string" },
          },
        },
        fields: {
          tasks: {
            type: { kind: "list", element: "Task" },
          },
        },
      },
      team: {
        flow: {
          nodes: [
            {
              skill: "planner",
              reads: [],
              writes: ["state.tasks"],
              then: "map",
            },
            {
              over: "state.tasks",
              as: "task",
              graph: [
                {
                  skill: "worker",
                  reads: ["task.description"],
                  writes: ["task.output"],
                  then: "reviewer",
                },
                {
                  skill: "reviewer",
                  reads: ["task.output"],
                  writes: [],
                },
              ],
            },
          ],
        },
      },
    };

    const output = generateOrchestrator(config);

    // Step 1
    assert.ok(output.includes("### Step 1: planner"));
    assert.ok(output.includes("Then: proceed to step 2."));

    // Map node
    assert.ok(output.includes("### Step 2: map over state.tasks"));
    assert.ok(
      output.includes(
        "For each item in `state.tasks` (as `task`), run the following subgraph:"
      )
    );

    // Sub-steps
    assert.ok(output.includes("#### Step 2.1: worker"));
    assert.ok(output.includes("Invoke **worker**."));
    assert.ok(output.includes("Reads: `task.description`"));
    assert.ok(output.includes("Writes: `task.output`"));
    assert.ok(output.includes("Then: proceed to step 2.2."));

    assert.ok(output.includes("#### Step 2.2: reviewer"));
    assert.ok(output.includes("Invoke **reviewer**."));
    assert.ok(output.includes("Reads: `task.output`"));
  });

  it("state table renders fields with types and locations", () => {
    const config: Config = {
      name: "state-pipeline",
      skills: {
        agent: { path: "./skills/agent" },
      },
      state: {
        types: {
          Task: {
            fields: { title: "string", done: "bool" },
          },
        },
        fields: {
          goal: {
            type: { kind: "primitive", value: "string" },
            location: { skill: "agent", path: "channel" },
          },
          count: {
            type: { kind: "primitive", value: "number" },
          },
          tasks: {
            type: { kind: "list", element: "Task" },
            location: { skill: "agent", path: "board", kind: "reply" },
          },
        },
      },
      team: {
        flow: {
          nodes: [
            {
              skill: "agent",
              reads: [],
              writes: [],
            },
          ],
        },
      },
    };

    const output = generateOrchestrator(config);

    assert.ok(output.includes("## State"));
    assert.ok(output.includes("| Field | Type | Location |"));
    assert.ok(output.includes("| goal | string | agent: channel |"));
    assert.ok(output.includes("| count | number |  |"));
    assert.ok(
      output.includes("| tasks | list<Task> | agent: board (reply) |")
    );
  });

  it("includes agent invocation section", () => {
    const config: Config = {
      name: "test",
      skills: {
        worker: { path: "./skills/worker" },
      },
      team: {
        flow: {
          nodes: [
            { skill: "worker", reads: [], writes: [] },
          ],
        },
      },
    };

    const output = generateOrchestrator(config);

    assert.ok(output.includes("## Agent Invocation"));
    assert.ok(output.includes("build/{name}/SKILL.md"));
  });

  it("no state section when config.state is undefined", () => {
    const config: Config = {
      name: "no-state",
      skills: {
        worker: { path: "./skills/worker" },
      },
      team: {
        flow: {
          nodes: [
            {
              skill: "worker",
              reads: [],
              writes: [],
            },
          ],
        },
      },
    };

    const output = generateOrchestrator(config);

    assert.ok(!output.includes("## State"));
    assert.ok(!output.includes("| Field |"));
    // Should still have the execution plan
    assert.ok(output.includes("## Execution Plan"));
    assert.ok(output.includes("### Step 1: worker"));
  });

  it("terminal node with no then renders end", () => {
    const config: Config = {
      name: "terminal",
      skills: {
        only: { path: "./skills/only" },
      },
      team: {
        flow: {
          nodes: [
            {
              skill: "only",
              reads: [],
              writes: [],
            },
          ],
        },
      },
    };

    const output = generateOrchestrator(config);

    assert.ok(output.includes("### Step 1: only"));
    assert.ok(output.includes("Then: end"));
    // "end" should appear but NOT "proceed to step"
    assert.ok(!output.includes("proceed to step"));
  });

  it("conditional then with 'end' target renders correctly", () => {
    const config: Config = {
      name: "end-branch",
      skills: {
        checker: { path: "./skills/checker" },
        fixer: { path: "./skills/fixer" },
      },
      team: {
        flow: {
          nodes: [
            {
              skill: "checker",
              reads: [],
              writes: [],
              then: [
                { when: "ok == false", to: "fixer" },
                { when: "ok == true", to: "end" },
              ],
            },
            {
              skill: "fixer",
              reads: [],
              writes: [],
            },
          ],
        },
      },
    };

    const output = generateOrchestrator(config);

    assert.ok(output.includes("- If `ok == false`: go to step 2"));
    assert.ok(output.includes("- If `ok == true`: end"));
  });

  it("map node with conditional then inside subgraph", () => {
    const config: Config = {
      name: "map-cond",
      skills: {
        setup: { path: "./skills/setup" },
        worker: { path: "./skills/worker" },
        reviewer: { path: "./skills/reviewer" },
      },
      state: {
        types: {
          Task: {
            fields: {
              description: "string",
              output: "string",
              approved: "bool",
            },
          },
        },
        fields: {
          tasks: {
            type: { kind: "list", element: "Task" },
          },
        },
      },
      team: {
        flow: {
          nodes: [
            {
              skill: "setup",
              reads: [],
              writes: ["state.tasks"],
            },
            {
              over: "state.tasks",
              as: "task",
              graph: [
                {
                  skill: "worker",
                  reads: ["task.description"],
                  writes: ["task.output"],
                },
                {
                  skill: "reviewer",
                  reads: ["task.output"],
                  writes: ["task.approved"],
                  then: [
                    { when: "task.approved == false", to: "worker" },
                    { when: "task.approved == true", to: "end" },
                  ],
                },
              ],
            },
          ],
        },
      },
    };

    const output = generateOrchestrator(config);

    // Sub-step conditional
    assert.ok(
      output.includes(
        "- If `task.approved == false`: go to step 2.1"
      )
    );
    assert.ok(
      output.includes("- If `task.approved == true`: end")
    );
  });

  it("multiple reads and writes render comma-separated", () => {
    const config: Config = {
      name: "multi-rw",
      skills: {
        agent: { path: "./skills/agent" },
      },
      state: {
        types: {},
        fields: {
          a: { type: { kind: "primitive", value: "string" } },
          b: { type: { kind: "primitive", value: "string" } },
          c: { type: { kind: "primitive", value: "string" } },
        },
      },
      team: {
        flow: {
          nodes: [
            {
              skill: "agent",
              reads: ["state.a", "state.b"],
              writes: ["state.b", "state.c"],
            },
          ],
        },
      },
    };

    const output = generateOrchestrator(config);

    assert.ok(output.includes("Reads: `state.a`, `state.b`"));
    assert.ok(output.includes("Writes: `state.b`, `state.c`"));
  });
});
