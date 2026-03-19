import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { isAtomic, isComposed, readConfig } from "./config.js";
import { ConfigError } from "./errors.js";

function makeTmpDir(): string {
  const dir = join(tmpdir(), `skillfold-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeYaml(dir: string, content: string): string {
  const filePath = join(dir, "skillfold.yaml");
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

describe("readConfig", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("string shorthand produces AtomicSkill", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  review: ./skills/review
`);
    const config = readConfig(configPath);
    const skill = config.skills["review"];
    assert.ok(isAtomic(skill));
    assert.equal(skill.path, "./skills/review");
  });

  it("object with path key produces AtomicSkill", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  review:
    path: ./skills/review
`);
    const config = readConfig(configPath);
    const skill = config.skills["review"];
    assert.ok(isAtomic(skill));
    assert.equal(skill.path, "./skills/review");
  });

  it("object with compose and string array produces ComposedSkill", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  lint: ./skills/lint
  format: ./skills/format
  quality:
    compose:
      - lint
      - format
    description: "Runs lint and format checks."
`);
    const config = readConfig(configPath);
    const skill = config.skills["quality"];
    assert.ok(isComposed(skill));
    assert.deepEqual(skill.compose, ["lint", "format"]);
    assert.equal(skill.description, "Runs lint and format checks.");
  });

  it("rejects compose with non-string elements", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  quality:
    compose:
      - 42
    description: "A quality skill."
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /compose must be an array of skill names/);
      return true;
    });
  });

  it("rejects composed skill without description", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  lint: ./skills/lint
  quality:
    compose:
      - lint
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /composed skills must have a description/);
      return true;
    });
  });

  it("rejects unrecognized skill shape", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  weird:
    unknown_key: value
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /must be a path string/);
      return true;
    });
  });

  it("composed skill referencing unknown skill throws ConfigError", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  quality:
    compose:
      - nonexistent
    description: "A quality skill."
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /composes unknown skill "nonexistent"/);
      return true;
    });
  });

  it("direct self-reference cycle throws with cycle path", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  loop:
    compose:
      - loop
    description: "A looping skill."
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /Circular composition detected/);
      assert.match(err.message, /loop -> loop/);
      return true;
    });
  });

  it("indirect cycle (A -> B -> C -> A) throws with cycle path", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  a:
    compose:
      - b
    description: "Skill a."
  b:
    compose:
      - c
    description: "Skill b."
  c:
    compose:
      - a
    description: "Skill c."
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /Circular composition detected/);
      assert.match(err.message, /a -> b -> c -> a/);
      return true;
    });
  });

  it("diamond shape (not a cycle) passes", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  leaf: ./skills/leaf
  mid1:
    compose:
      - leaf
    description: "Mid 1."
  mid2:
    compose:
      - leaf
    description: "Mid 2."
  top:
    compose:
      - mid1
      - mid2
    description: "Top skill."
`);
    const config = readConfig(configPath);
    assert.ok(isComposed(config.skills["top"]));
  });

  it("missing file throws ConfigError", () => {
    assert.throws(() => readConfig("/nonexistent/path/config.yaml"), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /Cannot read config file/);
      return true;
    });
  });

  it("non-object YAML throws", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, "just a string");
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /Config must be a YAML object/);
      return true;
    });
  });

  it("missing name field throws", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
skills:
  review: ./skills/review
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /must have a 'name' field/);
      return true;
    });
  });

  it("missing skills field throws", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /must have a 'skills' field/);
      return true;
    });
  });

  it("valid YAML returns correct Config", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: my-pipeline
skills:
  review: ./skills/review
  lint:
    path: ./skills/lint
  quality:
    compose:
      - review
      - lint
    description: "Runs quality checks."
`);
    const config = readConfig(configPath);
    assert.equal(config.name, "my-pipeline");
    assert.deepEqual(Object.keys(config.skills).sort(), ["lint", "quality", "review"]);
    assert.ok(isAtomic(config.skills["review"]));
    assert.ok(isAtomic(config.skills["lint"]));
    assert.ok(isComposed(config.skills["quality"]));
  });
});

