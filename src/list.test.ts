import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseRawConfig, validateAndBuild } from "./config.js";
import { listPipeline } from "./list.js";

describe("listPipeline", () => {
  it("renders skills, state, and team flow", () => {
    const raw = parseRawConfig(`
name: test-pipeline
skills:
  atomic:
    planning: ./skills/planning
    coding: ./skills/coding
    review: ./skills/review
  composed:
    engineer:
      compose: [planning, coding]
      description: "Implements the plan."
    reviewer:
      compose: [review]
      description: "Reviews code."
state:
  Review:
    approved: bool
    feedback: string
  code:
    type: string
  review:
    type: Review
team:
  flow:
    - engineer:
        writes: [state.code]
      then: reviewer
    - reviewer:
        reads: [state.code]
        writes: [state.review]
      then:
        - when: review.approved == false
          to: engineer
        - when: review.approved == true
          to: end
`);
    const config = validateAndBuild(raw);
    const output = listPipeline(config);

    assert.ok(output.startsWith("test-pipeline\n"));
    assert.ok(output.includes("Skills (3 atomic, 2 composed):"));
    assert.ok(output.includes("planning"));
    assert.ok(output.includes("(atomic)"));
    assert.ok(output.includes("engineer"));
    assert.ok(output.includes("= planning + coding"));
    assert.ok(output.includes("State (2 fields, 1 types):"));
    assert.ok(output.includes("code"));
    assert.ok(output.includes("string"));
    assert.ok(output.includes("Review { approved: bool, feedback: string }"));
    assert.ok(output.includes("Team Flow:"));
    assert.ok(output.includes("engineer -> reviewer"));
    assert.ok(output.includes("reviewer -> engineer (when review.approved == false)"));
    assert.ok(output.includes("reviewer -> end (when review.approved == true)"));
  });

  it("renders minimal config without state or team", () => {
    const raw = parseRawConfig(`
name: minimal
skills:
  atomic:
    one: ./skills/one
`);
    const config = validateAndBuild(raw);
    const output = listPipeline(config);

    assert.ok(output.startsWith("minimal\n"));
    assert.ok(output.includes("Skills (1 atomic, 0 composed):"));
    assert.ok(output.includes("one"));
    assert.ok(!output.includes("State"));
    assert.ok(!output.includes("Team Flow"));
  });

  it("marks remote skills", () => {
    const raw = parseRawConfig(`
name: remote-test
skills:
  atomic:
    local: ./skills/local
    remote-skill: https://github.com/org/repo/tree/main/skills/shared
`);
    const config = validateAndBuild(raw);
    const output = listPipeline(config);

    assert.ok(output.includes("local"));
    assert.ok(output.includes("(atomic)"));
    assert.ok(output.includes("remote-skill"));
    assert.ok(output.includes("(atomic, remote)"));
  });

  it("renders state locations", () => {
    const raw = parseRawConfig(`
name: location-test
skills:
  atomic:
    github: ./skills/github
  composed:
    agent:
      compose: [github]
      description: "Test agent."
state:
  plan:
    type: string
    location:
      skill: github
      path: discussions/general
      kind: reply
  code:
    type: string
    location:
      skill: github
      path: pull-requests
`);
    const config = validateAndBuild(raw);
    const output = listPipeline(config);

    assert.ok(output.includes("-> github: discussions/general (reply)"));
    assert.ok(output.includes("-> github: pull-requests"));
  });

  it("renders map nodes in team flow", () => {
    const raw = parseRawConfig(`
name: map-test
skills:
  atomic:
    planner: ./skills/planner
    worker: ./skills/worker
  composed:
    lead:
      compose: [planner]
      description: "Plans work."
    dev:
      compose: [worker]
      description: "Does work."
state:
  Task:
    title: string
  tasks:
    type: "list<Task>"
team:
  flow:
    - lead:
        writes: [state.tasks]
      then: map
    - map:
        over: state.tasks
        as: task
        graph:
          - dev:
              reads: [task.title]
`);
    const config = validateAndBuild(raw);
    const output = listPipeline(config);

    assert.ok(output.includes("lead -> map"));
    assert.ok(output.includes("map -> end"));
  });

  it("renders composed skill with multiple components", () => {
    const raw = parseRawConfig(`
name: multi-compose
skills:
  atomic:
    a: ./skills/a
    b: ./skills/b
    c: ./skills/c
    d: ./skills/d
  composed:
    agent:
      compose: [a, b, c, d]
      description: "Multi-skill agent."
`);
    const config = validateAndBuild(raw);
    const output = listPipeline(config);

    assert.ok(output.includes("agent"));
    assert.ok(output.includes("= a + b + c + d"));
  });

  it("renders state with list type fields", () => {
    const raw = parseRawConfig(`
name: list-state-test
skills:
  atomic:
    worker: ./skills/worker
state:
  Task:
    title: string
    done: bool
  tasks:
    type: "list<Task>"
  status:
    type: string
`);
    const config = validateAndBuild(raw);
    const output = listPipeline(config);

    assert.ok(output.includes("State (2 fields, 1 types):"));
    assert.ok(output.includes("list<Task>"));
    assert.ok(output.includes("Task { title: string, done: bool }"));
  });

  it("renders implicit fall-through in team flow", () => {
    const raw = parseRawConfig(`
name: fall-through
skills:
  atomic:
    a: ./skills/a
    b: ./skills/b
  composed:
    first:
      compose: [a]
      description: "First agent."
    second:
      compose: [b]
      description: "Second agent."
team:
  flow:
    - first:
        writes: []
    - second:
        writes: []
`);
    const config = validateAndBuild(raw);
    const output = listPipeline(config);

    assert.ok(output.includes("Team Flow:"));
    assert.ok(output.includes("first -> second"));
    assert.ok(output.includes("second -> end"));
  });
});
