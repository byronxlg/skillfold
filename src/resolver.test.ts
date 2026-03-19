import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { Config } from "./config.js";
import { ResolveError } from "./errors.js";
import { resolveSkills } from "./resolver.js";

function makeTmpDir(): string {
  const dir = join(tmpdir(), `skillfold-resolver-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("resolveSkills", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("resolves atomic skills, returns trimmed body content", () => {
    tmpDir = makeTmpDir();

    const skillDir = join(tmpDir, "skills", "review");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "  Review the code carefully.\n\n", "utf-8");

    const config: Config = {
      name: "test",
      skills: {
        review: { path: "./skills/review" },
      },
    };

    const bodies = resolveSkills(config, tmpDir);
    assert.equal(bodies.size, 1);
    assert.equal(bodies.get("review"), "Review the code carefully.");
  });

  it("skips composed skills", () => {
    tmpDir = makeTmpDir();

    const skillDir = join(tmpDir, "skills", "lint");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "Run the linter.", "utf-8");

    const config: Config = {
      name: "test",
      skills: {
        lint: { path: "./skills/lint" },
        quality: { compose: ["lint"] },
      },
    };

    const bodies = resolveSkills(config, tmpDir);
    assert.equal(bodies.size, 1);
    assert.ok(bodies.has("lint"));
    assert.ok(!bodies.has("quality"));
  });

  it("throws ResolveError for missing directory", () => {
    tmpDir = makeTmpDir();

    const config: Config = {
      name: "test",
      skills: {
        ghost: { path: "./skills/ghost" },
      },
    };

    assert.throws(() => resolveSkills(config, tmpDir!), (err: unknown) => {
      assert.ok(err instanceof ResolveError);
      assert.match(err.message, /Directory not found/);
      assert.match(err.message, /ghost/);
      return true;
    });
  });

  it("throws ResolveError for missing SKILL.md", () => {
    tmpDir = makeTmpDir();

    const skillDir = join(tmpDir, "skills", "empty");
    mkdirSync(skillDir, { recursive: true });

    const config: Config = {
      name: "test",
      skills: {
        empty: { path: "./skills/empty" },
      },
    };

    assert.throws(() => resolveSkills(config, tmpDir!), (err: unknown) => {
      assert.ok(err instanceof ResolveError);
      assert.match(err.message, /SKILL\.md not found/);
      assert.match(err.message, /empty/);
      return true;
    });
  });
});
