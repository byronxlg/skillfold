import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { isAtomic, isComposed, loadConfig, readConfig } from "./config.js";
import { compile } from "./compiler.js";
import { ConfigError } from "./errors.js";
import { resolveSkills } from "./resolver.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "..", "test", "fixtures", "imports");

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
  atomic:
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
  atomic:
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
  atomic:
    lint: ./skills/lint
    format: ./skills/format
  composed:
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
  composed:
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
  atomic:
    lint: ./skills/lint
  composed:
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

  it("rejects unrecognized skill shape in atomic section", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    weird:
      unknown_key: value
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /must be a path string/);
      return true;
    });
  });

  it("rejects skills without atomic or composed sub-sections", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  review: ./skills/review
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /atomic.*composed.*sub-sections/);
      return true;
    });
  });

  it("rejects skill name in both atomic and composed sections", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    dupe: ./skills/dupe
  composed:
    dupe:
      compose: [dupe]
      description: "Duplicate."
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /appears in both atomic and composed/);
      return true;
    });
  });

  it("composed skill referencing unknown skill throws ConfigError", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  composed:
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
  composed:
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
  composed:
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
  atomic:
    leaf: ./skills/leaf
  composed:
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
  atomic:
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
  atomic:
    review: ./skills/review
    lint:
      path: ./skills/lint
  composed:
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

  it("accepts config with only atomic skills", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    a: ./skills/a
    b: ./skills/b
`);
    const config = readConfig(configPath);
    assert.ok(isAtomic(config.skills["a"]));
    assert.ok(isAtomic(config.skills["b"]));
  });

  it("composed-only config still validates cycles", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  composed:
    loop:
      compose: [loop]
      description: "Self-referencing."
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /Circular composition/);
      return true;
    });
  });

  it("rejects old top-level graph format", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    review: ./skills/review
graph:
  - review:
      writes: []
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /Top-level 'graph' is no longer supported/);
      return true;
    });
  });

  it("rejects old top-level orchestrator format", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    review: ./skills/review
orchestrator: review
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /Top-level 'orchestrator' is no longer supported/);
      return true;
    });
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
  atomic:
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
  atomic:
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
  atomic:
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
  atomic:
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
  atomic:
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
  atomic:
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
  atomic:
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
  atomic:
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
  atomic:
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

describe("readConfig team integration", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("config without team has undefined team", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    review: ./skills/review
`);
    const config = readConfig(configPath);
    assert.equal(config.team, undefined);
  });

  it("config with valid team parses", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    strategy: ./skills/strategy
    lead: ./skills/lead
state:
  goal:
    type: string
  plan:
    type: string
team:
  flow:
    - strategy:
        writes: [state.goal]
      then: lead
    - lead:
        reads: [state.goal]
        writes: [state.plan]
      then: end
`);
    const config = readConfig(configPath);
    assert.ok(config.team);
    assert.equal(config.team.flow.nodes.length, 2);
  });

  it("config with non-array team.flow throws ConfigError", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    review: ./skills/review
team:
  flow: not-an-array
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /team\.flow must be a YAML array/);
      return true;
    });
  });

  it("non-object team throws ConfigError", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    review: ./skills/review
team: not-an-object
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /Team must be a YAML object/);
      return true;
    });
  });

  it("team without flow throws ConfigError", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    review: ./skills/review
team:
  orchestrator: review
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /Team must have a 'flow' field/);
      return true;
    });
  });

  it("non-string team.orchestrator throws ConfigError", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    review: ./skills/review
team:
  orchestrator: 42
  flow:
    - review:
        writes: []
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /team\.orchestrator must be a string/);
      return true;
    });
  });
});

describe("readConfig team orchestrator integration", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("config with valid team.orchestrator key parses correctly", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    strategy: ./skills/strategy
    lead: ./skills/lead
  composed:
    pipeline:
      compose:
        - strategy
        - lead
      description: "Runs the pipeline."
state:
  goal:
    type: string
team:
  orchestrator: pipeline
  flow:
    - strategy:
        writes: [state.goal]
      then: lead
    - lead:
        reads: [state.goal]
`);
    const config = readConfig(configPath);
    assert.equal(config.team?.orchestrator, "pipeline");
  });

  it("team.orchestrator referencing nonexistent skill throws ConfigError", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    strategy: ./skills/strategy
    lead: ./skills/lead
state:
  goal:
    type: string
team:
  orchestrator: nonexistent
  flow:
    - strategy:
        writes: [state.goal]
      then: lead
    - lead:
        reads: [state.goal]
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /Orchestrator references unknown skill "nonexistent"/);
      return true;
    });
  });
});

