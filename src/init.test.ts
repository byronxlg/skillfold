import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { compile } from "./compiler.js";
import { readConfig } from "./config.js";
import { initProject } from "./init.js";
import { resolveSkills } from "./resolver.js";

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `skillfold-init-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("initProject", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("creates all expected files", () => {
    tmpDir = makeTmpDir();
    initProject(tmpDir);

    assert.ok(existsSync(join(tmpDir, "skillfold.yaml")));
    assert.ok(existsSync(join(tmpDir, "skills", "planning", "SKILL.md")));
    assert.ok(existsSync(join(tmpDir, "skills", "coding", "SKILL.md")));
    assert.ok(existsSync(join(tmpDir, "skills", "reviewing", "SKILL.md")));

    const config = readFileSync(join(tmpDir, "skillfold.yaml"), "utf-8");
    assert.ok(config.includes("name: my-pipeline"));

    const planning = readFileSync(join(tmpDir, "skills", "planning", "SKILL.md"), "utf-8");
    assert.ok(planning.includes("name: planning"));
    assert.ok(planning.includes("# Planning"));

    const coding = readFileSync(join(tmpDir, "skills", "coding", "SKILL.md"), "utf-8");
    assert.ok(coding.includes("name: coding"));
    assert.ok(coding.includes("# Coding"));

    const reviewing = readFileSync(join(tmpDir, "skills", "reviewing", "SKILL.md"), "utf-8");
    assert.ok(reviewing.includes("name: reviewing"));
    assert.ok(reviewing.includes("# Reviewing"));
  });

  it("generated config compiles with orchestrator and review loop", async () => {
    tmpDir = makeTmpDir();
    initProject(tmpDir);

    const configPath = join(tmpDir, "skillfold.yaml");
    const outDir = join(tmpDir, "build");

    const config = readConfig(configPath);
    const bodies = await resolveSkills(config, tmpDir);
    const results = compile(config, bodies, outDir);

    // 4 agents: planner, engineer, reviewer, orchestrator
    assert.equal(results.length, 4);

    for (const result of results) {
      assert.ok(existsSync(result.path), `Expected ${result.path} to exist`);
    }

    // Orchestrator should contain the generated execution plan
    const orchResult = results.find((r) => r.name === "orchestrator");
    assert.ok(orchResult);
    const orchContent = readFileSync(orchResult.path, "utf-8");
    assert.ok(orchContent.includes("## Execution Plan"));
    assert.ok(orchContent.includes("review.approved == false"));
    assert.ok(orchContent.includes("review.approved == true"));
  });

  it("errors if skillfold.yaml already exists", () => {
    tmpDir = makeTmpDir();
    writeFileSync(join(tmpDir, "skillfold.yaml"), "name: existing\n", "utf-8");

    assert.throws(
      () => initProject(tmpDir!),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("skillfold.yaml already exists"));
        return true;
      }
    );
  });

  it("respects target directory", () => {
    tmpDir = makeTmpDir();
    const subDir = join(tmpDir, "my-project");

    initProject(subDir);

    assert.ok(existsSync(join(subDir, "skillfold.yaml")));
    assert.ok(existsSync(join(subDir, "skills", "planning", "SKILL.md")));
    assert.ok(existsSync(join(subDir, "skills", "coding", "SKILL.md")));
    assert.ok(existsSync(join(subDir, "skills", "reviewing", "SKILL.md")));
  });
});
