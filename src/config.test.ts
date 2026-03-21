import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { getLocalConfigName, isAtomic, isComposed, loadConfig, readConfig } from "./config.js";
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

  it("composed skill with frontmatter preserves extra fields", () => {
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
      description: "Runs lint checks."
      frontmatter:
        tools:
          - Edit
          - Bash
        permissionMode: bypassPermissions
        maxTurns: 25
`);
    const config = readConfig(configPath);
    const skill = config.skills["quality"];
    assert.ok(isComposed(skill));
    assert.deepEqual(skill.frontmatter, {
      tools: ["Edit", "Bash"],
      permissionMode: "bypassPermissions",
      maxTurns: 25,
    });
  });

  it("composed skill without frontmatter has undefined frontmatter", () => {
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
      description: "Runs lint checks."
`);
    const config = readConfig(configPath);
    const skill = config.skills["quality"];
    assert.ok(isComposed(skill));
    assert.equal(skill.frontmatter, undefined);
  });

  it("rejects frontmatter that is not a map", () => {
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
      description: "Runs lint checks."
      frontmatter: "not a map"
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /frontmatter must be a YAML map/);
      return true;
    });
  });

  it("rejects frontmatter that is an array", () => {
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
      description: "Runs lint checks."
      frontmatter:
        - not
        - a map
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /frontmatter must be a YAML map/);
      return true;
    });
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
      assert.match(err.message, /composed skills must have a "description" field/);
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

  it("rejects composed skill without compose field", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  composed:
    quality:
      description: "No compose field."
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /must have a "compose" field/);
      return true;
    });
  });

  it("rejects composed skill with empty description", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    lint: ./skills/lint
  composed:
    quality:
      compose: [lint]
      description: ""
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /composed skills must have a "description" field/);
      return true;
    });
  });

  it("rejects empty YAML file", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, "");
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /Config must be a YAML object/);
      return true;
    });
  });

  it("rejects skills section that is not an object", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills: not-an-object
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      return true;
    });
  });

  it("rejects skill name ending with a hyphen", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    bad-name-: ./skills/bad
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /name must be lowercase alphanumeric with hyphens/);
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

describe("error message improvements", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("includes file path in config parsing errors", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, "just a string");
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.ok(err.message.includes(configPath), "error should contain file path");
      return true;
    });
  });

  it("includes file path when skill validation fails", () => {
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
      assert.ok(err.message.includes(configPath), "error should contain file path");
      return true;
    });
  });

  it("suggests close match for composed skill referencing unknown skill", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    review: ./skills/review
    lint: ./skills/lint
  composed:
    quality:
      compose:
        - reveiw
      description: "A quality skill."
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /composes unknown skill "reveiw"/);
      assert.match(err.message, /Did you mean "review"\?/);
      return true;
    });
  });

  it("omits suggestion when no close match exists for composed skill", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    review: ./skills/review
  composed:
    quality:
      compose:
        - zzzzzzz
      description: "A quality skill."
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /composes unknown skill "zzzzzzz"/);
      assert.ok(!err.message.includes("Did you mean"), "should not suggest when no close match");
      return true;
    });
  });

  it("suggests close match for orchestrator referencing unknown skill", () => {
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
  orchestrator: startegy
  flow:
    - strategy:
        writes: [state.goal]
      then: lead
    - lead:
        reads: [state.goal]
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /Orchestrator references unknown skill "startegy"/);
      assert.match(err.message, /Did you mean "strategy"\?/);
      return true;
    });
  });

  it("actionable guidance for missing compose field", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  composed:
    quality:
      description: "A quality skill."
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /Add a "compose" list of skill names/);
      return true;
    });
  });

  it("actionable guidance for missing description field", () => {
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
      assert.match(err.message, /Add a description explaining what this composed skill does/);
      return true;
    });
  });
});

