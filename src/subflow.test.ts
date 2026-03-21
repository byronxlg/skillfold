import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { loadConfig, parseRawConfig, readConfig, validateAndBuild } from "./config.js";
import { compile } from "./compiler.js";
import { ConfigError, GraphError } from "./errors.js";
import {
  isSubFlowNode,
  parseGraph,
  SubFlowNode,
  validateGraph,
} from "./graph.js";
import { generateOrchestrator } from "./orchestrator.js";
import { resolveSkills } from "./resolver.js";
import { generateMermaid } from "./visualize.js";

import type { Config } from "./config.js";
import type { StepNode } from "./graph.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, "..", "test", "fixtures", "subflow-pipeline");
const configPath = join(fixtureDir, "skillfold.yaml");

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `skillfold-subflow-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeSkill(dir: string, name: string, body: string): void {
  const skillDir = join(dir, "skills", name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), body, "utf-8");
}

function writeYaml(dir: string, filename: string, content: string): string {
  const filePath = join(dir, filename);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

describe("parseGraph: sub-flow nodes", () => {
  it("parses a sub-flow node with flow path, reads, and writes", () => {
    const raw = [
      {
        "dev-cycle": {
          flow: "./subflow/skillfold.yaml",
          reads: ["state.plan"],
          writes: ["state.result"],
        },
        then: "end",
      },
    ];
    const graph = parseGraph(raw);
    assert.equal(graph.nodes.length, 1);
    const node = graph.nodes[0];
    assert.ok(isSubFlowNode(node));
    assert.equal(node.name, "dev-cycle");
    assert.equal(node.flow, "./subflow/skillfold.yaml");
    assert.deepEqual(node.reads, ["state.plan"]);
    assert.deepEqual(node.writes, ["state.result"]);
    assert.equal(node.then, "end");
    assert.equal(node.graph, undefined);
  });

  it("parses a sub-flow node with no reads/writes", () => {
    const raw = [
      {
        "sub": { flow: "./other.yaml" },
      },
    ];
    const graph = parseGraph(raw);
    const node = graph.nodes[0];
    assert.ok(isSubFlowNode(node));
    assert.deepEqual(node.reads, []);
    assert.deepEqual(node.writes, []);
  });

  it("rejects empty flow path", () => {
    const raw = [
      {
        "sub": { flow: "" },
      },
    ];
    assert.throws(
      () => parseGraph(raw),
      (err: unknown) => {
        assert.ok(err instanceof GraphError);
        assert.match(err.message, /flow must be a non-empty string/);
        return true;
      },
    );
  });

  it("rejects non-string flow path", () => {
    const raw = [
      {
        "sub": { flow: 42 },
      },
    ];
    assert.throws(
      () => parseGraph(raw),
      (err: unknown) => {
        assert.ok(err instanceof GraphError);
        assert.match(err.message, /flow must be a non-empty string/);
        return true;
      },
    );
  });

  it("rejects sub-flow inside map subgraph", () => {
    const raw = [
      {
        map: {
          over: "state.items",
          as: "item",
          graph: [
            {
              "nested-flow": { flow: "./nested.yaml" },
            },
          ],
        },
      },
    ];
    assert.throws(
      () => parseGraph(raw),
      (err: unknown) => {
        assert.ok(err instanceof GraphError);
        assert.match(err.message, /sub-flow nodes are not allowed inside map subgraphs/);
        return true;
      },
    );
  });

  it("sub-flow node is distinct from step and async nodes", () => {
    const raw = [
      {
        planner: { writes: ["state.plan"] },
        then: "cycle",
      },
      {
        cycle: { flow: "./sub.yaml", reads: ["state.plan"] },
        then: "end",
      },
    ];
    const graph = parseGraph(raw);
    assert.equal(graph.nodes.length, 2);
    assert.ok(!isSubFlowNode(graph.nodes[0]));
    assert.ok(isSubFlowNode(graph.nodes[1]));
  });
});

describe("validateGraph: sub-flow nodes", () => {
  it("validates sub-flow node reads/writes against state", () => {
    const graph = {
      nodes: [
        {
          name: "sub",
          flow: "./sub.yaml",
          reads: ["state.missing"],
          writes: [],
        } as SubFlowNode,
      ],
    };
    const skills = { worker: { path: "./skills/worker" } };
    const state = {
      types: {},
      fields: {
        plan: { type: { kind: "primitive" as const, value: "string" as const } },
      },
    };
    assert.throws(
      () => validateGraph(graph, skills, state),
      (err: unknown) => {
        assert.ok(err instanceof GraphError);
        assert.match(err.message, /reads state field "state.missing" which is not declared/);
        return true;
      },
    );
  });

  it("sub-flow nodes skip skill reference validation", () => {
    const graph = {
      nodes: [
        {
          name: "external-flow",
          flow: "./other.yaml",
          reads: [],
          writes: [],
        } as SubFlowNode,
      ],
    };
    const skills = {};
    // Should NOT throw about "external-flow" not being a declared skill
    validateGraph(graph, skills, undefined);
  });

  it("validates inner graph of resolved sub-flow", () => {
    const graph = {
      nodes: [
        {
          name: "sub",
          flow: "./sub.yaml",
          reads: [],
          writes: [],
          graph: [
            {
              skill: "unknown-skill",
              reads: [],
              writes: [],
            } as StepNode,
          ],
        } as SubFlowNode,
      ],
    };
    const skills = { worker: { path: "./skills/worker" } };
    assert.throws(
      () => validateGraph(graph, skills, undefined),
      (err: unknown) => {
        assert.ok(err instanceof GraphError);
        assert.match(err.message, /skill "unknown-skill" is not declared/);
        return true;
      },
    );
  });
});

describe("loadConfig: sub-flow resolution", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("loads config with sub-flow and resolves the inner graph", async () => {
    const config = await loadConfig(configPath);

    // Parent skills should be present
    assert.ok("planner" in config.skills);
    assert.ok("coordinator" in config.skills);
    assert.ok("orchestrator" in config.skills);

    // Sub-flow skills should be merged in
    assert.ok("coder" in config.skills);
    assert.ok("tester" in config.skills);
    assert.ok("engineer" in config.skills);
    assert.ok("qa" in config.skills);

    // Sub-flow state should be merged in
    assert.ok(config.state);
    assert.ok("plan" in config.state.fields);
    assert.ok("result" in config.state.fields);
    assert.ok("code" in config.state.fields);
    assert.ok("tests-pass" in config.state.fields);

    // The flow should have the sub-flow node with its inner graph
    assert.ok(config.team);
    assert.equal(config.team.flow.nodes.length, 2);
    const subFlowNode = config.team.flow.nodes[1];
    assert.ok(isSubFlowNode(subFlowNode));
    assert.equal(subFlowNode.name, "dev-cycle");
    assert.ok(subFlowNode.graph);
    assert.equal(subFlowNode.graph.length, 2);
  });

  it("errors on missing sub-flow config file", async () => {
    tmpDir = makeTmpDir();
    writeSkill(tmpDir, "worker", "# Worker\nDoes work.");
    const configContent = `
