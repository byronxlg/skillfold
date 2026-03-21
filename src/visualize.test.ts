import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { Config } from "./config.js";
import type { AsyncNode, GraphNode, MapNode, StepNode, SubFlowNode } from "./graph.js";
import { generateHtml, generateMermaid } from "./visualize.js";

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

// Helper: build a Config with only atomic skills (no composition subgraphs)
function atomicConfig(
  nodes: GraphNode[],
  skillNames?: string[],
): Config {
  const names = skillNames ?? nodes
    .filter((n): n is StepNode => "skill" in n)
    .map((n) => n.skill);
  const skills: Record<string, { path: string }> = {};
  for (const name of names) {
    skills[name] = { path: `./skills/${name}` };
  }
  return {
    name: "test",
    skills,
    team: { flow: { nodes } },
  };
}

describe("generateMermaid", () => {
  it("renders a linear graph with arrows between atomic nodes", () => {
    const config = atomicConfig([
      step("alpha", { then: "bravo" }),
      step("bravo", { then: "charlie" }),
      step("charlie"),
    ]);
    const output = generateMermaid(config);
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
    const config = atomicConfig([
      step("strategist", { then: "reviewer" }),
      step("reviewer", {
        then: [
          { when: "review.approved == false", to: "strategist" },
          { when: "review.approved == true", to: "end" },
        ],
      }),
    ]);
    const output = generateMermaid(config);
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
    const config = atomicConfig(
      [
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
      ["strategy", "engineer", "reviewer"],
    );
    const output = generateMermaid(config);
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
    const config = atomicConfig([step("alpha", { then: "end" })]);
    const output = generateMermaid(config);
    assert.equal(
      output,
      ["graph TD", "    alpha --> end_node([end])", ""].join("\n"),
    );
  });

  it("renders hyphenated atomic names with underscore IDs and correct labels", () => {
    const config = atomicConfig([
      step("senior-engineer", { then: "code-reviewer" }),
      step("code-reviewer", { then: "end" }),
    ]);
    const output = generateMermaid(config);
    assert.ok(output.includes('senior_engineer["senior-engineer"]'));
    assert.ok(output.includes('code_reviewer["code-reviewer"]'));
    assert.ok(output.includes("senior_engineer --> code_reviewer"));
    assert.ok(output.includes("code_reviewer --> end_node([end])"));
  });

  it("renders implicit fall-through between nodes with no then", () => {
    const config = atomicConfig([
      step("alpha"),
      step("bravo"),
      step("charlie"),
    ]);
    const output = generateMermaid(config);
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

  it("renders implicit fall-through to a map node", () => {
    const config = atomicConfig(
      [
        step("planner"),
        map("state.items", "item", [step("worker")]),
      ],
      ["planner", "worker"],
    );
    const output = generateMermaid(config);
    assert.ok(output.includes("planner --> map_state_items"));
    assert.ok(output.includes("worker --> end_map_state_items([end])"));
  });

  it("renders composed skills as subgraphs with leaf atomics", () => {
    const config: Config = {
      name: "test",
      skills: {
        planning: { path: "./skills/planning" },
        coding: { path: "./skills/coding" },
        review: { path: "./skills/review" },
        engineer: {
          compose: ["planning", "coding"],
          description: "Writes code.",
        },
        reviewer: {
          compose: ["review"],
          description: "Reviews code.",
        },
      },
      team: {
        flow: {
          nodes: [
            step("engineer", { then: "reviewer" }),
            step("reviewer", { then: "end" }),
          ],
        },
      },
    };
    const output = generateMermaid(config);
    // Engineer subgraph with leaf atomics
    assert.ok(output.includes("subgraph engineer"));
    assert.ok(output.includes('engineer_planning["planning"]'));
    assert.ok(output.includes('engineer_coding["coding"]'));
    // Reviewer subgraph with leaf atomic
    assert.ok(output.includes("subgraph reviewer"));
    assert.ok(output.includes('reviewer_review["review"]'));
    // Flow edges connect subgraphs
    assert.ok(output.includes("engineer --> reviewer"));
    assert.ok(output.includes("reviewer --> end_node([end])"));
  });

  it("renders recursive composition as flattened leaf atomics", () => {
    const config: Config = {
      name: "test",
      skills: {
        a: { path: "./skills/a" },
        b: { path: "./skills/b" },
        c: { path: "./skills/c" },
        inner: { compose: ["a", "b"], description: "Inner." },
        outer: { compose: ["inner", "c"], description: "Outer." },
      },
      team: {
        flow: {
          nodes: [step("outer", { then: "end" })],
        },
      },
    };
    const output = generateMermaid(config);
    assert.ok(output.includes("subgraph outer"));
    assert.ok(output.includes('outer_a["a"]'));
    assert.ok(output.includes('outer_b["b"]'));
    assert.ok(output.includes('outer_c["c"]'));
    // Inner composed skill should NOT appear as a leaf
    assert.ok(!output.includes('outer_inner'));
  });

  it("renders writes as edge labels on non-conditional edges", () => {
    const config = atomicConfig([
      step("planner", {
        writes: ["state.plan"],
        then: "worker",
      }),
      step("worker", {
        reads: ["state.plan"],
        writes: ["state.result"],
        then: "end",
      }),
    ]);
    const output = generateMermaid(config);
    assert.ok(output.includes('planner -->|"plan"| worker'));
    assert.ok(output.includes('worker -->|"result"| end_node([end])'));
  });

  it("renders writes on implicit fall-through edges", () => {
    const config = atomicConfig([
      step("planner", { writes: ["state.plan"] }),
      step("worker", { writes: ["state.result"] }),
    ]);
    const output = generateMermaid(config);
    assert.ok(output.includes('planner -->|"plan"| worker'));
    assert.ok(output.includes('worker -->|"result"| end_node([end])'));
  });

  it("renders multiple writes comma-separated in edge label", () => {
    const config = atomicConfig([
      step("planner", {
        writes: ["state.plan", "state.tasks"],
        then: "end",
      }),
    ]);
    const output = generateMermaid(config);
    assert.ok(output.includes('planner -->|"plan, tasks"| end_node([end])'));
  });

  it("does not add writes label to conditional edges", () => {
    const config = atomicConfig([
      step("checker", {
        writes: ["state.result"],
        then: [
          { when: "result == true", to: "end" },
        ],
      }),
    ]);
    const output = generateMermaid(config);
    // Conditional edge keeps the when clause, not the writes
    assert.ok(output.includes('checker -->|"result == true"| end_node([end])'));
    // Should not have a separate writes label
    assert.ok(!output.includes('"result"'));
  });

  it("renders the project config with composition and state", () => {
    const config: Config = {
      name: "skillfold-team",
      skills: {
        "skillfold-context": { path: "./skills/skillfold-context" },
        "product-strategy": { path: "./skills/product-strategy" },
        "task-decomposition": { path: "./skills/task-decomposition" },
        architecture: { path: "./skills/architecture" },
        "code-generation": { path: "./skills/code-generation" },
        testing: { path: "./skills/testing" },
        github: { path: "./skills/github" },
        "code-review": { path: "./skills/code-review" },
        strategist: {
          compose: ["skillfold-context", "product-strategy", "task-decomposition"],
          description: "Sets direction.",
        },
        architect: {
          compose: ["skillfold-context", "architecture", "task-decomposition"],
          description: "Designs systems.",
        },
        engineer: {
          compose: ["skillfold-context", "code-generation", "testing", "github"],
          description: "Writes code.",
        },
        reviewer: {
          compose: ["skillfold-context", "code-review", "testing", "github"],
          description: "Reviews code.",
        },
      },
      team: {
        flow: {
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
        },
      },
    };
    const output = generateMermaid(config);

    // Composition subgraphs
    assert.ok(output.includes("subgraph strategist"));
    assert.ok(output.includes('strategist_skillfold_context["skillfold-context"]'));
    assert.ok(output.includes('strategist_product_strategy["product-strategy"]'));
    assert.ok(output.includes('strategist_task_decomposition["task-decomposition"]'));

    assert.ok(output.includes("subgraph architect"));
    assert.ok(output.includes('architect_architecture["architecture"]'));

    assert.ok(output.includes("subgraph engineer"));
    assert.ok(output.includes('engineer_code_generation["code-generation"]'));
    assert.ok(output.includes('engineer_testing["testing"]'));

    assert.ok(output.includes("subgraph reviewer"));
    assert.ok(output.includes('reviewer_code_review["code-review"]'));

    // State writes on edges
    assert.ok(output.includes('strategist -->|"direction"| architect'));
    assert.ok(output.includes('architect -->|"plan"| engineer'));
    assert.ok(output.includes('engineer -->|"implementation"| reviewer'));

    // Conditional edges keep their labels
    assert.ok(output.includes('reviewer -->|"review.approved == false"| engineer'));
    assert.ok(output.includes('reviewer -->|"review.approved == true"| end_node([end])'));
  });

  it("renders composed skills inside map subgraphs", () => {
    const config: Config = {
      name: "test",
      skills: {
        planning: { path: "./skills/planning" },
        coding: { path: "./skills/coding" },
        setup: { path: "./skills/setup" },
        worker: {
          compose: ["planning", "coding"],
          description: "Does work.",
        },
      },
      team: {
        flow: {
          nodes: [
            step("setup", { then: "map" }),
            map("state.tasks", "task", [
              step("worker", { then: "end" }),
            ]),
          ],
        },
      },
    };
    const output = generateMermaid(config);
    // Map subgraph should contain composition subgraph for worker
    assert.ok(output.includes('subgraph map_state_tasks["map over state.tasks"]'));
    assert.ok(output.includes("subgraph worker"));
    assert.ok(output.includes('worker_planning["planning"]'));
    assert.ok(output.includes('worker_coding["coding"]'));
  });

  it("handles mixed atomic and composed skills in the flow", () => {
    const config: Config = {
      name: "test",
      skills: {
        planning: { path: "./skills/planning" },
        coding: { path: "./skills/coding" },
        deploy: { path: "./skills/deploy" },
        engineer: {
          compose: ["planning", "coding"],
          description: "Writes code.",
        },
      },
      team: {
        flow: {
          nodes: [
            step("engineer", { then: "deploy" }),
            step("deploy", { then: "end" }),
          ],
        },
      },
    };
    const output = generateMermaid(config);
    // Engineer is composed -> subgraph
    assert.ok(output.includes("subgraph engineer"));
    // Deploy is atomic -> plain node
    assert.ok(!output.includes("subgraph deploy"));
    // Flow connects them
    assert.ok(output.includes("engineer --> deploy"));
  });

  it("deduplicates shared atomics in composition", () => {
    const config: Config = {
      name: "test",
      skills: {
        shared: { path: "./skills/shared" },
        unique: { path: "./skills/unique" },
        mid1: { compose: ["shared"], description: "Mid 1." },
        mid2: { compose: ["shared", "unique"], description: "Mid 2." },
        top: { compose: ["mid1", "mid2"], description: "Top." },
      },
      team: {
        flow: {
          nodes: [step("top", { then: "end" })],
        },
      },
    };
    const output = generateMermaid(config);
    // "shared" should appear only once in the subgraph
    const sharedCount = output.split('top_shared["shared"]').length - 1;
    assert.equal(sharedCount, 1, "shared should appear exactly once");
    assert.ok(output.includes('top_unique["unique"]'));
  });

  it("renders async nodes with stadium shape", () => {
    const asyncNode: AsyncNode = {
      name: "owner",
      async: true,
      reads: [],
      writes: ["state.direction"],
      policy: "block",
      then: "worker",
    };
    const config = atomicConfig(
      [asyncNode, step("worker")],
      ["worker"],
    );
    const output = generateMermaid(config);
    // Async nodes use stadium shape: ([name])
    assert.ok(output.includes("owner([owner]):::async"));
    assert.ok(output.includes("owner -->"));
    assert.ok(output.includes("classDef async stroke-dasharray: 5 5"));
  });

  it("renders async node with writes as edge label", () => {
    const asyncNode: AsyncNode = {
      name: "ci",
      async: true,
      reads: [],
      writes: ["state.status"],
      policy: "skip",
      then: "end",
    };
    const config = atomicConfig([asyncNode], []);
    const output = generateMermaid(config);
    assert.ok(output.includes("ci([ci]):::async"));
    assert.ok(output.includes("|\"status\"|"));
    assert.ok(output.includes("classDef async stroke-dasharray: 5 5"));
  });

  it("renders async node followed by step node with fall-through", () => {
    const asyncNode: AsyncNode = {
      name: "external",
      async: true,
      reads: [],
      writes: ["state.data"],
      policy: "block",
    };
    const config = atomicConfig(
      [asyncNode, step("processor")],
      ["processor"],
    );
    const output = generateMermaid(config);
    assert.ok(output.includes("external([external]):::async"));
    assert.ok(output.includes("external -->"));
    assert.ok(output.includes("processor"));
    assert.ok(output.includes("classDef async stroke-dasharray: 5 5"));
  });
  it("does not emit async classDef when no async nodes exist", () => {
    const config = atomicConfig(
      [step("alpha", { then: "beta" }), step("beta")],
      ["alpha", "beta"],
    );
    const output = generateMermaid(config);
    assert.ok(!output.includes("classDef async"));
  });
});

describe("generateHtml", () => {
  it("produces valid HTML document with mermaid graph", () => {
    const config = atomicConfig([
      step("alpha", { then: "bravo" }),
      step("bravo", { then: "end" }),
    ]);
    const html = generateHtml(config);
    assert.ok(html.includes("<!DOCTYPE html>"));
    assert.ok(html.includes("<title>test - Pipeline Graph</title>"));
    assert.ok(html.includes("class=\"mermaid\""));
    assert.ok(html.includes("graph TD"));
    assert.ok(html.includes("alpha --&gt; bravo"));
    assert.ok(html.includes("</html>"));
  });

  it("embeds node metadata as JSON", () => {
    const config = atomicConfig([
      step("alpha", { reads: ["state.input"], writes: ["state.output"], then: "end" }),
    ]);
    const html = generateHtml(config);
    assert.ok(html.includes("const nodeMeta ="));
    assert.ok(html.includes('"id":"alpha"'));
    assert.ok(html.includes('"type":"step"'));
    assert.ok(html.includes('"reads":["state.input"]'));
    assert.ok(html.includes('"writes":["state.output"]'));
  });

  it("includes composition lineage for composed skills", () => {
    const config: Config = {
      name: "test",
      skills: {
        planning: { path: "./skills/planning" },
        coding: { path: "./skills/coding" },
        engineer: {
          compose: ["planning", "coding"],
          description: "Writes code.",
        },
      },
      team: {
        flow: {
          nodes: [step("engineer", { then: "end" })],
        },
      },
    };
    const html = generateHtml(config);
    assert.ok(html.includes('"composition":["planning","coding"]'));
    assert.ok(html.includes('"description":"Writes code."'));
  });

  it("includes metadata for async nodes", () => {
    const asyncNode: AsyncNode = {
      name: "owner",
      async: true,
      reads: [],
      writes: ["state.direction"],
      policy: "block",
      then: "end",
    };
    const config = atomicConfig([asyncNode], []);
    const html = generateHtml(config);
    assert.ok(html.includes('"id":"owner"'));
    assert.ok(html.includes('"type":"async"'));
    assert.ok(html.includes('"writes":["state.direction"]'));
  });

  it("includes metadata for subflow nodes", () => {
    const subflowNode: SubFlowNode = {
      name: "deploy-flow",
      flow: "deploy.yaml",
      reads: ["state.artifact"],
      writes: ["state.deployed"],
      then: "end",
    };
    const config: Config = {
      name: "test",
      skills: {},
      team: {
        flow: {
          nodes: [subflowNode],
        },
      },
    };
    const html = generateHtml(config);
    assert.ok(html.includes('"type":"subflow"'));
    assert.ok(html.includes('"reads":["state.artifact"]'));
    assert.ok(html.includes('"writes":["state.deployed"]'));
  });

  it("includes Export SVG button and toggle", () => {
    const config = atomicConfig([step("alpha", { then: "end" })]);
    const html = generateHtml(config);
    assert.ok(html.includes("exportSvg()"));
    assert.ok(html.includes("toggleSidebar()"));
    assert.ok(html.includes("Export SVG"));
  });

  it("includes Mermaid CDN import", () => {
    const config = atomicConfig([step("alpha", { then: "end" })]);
    const html = generateHtml(config);
    assert.ok(html.includes("cdn.jsdelivr.net/npm/mermaid"));
  });

  it("escapes HTML entities in mermaid definition", () => {
    // Mermaid output with angle brackets in conditionals
    const config = atomicConfig([
      step("checker", {
        then: [
          { when: "count > 0", to: "end" },
        ],
      }),
    ]);
    const html = generateHtml(config);
    // The > should be escaped as &gt; in the pre block
    assert.ok(html.includes("&gt;"));
    assert.ok(!html.match(/<pre[^>]*>.*[^&]>/s) || html.includes("&gt;"));
  });

  it("includes metadata for map nodes", () => {
    const config = atomicConfig(
      [
        map("state.tasks", "task", [
          step("worker", { then: "end" }),
        ]),
      ],
      ["worker"],
    );
    const html = generateHtml(config);
    assert.ok(html.includes('"type":"map"'));
    assert.ok(html.includes('"label":"map over state.tasks"'));
  });
});
