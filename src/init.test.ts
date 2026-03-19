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
    assert.ok(existsSync(join(tmpDir, "skills", "plan", "SKILL.md")));
    assert.ok(existsSync(join(tmpDir, "skills", "execute", "SKILL.md")));

    const config = readFileSync(join(tmpDir, "skillfold.yaml"), "utf-8");
    assert.ok(config.includes("name: my-pipeline"));

    const plan = readFileSync(join(tmpDir, "skills", "plan", "SKILL.md"), "utf-8");
    assert.ok(plan.includes("name: plan"));
    assert.ok(plan.includes("# Plan"));

    const execute = readFileSync(join(tmpDir, "skills", "execute", "SKILL.md"), "utf-8");
    assert.ok(execute.includes("name: execute"));
    assert.ok(execute.includes("# Execute"));
  });

  it("generated config compiles", () => {
    tmpDir = makeTmpDir();
    initProject(tmpDir);

    const configPath = join(tmpDir, "skillfold.yaml");
    const outDir = join(tmpDir, "build");

    const config = readConfig(configPath);
    const bodies = resolveSkills(config, tmpDir);
    const results = compile(config, bodies, outDir);

    assert.ok(results.length > 0);

    // Verify compiled skills exist on disk
    for (const result of results) {
      assert.ok(existsSync(result.path), `Expected ${result.path} to exist`);
    }
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
    assert.ok(existsSync(join(subDir, "skills", "plan", "SKILL.md")));
    assert.ok(existsSync(join(subDir, "skills", "execute", "SKILL.md")));
  });
});