describe("readConfig name validation", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("rejects uppercase characters in skill name", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  MySkill: ./skills/my-skill
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /name must be lowercase alphanumeric with hyphens/);
      return true;
    });
  });

  it("rejects consecutive hyphens in skill name", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  my--skill: ./skills/my-skill
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /name must be lowercase alphanumeric with hyphens/);
      return true;
    });
  });

  it("rejects skill name longer than 64 characters", () => {
    tmpDir = makeTmpDir();
    const longName = "a".repeat(65);
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  ${longName}: ./skills/long
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /name must be lowercase alphanumeric with hyphens/);
      return true;
    });
  });

  it("accepts single character name", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  a: ./skills/a
`);
    const config = readConfig(configPath);
    assert.ok(isAtomic(config.skills["a"]));
  });

  it("accepts valid hyphenated name", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  my-cool-skill: ./skills/my-cool-skill
`);
    const config = readConfig(configPath);
    assert.ok(isAtomic(config.skills["my-cool-skill"]));
  });
});

describe("readConfig state integration", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("config without state section has undefined state", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  review: ./skills/review
`);
    const config = readConfig(configPath);
    assert.equal(config.state, undefined);
  });

  it("config with valid state section parses types and fields", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  review: ./skills/review
  lint: ./skills/lint
state:
  Issue:
    title: string
    priority: number
  issues:
    type: "list<Issue>"
  status:
    type: string
  report:
    type: string
    location:
      skill: review
      path: report.md
`);
    const config = readConfig(configPath);
    assert.ok(config.state);
    assert.deepEqual(Object.keys(config.state.types), ["Issue"]);
    assert.deepEqual(Object.keys(config.state.fields).sort(), [
      "issues",
      "report",
      "status",
    ]);
    assert.deepEqual(config.state.fields["issues"].type, {
      kind: "list",
      element: "Issue",
    });
    assert.deepEqual(config.state.fields["report"].location, {
      skill: "review",
      path: "report.md",
    });
  });

  it("config with non-object state throws ConfigError", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  review: ./skills/review
state: not-an-object
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /State must be a YAML object/);
      return true;
    });
  });

  it("config with invalid state field type throws ConfigError", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  review: ./skills/review
state:
  items:
    type: "list<Unknown>"
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /unknown type "Unknown"/);
      return true;
    });
  });
});

describe("readConfig graph integration", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("config without graph has undefined graph", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  review: ./skills/review
`);
    const config = readConfig(configPath);
    assert.equal(config.graph, undefined);
  });

  it("config with valid graph parses", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  strategy: ./skills/strategy
  lead: ./skills/lead
state:
  goal:
    type: string
  plan:
    type: string
graph:
  - strategy:
      writes: [state.goal]
    then: lead
  - lead:
      reads: [state.goal]
      writes: [state.plan]
    then: end
`);
    const config = readConfig(configPath);
    assert.ok(config.graph);
    assert.equal(config.graph.nodes.length, 2);
  });

  it("config with non-array graph throws ConfigError", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  review: ./skills/review
graph: not-an-array
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /Graph must be a YAML array/);
      return true;
    });
  });
});

describe("readConfig orchestrator integration", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("config with valid orchestrator key parses correctly", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  strategy: ./skills/strategy
  lead: ./skills/lead
  pipeline:
    compose:
      - strategy
      - lead
    description: "Runs the pipeline."
state:
  goal:
    type: string
graph:
  - strategy:
      writes: [state.goal]
    then: lead
  - lead:
      reads: [state.goal]
orchestrator: pipeline
`);
    const config = readConfig(configPath);
    assert.equal(config.orchestrator, "pipeline");
  });

  it("orchestrator referencing nonexistent skill throws ConfigError", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  strategy: ./skills/strategy
  lead: ./skills/lead
state:
  goal:
    type: string
graph:
  - strategy:
      writes: [state.goal]
    then: lead
  - lead:
      reads: [state.goal]
orchestrator: nonexistent
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /Orchestrator references unknown skill "nonexistent"/);
      return true;
    });
  });
});

describe("type guards", () => {
  it("isAtomic returns true for AtomicSkill", () => {
    assert.equal(isAtomic({ path: "./skills/review" }), true);
  });

  it("isAtomic returns false for ComposedSkill", () => {
    assert.equal(isAtomic({ compose: ["a", "b"], description: "desc" }), false);
  });

  it("isComposed returns true for ComposedSkill", () => {
    assert.equal(isComposed({ compose: ["a", "b"], description: "desc" }), true);
  });

  it("isComposed returns false for AtomicSkill", () => {
    assert.equal(isComposed({ path: "./skills/review" }), false);
  });
});