name: test
skills:
  atomic:
    worker: ./skills/worker
  composed:
    agent:
      compose: [worker]
      description: "Test agent."
team:
  flow:
    - sub:
        flow: ./nonexistent/skillfold.yaml
      then: end
`;
    const path = writeYaml(tmpDir, "skillfold.yaml", configContent);
    await assert.rejects(
      () => loadConfig(path),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError);
        assert.match(err.message, /cannot read config file/);
        return true;
      },
    );
  });

  it("errors when sub-flow config has no team.flow", async () => {
    tmpDir = makeTmpDir();
    writeSkill(tmpDir, "worker", "# Worker\nDoes work.");
    writeSkill(tmpDir, "inner", "# Inner\nInner work.");
    const subContent = `
name: inner-config
skills:
  atomic:
    inner: ./skills/inner
`;
    writeYaml(tmpDir, "sub/skillfold.yaml", subContent);

    const configContent = `
name: test
skills:
  atomic:
    worker: ./skills/worker
  composed:
    agent:
      compose: [worker]
      description: "Test agent."
team:
  flow:
    - sub:
        flow: ./sub/skillfold.yaml
      then: end
`;
    const path = writeYaml(tmpDir, "skillfold.yaml", configContent);
    await assert.rejects(
      () => loadConfig(path),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError);
        assert.match(err.message, /has no team\.flow/);
        return true;
      },
    );
  });

  it("errors on circular sub-flow reference", async () => {
    tmpDir = makeTmpDir();
    writeSkill(tmpDir, "worker", "# Worker\nDoes work.");

    // Config A references config B as a sub-flow
    const configA = `
