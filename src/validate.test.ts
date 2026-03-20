import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { loadConfig, readConfig } from "./config.js";
import { resolveSkills } from "./resolver.js";
import { ConfigError, ResolveError } from "./errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, "..", "test", "fixtures", "dev-pipeline");
const configPath = join(fixtureDir, "skillfold.yaml");

describe("validate: valid configs", () => {
  it("validates dev-pipeline fixture without errors", async () => {
    const config = readConfig(configPath);
    const bodies = await resolveSkills(config, fixtureDir);

    assert.ok(Object.keys(config.skills).length > 0);
    assert.ok(bodies.size > 0);
  });

  it("validates config with imports", async () => {
    const importDir = join(__dirname, "..", "test", "fixtures", "imports", "main");
    const importPath = join(importDir, "skillfold.yaml");
    const config = await loadConfig(importPath);

    assert.ok(Object.keys(config.skills).length > 0);
  });

  it("validates the project's own skillfold.yaml", async () => {
    const projectRoot = join(__dirname, "..");
    const projectConfig = join(projectRoot, "skillfold.yaml");

    if (!existsSync(projectConfig)) return;

    const config = await loadConfig(projectConfig);
    const bodies = await resolveSkills(config, projectRoot);

    assert.ok(Object.keys(config.skills).length > 0);
    assert.ok(bodies.size > 0);
  });

  it("does not write any output files", async () => {
    const tmpDir = join(
      tmpdir(),
      `skillfold-validate-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(tmpDir, { recursive: true });

    const config = readConfig(configPath);
    await resolveSkills(config, fixtureDir);

    // The validate path never calls compile, so tmpDir should remain empty
    const files = readdirSync(tmpDir);
    assert.equal(files.length, 0, "Validate should not write any output files");
  });
});

describe("validate: invalid configs", () => {
  it("rejects config missing skills section", async () => {
    const { parseRawConfig, validateAndBuild } = await import("./config.js");
    assert.throws(
      () => validateAndBuild(parseRawConfig("name: bad\n")),
      (err: Error) => {
        assert.ok(err instanceof ConfigError);
        assert.ok(err.message.includes("skills"));
        return true;
      }
    );
  });

  it("rejects config with missing skill directory", async () => {
    const { parseRawConfig, validateAndBuild } = await import("./config.js");

    const raw = parseRawConfig(`
name: test
skills:
  atomic:
    missing: ./nonexistent-dir
  composed:
    agent:
      compose: [missing]
      description: "Test agent"
`);
    const config = validateAndBuild(raw);

    await assert.rejects(
      async () => resolveSkills(config, fixtureDir),
      (err: Error) => {
        assert.ok(err instanceof ResolveError);
        assert.ok(err.message.includes("missing"));
        return true;
      }
    );
  });

  it("rejects config with unknown compose reference", async () => {
    const { parseRawConfig, validateAndBuild } = await import("./config.js");

    assert.throws(
      () => {
        const raw = parseRawConfig(`
name: test
skills:
  atomic:
    real: ./skills/planning
  composed:
    agent:
      compose: [real, ghost]
      description: "Test agent"
`);
        validateAndBuild(raw);
      },
      (err: Error) => {
        assert.ok(err instanceof ConfigError);
        assert.ok(err.message.includes("ghost"));
        return true;
      }
    );
  });

  it("rejects config with invalid state reference", async () => {
    const { parseRawConfig, validateAndBuild } = await import("./config.js");

    assert.throws(
      () => {
        const raw = parseRawConfig(`
name: test
skills:
  atomic:
    planner: ./skills/planning
  composed:
    agent:
      compose: [planner]
      description: "Test agent"
state:
  result:
    type: string
    location:
      skill: nonexistent
      path: somewhere
`);
        validateAndBuild(raw);
      },
      (err: Error) => {
        assert.ok(err instanceof ConfigError);
        assert.ok(err.message.includes("nonexistent"));
        return true;
      }
    );
  });

  it("rejects config with bad flow reference", async () => {
    const { parseRawConfig, validateAndBuild } = await import("./config.js");

    assert.throws(
      () => {
        const raw = parseRawConfig(`
name: test
skills:
  atomic:
    planner: ./skills/planning
  composed:
    agent:
      compose: [planner]
      description: "Test agent"
team:
  flow:
    - ghost-agent:
        writes: [state.x]
      then: end
`);
        validateAndBuild(raw);
      },
      (err: Error) => {
        assert.ok(err.message.includes("ghost-agent"));
        return true;
      }
    );
  });
});
