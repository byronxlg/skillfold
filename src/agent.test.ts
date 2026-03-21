import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { Config } from "./config.js";
import type { Graph } from "./graph.js";
import type { StateSchema } from "./state.js";
import { assignColor, generateAgents } from "./agent.js";

function makeConfig(overrides?: Partial<Config>): Config {
  const state: StateSchema = {
    types: {},
    fields: {
      plan: { type: { kind: "primitive", value: "string" } },
      code: { type: { kind: "primitive", value: "string" } },
      review: { type: { kind: "primitive", value: "string" } },
    },
  };

  const graph: Graph = {
    nodes: [
      { skill: "planner", reads: [], writes: ["state.plan"] },
      { skill: "engineer", reads: ["state.plan"], writes: ["state.code"] },
      { skill: "reviewer", reads: ["state.code"], writes: ["state.review"] },
    ],
  };

  return {
    name: "test-pipeline",
    skills: {
      planning: { path: "./skills/planning" },
      coding: { path: "./skills/coding" },
      reviewing: { path: "./skills/reviewing" },
      planner: { compose: ["planning"], description: "Plans the work." },
      engineer: { compose: ["planning", "coding"], description: "Writes code." },
      reviewer: { compose: ["reviewing"], description: "Reviews code." },
      orchestrator: { compose: ["planning"], description: "Coordinates." },
    },
    state,
    team: {
      orchestrator: "orchestrator",
      flow: graph,
    },
    ...overrides,
  };
}

describe("assignColor", () => {
  it("returns blue for orchestrator", () => {
    const config = makeConfig();
    const color = assignColor("orchestrator", [], true, config);
    assert.equal(color, "blue");
  });

  it("returns red for skills composing review-related skills", () => {
    const config = makeConfig();
    const color = assignColor("reviewer", ["state.review"], false, config);
    assert.equal(color, "red");
  });

  it("returns green for skills composing code-related skills with code writes", () => {
    const config = makeConfig();
    const color = assignColor("engineer", ["state.code"], false, config);
    assert.equal(color, "green");
  });

  it("returns yellow for planning writes", () => {
    const config = makeConfig();
    const color = assignColor("planner", ["state.plan"], false, config);
    assert.equal(color, "yellow");
  });

  it("returns cyan when no patterns match", () => {
    const config = makeConfig();
    const color = assignColor("planner", ["state.summary"], false, config);
    assert.equal(color, "cyan");
  });
});

