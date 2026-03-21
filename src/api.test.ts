import { describe, it } from "node:test";
import assert from "node:assert/strict";

import * as skillfold from "./index.js";

describe("public API surface", () => {
  it("exports config functions", () => {
    assert.equal(typeof skillfold.loadConfig, "function");
    assert.equal(typeof skillfold.readConfig, "function");
    assert.equal(typeof skillfold.isAtomic, "function");
    assert.equal(typeof skillfold.isComposed, "function");
  });

  it("exports resolver functions", () => {
    assert.equal(typeof skillfold.resolveSkills, "function");
    assert.equal(typeof skillfold.stripFrontmatter, "function");
  });

  it("exports compiler functions", () => {
    assert.equal(typeof skillfold.compile, "function");
    assert.equal(typeof skillfold.check, "function");
    assert.equal(typeof skillfold.generate, "function");
  });

  it("exports graph functions", () => {
    assert.equal(typeof skillfold.parseGraph, "function");
    assert.equal(typeof skillfold.validateGraph, "function");
    assert.equal(typeof skillfold.isMapNode, "function");
    assert.equal(typeof skillfold.isConditionalThen, "function");
  });

  it("exports state function", () => {
    assert.equal(typeof skillfold.parseState, "function");
  });

  it("exports orchestrator function", () => {
    assert.equal(typeof skillfold.generateOrchestrator, "function");
  });

  it("exports visualization function", () => {
    assert.equal(typeof skillfold.generateMermaid, "function");
  });

  it("exports list function", () => {
    assert.equal(typeof skillfold.listPipeline, "function");
  });

  it("exports init functions and templates", () => {
    assert.equal(typeof skillfold.initProject, "function");
    assert.equal(typeof skillfold.initFromTemplate, "function");
    assert.ok(Array.isArray(skillfold.TEMPLATES));
    assert.ok(skillfold.TEMPLATES.includes("dev-team"));
  });

  it("exports error classes", () => {
    assert.equal(typeof skillfold.ConfigError, "function");
    assert.equal(typeof skillfold.ResolveError, "function");
    assert.equal(typeof skillfold.CompileError, "function");
    assert.equal(typeof skillfold.GraphError, "function");
  });

  it("error classes are throwable with correct names", () => {
    const config = new skillfold.ConfigError("test");
    assert.equal(config.name, "ConfigError");
    assert.equal(config.message, "test");

    const resolve = new skillfold.ResolveError("skill", "msg");
    assert.equal(resolve.name, "ResolveError");

    const compile = new skillfold.CompileError("skill", "msg");
    assert.equal(compile.name, "CompileError");

    const graph = new skillfold.GraphError("test");
    assert.equal(graph.name, "GraphError");
  });
});

describe("API round-trip", () => {
  it("readConfig loads a valid config", () => {
    const config = skillfold.readConfig("skillfold.yaml");
    assert.equal(config.name, "skillfold-team");
    assert.ok(config.skills);
    assert.ok(config.state);
    assert.ok(config.team);
  });

  it("type guards work on loaded config", () => {
    const config = skillfold.readConfig("skillfold.yaml");
    const testing = config.skills["testing"];
    assert.ok(skillfold.isAtomic(testing));
    assert.ok(!skillfold.isComposed(testing));

    const strategist = config.skills["strategist"];
    assert.ok(skillfold.isComposed(strategist));
    assert.ok(!skillfold.isAtomic(strategist));
  });
});
