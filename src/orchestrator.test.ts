import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { Config } from "./config.js";
import { formatLocation, generateOrchestrator } from "./orchestrator.js";
import type { StateField } from "./state.js";

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
              flow: [
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

  it("includes agent invocation section with isolation guidance", () => {
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
    assert.ok(output.includes("isolation"));
  });

  it("includes state location guidance when fields have locations", () => {
    const config: Config = {
      name: "test",
      skills: {
        agent: { path: "./skills/agent" },
      },
      state: {
        types: {},
        fields: {
          goal: {
            type: { kind: "primitive", value: "string" },
            location: { skill: "agent", path: "channel" },
          },
        },
      },
      team: {
        flow: {
          nodes: [
            { skill: "agent", reads: [], writes: [] },
          ],
        },
      },
    };

    const output = generateOrchestrator(config);

    assert.ok(output.includes("external locations"));
  });

  it("omits state location guidance when no fields have locations", () => {
    const config: Config = {
      name: "test",
      skills: {
        worker: { path: "./skills/worker" },
      },
      state: {
        types: {},
        fields: {
          goal: {
            type: { kind: "primitive", value: "string" },
          },
        },
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

    assert.ok(!output.includes("external locations"));
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
              flow: [
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

describe("generateOrchestrator: async nodes", () => {
  it("renders async node with (async) label", () => {
    const config: Config = {
      name: "async-test",
      skills: {
        engineer: { path: "./skills/engineer" },
      },
      state: {
        types: {},
        fields: {
          direction: { type: { kind: "primitive", value: "string" } },
          code: { type: { kind: "primitive", value: "string" } },
        },
      },
      team: {
        flow: {
          nodes: [
            {
              name: "owner",
              async: true,
              reads: [],
              writes: ["state.direction"],
              policy: "block" as const,
              then: "engineer",
            },
            {
              skill: "engineer",
              reads: ["state.direction"],
              writes: ["state.code"],
            },
          ],
        },
      },
    };

    const output = generateOrchestrator(config);
    assert.ok(output.includes("### Step 1: owner (async)"));
    assert.ok(output.includes("Check `state.direction` at its external location."));
    assert.ok(output.includes("wait for the external agent to provide it"));
    assert.ok(output.includes("### Step 2: engineer"));
    assert.ok(output.includes("Invoke **engineer**."));
  });

  it("renders skip policy text", () => {
    const config: Config = {
      name: "skip-test",
      skills: {},
      state: {
        types: {},
        fields: {
          data: { type: { kind: "primitive", value: "string" } },
        },
      },
      team: {
        flow: {
          nodes: [
            {
              name: "external",
              async: true,
              reads: [],
              writes: ["state.data"],
              policy: "skip" as const,
            },
          ],
        },
      },
    };

    const output = generateOrchestrator(config);
    assert.ok(output.includes("skip this step and proceed"));
  });

  it("renders use-latest policy text", () => {
    const config: Config = {
      name: "latest-test",
      skills: {},
      state: {
        types: {},
        fields: {
          metrics: { type: { kind: "primitive", value: "string" } },
        },
      },
      team: {
        flow: {
          nodes: [
            {
              name: "monitor",
              async: true,
              reads: [],
              writes: ["state.metrics"],
              policy: "use-latest" as const,
            },
          ],
        },
      },
    };

    const output = generateOrchestrator(config);
    assert.ok(output.includes("use the most recent value and proceed"));
  });

  it("renders async node reads and writes", () => {
    const config: Config = {
      name: "rw-test",
      skills: {},
      state: {
        types: {},
        fields: {
          input: { type: { kind: "primitive", value: "string" } },
          output: { type: { kind: "primitive", value: "string" } },
        },
      },
      team: {
        flow: {
          nodes: [
            {
              name: "checker",
              async: true,
              reads: ["state.input"],
              writes: ["state.output"],
              policy: "block" as const,
            },
          ],
        },
      },
    };

    const output = generateOrchestrator(config);
    assert.ok(output.includes("Reads: `state.input`"));
    assert.ok(output.includes("Writes: `state.output`"));
  });

  it("renders async node transitions correctly", () => {
    const config: Config = {
      name: "transition-test",
      skills: {
        worker: { path: "./skills/worker" },
      },
      state: {
        types: {},
        fields: {
          result: { type: { kind: "primitive", value: "string" } },
        },
      },
      team: {
        flow: {
          nodes: [
            {
              name: "external",
              async: true,
              reads: [],
              writes: ["state.result"],
              policy: "block" as const,
              then: "worker",
            },
            {
              skill: "worker",
              reads: ["state.result"],
              writes: [],
            },
          ],
        },
      },
    };

    const output = generateOrchestrator(config);
    assert.ok(output.includes("Then: proceed to step 2."));
  });

  it("async node does not reference Agent tool in agent-tool mode", () => {
    const config: Config = {
      name: "agent-mode-test",
      skills: {
        worker: { path: "./skills/worker" },
      },
      state: {
        types: {},
        fields: {
          data: { type: { kind: "primitive", value: "string" } },
        },
      },
      team: {
        flow: {
          nodes: [
            {
              name: "external",
              async: true,
              reads: [],
              writes: ["state.data"],
              policy: "block" as const,
              then: "worker",
            },
            {
              skill: "worker",
              reads: ["state.data"],
              writes: [],
            },
          ],
        },
      },
    };

    const output = generateOrchestrator(config, true);
    // The async node section should NOT mention Agent tool
    const asyncSection = output.split("### Step 1: external (async)")[1]?.split("### Step 2")[0] ?? "";
    assert.ok(!asyncSection.includes("Agent tool"));
    // But the step node should
    assert.ok(output.includes("Invoke **worker** using the Agent tool."));
  });
});

describe("generateOrchestrator: async nodes inside map", () => {
  it("renders async node inside map with correct step numbering", () => {
    const config: Config = {
      name: "async-map-pipeline",
      skills: {
        architect: { path: "./skills/architect" },
        "task-router": { path: "./skills/task-router" },
        engineer: { path: "./skills/engineer" },
        reviewer: { path: "./skills/reviewer" },
      },
      state: {
        types: {
          Task: {
            fields: {
              agent: "string",
              output: "string",
              approved: "bool",
            },
          },
        },
        fields: {
          tasks: { type: { kind: "list", element: "Task" } },
        },
      },
      team: {
        flow: {
          nodes: [
            {
              skill: "architect",
              reads: [],
              writes: ["state.tasks"],
              then: "map",
            },
            {
              over: "state.tasks",
              as: "task",
              flow: [
                {
                  skill: "task-router",
                  reads: ["task.agent"],
                  writes: [],
                  then: [
                    { when: "task.agent == \"human\"", to: "human-worker" },
                    { when: "task.agent == \"engineer\"", to: "engineer" },
                  ],
                },
                {
                  name: "human-worker",
                  async: true,
                  reads: [],
                  writes: [],
                  policy: "block",
                  then: "end",
                },
                {
                  skill: "engineer",
                  reads: ["task.agent"],
                  writes: ["task.output"],
                  then: "reviewer",
                },
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
        },
      },
    };

    const output = generateOrchestrator(config);

    // Step 1: architect
    assert.ok(output.includes("### Step 1: architect"));
    assert.ok(output.includes("Invoke **architect**."));
    assert.ok(output.includes("Then: proceed to step 2."));

    // Step 2: map
    assert.ok(output.includes("### Step 2: map over state.tasks"));

    // Step 2.1: task-router
    assert.ok(output.includes("#### Step 2.1: task-router"));
    assert.ok(output.includes("Invoke **task-router**."));

    // Step 2.2: human-worker (async)
    assert.ok(output.includes("#### Step 2.2: human-worker (async)"));
    assert.ok(output.includes("wait for the external agent"));

    // Step 2.3: engineer
    assert.ok(output.includes("#### Step 2.3: engineer"));

    // Step 2.4: reviewer
    assert.ok(output.includes("#### Step 2.4: reviewer"));
    assert.ok(output.includes("- If `task.approved == false`: go to step 2.3"));
    assert.ok(output.includes("- If `task.approved == true`: end"));
  });
});

describe("formatLocation with resolved URLs", () => {
  const resources = {
    github: {
      discussions: "https://github.com/org/repo/discussions",
      issues: "https://github.com/org/repo/issues",
      "pull-requests": "https://github.com/org/repo/pulls",
    },
  };

  it("resolves URL with sub-path", () => {
    const field: StateField = {
      type: { kind: "primitive", value: "string" },
      location: { skill: "github", path: "discussions/general" },
    };
    assert.equal(
      formatLocation(field, resources),
      "https://github.com/org/repo/discussions/general"
    );
  });

  it("resolves URL without sub-path", () => {
    const field: StateField = {
      type: { kind: "primitive", value: "string" },
      location: { skill: "github", path: "issues" },
    };
    assert.equal(
      formatLocation(field, resources),
      "https://github.com/org/repo/issues"
    );
  });

  it("resolves URL with kind qualifier", () => {
    const field: StateField = {
      type: { kind: "primitive", value: "string" },
      location: { skill: "github", path: "pull-requests", kind: "review" },
    };
    assert.equal(
      formatLocation(field, resources),
      "https://github.com/org/repo/pulls (review)"
    );
  });

  it("falls back to abstract format without resources", () => {
    const field: StateField = {
      type: { kind: "primitive", value: "string" },
      location: { skill: "github", path: "discussions/general" },
    };
    assert.equal(
      formatLocation(field),
      "github: discussions/general"
    );
  });

  it("falls back to abstract format with kind without resources", () => {
    const field: StateField = {
      type: { kind: "primitive", value: "string" },
      location: { skill: "github", path: "pull-requests", kind: "review" },
    };
    assert.equal(
      formatLocation(field),
      "github: pull-requests (review)"
    );
  });

  it("returns empty string for field without location", () => {
    const field: StateField = {
      type: { kind: "primitive", value: "string" },
    };
    assert.equal(formatLocation(field), "");
  });
});

describe("generateOrchestrator with resolved URLs", () => {
  it("renders resolved URLs in state table when config has resources", () => {
    const config: Config = {
      name: "resolved-urls",
      skills: {
        github: { path: "./skills/github" },
        worker: { compose: ["github"], description: "Does work." },
      },
      resources: {
        github: {
          discussions: "https://github.com/org/repo/discussions",
          issues: "https://github.com/org/repo/issues",
        },
      },
      state: {
        types: {},
        fields: {
          direction: {
            type: { kind: "primitive", value: "string" },
            location: { skill: "github", path: "discussions/general" },
          },
          tasks: {
            type: { kind: "primitive", value: "string" },
            location: { skill: "github", path: "issues" },
          },
        },
      },
      team: {
        flow: {
          nodes: [
            {
              skill: "worker",
              reads: [],
              writes: [],
              then: "end",
            },
          ],
        },
      },
    };

    const output = generateOrchestrator(config);
    assert.ok(output.includes("https://github.com/org/repo/discussions/general"));
    assert.ok(output.includes("https://github.com/org/repo/issues"));
  });

  it("renders resolved URLs from top-level resources", () => {
    const config: Config = {
      name: "top-level-resources",
      skills: {
        github: { path: "./skills/github" },
        worker: { compose: ["github"], description: "Does work." },
      },
      resources: {
        github: {
          discussions: "https://github.com/org/repo/discussions",
          issues: "https://github.com/org/repo/issues",
        },
      },
      state: {
        types: {},
        fields: {
          direction: {
            type: { kind: "primitive", value: "string" },
            location: { skill: "github", path: "discussions/general" },
          },
          tasks: {
            type: { kind: "primitive", value: "string" },
            location: { skill: "github", path: "issues" },
          },
        },
      },
      team: {
        flow: {
          nodes: [{ skill: "worker", reads: [], writes: [], then: "end" }],
        },
      },
    };

    const output = generateOrchestrator(config);
    assert.ok(output.includes("https://github.com/org/repo/discussions/general"));
    assert.ok(output.includes("https://github.com/org/repo/issues"));
  });

  it("top-level resources take precedence over inline in orchestrator", () => {
    const config: Config = {
      name: "precedence-test",
      skills: {
        github: {
          path: "./skills/github",
          resources: { issues: "https://old.example.com/issues" },
        },
        worker: { compose: ["github"], description: "Does work." },
      },
      resources: {
        github: { issues: "https://new.example.com/issues" },
      },
      state: {
        types: {},
        fields: {
          tasks: {
            type: { kind: "primitive", value: "string" },
            location: { skill: "github", path: "issues" },
          },
        },
      },
      team: {
        flow: {
          nodes: [{ skill: "worker", reads: [], writes: [], then: "end" }],
        },
      },
    };

    const output = generateOrchestrator(config);
    assert.ok(output.includes("https://new.example.com/issues"));
    assert.ok(!output.includes("https://old.example.com/issues"));
  });
});
