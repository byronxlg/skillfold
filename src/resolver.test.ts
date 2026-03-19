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

  it("resolves atomic skills, returns trimmed body content", async () => {
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

    const bodies = await resolveSkills(config, tmpDir);
    assert.equal(bodies.size, 1);
    assert.equal(bodies.get("review"), "Review the code carefully.");
  });

  it("skips composed skills", async () => {
    tmpDir = makeTmpDir();

    const skillDir = join(tmpDir, "skills", "lint");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "Run the linter.", "utf-8");

    const config: Config = {
      name: "test",
      skills: {
        lint: { path: "./skills/lint" },
        quality: { compose: ["lint"], description: "Quality checks." },
      },
    };

    const bodies = await resolveSkills(config, tmpDir);
    assert.equal(bodies.size, 1);
    assert.ok(bodies.has("lint"));
    assert.ok(!bodies.has("quality"));
  });

  it("throws ResolveError for missing directory", async () => {
    tmpDir = makeTmpDir();

    const config: Config = {
      name: "test",
      skills: {
        ghost: { path: "./skills/ghost" },
      },
    };

    await assert.rejects(() => resolveSkills(config, tmpDir!), (err: unknown) => {
      assert.ok(err instanceof ResolveError);
      assert.match(err.message, /Directory not found/);
      assert.match(err.message, /ghost/);
      return true;
    });
  });

  it("throws ResolveError for missing SKILL.md", async () => {
    tmpDir = makeTmpDir();

    const skillDir = join(tmpDir, "skills", "empty");
    mkdirSync(skillDir, { recursive: true });

    const config: Config = {
      name: "test",
      skills: {
        empty: { path: "./skills/empty" },
      },
    };

    await assert.rejects(() => resolveSkills(config, tmpDir!), (err: unknown) => {
      assert.ok(err instanceof ResolveError);
      assert.match(err.message, /SKILL\.md not found/);
      assert.match(err.message, /empty/);
      return true;
    });
  });

  it("strips YAML frontmatter from skill body", async () => {
    tmpDir = makeTmpDir();

    const skillDir = join(tmpDir, "skills", "review");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      `---
name: review
description: Reviews code.
---

# Code Review

Review the code carefully.
`,
      "utf-8"
    );

    const config: Config = {
      name: "test",
      skills: {
        review: { path: "./skills/review" },
      },
    };

    const bodies = await resolveSkills(config, tmpDir);
    assert.equal(bodies.size, 1);
    const body = bodies.get("review")!;
    assert.ok(!body.includes("---"), "Body should not contain frontmatter delimiters");
    assert.ok(!body.includes("name: review"), "Body should not contain frontmatter fields");
    assert.ok(body.includes("# Code Review"), "Body should contain the markdown content");
    assert.ok(body.includes("Review the code carefully."), "Body should contain the body text");
  });

  it("preserves body when no frontmatter present", async () => {
    tmpDir = makeTmpDir();

    const skillDir = join(tmpDir, "skills", "lint");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "# Lint\n\nRun the linter.", "utf-8");

    const config: Config = {
      name: "test",
      skills: {
        lint: { path: "./skills/lint" },
      },
    };

    const bodies = await resolveSkills(config, tmpDir);
    assert.equal(bodies.get("lint"), "# Lint\n\nRun the linter.");
  });

  it("resolves a remote skill from a real GitHub URL, stripping frontmatter", async () => {
    const config: Config = {
      name: "test",
      skills: {
        "code-review": {
          path: "https://github.com/byronxlg/skillfold/tree/main/skills/code-review",
        },
      },
    };

    const bodies = await resolveSkills(config, "/unused");
    assert.equal(bodies.size, 1);
    const body = bodies.get("code-review")!;
    assert.ok(
      body.includes("Code Review"),
      "Remote skill body should contain Code Review"
    );
  });
});