describe("generateAgents", () => {
  it("generates agent files for each composed skill", () => {
    const config = makeConfig();
    const bodies = new Map<string, string>();
    bodies.set("planner", "Plan body.");
    bodies.set("engineer", "Engineer body.");
    bodies.set("reviewer", "Reviewer body.");
    bodies.set("orchestrator", "Orchestrator body.");

    const results = generateAgents(config, bodies, "/out", "1.0.0", "test.yaml");

    assert.equal(results.length, 4);
    const names = results.map((r) => r.name);
    assert.ok(names.includes("planner"));
    assert.ok(names.includes("engineer"));
    assert.ok(names.includes("reviewer"));
    assert.ok(names.includes("orchestrator"));
  });

  it("agent files contain frontmatter with name, description, model, and color", () => {
    const config = makeConfig();
    const bodies = new Map<string, string>();
    bodies.set("engineer", "Write code.");

    const results = generateAgents(config, bodies, "/out", "1.0.0", "test.yaml");
    const engineer = results.find((r) => r.name === "engineer");
    assert.ok(engineer);

    assert.ok(engineer.content.includes("name: engineer"));
    assert.ok(engineer.content.includes("description: Writes code."));
    assert.ok(engineer.content.includes("model: inherit"));
    assert.ok(engineer.content.includes("color: green"));
  });

  it("orchestrator agent has special heading and blue color", () => {
    const config = makeConfig();
    const bodies = new Map<string, string>();
    bodies.set("orchestrator", "Orchestrate.");

    const results = generateAgents(config, bodies, "/out", "1.0.0", "test.yaml");
    const orch = results.find((r) => r.name === "orchestrator");
    assert.ok(orch);

    assert.ok(orch.content.includes("color: blue"));
    assert.ok(orch.content.includes("# orchestrator (orchestrator)"));
    assert.ok(orch.content.includes("lead orchestrator agent"));
  });

  it("agent output path is agents/{name}.md", () => {
    const config = makeConfig();
    const bodies = new Map<string, string>();
    bodies.set("planner", "Plan.");

    const results = generateAgents(config, bodies, "/out", "1.0.0", "test.yaml");
    const planner = results.find((r) => r.name === "planner");
    assert.ok(planner);
    assert.ok(planner.path.endsWith("/agents/planner.md"));
  });

  it("includes reads and writes sections from team flow", () => {
    const config = makeConfig();
    const bodies = new Map<string, string>();
    bodies.set("engineer", "Write code.");

    const results = generateAgents(config, bodies, "/out", "1.0.0", "test.yaml");
    const engineer = results.find((r) => r.name === "engineer");
    assert.ok(engineer);

    assert.ok(engineer.content.includes("## Reads"));
    assert.ok(engineer.content.includes("`state.plan`"));
    assert.ok(engineer.content.includes("## Writes"));
    assert.ok(engineer.content.includes("`state.code`"));
  });

  it("includes composed body in Instructions section", () => {
    const config = makeConfig();
    const bodies = new Map<string, string>();
    bodies.set("planner", "This is the plan body.");

    const results = generateAgents(config, bodies, "/out", "1.0.0", "test.yaml");
    const planner = results.find((r) => r.name === "planner");
    assert.ok(planner);

    assert.ok(planner.content.includes("## Instructions"));
    assert.ok(planner.content.includes("This is the plan body."));
  });

  it("includes provenance header", () => {
    const config = makeConfig();
    const bodies = new Map<string, string>();
    bodies.set("planner", "Body.");

    const results = generateAgents(config, bodies, "/out", "1.0.0", "test.yaml");
    const planner = results.find((r) => r.name === "planner");
    assert.ok(planner);
    assert.ok(
      planner.content.startsWith(
        "<!-- Generated by skillfold v1.0.0 from test-pipeline (test.yaml). Do not edit directly. -->"
      ),
    );
  });

  it("generates agents even without team flow (no reads/writes)", () => {
    const config = makeConfig({ team: undefined });
    const bodies = new Map<string, string>();
    bodies.set("planner", "Plan.");

    const results = generateAgents(config, bodies, "/out", "1.0.0", "test.yaml");
    const planner = results.find((r) => r.name === "planner");
    assert.ok(planner);

    // No reads/writes sections when there is no team flow
    assert.ok(!planner.content.includes("## Reads"));
    assert.ok(!planner.content.includes("## Writes"));
  });

  it("emits extra frontmatter fields from composed skill config", () => {
    const config = makeConfig({
      skills: {
        planning: { path: "./skills/planning" },
        coding: { path: "./skills/coding" },
        engineer: {
          compose: ["planning", "coding"],
          description: "Writes code.",
          frontmatter: {
            tools: ["Edit", "Write", "Bash"],
            permissionMode: "bypassPermissions",
            isolation: "worktree",
          },
        },
      },
      team: undefined,
    });
    const bodies = new Map<string, string>();
    bodies.set("engineer", "Write code.");

    const results = generateAgents(config, bodies, "/out", "1.0.0", "test.yaml");
    const engineer = results.find((r) => r.name === "engineer");
    assert.ok(engineer);

    // Core fields still present
    assert.ok(engineer.content.includes("name: engineer"));
    assert.ok(engineer.content.includes("model: inherit"));

    // Extra frontmatter fields emitted
    assert.ok(engineer.content.includes("permissionMode: bypassPermissions"));
    assert.ok(engineer.content.includes("isolation: worktree"));
    // Tools array rendered in YAML
    assert.ok(engineer.content.includes("tools:"));
    assert.ok(engineer.content.includes("- Edit"));
    assert.ok(engineer.content.includes("- Write"));
    assert.ok(engineer.content.includes("- Bash"));
  });

  it("emits boolean and number frontmatter fields", () => {
    const config = makeConfig({
      skills: {
        planning: { path: "./skills/planning" },
        planner: {
          compose: ["planning"],
          description: "Plans.",
          frontmatter: {
            memory: true,
            maxTurns: 50,
            background: false,
          },
        },
      },
      team: undefined,
    });
    const bodies = new Map<string, string>();
    bodies.set("planner", "Plan.");

    const results = generateAgents(config, bodies, "/out", "1.0.0", "test.yaml");
    const planner = results.find((r) => r.name === "planner");
    assert.ok(planner);

    assert.ok(planner.content.includes("memory: true"));
    assert.ok(planner.content.includes("maxTurns: 50"));
    assert.ok(planner.content.includes("background: false"));
  });

  it("does not emit extra frontmatter when none is configured", () => {
    const config = makeConfig({
      skills: {
        planning: { path: "./skills/planning" },
        planner: {
          compose: ["planning"],
          description: "Plans.",
        },
      },
      team: undefined,
    });
    const bodies = new Map<string, string>();
    bodies.set("planner", "Plan.");

    const results = generateAgents(config, bodies, "/out", "1.0.0", "test.yaml");
    const planner = results.find((r) => r.name === "planner");
    assert.ok(planner);

    // Extract frontmatter between --- delimiters
    const fmMatch = planner.content.match(/---\n([\s\S]*?)\n---/);
    assert.ok(fmMatch);
    const fmLines = fmMatch[1].split("\n").map((l) => l.split(":")[0].trim());
    // Only the four core fields
    assert.deepEqual(fmLines, ["name", "description", "model", "color"]);
  });

  it("extra frontmatter appears after core fields and before closing ---", () => {
    const config = makeConfig({
      skills: {
        planning: { path: "./skills/planning" },
        planner: {
          compose: ["planning"],
          description: "Plans.",
          frontmatter: {
            effort: "high",
          },
        },
      },
      team: undefined,
    });
    const bodies = new Map<string, string>();
    bodies.set("planner", "Plan.");

    const results = generateAgents(config, bodies, "/out", "1.0.0", "test.yaml");
    const planner = results.find((r) => r.name === "planner");
    assert.ok(planner);

    // effort appears between color and closing ---
    const fmMatch = planner.content.match(/---\n([\s\S]*?)\n---/);
    assert.ok(fmMatch);
    const lines = fmMatch[1].split("\n");
    const colorIdx = lines.findIndex((l) => l.startsWith("color:"));
    const effortIdx = lines.findIndex((l) => l.startsWith("effort:"));
    assert.ok(colorIdx >= 0);
    assert.ok(effortIdx >= 0);
    assert.ok(effortIdx > colorIdx, "extra frontmatter should follow core fields");
  });
});