describe("readConfig agent frontmatter overrides", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("parses named agent frontmatter fields on composed skills", () => {
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
      description: "Runs lint checks."
      tools:
        - Read
        - Edit
        - Bash
      permissionMode: acceptEdits
      isolation: worktree
      model: sonnet
      effort: high
      maxTurns: 30
      memory: true
      background: false
`);
    const config = readConfig(configPath);
    const skill = config.skills["quality"];
    assert.ok(isComposed(skill));
    assert.ok(skill.agentConfig);
    assert.deepEqual(skill.agentConfig.tools, ["Read", "Edit", "Bash"]);
    assert.equal(skill.agentConfig.permissionMode, "acceptEdits");
    assert.equal(skill.agentConfig.isolation, "worktree");
    assert.equal(skill.agentConfig.model, "sonnet");
    assert.equal(skill.agentConfig.effort, "high");
    assert.equal(skill.agentConfig.maxTurns, 30);
    assert.equal(skill.agentConfig.memory, true);
    assert.equal(skill.agentConfig.background, false);
  });

  it("composed skill without agent config fields has undefined agentConfig", () => {
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
      description: "Runs lint checks."
`);
    const config = readConfig(configPath);
    const skill = config.skills["quality"];
    assert.ok(isComposed(skill));
    assert.equal(skill.agentConfig, undefined);
  });

  it("parses disallowedTools field", () => {
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
      description: "Runs lint checks."
      disallowedTools:
        - Bash
        - Write
`);
    const config = readConfig(configPath);
    const skill = config.skills["quality"];
    assert.ok(isComposed(skill));
    assert.deepEqual(skill.agentConfig?.disallowedTools, ["Bash", "Write"]);
  });

  it("parses hooks field", () => {
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
      description: "Runs lint checks."
      hooks:
        preToolCall:
          command: "echo hook"
`);
    const config = readConfig(configPath);
    const skill = config.skills["quality"];
    assert.ok(isComposed(skill));
    assert.deepEqual(skill.agentConfig?.hooks, { preToolCall: { command: "echo hook" } });
  });

  it("rejects invalid permissionMode value", () => {
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
      description: "Runs lint checks."
      permissionMode: invalid
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /permissionMode must be one of/);
      return true;
    });
  });

  it("rejects invalid isolation value", () => {
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
      description: "Runs lint checks."
      isolation: sandbox
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /isolation must be one of/);
      return true;
    });
  });

  it("rejects invalid effort value", () => {
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
      description: "Runs lint checks."
      effort: extreme
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /effort must be one of/);
      return true;
    });
  });

  it("rejects non-integer maxTurns", () => {
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
      description: "Runs lint checks."
      maxTurns: 3.5
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /maxTurns must be a positive integer/);
      return true;
    });
  });

  it("rejects zero maxTurns", () => {
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
      description: "Runs lint checks."
      maxTurns: 0
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /maxTurns must be a positive integer/);
      return true;
    });
  });

  it("rejects non-boolean memory", () => {
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
      description: "Runs lint checks."
      memory: "yes"
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /memory must be a boolean/);
      return true;
    });
  });

  it("rejects non-boolean background", () => {
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
      description: "Runs lint checks."
      background: 1
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /background must be a boolean/);
      return true;
    });
  });

  it("rejects non-string model", () => {
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
      description: "Runs lint checks."
      model: 42
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /model must be a string/);
      return true;
    });
  });

  it("rejects non-array tools", () => {
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
      description: "Runs lint checks."
      tools: "Read"
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /tools must be an array of strings/);
      return true;
    });
  });

  it("rejects non-object hooks", () => {
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
      description: "Runs lint checks."
      hooks: "not a map"
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /hooks must be a YAML map/);
      return true;
    });
  });

  it("accepts all four permissionMode values", () => {
    for (const mode of ["default", "acceptEdits", "bypassPermissions", "plan"]) {
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
      description: "Runs lint checks."
      permissionMode: ${mode}
`);
      const config = readConfig(configPath);
      const skill = config.skills["quality"];
      assert.ok(isComposed(skill));
      assert.equal(skill.agentConfig?.permissionMode, mode);
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("parses mcpServers field", () => {
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
      description: "Runs lint checks."
      mcpServers:
        filesystem:
          command: npx
          args:
            - "-y"
            - "@modelcontextprotocol/server-filesystem"
          env:
            HOME: /home/user
`);
    const config = readConfig(configPath);
    const skill = config.skills["quality"];
    assert.ok(isComposed(skill));
    assert.ok(skill.agentConfig?.mcpServers);
    assert.deepEqual(skill.agentConfig.mcpServers.filesystem, {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem"],
      env: { HOME: "/home/user" },
    });
  });

  it("parses skills field", () => {
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
      description: "Runs lint checks."
      skills:
        - ".claude/skills/review/SKILL.md"
        - ".claude/skills/testing/SKILL.md"
`);
    const config = readConfig(configPath);
    const skill = config.skills["quality"];
    assert.ok(isComposed(skill));
    assert.deepEqual(skill.agentConfig?.skills, [
      ".claude/skills/review/SKILL.md",
      ".claude/skills/testing/SKILL.md",
    ]);
  });

  it("rejects non-object mcpServers", () => {
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
      description: "Runs lint checks."
      mcpServers: "not a map"
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /mcpServers must be a YAML map/);
      return true;
    });
  });

  it("rejects non-object mcpServers server entry", () => {
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
      description: "Runs lint checks."
      mcpServers:
        my-server: "not a map"
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /mcpServers\.my-server must be a YAML map/);
      return true;
    });
  });

  it("rejects non-array skills", () => {
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
      description: "Runs lint checks."
      skills: "not an array"
`);
    assert.throws(() => readConfig(configPath), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /skills must be an array of strings/);
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

describe("resource namespace declarations", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("parses atomic skill with valid resources map", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    github:
      path: ./skills/github
      resources:
        discussions: "https://github.com/org/repo/discussions"
        issues: "https://github.com/org/repo/issues"
`);
    const config = readConfig(configPath);
    const skill = config.skills["github"];
    assert.ok(isAtomic(skill));
    assert.deepEqual(skill.resources, {
      discussions: "https://github.com/org/repo/discussions",
      issues: "https://github.com/org/repo/issues",
    });
  });

  it("accepts empty resources map", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    github:
      path: ./skills/github
      resources: {}
`);
    const config = readConfig(configPath);
    const skill = config.skills["github"];
    assert.ok(isAtomic(skill));
    assert.deepEqual(skill.resources, {});
  });

  it("string shorthand has no resources", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    github: ./skills/github
`);
    const config = readConfig(configPath);
    const skill = config.skills["github"];
    assert.ok(isAtomic(skill));
    assert.equal(skill.resources, undefined);
  });

  it("rejects resources with uppercase key", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    github:
      path: ./skills/github
      resources:
        Discussions: "https://example.com"
`);
    assert.throws(
      () => readConfig(configPath),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError);
        assert.match(err.message, /resource name "Discussions"/);
        return true;
      }
    );
  });

  it("rejects resources with non-string value", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    github:
      path: ./skills/github
      resources:
        issues: 42
`);
    assert.throws(
      () => readConfig(configPath),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError);
        assert.match(err.message, /resource "issues" must be a non-empty string/);
        return true;
      }
    );
  });

  it("rejects resources with array value", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    github:
      path: ./skills/github
      resources:
        - issues
`);
    assert.throws(
      () => readConfig(configPath),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError);
        assert.match(err.message, /resources must be a YAML map/);
        return true;
      }
    );
  });
});

