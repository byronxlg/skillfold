import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { loadConfig } from "./config.js";
import { ConfigError, ResolveError } from "./errors.js";
import { isNpmRef, parseNpmRef, resolveNpmImportPath, resolveNpmPackageDir, resolveNpmSkillPath } from "./npm.js";
import { resolveSkills } from "./resolver.js";

import type { Config } from "./config.js";

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `skillfold-npm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("isNpmRef", () => {
  it("returns true for npm: prefixed string", () => {
    assert.equal(isNpmRef("npm:some-package"), true);
  });

  it("returns true for scoped npm: prefixed string", () => {
    assert.equal(isNpmRef("npm:@scope/package"), true);
  });

  it("returns false for local path", () => {
    assert.equal(isNpmRef("./skills/review"), false);
  });

  it("returns false for https URL", () => {
    assert.equal(isNpmRef("https://github.com/org/repo"), false);
  });

  it("returns false for node_modules path", () => {
    assert.equal(isNpmRef("node_modules/skillfold/library/skillfold.yaml"), false);
  });
});

describe("parseNpmRef", () => {
  it("parses unscoped package with no subpath", () => {
    const result = parseNpmRef("npm:my-package");
    assert.deepEqual(result, { packageName: "my-package", subpath: "" });
  });

  it("parses unscoped package with subpath", () => {
    const result = parseNpmRef("npm:my-package/skills/planning");
    assert.deepEqual(result, { packageName: "my-package", subpath: "skills/planning" });
  });

  it("parses unscoped package with file subpath", () => {
    const result = parseNpmRef("npm:my-package/custom.yaml");
    assert.deepEqual(result, { packageName: "my-package", subpath: "custom.yaml" });
  });

  it("parses scoped package with no subpath", () => {
    const result = parseNpmRef("npm:@team/shared-skills");
    assert.deepEqual(result, { packageName: "@team/shared-skills", subpath: "" });
  });

  it("parses scoped package with subpath", () => {
    const result = parseNpmRef("npm:@team/shared-skills/skills/planning");
    assert.deepEqual(result, { packageName: "@team/shared-skills", subpath: "skills/planning" });
  });

  it("parses scoped package with file subpath", () => {
    const result = parseNpmRef("npm:@team/shared-skills/custom.yaml");
    assert.deepEqual(result, { packageName: "@team/shared-skills", subpath: "custom.yaml" });
  });

  it("parses scoped package with deep subpath", () => {
    const result = parseNpmRef("npm:@org/lib/a/b/c");
    assert.deepEqual(result, { packageName: "@org/lib", subpath: "a/b/c" });
  });

  it("handles bare scope (edge case)", () => {
    const result = parseNpmRef("npm:@scope");
    assert.deepEqual(result, { packageName: "@scope", subpath: "" });
  });
});

describe("resolveNpmPackageDir", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("falls back to direct node_modules path for missing package", () => {
    tmpDir = makeTmpDir();
    const result = resolveNpmPackageDir("nonexistent-pkg", tmpDir);
    assert.equal(result, join(tmpDir, "node_modules", "nonexistent-pkg"));
  });

  it("falls back to direct node_modules path for scoped package", () => {
    tmpDir = makeTmpDir();
    const result = resolveNpmPackageDir("@scope/pkg", tmpDir);
    assert.equal(result, join(tmpDir, "node_modules", "@scope/pkg"));
  });

  it("resolves package with package.json via require.resolve", () => {
    tmpDir = makeTmpDir();
    // Create a real package structure so require.resolve works
    const pkgDir = join(tmpDir, "node_modules", "test-pkg");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, "package.json"), '{"name":"test-pkg","version":"1.0.0"}', "utf-8");

    const result = resolveNpmPackageDir("test-pkg", tmpDir);
    // Use realpathSync to normalize symlinks (e.g., /tmp -> /private/tmp on macOS)
    assert.equal(realpathSync(result), realpathSync(pkgDir));
  });
});

describe("resolveNpmImportPath", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("resolves bare package to skillfold.yaml", () => {
    tmpDir = makeTmpDir();
    const result = resolveNpmImportPath("npm:my-package", tmpDir);
    assert.equal(result, join(tmpDir, "node_modules", "my-package", "skillfold.yaml"));
  });

  it("resolves package with explicit file subpath", () => {
    tmpDir = makeTmpDir();
    const result = resolveNpmImportPath("npm:my-package/custom.yaml", tmpDir);
    assert.equal(result, join(tmpDir, "node_modules", "my-package", "custom.yaml"));
  });

  it("resolves scoped package to skillfold.yaml", () => {
    tmpDir = makeTmpDir();
    const result = resolveNpmImportPath("npm:@team/shared", tmpDir);
    assert.equal(result, join(tmpDir, "node_modules", "@team/shared", "skillfold.yaml"));
  });

  it("resolves scoped package with subpath", () => {
    tmpDir = makeTmpDir();
    const result = resolveNpmImportPath("npm:@team/shared/library/skillfold.yaml", tmpDir);
    assert.equal(result, join(tmpDir, "node_modules", "@team/shared", "library", "skillfold.yaml"));
  });
});

describe("resolveNpmSkillPath", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("resolves bare package to package root", () => {
    tmpDir = makeTmpDir();
    const result = resolveNpmSkillPath("npm:my-package", tmpDir);
    assert.equal(result, join(tmpDir, "node_modules", "my-package"));
  });

  it("resolves package with skill subpath", () => {
    tmpDir = makeTmpDir();
    const result = resolveNpmSkillPath("npm:my-package/skills/planning", tmpDir);
    assert.equal(result, join(tmpDir, "node_modules", "my-package", "skills", "planning"));
  });

  it("resolves scoped package with skill subpath", () => {
    tmpDir = makeTmpDir();
    const result = resolveNpmSkillPath("npm:@team/shared/skills/planning", tmpDir);
    assert.equal(result, join(tmpDir, "node_modules", "@team/shared", "skills", "planning"));
  });
});

describe("npm: import integration", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("loads config with npm: import", async () => {
    tmpDir = makeTmpDir();

    // Create a mock npm package with a skillfold config
    const pkgDir = join(tmpDir, "node_modules", "@team", "shared-skills");
    const skillDir = join(pkgDir, "skills", "imported-skill");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(pkgDir, "package.json"), '{"name":"@team/shared-skills","version":"1.0.0"}', "utf-8");
    writeFileSync(
      join(pkgDir, "skillfold.yaml"),
      `name: shared