describe("loadConfig imports", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("local import merges skills", async () => {
    const configPath = join(fixturesDir, "main", "skillfold.yaml");
    const config = await loadConfig(configPath);
    assert.ok("common-skill" in config.skills, "imported skill should be present");
    assert.ok("local-skill" in config.skills, "local skill should be present");
    assert.ok("combined" in config.skills, "composed skill should be present");
  });

  it("composed skill references imported skill", async () => {
    const configPath = join(fixturesDir, "main", "skillfold.yaml");
    const config = await loadConfig(configPath);
    const combined = config.skills["combined"];
    assert.ok(isComposed(combined));
    assert.deepEqual(combined.compose, ["common-skill", "local-skill"]);
  });

  it("state merges from import", async () => {
    const configPath = join(fixturesDir, "main", "skillfold.yaml");
    const config = await loadConfig(configPath);
    assert.ok(config.state, "merged config should have state");
    assert.ok("SharedType" in config.state.types, "imported custom type should be present");
    assert.ok("shared-field" in config.state.fields, "imported state field should be present");
  });

  it("local override wins", async () => {
    const configPath = join(fixturesDir, "override", "skillfold.yaml");
    const config = await loadConfig(configPath);
    const skill = config.skills["common-skill"];
    assert.ok(isAtomic(skill));
    // Local path should be ./skills/common (not the imported ../shared path)
    assert.equal(skill.path, "./skills/common");
  });

  it("imported team is ignored", async () => {
    tmpDir = makeTmpDir();
    const configPath = join(tmpDir, "skillfold.yaml");
    writeFileSync(configPath, `
imports:
  - ${join(fixturesDir, "with-team", "skillfold.yaml")}

name: no-team
skills:
  atomic:
    my-skill: ./dummy
`, "utf-8");
    const config = await loadConfig(configPath);
    assert.equal(config.team, undefined, "team from import should not carry over");
  });

  it("imported imports are ignored", async () => {
    tmpDir = makeTmpDir();
    const configPath = join(tmpDir, "skillfold.yaml");
    // Import a config that itself has imports - those nested imports should be ignored
    writeFileSync(configPath, `
imports:
  - ${join(fixturesDir, "nested-imports", "skillfold.yaml")}

name: flat
skills:
  atomic:
    top-skill: ./dummy
`, "utf-8");
    const config = await loadConfig(configPath);
    // nested-imports imports shared, but since nested imports are ignored,
    // common-skill should NOT be in our merged config
    assert.ok(!("common-skill" in config.skills), "nested import's skills should not be present");
    // nested-skill from the directly imported config should be present
    assert.ok("nested-skill" in config.skills, "directly imported skill should be present");
  });

  it("missing import file throws ConfigError", async () => {
    tmpDir = makeTmpDir();
    const configPath = join(tmpDir, "skillfold.yaml");
    writeFileSync(configPath, `
imports:
  - ./nonexistent/skillfold.yaml

name: broken
skills:
  atomic:
    my-skill: ./dummy
`, "utf-8");
    await assert.rejects(() => loadConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /Cannot read imported config/);
      return true;
    });
  });

  it("full pipeline: loadConfig, resolveSkills, compile", async () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "build");
    const configPath = join(fixturesDir, "main", "skillfold.yaml");
    const baseDir = dirname(configPath);

    const config = await loadConfig(configPath);
    const bodies = await resolveSkills(config, baseDir);
    const results = compile(config, bodies, outDir, "0.0.0", "test.yaml");

    assert.ok(results.length > 0, "should produce compile results");
    // The composed skill 'combined' should be compiled
    assert.ok(
      existsSync(join(outDir, "combined", "SKILL.md")),
      "combined/SKILL.md should exist"
    );

    const content = readFileSync(join(outDir, "combined", "SKILL.md"), "utf-8");
    assert.ok(content.includes("Common Skill"), "should contain imported skill body");
    assert.ok(content.includes("Local Skill"), "should contain local skill body");
  });

  it("invalid imports type throws ConfigError", async () => {
    tmpDir = makeTmpDir();
    const configPath = join(tmpDir, "skillfold.yaml");
    writeFileSync(configPath, `
imports: not-an-array

name: broken
skills:
  atomic:
    my-skill: ./dummy
`, "utf-8");
    await assert.rejects(() => loadConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /Imports must be an array of strings/);
      return true;
    });
  });

  it("imports with non-string elements throws ConfigError", async () => {
    tmpDir = makeTmpDir();
    const configPath = join(tmpDir, "skillfold.yaml");
    writeFileSync(configPath, `
imports:
  - 42

name: broken
skills:
  atomic:
    my-skill: ./dummy
`, "utf-8");
    await assert.rejects(() => loadConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /Imports must be an array of strings/);
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
