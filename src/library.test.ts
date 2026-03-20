import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { loadConfig, readConfig } from "./config.js";
import { compile } from "./compiler.js";
import { initProject } from "./init.js";
import { resolveSkills } from "./resolver.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const libraryDir = join(__dirname, "..", "library");
const libraryConfigPath = join(libraryDir, "skillfold.yaml");

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `skillfold-library-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("library: skillfold.yaml", () => {
  it("parses without error", () => {
    const config = readConfig(libraryConfigPath);
    assert.equal(config.name, "skillfold-library");
  });

  it("declares all 11 atomic skills", () => {
    const config = readConfig(libraryConfigPath);
    const expected = [
      "planning",
      "research",
      "decision-making",
      "code-writing",
      "code-review",
      "testing",
      "writing",
      "summarization",
      "github-workflow",
      "file-management",
      "skillfold-cli",
    ];
    for (const name of expected) {
      assert.ok(name in config.skills, `Expected skill "${name}" to be declared`);
    }
    assert.equal(Object.keys(config.skills).length, 11);
  });

  it("has no state or team sections", () => {
    const config = readConfig(libraryConfigPath);
    assert.equal(config.state, undefined);
    assert.equal(config.team, undefined);
  });
});

describe("library: skill directories", () => {
  const skillsDir = join(libraryDir, "skills");
  const skillDirs = readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const skillName of skillDirs) {
    it(`${skillName}/SKILL.md exists and has valid frontmatter`, () => {
      const skillFile = join(skillsDir, skillName, "SKILL.md");
      assert.ok(existsSync(skillFile), `Expected ${skillFile} to exist`);

      const content = readFileSync(skillFile, "utf-8");

      // Check frontmatter structure
      assert.ok(
        content.startsWith("---\n"),
        `${skillName}/SKILL.md should start with frontmatter`
      );
      const endIndex = content.indexOf("\n---", 3);
      assert.ok(endIndex > 0, `${skillName}/SKILL.md should have closing frontmatter`);

      const frontmatter = content.slice(4, endIndex);
      assert.ok(
        frontmatter.includes("name:"),
        `${skillName}/SKILL.md frontmatter should contain name`
      );
      assert.ok(
        frontmatter.includes("description:"),
        `${skillName}/SKILL.md frontmatter should contain description`
      );

      // Check body has substantive content (at least 15 lines after frontmatter)
      const body = content.slice(endIndex + 4).trim();
      const bodyLines = body.split("\n").filter((l) => l.trim().length > 0);
      assert.ok(
        bodyLines.length >= 15,
        `${skillName}/SKILL.md body should have at least 15 non-empty lines (found ${bodyLines.length})`
      );
    });
  }
});

describe("library: example configs", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  const examples = ["dev-team", "content-pipeline", "code-review-bot"];

  for (const example of examples) {
    const exampleDir = join(libraryDir, "examples", example);
    const configPath = join(exampleDir, "skillfold.yaml");

    it(`${example}: config exists`, () => {
      assert.ok(existsSync(configPath), `Expected ${configPath} to exist`);
    });

    it(`${example}: parses, resolves, and compiles without error`, async () => {
      tmpDir = makeTmpDir();
      const outDir = join(tmpDir, "dist");

      const config = await loadConfig(configPath);
      const bodies = await resolveSkills(config, exampleDir);
      const results = compile(config, bodies, outDir);

      assert.ok(results.length > 0, `Expected at least one compiled skill`);

      for (const result of results) {
        assert.ok(
          existsSync(result.path),
          `Expected compiled output at ${result.path}`
        );
      }
    });
  }

  it("dev-team: produces planner, engineer, reviewer agents", async () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");
    const configPath = join(libraryDir, "examples", "dev-team", "skillfold.yaml");

    const config = await loadConfig(configPath);
    const bodies = await resolveSkills(
      config,
      join(libraryDir, "examples", "dev-team")
    );
    compile(config, bodies, outDir);

    for (const agent of ["planner", "engineer", "reviewer"]) {
      assert.ok(
        existsSync(join(outDir, agent, "SKILL.md")),
        `Expected ${agent}/SKILL.md`
      );
    }
  });

  it("content-pipeline: produces researcher, writer, editor agents", async () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");
    const configPath = join(
      libraryDir,
      "examples",
      "content-pipeline",
      "skillfold.yaml"
    );

    const config = await loadConfig(configPath);
    const bodies = await resolveSkills(
      config,
      join(libraryDir, "examples", "content-pipeline")
    );
    compile(config, bodies, outDir);

    for (const agent of ["researcher", "writer", "editor"]) {
      assert.ok(
        existsSync(join(outDir, agent, "SKILL.md")),
        `Expected ${agent}/SKILL.md`
      );
    }
  });

  it("code-review-bot: produces analyzer and reporter agents", async () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");
    const configPath = join(
      libraryDir,
      "examples",
      "code-review-bot",
      "skillfold.yaml"
    );

    const config = await loadConfig(configPath);
    const bodies = await resolveSkills(
      config,
      join(libraryDir, "examples", "code-review-bot")
    );
    compile(config, bodies, outDir);

    for (const agent of ["analyzer", "reporter"]) {
      assert.ok(
        existsSync(join(outDir, agent, "SKILL.md")),
        `Expected ${agent}/SKILL.md`
      );
    }
  });
});

describe("library: init output references library", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("generated config contains library import comment", () => {
    tmpDir = makeTmpDir();
    initProject(tmpDir);

    const config = readFileSync(join(tmpDir, "skillfold.yaml"), "utf-8");
    assert.ok(
      config.includes("skillfold/library/skillfold.yaml"),
      "Generated config should reference the library import path"
    );
  });

  it("generated config still compiles with the import commented out", async () => {
    tmpDir = makeTmpDir();
    initProject(tmpDir);

    const configPath = join(tmpDir, "skillfold.yaml");
    const config = readConfig(configPath);
    const bodies = await resolveSkills(config, tmpDir);
    const results = compile(config, bodies, join(tmpDir, "build"));

    assert.ok(results.length > 0);
  });
});
