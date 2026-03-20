import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { SkillEntry } from "./config.js";
import { GraphError } from "./errors.js";
import {
  Graph,
  isConditionalThen,
  isMapNode,
  parseGraph,
  parseWhenClause,
  StepNode,
  validateGraph,
  WhenClause,
} from "./graph.js";
import { StateSchema } from "./state.js";

// Helper: build a minimal skills record
function makeSkills(...names: string[]): Record<string, SkillEntry> {
  const skills: Record<string, SkillEntry> = {};
  for (const name of names) {
    skills[name] = { path: `./skills/${name}` };
  }
  return skills;
}

// Helper: build a minimal state schema
function makeState(
  fields: Record<string, { kind: "primitive"; value: "string" | "bool" | "number" } | { kind: "list"; element: string } | { kind: "custom"; name: string }>,
): StateSchema {
  const stateFields: StateSchema["fields"] = {};
  for (const [name, type] of Object.entries(fields)) {
    stateFields[name] = { type };
  }
  return { types: {}, fields: stateFields };
}

describe("parseGraph", () => {
  it("parses a single step node with reads, writes, and then", () => {
    const raw = [
      {
        strategy: { writes: ["state.goal"] },
        then: "tech-lead",
      },
    ];
    const graph = parseGraph(raw);
    assert.equal(graph.nodes.length, 1);
    const node = graph.nodes[0] as StepNode;
    assert.equal(node.skill, "strategy");
    assert.deepEqual(node.reads, []);
    assert.deepEqual(node.writes, ["state.goal"]);
    assert.equal(node.then, "tech-lead");
  });

  it("parses a chain of step nodes", () => {
    const raw = [
      {
        strategy: { writes: ["state.goal"] },
        then: "tech-lead",
      },
      {
        "tech-lead": { reads: ["state.goal"], writes: ["state.plan"] },
        then: "end",
      },
    ];
    const graph = parseGraph(raw);
    assert.equal(graph.nodes.length, 2);
    assert.equal((graph.nodes[0] as StepNode).skill, "strategy");
    assert.equal((graph.nodes[1] as StepNode).skill, "tech-lead");
  });

  it("parses conditional then (array of when/to)", () => {
    const raw = [
      {
        reviewer: { reads: ["state.output"], writes: ["state.approved"] },
        then: [
          { when: "state.approved == false", to: "engineer" },
          { when: "state.approved == true", to: "end" },
        ],
      },
    ];
    const graph = parseGraph(raw);
    const node = graph.nodes[0];
    assert.ok(node.then);
    assert.ok(isConditionalThen(node.then));
    assert.equal(node.then.length, 2);
    assert.equal(node.then[0].when, "state.approved == false");
    assert.equal(node.then[0].to, "engineer");
    assert.equal(node.then[1].to, "end");
  });

  it("parses a map node with nested subgraph", () => {
    const raw = [
      {
        map: {
          over: "state.tasks",
          as: "task",
          graph: [
            {
              engineer: { reads: ["task.description"], writes: ["task.output"] },
              then: "end",
            },
          ],
        },
        then: "end",
      },
    ];
    const graph = parseGraph(raw);
    assert.equal(graph.nodes.length, 1);
    const node = graph.nodes[0];
    assert.ok(isMapNode(node));
    assert.equal(node.over, "state.tasks");
    assert.equal(node.as, "task");
    assert.equal(node.graph.length, 1);
    assert.equal(node.then, "end");
  });

  it("parses step node with no reads/writes", () => {
    const raw = [
      {
        strategy: {},
        then: "end",
      },
    ];
    const graph = parseGraph(raw);
    const node = graph.nodes[0] as StepNode;
    assert.deepEqual(node.reads, []);
    assert.deepEqual(node.writes, []);
  });

  it("parses step node with null value (no properties)", () => {
    const raw = [
      {
        strategy: null,
        then: "end",
      },
    ];
    const graph = parseGraph(raw);
    const node = graph.nodes[0] as StepNode;
    assert.equal(node.skill, "strategy");
    assert.deepEqual(node.reads, []);
    assert.deepEqual(node.writes, []);
  });

  describe("malformed input", () => {
    it("rejects non-array graph", () => {
      assert.throws(
        () => parseGraph("not-an-array"),
        (err: unknown) => {
          assert.ok(err instanceof GraphError);
          assert.match(err.message, /Graph must be an array/);
          return true;
        },
      );
    });

    it("rejects empty array", () => {
      assert.throws(
        () => parseGraph([]),
        (err: unknown) => {
          assert.ok(err instanceof GraphError);
          assert.match(err.message, /Graph must have at least one node/);
          return true;
        },
      );
    });

    it("rejects non-object element", () => {
      assert.throws(
        () => parseGraph(["not-an-object"]),
        (err: unknown) => {
          assert.ok(err instanceof GraphError);
          assert.match(err.message, /must be an object/);
          return true;
        },
      );
    });

    it("rejects element with no primary key", () => {
      assert.throws(
        () => parseGraph([{ then: "end" }]),
        (err: unknown) => {
          assert.ok(err instanceof GraphError);
          assert.match(err.message, /must have exactly one primary key/);
          return true;
        },
      );
    });

    it("rejects element with multiple primary keys", () => {
      assert.throws(
        () => parseGraph([{ a: {}, b: {} }]),
        (err: unknown) => {
          assert.ok(err instanceof GraphError);
          assert.match(err.message, /must have exactly one primary key/);
          return true;
        },
      );
    });

    it("rejects invalid then shape (number)", () => {
      assert.throws(
        () => parseGraph([{ strategy: {}, then: 42 }]),
        (err: unknown) => {
          assert.ok(err instanceof GraphError);
          assert.match(err.message, /then must be a string or array/);
          return true;
        },
      );
    });

    it("rejects conditional then with non-object item", () => {
      assert.throws(
        () => parseGraph([{ strategy: {}, then: ["not-an-object"] }]),
        (err: unknown) => {
          assert.ok(err instanceof GraphError);
          assert.match(err.message, /conditional then must be an array of \{when, to\}/);
          return true;
        },
      );
    });

    it("rejects conditional then with missing when/to", () => {
      assert.throws(
        () => parseGraph([{ strategy: {}, then: [{ when: "x" }] }]),
        (err: unknown) => {
          assert.ok(err instanceof GraphError);
          assert.match(err.message, /conditional branch must have "when"/);
          return true;
        },
      );
    });

    it("rejects map node missing over", () => {
      assert.throws(
        () => parseGraph([{ map: { as: "task", graph: [] } }]),
        (err: unknown) => {
          assert.ok(err instanceof GraphError);
          assert.match(err.message, /must have "over"/);
          return true;
        },
      );
    });

    it("rejects map node missing as", () => {
      assert.throws(
        () => parseGraph([{ map: { over: "state.tasks", graph: [] } }]),
        (err: unknown) => {
          assert.ok(err instanceof GraphError);
          assert.match(err.message, /must have "as"/);
          return true;
        },
      );
    });

    it("rejects map node missing graph", () => {
      assert.throws(
        () => parseGraph([{ map: { over: "state.tasks", as: "task" } }]),
        (err: unknown) => {
          assert.ok(err instanceof GraphError);
          assert.match(err.message, /must have "graph"/);
          return true;
        },
      );
    });

    it("rejects reads that is not an array of strings", () => {
      assert.throws(
        () => parseGraph([{ strategy: { reads: "not-an-array" } }]),
        (err: unknown) => {
          assert.ok(err instanceof GraphError);
          assert.match(err.message, /reads must be an array of strings/);
          return true;
        },
      );
    });

    it("rejects writes that is not an array of strings", () => {
      assert.throws(
        () => parseGraph([{ strategy: { writes: [42] } }]),
        (err: unknown) => {
          assert.ok(err instanceof GraphError);
          assert.match(err.message, /writes must be an array of strings/);
          return true;
        },
      );
    });
  });
});

