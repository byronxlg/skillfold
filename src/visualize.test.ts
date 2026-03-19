import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { Graph, GraphNode, MapNode, StepNode } from "./graph.js";
import { generateMermaid } from "./visualize.js";

// Helper: build a StepNode
function step(
  skill: string,
  opts?: { reads?: string[]; writes?: string[]; then?: StepNode["then"] },
): StepNode {
  return {
    skill,
    reads: opts?.reads ?? [],
    writes: opts?.writes ?? [],
    ...(opts?.then !== undefined ? { then: opts.then } : {}),
  };
}

// Helper: build a MapNode
function map(
  over: string,
  as: string,
  graph: GraphNode[],
  then?: MapNode["then"],
): MapNode {
  return {
    over,
    as,
    graph,
    ...(then !== undefined ? { then } : {}),
  };
}

describe("generateMermaid", () => {
  it("renders a linear graph with arrows between nodes", () => {
    const graph: Graph = {
      nodes: [
        step("alpha", { then: "bravo" }),
        step("bravo", { then: "charlie" }),
        step("charlie"),
      ],
    };
    const output = generateMermaid(graph);
    assert.equal(
      output,
      [
        "graph TD",
        "    alpha --> bravo",
        "    bravo --> charlie",
        "    charlie --> end_node([end])",
        "",
      ].join("\n"),
    );
  });

  it("renders conditional transitions with labels", () => {
    const graph: Graph = {
      nodes: [
        step("strategist", { then: "reviewer" }),
        step("reviewer", {
          then: [
            { when: "review.approved == false", to: "strategist" },
            { when: "review.approved == true", to: "end" },
          ],
        }),
      ],
    };
    const output = generateMermaid(graph);
    assert.equal(
      output,
      [
        "graph TD",
        "    strategist --> reviewer",
        '    reviewer -->|"review.approved == false"| strategist',
        '    reviewer -->|"review.approved == true"| end_node([end])',
        "",
      ].join("\n"),
    );
  });

  it("renders a map node as a subgraph with inner nodes", () => {
    const graph: Graph = {
      nodes: [
        step("strategy", { then: "map" }),
        map("state.tasks", "task", [
          step("engineer", { then: "reviewer" }),
          step("reviewer", {
            then: [
              { when: "task.approved == false", to: "engineer" },
              { when: "task.approved == true", to: "end" },
            ],
          }),
        ]),
      ],
    };
    const output = generateMermaid(graph);
    // The map subgraph should be rendered with its inner nodes
    assert.ok(output.includes('subgraph map_state_tasks["map over state.tasks"]'));
    assert.ok(output.includes("        engineer --> reviewer"));
    assert.ok(
      output.includes(
        '        reviewer -->|"task.approved == false"| engineer',
      ),
    );
    assert.ok(
      output.includes(
        '        reviewer -->|"task.approved == true"| end_map_state_tasks([end])',
      ),
    );
    assert.ok(output.includes("    end"));
  });

  it("renders terminal end node for explicit then: end", () => {
    const graph: Graph = {
      nodes: [step("alpha", { then: "end" })],
    };
    const output = generateMermaid(graph);
    assert.equal(
      output,
      ["graph TD", "    alpha --> end_node([end])", ""].join("\n"),
    );
  });

  it("renders hyphenated names with underscore IDs and correct labels", () => {
    const graph: Graph = {
      nodes: [
        step("senior-engineer", { then: "code-reviewer" }),
        step("code-reviewer", { then: "end" }),
      ],
    };
    const output = generateMermaid(graph);
    assert.ok(output.includes('senior_engineer["senior-engineer"]'));
    assert.ok(output.includes('code_reviewer["code-reviewer"]'));
    assert.ok(output.includes("senior_engineer --> code_reviewer"));
    assert.ok(output.includes("code_reviewer --> end_node([end])"));
  });

  it("renders implicit fall-through between nodes with no then", () => {
    const graph: Graph = {
      nodes: [step("alpha"), step("bravo"), step("charlie")],
    };
    const output = generateMermaid(graph);
    assert.equal(
      output,
      [
        "graph TD",
        "    alpha --> bravo",
        "    bravo --> charlie",
        "    charlie --> end_node([end])",
        "",
      ].join("\n"),
    );
  });

  it("renders the project config graph correctly", () => {
    const graph: Graph = {
      nodes: [
        step("strategist", {
          writes: ["state.direction"],
          then: "architect",
        }),
        step("architect", {
          reads: ["state.direction"],
          writes: ["state.plan"],
          then: "engineer",
        }),
        step("engineer", {
          reads: ["state.plan"],
          writes: ["state.implementation"],
          then: "reviewer",
        }),
        step("reviewer", {
          reads: ["state.implementation"],
          writes: ["state.review"],
          then: [
            { when: "review.approved == false", to: "engineer" },
            { when: "review.approved == true", to: "end" },
          ],
        }),
      ],
    };
    const output = generateMermaid(graph);
    assert.equal(
      output,
      [
        "graph TD",
        "    strategist --> architect",
        "    architect --> engineer",
        "    engineer --> reviewer",
        '    reviewer -->|"review.approved == false"| engineer',
        '    reviewer -->|"review.approved == true"| end_node([end])',
        "",
      ].join("\n"),
    );
  });

  it("renders the brief example with map correctly", () => {
    const graph: Graph = {
      nodes: [
        step("strategy", { then: "tech-lead" }),
        step("tech-lead", { then: "map" }),
        map("state.tasks", "task", [
          step("senior-engineer", { then: "reviewer" }),
          step("reviewer", {
            then: [
              { when: "task.approved == false", to: "senior-engineer" },
              { when: "task.approved == true", to: "end" },
            ],
          }),
        ]),
      ],
    };
    const output = generateMermaid(graph);
    assert.equal(
      output,
      [
        "graph TD",
        "    strategy --> tech_lead",
        '    tech_lead["tech-lead"]',
        "    tech_lead --> map_state_tasks",
        '    subgraph map_state_tasks["map over state.tasks"]',
        '        senior_engineer["senior-engineer"]',
        "        senior_engineer --> reviewer",
        '        reviewer -->|"task.approved == false"| senior_engineer',
        '        reviewer -->|"task.approved == true"| end_map_state_tasks([end])',
        "    end",
        "",
      ].join("\n"),
    );
  });

  it("renders implicit fall-through to a map node", () => {
    const graph: Graph = {
      nodes: [
        step("planner"),
        map("state.items", "item", [step("worker")]),
      ],
    };
    const output = generateMermaid(graph);
    assert.ok(output.includes("planner --> map_state_items"));
    assert.ok(output.includes("worker --> end_map_state_items([end])"));
  });
});
