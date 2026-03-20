import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { adoptProject } from "./adopt.js";
import { compile } from "./compiler.js";
import { readConfig } from "./config.js";
import { resolveSkills } from "./resolver.js";

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `skillfold-adopt-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeAgent(dir: string, name: string, content: string): void {
  const agentsDir = join(dir, ".claude", "agents");
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(join(agentsDir, `${name}.md`), content, "utf-8");
}

describe("adoptProject", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("adopts agents with YAML frontmatter", () => {
    tmpDir = makeTmpDir();
    writeAgent(
      tmpDir,
      "planner",
      "---\nname: planner\ndescription: Plans the work.\n---\n\n# Planner\n\nYou plan the work.\n"
    );

    const result = adoptProject(tmpDir);

    assert.equal(result.agents.length, 1);
    assert.equal(result.agents[0].name, "planner");
    assert.equal(result.agents[0].description, "Plans the work.");

    const skill = readFileSync(result.agents[0].skillPath, "utf-8");
    assert.ok(skill.includes("name: planner-skill"));
    assert.ok(skill.includes("description: Plans the work."));
    assert.ok(skill.includes("# Planner"));
  });

  it("adopts agents without frontmatter (derives name from filename)", () => {
    tmpDir = makeTmpDir();
    writeAgent(tmpDir, "engineer", "# Engineer\n\nYou write code and tests.\n");

    const result = adoptProject(tmpDir);

    assert.equal(result.agents.length, 1);
    assert.equal(result.agents[0].name, "engineer");

    const skill = readFileSync(result.agents[0].skillPath, "utf-8");
    assert.ok(skill.includes("name: engineer-skill"));
    assert.ok(skill.includes("# Engineer"));
  });

  it("adopts multiple agents and generates valid config", () => {
    tmpDir = makeTmpDir();
    writeAgent(
      tmpDir,
      "planner",
      "---\nname: planner\ndescription: Plans work.\n---\n\n# Planner\n\nYou plan.\n"
    );
    writeAgent(
      tmpDir,
      "engineer",
      "---\nname: engineer\ndescription: Writes code.\n---\n\n# Engineer\n\nYou code.\n"
    );

    const result = adoptProject(tmpDir);

    assert.equal(result.agents.length, 2);
    assert.ok(existsSync(result.configPath));

    const config = readFileSync(result.configPath, "utf-8");
    assert.ok(config.includes("name: my-pipeline"));
    assert.ok(config.includes("planner-skill: ./skills/planner"));
    assert.ok(config.includes("engineer-skill: ./skills/engineer"));
  });

  it("generated config compiles without errors", async () => {
    tmpDir = makeTmpDir();
    writeAgent(
      tmpDir,
      "planner",
      "---\nname: planner\ndescription: Plans work.\n---\n\n# Planner\n\nYou plan.\n"
    );
    writeAgent(
      tmpDir,
      "coder",
      "---\nname: coder\ndescription: Writes code.\n---\n\n# Coder\n\nYou code.\n"
    );

    adoptProject(tmpDir);

    const configPath = join(tmpDir, "skillfold.yaml");
    const config = readConfig(configPath);
    const bodies = await resolveSkills(config, tmpDir);
    const outDir = join(tmpDir, "build");
    const results = compile(config, bodies, outDir, "0.0.0", "skillfold.yaml");

    assert.equal(results.length, 2);
    for (const r of results) {
      assert.ok(existsSync(r.path));
    }
  });

  it("round-trips: adopt then claude-code compile produces equivalent agents", async () => {
    tmpDir = makeTmpDir();
    const originalBody = "# Reviewer\n\nYou review code for correctness.\n\n- Check edge cases\n- Verify tests\n";
    writeAgent(
      tmpDir,
      "reviewer",
      `---\nname: reviewer\ndescription: Reviews code.\n---\n\n${originalBody}`
    );

    adoptProject(tmpDir);

    const configPath = join(tmpDir, "skillfold.yaml");
    const config = readConfig(configPath);
    const bodies = await resolveSkills(config, tmpDir);
    const outDir = join(tmpDir, "out");
    const results = compile(config, bodies, outDir, "0.0.0", "skillfold.yaml", "claude-code");

    // Should produce agent file and skill file
    const agentResult = results.find((r) => r.path.includes("agents"));
    assert.ok(agentResult, "should produce an agent file");

    const agentContent = readFileSync(agentResult.path, "utf-8");
    assert.ok(agentContent.includes("reviewer"));
    assert.ok(agentContent.includes("Reviews code."));

    // The skill body should contain the original content
    const skillResult = results.find((r) => r.path.includes("skills"));
    assert.ok(skillResult, "should produce a skill file");
    const skillContent = readFileSync(skillResult.path, "utf-8");
    assert.ok(skillContent.includes("# Reviewer"));
    assert.ok(skillContent.includes("Check edge cases"));
  });

  it("errors when .claude/agents/ does not exist", () => {
    tmpDir = makeTmpDir();

    assert.throws(
      () => adoptProject(tmpDir!),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("No .claude/agents/ directory found"));
        return true;
      }
    );
  });

  it("errors when skillfold.yaml already exists", () => {
    tmpDir = makeTmpDir();
    writeAgent(tmpDir, "planner", "# Planner\n");
    writeFileSync(join(tmpDir, "skillfold.yaml"), "name: existing\n", "utf-8");

    assert.throws(
      () => adoptProject(tmpDir!),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("skillfold.yaml already exists"));
        return true;
      }
    );
  });

  it("errors when agents dir has no .md files", () => {
    tmpDir = makeTmpDir();
    const agentsDir = join(tmpDir, ".claude", "agents");
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(join(agentsDir, "notes.txt"), "not an agent\n", "utf-8");

    assert.throws(
      () => adoptProject(tmpDir!),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("No .md files found"));
        return true;
      }
    );
  });
});