skills:
  atomic:
    imported-skill: ./skills/imported-skill
`,
      "utf-8"
    );
    writeFileSync(join(skillDir, "SKILL.md"), "# Imported\n\nImported from npm.", "utf-8");

    // Create the main config that imports from npm
    const localSkillDir = join(tmpDir, "skills", "local-skill");
    mkdirSync(localSkillDir, { recursive: true });
    writeFileSync(join(localSkillDir, "SKILL.md"), "# Local\n\nLocal skill.", "utf-8");

    const configPath = join(tmpDir, "skillfold.yaml");
    writeFileSync(
      configPath,
      `name: main
imports:
  - npm:@team/shared-skills

skills:
  atomic:
    local-skill: ./skills/local-skill
  composed:
    combined:
      compose:
        - imported-skill
        - local-skill
      description: "Combines imported and local."
`,
      "utf-8"
    );

    const config = await loadConfig(configPath);
    assert.ok("imported-skill" in config.skills, "imported skill should be present");
    assert.ok("local-skill" in config.skills, "local skill should be present");
    assert.ok("combined" in config.skills, "composed skill should be present");
  });

  it("loads config with npm: import using explicit subpath", async () => {
    tmpDir = makeTmpDir();

    // Create a mock npm package with a non-default config file
    const pkgDir = join(tmpDir, "node_modules", "my-skills");
    const skillDir = join(pkgDir, "skills", "special");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(pkgDir, "package.json"), '{"name":"my-skills","version":"1.0.0"}', "utf-8");
    writeFileSync(
      join(pkgDir, "custom.yaml"),
      `name: custom