describe("validateGraph", () => {
  describe("skill references (rule 1)", () => {
    it("valid graph passes", () => {
      const graph: Graph = {
        nodes: [
          { skill: "strategy", reads: [], writes: ["state.goal"], then: "lead" },
          { skill: "lead", reads: ["state.goal"], writes: [], then: "end" },
        ],
      };
      const skills = makeSkills("strategy", "lead");
      const state = makeState({ goal: { kind: "primitive", value: "string" } });
      assert.doesNotThrow(() => validateGraph(graph, skills, state));
    });

    it("unknown skill reference errors", () => {
      const graph: Graph = {
        nodes: [
          { skill: "unknown", reads: [], writes: [] },
        ],
      };
      const skills = makeSkills("strategy");
      assert.throws(
        () => validateGraph(graph, skills, undefined),
        (err: unknown) => {
          assert.ok(err instanceof GraphError);
          assert.match(err.message, /skill "unknown" is not declared/);
          return true;
        },
      );
    });
  });

  describe("transition targets (rule 2)", () => {
    it("unknown transition target errors", () => {
      const graph: Graph = {
        nodes: [
          { skill: "strategy", reads: [], writes: [], then: "nonexistent" },
        ],
      };
      const skills = makeSkills("strategy");
      assert.throws(
        () => validateGraph(graph, skills, undefined),
        (err: unknown) => {
          assert.ok(err instanceof GraphError);
          assert.match(
            err.message,
            /transition target "nonexistent" is not a declared skill or "end"/,
          );
          return true;
        },
      );
    });

    it('"end" is a valid target', () => {
      const graph: Graph = {
        nodes: [
          { skill: "strategy", reads: [], writes: [], then: "end" },
        ],
      };
      const skills = makeSkills("strategy");
      assert.doesNotThrow(() => validateGraph(graph, skills, undefined));
    });

    it("conditional then with unknown target errors", () => {
      const graph: Graph = {
        nodes: [
          {
            skill: "reviewer",
            reads: [],
            writes: [],
            then: [
              { when: "state.approved == true", to: "end" },
              { when: "state.approved == false", to: "ghost" },
            ],
          },
        ],
      };
      const skills = makeSkills("reviewer");
      const state = makeState({ approved: { kind: "primitive", value: "bool" } });
      assert.throws(
        () => validateGraph(graph, skills, state),
        (err: unknown) => {
          assert.ok(err instanceof GraphError);
          assert.match(err.message, /transition target "ghost"/);
          return true;
        },
      );
    });
  });

  describe("state path validation (rule 3)", () => {
    it("valid state paths pass", () => {
      const graph: Graph = {
        nodes: [
          { skill: "strategy", reads: [], writes: ["state.goal"], then: "lead" },
          { skill: "lead", reads: ["state.goal"], writes: ["state.plan"] },
        ],
      };
      const skills = makeSkills("strategy", "lead");
      const state = makeState({
        goal: { kind: "primitive", value: "string" },
        plan: { kind: "primitive", value: "string" },
      });
      assert.doesNotThrow(() => validateGraph(graph, skills, state));
    });

    it("unknown state field in reads errors", () => {
      const graph: Graph = {
        nodes: [
          { skill: "strategy", reads: ["state.missing"], writes: [] },
        ],
      };
      const skills = makeSkills("strategy");
      const state = makeState({ goal: { kind: "primitive", value: "string" } });
      assert.throws(
        () => validateGraph(graph, skills, state),
        (err: unknown) => {
          assert.ok(err instanceof GraphError);
          assert.match(err.message, /reads state field "state.missing" which is not declared/);
          return true;
        },
      );
    });

    it("unknown state field in writes errors", () => {
      const graph: Graph = {
        nodes: [
          { skill: "strategy", reads: [], writes: ["state.missing"] },
        ],
      };
      const skills = makeSkills("strategy");
      const state = makeState({ goal: { kind: "primitive", value: "string" } });
      assert.throws(
        () => validateGraph(graph, skills, state),
        (err: unknown) => {
          assert.ok(err instanceof GraphError);
          assert.match(err.message, /writes state field "state.missing" which is not declared/);
          return true;
        },
      );
    });

    it("graph with no state but reads/writes errors", () => {
      const graph: Graph = {
        nodes: [
          { skill: "strategy", reads: ["state.goal"], writes: [] },
        ],
      };
      const skills = makeSkills("strategy");
      assert.throws(
        () => validateGraph(graph, skills, undefined),
        (err: unknown) => {
          assert.ok(err instanceof GraphError);
          assert.match(err.message, /reads state field "state.goal" but no state is declared/);
          return true;
        },
      );
    });

    it("non-state paths are skipped during validation", () => {
      const graph: Graph = {
        nodes: [
          { skill: "engineer", reads: ["task.description"], writes: ["task.output"] },
        ],
      };
      const skills = makeSkills("engineer");
      assert.doesNotThrow(() => validateGraph(graph, skills, undefined));
    });
  });

  describe("write conflicts (rule 4)", () => {
    it("no conflicts passes", () => {
      const graph: Graph = {
        nodes: [
          { skill: "strategy", reads: [], writes: ["state.goal"], then: "lead" },
          { skill: "lead", reads: [], writes: ["state.plan"] },
        ],
      };
      const skills = makeSkills("strategy", "lead");
      const state = makeState({
        goal: { kind: "primitive", value: "string" },
        plan: { kind: "primitive", value: "string" },
      });
      assert.doesNotThrow(() => validateGraph(graph, skills, state));
    });

    it("two nodes writing same field errors", () => {
      const graph: Graph = {
        nodes: [
          { skill: "strategy", reads: [], writes: ["state.goal"], then: "lead" },
          { skill: "lead", reads: [], writes: ["state.goal"] },
        ],
      };
      const skills = makeSkills("strategy", "lead");
      const state = makeState({
        goal: { kind: "primitive", value: "string" },
      });
      assert.throws(
        () => validateGraph(graph, skills, state),
        (err: unknown) => {
          assert.ok(err instanceof GraphError);
          assert.match(err.message, /Write conflict: nodes "strategy" and "lead" both write "state.goal"/);
          return true;
        },
      );
    });

    it("same field in different scopes (outer vs map subgraph) passes", () => {
      const graph: Graph = {
        nodes: [
          { skill: "strategy", reads: [], writes: ["state.goal"], then: "map" },
          {
            over: "state.tasks",
            as: "task",
            graph: [
              { skill: "engineer", reads: [], writes: ["state.goal"] },
            ],
          },
        ],
      };
      // The outer strategy and inner engineer write the same field
      // but they are at different graph levels, so no conflict.
      const skills = makeSkills("strategy", "engineer");
      const state = makeState({
        goal: { kind: "primitive", value: "string" },
        tasks: { kind: "list", element: "Task" },
      });
      assert.doesNotThrow(() => validateGraph(graph, skills, state));
    });
  });

  describe("map validation (rules 7 & 8)", () => {
    it("map over non-list field errors", () => {
      const graph: Graph = {
        nodes: [
          {
            over: "state.goal",
            as: "item",
            graph: [
              { skill: "engineer", reads: [], writes: [] },
            ],
          },
        ],
      };
      const skills = makeSkills("engineer");
      const state = makeState({
        goal: { kind: "primitive", value: "string" },
      });
      assert.throws(
        () => validateGraph(graph, skills, state),
        (err: unknown) => {
          assert.ok(err instanceof GraphError);
          assert.match(err.message, /Map node: "state.goal" is not a list field/);
          return true;
        },
      );
    });

    it("map over undeclared state field errors", () => {
      const graph: Graph = {
        nodes: [
          {
            over: "state.missing",
            as: "item",
            graph: [
              { skill: "engineer", reads: [], writes: [] },
            ],
          },
        ],
      };
      const skills = makeSkills("engineer");
      const state = makeState({
        tasks: { kind: "list", element: "Task" },
      });
      assert.throws(
        () => validateGraph(graph, skills, state),
        (err: unknown) => {
          assert.ok(err instanceof GraphError);
          assert.match(err.message, /is not a declared state field/);
          return true;
        },
      );
    });

    it("map as shadowing state field errors", () => {
      const graph: Graph = {
        nodes: [
          {
            over: "state.tasks",
            as: "goal",
            graph: [
              { skill: "engineer", reads: [], writes: [] },
            ],
          },
        ],
      };
      const skills = makeSkills("engineer");
      const state = makeState({
        tasks: { kind: "list", element: "Task" },
        goal: { kind: "primitive", value: "string" },
      });
      assert.throws(
        () => validateGraph(graph, skills, state),
        (err: unknown) => {
          assert.ok(err instanceof GraphError);
          assert.match(err.message, /loop variable "goal" shadows state field/);
          return true;
        },
      );
    });

    it("valid map node passes", () => {
      const graph: Graph = {
        nodes: [
          {
            over: "state.tasks",
            as: "task",
            graph: [
              { skill: "engineer", reads: ["task.description"], writes: ["task.output"] },
            ],
          },
        ],
      };
      const skills = makeSkills("engineer");
      const state = makeState({
        tasks: { kind: "list", element: "Task" },
      });
      assert.doesNotThrow(() => validateGraph(graph, skills, state));
    });
  });

  describe("map subgraph state path validation", () => {
    // State schema with a Task type and a list<Task> field
    function makeMapState(): StateSchema {
      return {
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
          tasks: { type: { kind: "list", element: "Task" } },
        },
      };
    }

    it("valid map subgraph state path passes", () => {
      const graph: Graph = {
        nodes: [
          {
            over: "state.tasks",
            as: "task",
            graph: [
              { skill: "engineer", reads: ["task.description"], writes: ["task.output"] },
            ],
          },
        ],
      };
      const skills = makeSkills("engineer");
      assert.doesNotThrow(() => validateGraph(graph, skills, makeMapState()));
    });

    it("invalid map subgraph reads path errors", () => {
      const graph: Graph = {
        nodes: [
          {
            over: "state.tasks",
            as: "task",
            graph: [
              { skill: "engineer", reads: ["task.nonexistent"], writes: [] },
            ],
          },
        ],
      };
      const skills = makeSkills("engineer");
      assert.throws(
        () => validateGraph(graph, skills, makeMapState()),
        (err: unknown) => {
          assert.ok(err instanceof GraphError);
          assert.match(
            err.message,
            /Map subgraph node "engineer": reads "task.nonexistent" but type "Task" has no field "nonexistent"/,
          );
          return true;
        },
      );
    });

    it("invalid map subgraph writes path errors", () => {
      const graph: Graph = {
        nodes: [
          {
            over: "state.tasks",
            as: "task",
            graph: [
              { skill: "engineer", reads: [], writes: ["task.missing"] },
            ],
          },
        ],
      };
      const skills = makeSkills("engineer");
      assert.throws(
        () => validateGraph(graph, skills, makeMapState()),
        (err: unknown) => {
          assert.ok(err instanceof GraphError);
          assert.match(
            err.message,
            /Map subgraph node "engineer": writes "task.missing" but type "Task" has no field "missing"/,
          );
          return true;
        },
      );
    });

    it("multiple valid paths pass", () => {
      const graph: Graph = {
        nodes: [
          {
            over: "state.tasks",
            as: "task",
            graph: [
              {
                skill: "engineer",
                reads: ["task.description"],
                writes: ["task.output"],
                then: "reviewer",
              },
              {
                skill: "reviewer",
                reads: ["task.output"],
                writes: ["task.approved"],
                then: "end",
              },
            ],
          },
        ],
      };
      const skills = makeSkills("engineer", "reviewer");
      assert.doesNotThrow(() => validateGraph(graph, skills, makeMapState()));
    });

    it("skips subgraph path validation when state is undefined", () => {
      const graph: Graph = {
        nodes: [
          {
            over: "items",
            as: "item",
            graph: [
              { skill: "worker", reads: ["item.name"], writes: ["item.result"] },
            ],
          },
        ],
      };
      const skills = makeSkills("worker");
      // map.over doesn't start with "state." so no state validation triggered,
      // and no map context is resolved, so item.* paths are skipped
      assert.doesNotThrow(() => validateGraph(graph, skills, undefined));
    });
  });

  describe("cycle exit condition (rule 5)", () => {
    it("conditional cycle with exit condition passes", () => {
      const graph: Graph = {
        nodes: [
          { skill: "engineer", reads: [], writes: [], then: "reviewer" },
          {
            skill: "reviewer",
            reads: [],
            writes: [],
            then: [
              { when: "state.approved == false", to: "engineer" },
              { when: "state.approved == true", to: "end" },
            ],
          },
        ],
      };
      const skills = makeSkills("engineer", "reviewer");
      const state = makeState({ approved: { kind: "primitive", value: "bool" } });
      assert.doesNotThrow(() => validateGraph(graph, skills, state));
    });

    it("conditional cycle without exit condition errors", () => {
      const graph: Graph = {
        nodes: [
          { skill: "engineer", reads: [], writes: [], then: "reviewer" },
          {
            skill: "reviewer",
            reads: [],
            writes: [],
            then: [
              { when: "state.approved == false", to: "engineer" },
              { when: "state.status == \"revision\"", to: "engineer" },
            ],
          },
        ],
      };
      const skills = makeSkills("engineer", "reviewer");
      const state = makeState({
        approved: { kind: "primitive", value: "bool" },
        status: { kind: "primitive", value: "string" },
      });
      assert.throws(
        () => validateGraph(graph, skills, state),
        (err: unknown) => {
          assert.ok(err instanceof GraphError);
          assert.match(err.message, /conditional cycle has no exit condition/);
          return true;
        },
      );
    });

    it("unconditional then (string) forming a back-edge is not checked by cycle rule", () => {
      // The cycle rule only applies to conditional branches
      // An unconditional back-edge is not caught by this rule
      const graph: Graph = {
        nodes: [
          { skill: "engineer", reads: [], writes: [], then: "reviewer" },
          { skill: "reviewer", reads: [], writes: [], then: "engineer" },
        ],
      };
      const skills = makeSkills("engineer", "reviewer");
      // This is a design choice: unconditional loops are allowed
      // (they'd run forever, but that's the user's problem)
      assert.doesNotThrow(() => validateGraph(graph, skills, undefined));
    });
  });

  describe("reachability (rule 6)", () => {
    it("linear graph passes", () => {
      const graph: Graph = {
        nodes: [
          { skill: "a", reads: [], writes: [], then: "b" },
          { skill: "b", reads: [], writes: [], then: "c" },
          { skill: "c", reads: [], writes: [], then: "end" },
        ],
      };
      const skills = makeSkills("a", "b", "c");
      assert.doesNotThrow(() => validateGraph(graph, skills, undefined));
    });

    it("unreachable node errors", () => {
      const graph: Graph = {
        nodes: [
          { skill: "a", reads: [], writes: [], then: "end" },
          { skill: "b", reads: [], writes: [] },
        ],
      };
      const skills = makeSkills("a", "b");
      assert.throws(
        () => validateGraph(graph, skills, undefined),
        (err: unknown) => {
          assert.ok(err instanceof GraphError);
          assert.match(err.message, /Graph node "b" is unreachable/);
          return true;
        },
      );
    });

    it("implicit fall-through makes next node reachable", () => {
      const graph: Graph = {
        nodes: [
          { skill: "a", reads: [], writes: [] },
          { skill: "b", reads: [], writes: [] },
        ],
      };
      const skills = makeSkills("a", "b");
      assert.doesNotThrow(() => validateGraph(graph, skills, undefined));
    });

    it("conditional branches make both targets reachable", () => {
      const graph: Graph = {
        nodes: [
          {
            skill: "a",
            reads: [],
            writes: [],
            then: [
              { when: "state.flag == true", to: "b" },
              { when: "state.flag == false", to: "c" },
            ],
          },
          { skill: "b", reads: [], writes: [], then: "end" },
          { skill: "c", reads: [], writes: [], then: "end" },
        ],
      };
      const skills = makeSkills("a", "b", "c");
      const state = makeState({ flag: { kind: "primitive", value: "bool" } });
      assert.doesNotThrow(() => validateGraph(graph, skills, state));
    });

    it("node reachable only through cycle is still reachable", () => {
      const graph: Graph = {
        nodes: [
          { skill: "a", reads: [], writes: [], then: "b" },
          {
            skill: "b",
            reads: [],
            writes: [],
            then: [
              { when: "state.done == false", to: "a" },
              { when: "state.done == true", to: "end" },
            ],
          },
        ],
      };
      const skills = makeSkills("a", "b");
      const state = makeState({ done: { kind: "primitive", value: "bool" } });
      assert.doesNotThrow(() => validateGraph(graph, skills, state));
    });
  });
});