name: config-a
skills:
  atomic:
    worker: ./skills/worker
  composed:
    agent:
      compose: [worker]
      description: "Agent A."
team:
  flow:
    - sub:
        flow: ./sub/skillfold.yaml
      then: end
`;
    // Config B references config A back as a sub-flow (circular)
    const configB = `
name: config-b
skills:
  atomic:
    worker: ../skills/worker
  composed:
    agent:
      compose: [worker]
      description: "Agent B."
team:
  flow:
    - sub:
        flow: ../skillfold.yaml
      then: end
`;
    writeYaml(tmpDir, "skillfold.yaml", configA);
    writeYaml(tmpDir, "sub/skillfold.yaml", configB);

    const path = join(tmpDir, "skillfold.yaml");
    await assert.rejects(
      () => loadConfig(path),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError);
        assert.match(err.message, /[Cc]ircular sub-flow/);
        return true;
      },
    );
  });
});

describe("generateOrchestrator: sub-flow nodes", () => {
  it("renders sub-flow with hierarchical step numbers", () => {
    const config: Config = {
      name: "subflow-pipeline",
      skills: {
        planner: { path: "./skills/planner" },
        coder: { path: "./skills/coder" },
        tester: { path: "./skills/tester" },
      },
      state: {
        types: {},
        fields: {
          plan: { type: { kind: "primitive", value: "string" } },
          code: { type: { kind: "primitive", value: "string" } },
          result: { type: { kind: "primitive", value: "string" } },
        },
      },
      team: {
        flow: {
          nodes: [
            {
              skill: "planner",
              reads: [],
              writes: ["state.plan"],
              then: "dev-cycle",
            },
            {
              name: "dev-cycle",
              flow: "./subflow/skillfold.yaml",
              reads: ["state.plan"],
              writes: ["state.result"],
              graph: [
                {
                  skill: "coder",
                  reads: [],
                  writes: ["state.code"],
                  then: "tester",
                },
                {
                  skill: "tester",
                  reads: ["state.code"],
                  writes: [],
                },
              ],
            } as SubFlowNode,
          ],
        },
      },
    };

    const output = generateOrchestrator(config);

    // Step 1: planner
    assert.ok(output.includes("### Step 1: planner"));
    assert.ok(output.includes("Then: proceed to step 2."));

    // Step 2: sub-flow
    assert.ok(output.includes("### Step 2: dev-cycle (sub-flow)"));
    assert.ok(output.includes("Run the **dev-cycle** sub-flow"));
    assert.ok(output.includes("Reads: `state.plan`"));
    assert.ok(output.includes("Writes: `state.result`"));

    // Sub-flow inner steps
    assert.ok(output.includes("Sub-flow steps:"));
    assert.ok(output.includes("#### Step 2.1: coder"));
    assert.ok(output.includes("#### Step 2.2: tester"));
  });

  it("renders sub-flow without inner graph when not resolved", () => {
    const config: Config = {
      name: "unresolved",
      skills: {},
      team: {
        flow: {
          nodes: [
            {
              name: "sub",
              flow: "./sub.yaml",
              reads: [],
              writes: ["state.result"],
            } as SubFlowNode,
          ],
        },
      },
    };

    const output = generateOrchestrator(config);
    assert.ok(output.includes("### Step 1: sub (sub-flow)"));
    assert.ok(!output.includes("Sub-flow steps:"));
  });
});

describe("generateMermaid: sub-flow nodes", () => {
  it("renders sub-flow as a subgraph with inner nodes", () => {
    const config: Config = {
      name: "test",
      skills: {
        planner: { path: "./skills/planner" },
        coder: { path: "./skills/coder" },
        tester: { path: "./skills/tester" },
      },
      team: {
        flow: {
          nodes: [
            {
              skill: "planner",
              reads: [],
              writes: [],
              then: "dev-cycle",
            },
            {
              name: "dev-cycle",
              flow: "./sub.yaml",
              reads: [],
              writes: [],
              graph: [
                {
                  skill: "coder",
                  reads: [],
                  writes: [],
                  then: "tester",
                },
                {
                  skill: "tester",
                  reads: [],
                  writes: [],
                },
              ],
            } as SubFlowNode,
          ],
        },
      },
    };

    const output = generateMermaid(config);
    assert.ok(output.includes('subgraph subflow_dev_cycle["sub-flow: dev-cycle"]'));
    assert.ok(output.includes("coder --> tester"));
    assert.ok(output.includes("end"));
    assert.ok(output.includes("planner --> subflow_dev_cycle"));
  });

  it("renders sub-flow with writes as edge label", () => {
    const config: Config = {
      name: "test",
      skills: {
        coder: { path: "./skills/coder" },
      },
      team: {
        flow: {
          nodes: [
            {
              name: "cycle",
              flow: "./sub.yaml",
              reads: [],
              writes: ["state.result"],
              graph: [
                {
                  skill: "coder",
                  reads: [],
                  writes: [],
                },
              ],
            } as SubFlowNode,
          ],
        },
      },
    };

    const output = generateMermaid(config);
    assert.ok(output.includes('subflow_cycle'));
    assert.ok(output.includes('"result"'));
  });

  it("renders empty sub-flow subgraph when graph is not resolved", () => {
    const config: Config = {
      name: "test",
      skills: {},
      team: {
        flow: {
          nodes: [
            {
              name: "sub",
              flow: "./sub.yaml",
              reads: [],
              writes: [],
            } as SubFlowNode,
          ],
        },
      },
    };

    const output = generateMermaid(config);
    assert.ok(output.includes('subgraph subflow_sub["sub-flow: sub"]'));
    assert.ok(output.includes("end"));
  });
});

describe("e2e: subflow-pipeline", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("loads, resolves, compiles, and generates orchestrator for sub-flow pipeline", async () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");

    const config = await loadConfig(configPath);

    // Verify sub-flow node has its inner graph populated
    assert.ok(config.team);
    const sfNode = config.team.flow.nodes[1];
    assert.ok(isSubFlowNode(sfNode));
    assert.ok(sfNode.graph);
    assert.ok(sfNode.graph.length > 0);

    // Resolve skills and compile
    const bodies = await resolveSkills(config, fixtureDir);
    const results = compile(config, bodies, outDir, "0.0.0", "skillfold.yaml");

    // Should produce composed skill outputs
    assert.ok(results.length > 0);

    // Orchestrator output should include sub-flow rendering
    const orchestrator = generateOrchestrator(config);
    assert.ok(orchestrator.includes("sub-flow"));
    assert.ok(orchestrator.includes("dev-cycle"));

    // Mermaid output should include sub-flow subgraph
    const mermaid = generateMermaid(config);
    assert.ok(mermaid.includes("subflow_dev_cycle"));
  });
});