skills:
  atomic:
    special: ./skills/special
`,
      "utf-8"
    );
    writeFileSync(join(skillDir, "SKILL.md"), "# Special\n\nSpecial skill.", "utf-8");

    const configPath = join(tmpDir, "skillfold.yaml");
    writeFileSync(
      configPath,
      `name: main
imports:
  - npm:my-skills/custom.yaml

skills:
  atomic:
    dummy: ./dummy
`,
      "utf-8"
    );

    const config = await loadConfig(configPath);
    assert.ok("special" in config.skills, "skill from npm subpath import should be present");
  });

  it("throws ConfigError for missing npm package import", async () => {
    tmpDir = makeTmpDir();

    const configPath = join(tmpDir, "skillfold.yaml");
    writeFileSync(
      configPath,
      `name: broken
imports:
  - npm:@nonexistent/package

skills:
  atomic:
    dummy: ./dummy
`,
      "utf-8"
    );

    await assert.rejects(
      () => loadConfig(configPath),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError);
        assert.match(err.message, /Cannot read npm imported config/);
        assert.match(err.message, /npm:@nonexistent\/package/);
        assert.match(err.message, /npm install @nonexistent\/package/);
        return true;
      }
    );
  });

  it("local override wins over npm import", async () => {
    tmpDir = makeTmpDir();

    // Create npm package with a skill
    const pkgDir = join(tmpDir, "node_modules", "shared-pkg");
    const pkgSkillDir = join(pkgDir, "skills", "my-skill");
    mkdirSync(pkgSkillDir, { recursive: true });
    writeFileSync(join(pkgDir, "package.json"), '{"name":"shared-pkg","version":"1.0.0"}', "utf-8");
    writeFileSync(
      join(pkgDir, "skillfold.yaml"),
      `name: shared
skills:
  atomic:
    my-skill: ./skills/my-skill
`,
      "utf-8"
    );
    writeFileSync(join(pkgSkillDir, "SKILL.md"), "# From NPM", "utf-8");

    // Create local override
    const localDir = join(tmpDir, "skills", "my-skill");
    mkdirSync(localDir, { recursive: true });
    writeFileSync(join(localDir, "SKILL.md"), "# Local Override", "utf-8");

    const configPath = join(tmpDir, "skillfold.yaml");
    writeFileSync(
      configPath,
      `name: main
imports:
  - npm:shared-pkg

skills:
  atomic:
    my-skill: ./skills/my-skill
`,
      "utf-8"
    );

    const config = await loadConfig(configPath);
    // Local skill should resolve to local path, not the npm-imported one
    const skill = config.skills["my-skill"];
    assert.ok("path" in skill);
    assert.equal(skill.path, "./skills/my-skill");
  });

  it("merges state from npm import", async () => {
    tmpDir = makeTmpDir();

    const pkgDir = join(tmpDir, "node_modules", "shared-pkg");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, "package.json"), '{"name":"shared-pkg","version":"1.0.0"}', "utf-8");
    writeFileSync(
      join(pkgDir, "skillfold.yaml"),
      `name: shared
skills:
  atomic:
    dummy: ./dummy
state:
  SharedType:
    score: number
  shared-field:
    type: string
`,
      "utf-8"
    );

    const configPath = join(tmpDir, "skillfold.yaml");
    writeFileSync(
      configPath,
      `name: main
imports:
  - npm:shared-pkg

skills:
  atomic:
    local: ./local
state:
  local-field:
    type: string