describe("parseWhenClause", () => {
  it("parses == with boolean value", () => {
    const clause = parseWhenClause("task.approved == false", 'Graph node "reviewer"');
    assert.deepEqual(clause, { path: "task.approved", operator: "==", value: false });
  });

  it("parses == with true value", () => {
    const clause = parseWhenClause("task.approved == true", 'Graph node "reviewer"');
    assert.deepEqual(clause, { path: "task.approved", operator: "==", value: true });
  });

  it("parses != with quoted string value", () => {
    const clause = parseWhenClause('state.status != "pending"', 'Graph node "check"');
    assert.deepEqual(clause, { path: "state.status", operator: "!=", value: "pending" });
  });

  it("parses == with quoted string value", () => {
    const clause = parseWhenClause('state.status == "done"', 'Graph node "check"');
    assert.deepEqual(clause, { path: "state.status", operator: "==", value: "done" });
  });

  it("parses == with numeric value", () => {
    const clause = parseWhenClause("state.retries == 3", 'Graph node "retry"');
    assert.deepEqual(clause, { path: "state.retries", operator: "==", value: 3 });
  });

  it("throws on malformed when clause with no operator", () => {
    assert.throws(
      () => parseWhenClause("just a string", 'Graph node "a"'),
      (err: unknown) => {
        assert.ok(err instanceof GraphError);
        assert.match(err.message, /invalid when clause "just a string"/);
        assert.match(err.message, /expected: <path> == <value> or <path> != <value>/);
        return true;
      },
    );
  });

  it("throws on empty expression", () => {
    assert.throws(
      () => parseWhenClause("", 'Graph node "a"'),
      (err: unknown) => {
        assert.ok(err instanceof GraphError);
        assert.match(err.message, /invalid when clause/);
        return true;
      },
    );
  });
});

