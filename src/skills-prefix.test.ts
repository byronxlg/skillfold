import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { loadConfig } from "./config.js";
import { ResolveError } from "./errors.js";
import { resolveSkills } from "./resolver.js";
import { isSkillsRef, parseSkillsRef, resolveSkillsPath } from "./skills-prefix.js";

import type { Config } from "./config.js";

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `skillfold-skills-prefix-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("isSkillsRef", () => {
  it("returns true for skills: prefixed string", () => {
    assert.equal(isSkillsRef("skills:some-skill"), true);
  });

  it("returns true for skills: prefixed string with slashes", () => {
    assert.equal(isSkillsRef("skills:@org/some-skill"), true);
  });

  it("returns false for local path", () => {
    assert.equal(isSkillsRef("./skills/review"), false);
  });

  it("returns false for https URL", () => {
    assert.equal(isSkillsRef("https://github.com/org/repo"), false);
  });

  it("returns false for npm: prefix", () => {
    assert.equal(isSkillsRef("npm:some-package"), false);
  });

  it("returns false for plain string containing skills", () => {
    assert.equal(isSkillsRef("my-skills-dir"), false);
  });
});

describe("parseSkillsRef", () => {
  it("strips the skills: prefix", () => {
    assert.equal(parseSkillsRef("skills:planning"), "planning");
  });

  it("strips prefix and preserves nested path", () => {
    assert.equal(parseSkillsRef("skills:@org/code-review"), "@org/code-review");
  });

  it("strips prefix for deeply nested path", () => {
    assert.equal(parseSkillsRef("skills:team/shared/review"), "team/shared/review");
  });
});

describe("resolveSkillsPath", () => {
  it("resolves to .skills/ directory under baseDir", () => {
    const result = resolveSkillsPath("skills:planning", "/home/user/project");
    assert.equal(result, join("/home/user/project", ".skills", "planning"));
  });

  it("resolves nested skill name to .skills/ directory", () => {
    const result = resolveSkillsPath("skills:@org/code-review", "/home/user/project");
    assert.equal(result, join("/home/user/project", ".skills", "@org/code-review"));
  });

  it("resolves deeply nested skill path", () => {
    const result = resolveSkillsPath("skills:team/shared/review", "/tmp/proj");
    assert.equal(result, join("/tmp/proj", ".skills", "team/shared/review"));
  });
});

describe("skills: skill resolution", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("resolves atomic skill with skills: path", async () => {
    tmpDir = makeTmpDir();

    // Create .skills directory with a skill
    const skillDir = join(tmpDir, ".skills", "planning");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "# Planning\n\nPlan carefully.", "utf-8");

    const config: Config = {
      name: "test",
      skills: {
        planning: { path: "skills:planning" },
      },
    };

    const bodies = await resolveSkills(config, tmpDir);
    assert.equal(bodies.size, 1);
    assert.equal(bodies.get("planning"), "# Planning\n\nPlan carefully.");
  });

  it("throws ResolveError with install hint for missing skills: directory", async () => {
    tmpDir = makeTmpDir();

    const config: Config = {
      name: "test",
      skills: {
        ghost: { path: "skills:ghost-skill" },
      },
    };

    await assert.rejects(
      () => resolveSkills(config, tmpDir!),
      (err: unknown) => {
        assert.ok(err instanceof ResolveError);
        assert.match(err.message, /Directory not found/);
        assert.match(err.message, /ghost/);
        assert.match(err.message, /npx skills add ghost-skill/);
        return true;
      }
    );
  });

  it("throws ResolveError for skills: directory without SKILL.md", async () => {
    tmpDir = makeTmpDir();

    // Create the .skills directory but without SKILL.md
    const skillDir = join(tmpDir, ".skills", "empty-skill");
    mkdirSync(skillDir, { recursive: true });

    const config: Config = {
      name: "test",
      skills: {
        empty: { path: "skills:empty-skill" },
      },
    };

    await assert.rejects(
      () => resolveSkills(config, tmpDir!),
      (err: unknown) => {
        assert.ok(err instanceof ResolveError);
        assert.match(err.message, /SKILL\.md not found/);
        assert.match(err.message, /empty/);
        return true;
      }
    );
  });

  it("strips frontmatter from skills: skill body", async () => {
    tmpDir = makeTmpDir();

    const skillDir = join(tmpDir, ".skills", "review");
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
        review: { path: "skills:review" },
      },
    };

    const bodies = await resolveSkills(config, tmpDir);
    const body = bodies.get("review")!;
    assert.ok(!body.includes("---"), "Body should not contain frontmatter delimiters");
    assert.ok(body.includes("# Code Review"), "Body should contain the markdown content");
  });
});

describe("skills: paths are not rebased during import", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("skills: paths are preserved as-is during import", async () => {
    tmpDir = makeTmpDir();

    // Create a local import config that uses skills: prefix
    const importDir = join(tmpDir, "imported");
    mkdirSync(importDir, { recursive: true });
    writeFileSync(
      join(importDir, "skillfold.yaml"),
      `name: imported
skills:
  atomic:
    review: skills:code-review
`,
      "utf-8"
    );

    // Create the main config that imports
    const configPath = join(tmpDir, "skillfold.yaml");
    writeFileSync(
      configPath,
      `name: main
imports:
  - ./imported/skillfold.yaml

skills:
  atomic:
    local: ./local
`,
      "utf-8"
    );

    const config = await loadConfig(configPath);
    const reviewSkill = config.skills["review"];
    assert.ok("path" in reviewSkill);
    // skills: paths should be preserved as-is, not rebased
    assert.equal(reviewSkill.path, "skills:code-review");
  });
});