`,
      "utf-8"
    );

    const config = await loadConfig(configPath);
    assert.ok(config.state, "merged config should have state");
    assert.ok("SharedType" in config.state.types, "imported custom type should be present");
    assert.ok("shared-field" in config.state.fields, "imported state field should be present");
    assert.ok("local-field" in config.state.fields, "local state field should be present");
  });
});

describe("npm: skill resolution", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("resolves atomic skill with npm: path", async () => {
    tmpDir = makeTmpDir();

    // Create npm package with a skill directory
    const pkgDir = join(tmpDir, "node_modules", "@team", "shared-skills");
    const skillDir = join(pkgDir, "skills", "planning");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(pkgDir, "package.json"), '{"name":"@team/shared-skills","version":"1.0.0"}', "utf-8");
    writeFileSync(join(skillDir, "SKILL.md"), "# Planning\n\nPlan carefully.", "utf-8");

    const config: Config = {
      name: "test",
      skills: {
        planning: { path: "npm:@team/shared-skills/skills/planning" },
      },
    };

    const bodies = await resolveSkills(config, tmpDir);
    assert.equal(bodies.size, 1);
    assert.equal(bodies.get("planning"), "# Planning\n\nPlan carefully.");
  });

  it("throws ResolveError for missing npm skill directory", async () => {
    tmpDir = makeTmpDir();

    const config: Config = {
      name: "test",
      skills: {
        ghost: { path: "npm:@nonexistent/package/skills/ghost" },
      },
    };

    await assert.rejects(
      () => resolveSkills(config, tmpDir!),
      (err: unknown) => {
        assert.ok(err instanceof ResolveError);
        assert.match(err.message, /Directory not found/);
        assert.match(err.message, /ghost/);
        return true;
      }
    );
  });

  it("throws ResolveError for npm skill directory without SKILL.md", async () => {
    tmpDir = makeTmpDir();

    // Create the directory but without SKILL.md
    const skillDir = join(tmpDir, "node_modules", "my-pkg", "skills", "empty");
    mkdirSync(skillDir, { recursive: true });

    const config: Config = {
      name: "test",
      skills: {
        empty: { path: "npm:my-pkg/skills/empty" },
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

  it("strips frontmatter from npm skill body", async () => {
    tmpDir = makeTmpDir();

    const pkgDir = join(tmpDir, "node_modules", "skills-pkg");
    const skillDir = join(pkgDir, "skills", "review");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(pkgDir, "package.json"), '{"name":"skills-pkg","version":"1.0.0"}', "utf-8");
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
        review: { path: "npm:skills-pkg/skills/review" },
      },
    };

    const bodies = await resolveSkills(config, tmpDir);
    const body = bodies.get("review")!;
    assert.ok(!body.includes("---"), "Body should not contain frontmatter delimiters");
    assert.ok(body.includes("# Code Review"), "Body should contain the markdown content");
  });

  it("npm: paths are not rebased during import", async () => {
    tmpDir = makeTmpDir();

    // Create npm package with a skill that has an npm: path in its imported config
    const pkgDir = join(tmpDir, "node_modules", "base-pkg");
    const pkgSkillDir = join(pkgDir, "skills", "core");
    mkdirSync(pkgSkillDir, { recursive: true });
    writeFileSync(join(pkgDir, "package.json"), '{"name":"base-pkg","version":"1.0.0"}', "utf-8");
    writeFileSync(
      join(pkgDir, "skillfold.yaml"),
      `name: base
skills:
  atomic:
    core: npm:base-pkg/skills/core
`,
      "utf-8"
    );
    writeFileSync(join(pkgSkillDir, "SKILL.md"), "# Core\n\nCore skill.", "utf-8");

    const configPath = join(tmpDir, "skillfold.yaml");
    writeFileSync(
      configPath,
      `name: main
imports:
  - npm:base-pkg

skills:
  atomic:
    local: ./local
`,
      "utf-8"
    );

    const config = await loadConfig(configPath);
    const coreSkill = config.skills["core"];
    assert.ok("path" in coreSkill);
    // npm: paths should be preserved as-is, not rebased
    assert.equal(coreSkill.path, "npm:base-pkg/skills/core");
  });
});