describe("validateGraph when-clause validation", () => {
  // Helper: state schema with Task type
  function makeMapState(): StateSchema {
    return {
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
        tasks: { type: { kind: "list", element: "Task" } },
      },
    };
  }

  it("valid when-clause with map variable path passes", () => {
    const graph: Graph = {
      nodes: [
        {
          over: "state.tasks",
          as: "task",
          graph: [
            {
              skill: "engineer",
              reads: ["task.description"],
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
    };
    const skills = makeSkills("engineer", "reviewer");
    assert.doesNotThrow(() => validateGraph(graph, skills, makeMapState()));
  });

  it("invalid path in when-clause errors", () => {
    const graph: Graph = {
      nodes: [
        {
          over: "state.tasks",
          as: "task",
          graph: [
            {
              skill: "engineer",
              reads: ["task.description"],
              writes: ["task.output"],
              then: "reviewer",
            },
            {
              skill: "reviewer",
              reads: ["task.output"],
              writes: ["task.approved"],
              then: [
                { when: "task.nonexistent == true", to: "engineer" },
                { when: "task.approved == true", to: "end" },
              ],
            },
          ],
        },
      ],
    };
    const skills = makeSkills("engineer", "reviewer");
    assert.throws(
      () => validateGraph(graph, skills, makeMapState()),
      (err: unknown) => {
        assert.ok(err instanceof GraphError);
        assert.match(err.message, /when clause references "task.nonexistent"/);
        assert.match(err.message, /type "Task" has no field "nonexistent"/);
        return true;
      },
    );
  });

  it("valid state path in when-clause passes", () => {
    const graph: Graph = {
      nodes: [
        {
          skill: "checker",
          reads: [],
          writes: [],
          then: [
            { when: 'state.status == "done"', to: "end" },
            { when: 'state.status != "done"', to: "checker" },
          ],
        },
      ],
    };
    const skills = makeSkills("checker");
    const state = makeState({ status: { kind: "primitive", value: "string" } });
    assert.doesNotThrow(() => validateGraph(graph, skills, state));
  });

  it("invalid state path in when-clause errors", () => {
    const graph: Graph = {
      nodes: [
        {
          skill: "checker",
          reads: [],
          writes: [],
          then: [
            { when: "state.missing == true", to: "end" },
            { when: "state.missing == false", to: "checker" },
          ],
        },
      ],
    };
    const skills = makeSkills("checker");
    const state = makeState({ status: { kind: "primitive", value: "string" } });
    assert.throws(
      () => validateGraph(graph, skills, state),
      (err: unknown) => {
        assert.ok(err instanceof GraphError);
        assert.match(err.message, /when clause references state field "state.missing" which is not declared/);
        return true;
      },
    );
  });

  it("malformed when-clause errors during validation", () => {
    const graph: Graph = {
      nodes: [
        {
          skill: "checker",
          reads: [],
          writes: [],
          then: [
            { when: "just a string", to: "end" },
          ],
        },
      ],
    };
    const skills = makeSkills("checker");
    const state = makeState({ status: { kind: "primitive", value: "string" } });
    assert.throws(
      () => validateGraph(graph, skills, state),
      (err: unknown) => {
        assert.ok(err instanceof GraphError);
        assert.match(err.message, /invalid when clause "just a string"/);
        return true;
      },
    );
  });

  it("!= operator works in validation", () => {
    const graph: Graph = {
      nodes: [
        {
          skill: "checker",
          reads: [],
          writes: [],
          then: [
            { when: 'state.status != "pending"', to: "end" },
            { when: 'state.status == "pending"', to: "checker" },
          ],
        },
      ],
    };
    const skills = makeSkills("checker");
    const state = makeState({ status: { kind: "primitive", value: "string" } });
    assert.doesNotThrow(() => validateGraph(graph, skills, state));
  });

  it("when-clause with unknown prefix errors", () => {
    const graph: Graph = {
      nodes: [
        {
          skill: "checker",
          reads: [],
          writes: [],
          then: [
            { when: "unknown.field == true", to: "end" },
          ],
        },
      ],
    };
    const skills = makeSkills("checker");
    const state = makeState({ field: { kind: "primitive", value: "bool" } });
    assert.throws(
      () => validateGraph(graph, skills, state),
      (err: unknown) => {
        assert.ok(err instanceof GraphError);
        assert.match(err.message, /when clause references "unknown.field" but "unknown" is not a declared state field/);
        return true;
      },
    );
  });

  it("when-clause referencing state without state declared errors", () => {
    const graph: Graph = {
      nodes: [
        {
          skill: "checker",
          reads: [],
          writes: [],
          then: [
            { when: "state.status == true", to: "end" },
          ],
        },
      ],
    };
    const skills = makeSkills("checker");
    assert.throws(
      () => validateGraph(graph, skills, undefined),
      (err: unknown) => {
        assert.ok(err instanceof GraphError);
        assert.match(err.message, /when clause references state field "state.status" but no state is declared/);
        return true;
      },
    );
  });
});

describe("parseGraph edge cases", () => {
  it("rejects empty conditional then array", () => {
    assert.throws(
      () => parseGraph([{ strategy: {}, then: [] }]),
      (err: unknown) => {
        assert.ok(err instanceof GraphError);
        assert.match(err.message, /conditional then must not be empty/);
        return true;
      },
    );
  });

  it("rejects map node with non-object value", () => {
    assert.throws(
      () => parseGraph([{ map: "not-an-object" }]),
      (err: unknown) => {
        assert.ok(err instanceof GraphError);
        assert.match(err.message, /value must be an object/);
        return true;
      },
    );
  });

  it("rejects step node with non-object non-null value", () => {
    assert.throws(
      () => parseGraph([{ strategy: "bad-value" }]),
      (err: unknown) => {
        assert.ok(err instanceof GraphError);
        assert.match(err.message, /value must be an object or omitted/);
        return true;
      },
    );
  });

  it("rejects array element that is itself an array", () => {
    assert.throws(
      () => parseGraph([["nested"]]),
      (err: unknown) => {
        assert.ok(err instanceof GraphError);
        assert.match(err.message, /must be an object/);
        return true;
      },
    );
  });
});

describe("validateGraph: map over state without state declared", () => {
  it("map over state.* with no state schema errors", () => {
    const graph: Graph = {
      nodes: [
        {
          over: "state.items",
          as: "item",
          graph: [
            { skill: "worker", reads: [], writes: [] },
          ],
        },
      ],
    };
    const skills = makeSkills("worker");
    assert.throws(
      () => validateGraph(graph, skills, undefined),
      (err: unknown) => {
        assert.ok(err instanceof GraphError);
        assert.match(err.message, /references state but no state is declared/);
        return true;
      },
    );
  });
});

describe("validateGraph: writes without state declared", () => {
  it("writing state path without state schema errors", () => {
    const graph: Graph = {
      nodes: [
        { skill: "strategy", reads: [], writes: ["state.goal"] },
      ],
    };
    const skills = makeSkills("strategy");
    assert.throws(
      () => validateGraph(graph, skills, undefined),
      (err: unknown) => {
        assert.ok(err instanceof GraphError);
        assert.match(err.message, /writes state field "state.goal" but no state is declared/);
        return true;
      },
    );
  });
});

describe("validateGraph: when-clause with no state and non-state path", () => {
  it("when-clause with dotted path and no state errors", () => {
    const graph: Graph = {
      nodes: [
        {
          skill: "checker",
          reads: [],
          writes: [],
          then: [
            { when: "some.field == true", to: "end" },
          ],
        },
      ],
    };
    const skills = makeSkills("checker");
    assert.throws(
      () => validateGraph(graph, skills, undefined),
      (err: unknown) => {
        assert.ok(err instanceof GraphError);
        assert.match(err.message, /not a state or map variable path/);
        return true;
      },
    );
  });
});

describe("parseWhenClause edge cases", () => {
  it("parses != with boolean value", () => {
    const clause = parseWhenClause("state.active != false", 'Graph node "a"');
    assert.deepEqual(clause, { path: "state.active", operator: "!=", value: false });
  });

  it("parses == with unquoted string value", () => {
    const clause = parseWhenClause("state.mode == draft", 'Graph node "a"');
    assert.deepEqual(clause, { path: "state.mode", operator: "==", value: "draft" });
  });

  it("parses == with negative numeric value", () => {
    const clause = parseWhenClause("state.count == -1", 'Graph node "a"');
    assert.deepEqual(clause, { path: "state.count", operator: "==", value: -1 });
  });

  it("parses == with zero value", () => {
    const clause = parseWhenClause("state.count == 0", 'Graph node "a"');
    assert.deepEqual(clause, { path: "state.count", operator: "==", value: 0 });
  });

  it("throws on when clause with empty path (== at start)", () => {
    assert.throws(
      () => parseWhenClause(" == true", 'Graph node "a"'),
      (err: unknown) => {
        assert.ok(err instanceof GraphError);
        assert.match(err.message, /invalid when clause/);
        return true;
      },
    );
  });
});

describe("validateGraph: when-clause with custom type sub-field", () => {
  it("valid custom type sub-field in when-clause passes", () => {
    const graph: Graph = {
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
    };
    const skills = makeSkills("engineer", "reviewer");
    const state: StateSchema = {
      types: {
        Review: {
          fields: { approved: "bool", feedback: "string" },
        },
      },
      fields: {
        code: { type: { kind: "primitive", value: "string" } },
        review: { type: { kind: "custom", name: "Review" } },
      },
    };
    assert.doesNotThrow(() => validateGraph(graph, skills, state));
  });

  it("invalid custom type sub-field in when-clause errors", () => {
    const graph: Graph = {
      nodes: [
        {
          skill: "reviewer",
          reads: [],
          writes: [],
          then: [
            { when: "review.nonexistent == true", to: "end" },
          ],
        },
      ],
    };
    const skills = makeSkills("reviewer");
    const state: StateSchema = {
      types: {
        Review: {
          fields: { approved: "bool" },
        },
      },
      fields: {
        review: { type: { kind: "custom", name: "Review" } },
      },
    };
    assert.throws(
      () => validateGraph(graph, skills, state),
      (err: unknown) => {
        assert.ok(err instanceof GraphError);
        assert.match(err.message, /type "Review" has no field "nonexistent"/);
        return true;
      },
    );
  });

  it("when-clause with path that has no dot and state present errors", () => {
    const graph: Graph = {
      nodes: [
        {
          skill: "checker",
          reads: [],
          writes: [],
          then: [
            { when: "nodots == true", to: "end" },
          ],
        },
      ],
    };
    const skills = makeSkills("checker");
    const state = makeState({ status: { kind: "primitive", value: "string" } });
    assert.throws(
      () => validateGraph(graph, skills, state),
      (err: unknown) => {
        assert.ok(err instanceof GraphError);
        assert.match(err.message, /not a valid state path/);
        return true;
      },
    );
  });
});

describe("type guards", () => {
  it("isMapNode returns true for MapNode", () => {
    assert.equal(isMapNode({ over: "state.tasks", as: "task", graph: [] }), true);
  });

  it("isMapNode returns false for StepNode", () => {
    assert.equal(isMapNode({ skill: "a", reads: [], writes: [] }), false);
  });

  it("isConditionalThen returns true for array", () => {
    assert.equal(isConditionalThen([{ when: "x", to: "y" }]), true);
  });

  it("isConditionalThen returns false for string", () => {
    assert.equal(isConditionalThen("next"), false);
  });
});

describe("error message improvements", () => {
  it("suggests close match for unknown skill in graph node", () => {
    const graph = parseGraph([{ "reveiw": { writes: ["state.output"] } }]);
    const skills = makeSkills("review", "lint");
    assert.throws(
      () => validateGraph(graph, skills, undefined),
      (err: unknown) => {
        assert.ok(err instanceof GraphError);
        assert.match(err.message, /skill "reveiw" is not declared/);
        assert.match(err.message, /Did you mean "review"\?/);
        return true;
      },
    );
  });

  it("omits suggestion when no close skill match exists", () => {
    const graph = parseGraph([{ "zzzzz": { writes: [] } }]);
    const skills = makeSkills("review", "lint");
    assert.throws(
      () => validateGraph(graph, skills, undefined),
      (err: unknown) => {
        assert.ok(err instanceof GraphError);
        assert.match(err.message, /skill "zzzzz" is not declared/);
        assert.ok(!err.message.includes("Did you mean"), "should not suggest when no close match");
        return true;
      },
    );
  });

  it("suggests close match for unknown transition target", () => {
    const graph = parseGraph([
      { review: { writes: [] }, then: "lnt" },
      { lint: null },
    ]);
    const skills = makeSkills("review", "lint");
    assert.throws(
      () => validateGraph(graph, skills, undefined),
      (err: unknown) => {
        assert.ok(err instanceof GraphError);
        assert.match(err.message, /transition target "lnt"/);
        assert.match(err.message, /Did you mean "lint"\?/);
        return true;
      },
    );
  });

  it("includes actionable guidance for missing state section", () => {
    const graph = parseGraph([{ review: { reads: ["state.output"] } }]);
    const skills = makeSkills("review");
    assert.throws(
      () => validateGraph(graph, skills, undefined),
      (err: unknown) => {
        assert.ok(err instanceof GraphError);
        assert.match(err.message, /Add a top-level "state" section to your config/);
        return true;
      },
    );
  });

  it("suggests close match for undeclared state field in reads", () => {
    const state = makeState({
      output: { kind: "primitive", value: "string" },
      status: { kind: "primitive", value: "string" },
    });
    const graph = parseGraph([{ review: { reads: ["state.outpt"] } }]);
    const skills = makeSkills("review");
    assert.throws(
      () => validateGraph(graph, skills, state),
      (err: unknown) => {
        assert.ok(err instanceof GraphError);
        assert.match(err.message, /reads state field "state.outpt" which is not declared/);
        assert.match(err.message, /Did you mean "output"\?/);
        return true;
      },
    );
  });

  it("suggests close match for undeclared state field in writes", () => {
    const state = makeState({
      output: { kind: "primitive", value: "string" },
      status: { kind: "primitive", value: "string" },
    });
    const graph = parseGraph([{ review: { writes: ["state.staus"] } }]);
    const skills = makeSkills("review");
    assert.throws(
      () => validateGraph(graph, skills, state),
      (err: unknown) => {
        assert.ok(err instanceof GraphError);
        assert.match(err.message, /writes state field "state.staus" which is not declared/);
        assert.match(err.message, /Did you mean "status"\?/);
        return true;
      },
    );
  });
});