describe("top-level resources", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("parses top-level resources section", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    github: ./skills/github
resources:
  github:
    discussions: "https://github.com/org/repo/discussions"
    issues: "https://github.com/org/repo/issues"
`);
    const config = readConfig(configPath);
    assert.deepEqual(config.resources, {
      github: {
        discussions: "https://github.com/org/repo/discussions",
        issues: "https://github.com/org/repo/issues",
      },
    });
  });

  it("uses top-level resources for state location validation", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    github: ./skills/github
resources:
  github:
    discussions: "https://github.com/org/repo/discussions"
    issues: "https://github.com/org/repo/issues"
state:
  direction:
    type: string
    location:
      skill: github
      path: discussions/strategy
`);
    const config = readConfig(configPath);
    assert.equal(config.state?.fields.direction.location?.skill, "github");
    assert.equal(config.state?.fields.direction.location?.path, "discussions/strategy");
  });

  it("rejects invalid namespace against top-level resources", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    github: ./skills/github
resources:
  github:
    discussions: "https://github.com/org/repo/discussions"
state:
  direction:
    type: string
    location:
      skill: github
      path: wikis/strategy
`);
    assert.throws(
      () => readConfig(configPath),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError);
        assert.match(err.message, /namespace "wikis"/);
        return true;
      }
    );
  });

  it("top-level resources take precedence over inline skill resources", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    github:
      path: ./skills/github
      resources:
        discussions: "https://old.example.com/discussions"
resources:
  github:
    discussions: "https://new.example.com/discussions"
state:
  direction:
    type: string
    location:
      skill: github
      path: discussions/strategy
`);
    const config = readConfig(configPath);
    assert.equal(config.state?.fields.direction.location?.skill, "github");
    assert.deepEqual(config.resources, {
      github: {
        discussions: "https://new.example.com/discussions",
      },
    });
  });

  it("rejects top-level resources with invalid group name", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    github: ./skills/github
resources:
  GitHub:
    discussions: "https://example.com"
`);
    assert.throws(
      () => readConfig(configPath),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError);
        assert.match(err.message, /Resource group "GitHub"/);
        return true;
      }
    );
  });

  it("rejects top-level resources with non-map value", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    github: ./skills/github
resources: "not a map"
`);
    assert.throws(
      () => readConfig(configPath),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError);
        assert.match(err.message, /resources.*must be a YAML map/i);
        return true;
      }
    );
  });

  it("accepts config with no resources section", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    github: ./skills/github
`);
    const config = readConfig(configPath);
    assert.equal(config.resources, undefined);
  });

  it("supports multiple resource groups", () => {
    tmpDir = makeTmpDir();
    const configPath = writeYaml(tmpDir, `
name: test
skills:
  atomic:
    github: ./skills/github
    slack: ./skills/slack
resources:
  github:
    issues: "https://github.com/org/repo/issues"
  slack:
    channels: "https://slack.com/api/channels"
`);
    const config = readConfig(configPath);
    assert.deepEqual(config.resources, {
      github: { issues: "https://github.com/org/repo/issues" },
      slack: { channels: "https://slack.com/api/channels" },
    });
  });
});

describe("getLocalConfigName", () => {
  it("derives local name from skillfold.yaml", () => {
    assert.equal(getLocalConfigName("skillfold.yaml"), "skillfold.local.yaml");
  });

  it("derives local name from custom config path", () => {
    assert.equal(getLocalConfigName("my-pipeline.yaml"), "my-pipeline.local.yaml");
  });

  it("handles path with directory", () => {
    assert.equal(getLocalConfigName("/some/dir/skillfold.yaml"), "skillfold.local.yaml");
  });

  it("handles .yml extension", () => {
    assert.equal(getLocalConfigName("pipeline.yml"), "pipeline.local.yml");
  });
});

describe("local config override", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  function writeMainConfig(dir: string, content: string): string {
    const filePath = join(dir, "skillfold.yaml");
    writeFileSync(filePath, content, "utf-8");
    return filePath;
  }

  function writeLocalConfig(dir: string, content: string): void {
    writeFileSync(join(dir, "skillfold.local.yaml"), content, "utf-8");
  }

  function writeSkill(dir: string, name: string, body: string): void {
    const skillDir = join(dir, "skills", name);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), `---\nname: ${name}\ndescription: ${name} skill.\n---\n\n${body}\n`, "utf-8");
  }

  it("works without local config file", async () => {
    tmpDir = makeTmpDir();
    writeSkill(tmpDir, "alpha", "Alpha body.");
    const configPath = writeMainConfig(tmpDir, `
name: test
skills:
  atomic:
    alpha: ./skills/alpha
  composed:
    bot:
      compose: [alpha]
      description: "A bot."
`);
    const config = await loadConfig(configPath);
    assert.equal(config.name, "test");
    assert.ok(isComposed(config.skills["bot"]));
  });

  it("merges local atomic skills on top of main config", async () => {
    tmpDir = makeTmpDir();
    writeSkill(tmpDir, "alpha", "Alpha body.");
    writeSkill(tmpDir, "beta", "Beta body.");
    const configPath = writeMainConfig(tmpDir, `
name: test
skills:
  atomic:
    alpha: ./skills/alpha
  composed:
    bot:
      compose: [alpha]
      description: "A bot."
`);
    writeLocalConfig(tmpDir, `
skills:
  atomic:
    beta: ./skills/beta
  composed:
    bot:
      compose: [alpha, beta]
      description: "A better bot."
`);
    const config = await loadConfig(configPath);
    assert.equal(config.name, "test");
    assert.ok(isAtomic(config.skills["alpha"]));
    assert.ok(isAtomic(config.skills["beta"]));
    const bot = config.skills["bot"];
    assert.ok(isComposed(bot));
    assert.deepEqual(bot.compose, ["alpha", "beta"]);
    assert.equal(bot.description, "A better bot.");
  });

  it("local composed skills override main composed skills", async () => {
    tmpDir = makeTmpDir();
    writeSkill(tmpDir, "alpha", "Alpha body.");
    writeSkill(tmpDir, "beta", "Beta body.");
    const configPath = writeMainConfig(tmpDir, `
name: test
skills:
  atomic:
    alpha: ./skills/alpha
    beta: ./skills/beta
  composed:
    bot:
      compose: [alpha]
      description: "Uses alpha."
`);
    writeLocalConfig(tmpDir, `
skills:
  composed:
    bot:
      compose: [beta]
      description: "Uses beta instead."
`);
    const config = await loadConfig(configPath);
    const bot = config.skills["bot"];
    assert.ok(isComposed(bot));
    assert.deepEqual(bot.compose, ["beta"]);
    assert.equal(bot.description, "Uses beta instead.");
  });

  it("local state adds fields to main state", async () => {
    tmpDir = makeTmpDir();
    writeSkill(tmpDir, "alpha", "Alpha body.");
    const configPath = writeMainConfig(tmpDir, `
name: test
skills:
  atomic:
    alpha: ./skills/alpha
  composed:
    bot:
      compose: [alpha]
      description: "A bot."
state:
  plan:
    type: string
`);
    writeLocalConfig(tmpDir, `
state:
  notes:
    type: string
`);
    const config = await loadConfig(configPath);
    assert.ok(config.state);
    assert.ok("plan" in config.state.fields);
    assert.ok("notes" in config.state.fields);
  });

  it("local team replaces main team entirely", async () => {
    tmpDir = makeTmpDir();
    writeSkill(tmpDir, "alpha", "Alpha body.");
    writeSkill(tmpDir, "beta", "Beta body.");
    const configPath = writeMainConfig(tmpDir, `
name: test
skills:
  atomic:
    alpha: ./skills/alpha
    beta: ./skills/beta
  composed:
    bot-a:
      compose: [alpha]
      description: "Bot A."
    bot-b:
      compose: [beta]
      description: "Bot B."
state:
  result:
    type: string
team:
  flow:
    - bot-a:
        writes: [state.result]
      then: bot-b
    - bot-b:
        reads: [state.result]
      then: end
`);
    writeLocalConfig(tmpDir, `
team:
  flow:
    - bot-b:
        writes: [state.result]
      then: end
`);
    const config = await loadConfig(configPath);
    assert.ok(config.team);
    // The local team has only bot-b, so the flow should have one node
    assert.equal(config.team.flow.nodes.length, 1);
    assert.equal((config.team.flow.nodes[0] as { skill: string }).skill, "bot-b");
  });

  it("local config does not require name field", async () => {
    tmpDir = makeTmpDir();
    writeSkill(tmpDir, "alpha", "Alpha body.");
    writeSkill(tmpDir, "beta", "Beta body.");
    const configPath = writeMainConfig(tmpDir, `
name: test
skills:
  atomic:
    alpha: ./skills/alpha
  composed:
    bot:
      compose: [alpha]
      description: "A bot."
`);
    writeLocalConfig(tmpDir, `
skills:
  atomic:
    beta: ./skills/beta
`);
    const config = await loadConfig(configPath);
    assert.equal(config.name, "test");
    assert.ok(isAtomic(config.skills["beta"]));
  });

  it("local config does not require skills section", async () => {
    tmpDir = makeTmpDir();
    writeSkill(tmpDir, "alpha", "Alpha body.");
    const configPath = writeMainConfig(tmpDir, `
name: test
skills:
  atomic:
    alpha: ./skills/alpha
  composed:
    bot:
      compose: [alpha]
      description: "A bot."
state:
  plan:
    type: string
`);
    writeLocalConfig(tmpDir, `
state:
  notes:
    type: string
`);
    const config = await loadConfig(configPath);
    assert.ok(config.state);
    assert.ok("notes" in config.state.fields);
    // Original skills preserved
    assert.ok(isAtomic(config.skills["alpha"]));
    assert.ok(isComposed(config.skills["bot"]));
  });

  it("local config with only team section", async () => {
    tmpDir = makeTmpDir();
    writeSkill(tmpDir, "alpha", "Alpha body.");
    const configPath = writeMainConfig(tmpDir, `
name: test
skills:
  atomic:
    alpha: ./skills/alpha
  composed:
    bot:
      compose: [alpha]
      description: "A bot."
state:
  result:
    type: string
team:
  flow:
    - bot:
        writes: [state.result]
      then: end
`);
    writeLocalConfig(tmpDir, `
team:
  flow:
    - bot:
        reads: [state.result]
      then: end
`);
    const config = await loadConfig(configPath);
    assert.ok(config.team);
    assert.equal((config.team.flow.nodes[0] as { skill: string }).skill, "bot");
  });

  it("local config rejects imports", async () => {
    tmpDir = makeTmpDir();
    writeSkill(tmpDir, "alpha", "Alpha body.");
    const configPath = writeMainConfig(tmpDir, `
name: test
skills:
  atomic:
    alpha: ./skills/alpha
  composed:
    bot:
      compose: [alpha]
      description: "A bot."
`);
    writeLocalConfig(tmpDir, `
imports:
  - some/path.yaml
skills:
  atomic:
    beta: ./skills/beta
`);
    await assert.rejects(
      () => loadConfig(configPath),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError);
        assert.match(err.message, /Local config cannot have imports/);
        return true;
      }
    );
  });

  it("local config uses custom config name", async () => {
    tmpDir = makeTmpDir();
    writeSkill(tmpDir, "alpha", "Alpha body.");
    writeSkill(tmpDir, "beta", "Beta body.");
    const configPath = join(tmpDir, "my-pipeline.yaml");
    writeFileSync(configPath, `
name: test
skills:
  atomic:
    alpha: ./skills/alpha
  composed:
    bot:
      compose: [alpha]
      description: "A bot."
`, "utf-8");
    writeFileSync(join(tmpDir, "my-pipeline.local.yaml"), `
skills:
  atomic:
    beta: ./skills/beta
`, "utf-8");
    const config = await loadConfig(configPath);
    assert.ok(isAtomic(config.skills["beta"]));
  });

  it("empty local config is a no-op", async () => {
    tmpDir = makeTmpDir();
    writeSkill(tmpDir, "alpha", "Alpha body.");
    const configPath = writeMainConfig(tmpDir, `
name: test
skills:
  atomic:
    alpha: ./skills/alpha
  composed:
    bot:
      compose: [alpha]
      description: "A bot."
`);
    // An empty YAML document parses as null, which should be caught
    writeLocalConfig(tmpDir, `# empty local config\n{}`);
    const config = await loadConfig(configPath);
    assert.equal(config.name, "test");
    assert.ok(isComposed(config.skills["bot"]));
  });
});
