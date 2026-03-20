import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { compile } from "./compiler.js";
import { readConfig } from "./config.js";
import { initFromTemplate, initProject, TEMPLATES } from "./init.js";
import { resolveSkills } from "./resolver.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, "..", "src", "cli.ts");

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
    const results = compile(config, bodies, outDir, "0.0.0", "skillfold.yaml");

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

describe("initFromTemplate", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("scaffolds dev-team template with rewritten import path", () => {
    tmpDir = makeTmpDir();
    const files = initFromTemplate(tmpDir, "dev-team");

    assert.deepEqual(files, ["skillfold.yaml"]);
    assert.ok(existsSync(join(tmpDir, "skillfold.yaml")));

    const config = readFileSync(join(tmpDir, "skillfold.yaml"), "utf-8");
    assert.ok(config.includes("name: dev-team"));
    assert.ok(
      config.includes("node_modules/skillfold/library/skillfold.yaml"),
      "import path should be rewritten to npm path"
    );
    assert.ok(
      !config.includes("../../skillfold.yaml"),
      "relative import path should be replaced"
    );
    assert.ok(
      config.includes("yaml-language-server"),
      "should include schema comment"
    );
  });

  it("scaffolds all available templates", () => {
    for (const template of TEMPLATES) {
      tmpDir = makeTmpDir();
      const files = initFromTemplate(tmpDir, template);
      assert.deepEqual(files, ["skillfold.yaml"]);

      const config = readFileSync(join(tmpDir, "skillfold.yaml"), "utf-8");
      assert.ok(config.includes(`name: ${template}`));
      assert.ok(config.includes("node_modules/skillfold/library/skillfold.yaml"));

      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("errors on unknown template name", () => {
    tmpDir = makeTmpDir();
    assert.throws(
      () => initFromTemplate(tmpDir!, "nonexistent"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('Unknown template "nonexistent"'));
        assert.ok(err.message.includes("dev-team"));
        return true;
      }
    );
  });

  it("errors if skillfold.yaml already exists", () => {
    tmpDir = makeTmpDir();
    writeFileSync(join(tmpDir, "skillfold.yaml"), "name: existing\n", "utf-8");

    assert.throws(
      () => initFromTemplate(tmpDir!, "dev-team"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("skillfold.yaml already exists"));
        return true;
      }
    );
  });
});

describe("init CLI", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("prints compile hint after init", () => {
    tmpDir = makeTmpDir();
    const subDir = join(tmpDir, "my-project");
    const output = execSync(`npx tsx ${cliPath} init --dir ${subDir}`, {
      encoding: "utf-8",
    });
    assert.ok(output.includes("Next:"), "should print Next: hint");
    assert.ok(output.includes("npx skillfold"), "should hint to compile");
  });

  it("prints cd hint when init dir is not cwd", () => {
    tmpDir = makeTmpDir();
    const subDir = join(tmpDir, "my-project");
    const output = execSync(`npx tsx ${cliPath} init --dir ${subDir}`, {
      encoding: "utf-8",
    });
    assert.ok(output.includes("cd "), "should include cd when dir != cwd");
  });

  it("supports positional dir argument", () => {
    tmpDir = makeTmpDir();
    const subDir = join(tmpDir, "my-project");
    const output = execSync(`npx tsx ${cliPath} init ${subDir}`, {
      encoding: "utf-8",
    });
    assert.ok(output.includes("project initialized"));
    assert.ok(existsSync(join(subDir, "skillfold.yaml")));
  });

  it("shows template hint after init without template", () => {
    tmpDir = makeTmpDir();
    const subDir = join(tmpDir, "my-project");
    const output = execSync(`npx tsx ${cliPath} init ${subDir}`, {
      encoding: "utf-8",
    });
    assert.ok(output.includes("--template"), "should show template hint");
    assert.ok(output.includes("dev-team"), "should list dev-team template");
  });

  it("scaffolds from template via CLI", () => {
    tmpDir = makeTmpDir();
    const subDir = join(tmpDir, "my-project");
    const output = execSync(
      `npx tsx ${cliPath} init ${subDir} --template dev-team`,
      { encoding: "utf-8" }
    );
    assert.ok(output.includes("project initialized"));
    assert.ok(existsSync(join(subDir, "skillfold.yaml")));

    const config = readFileSync(join(subDir, "skillfold.yaml"), "utf-8");
    assert.ok(config.includes("name: dev-team"));
    assert.ok(config.includes("node_modules/skillfold/library/skillfold.yaml"));
  });

  it("errors on unknown template via CLI", () => {
    tmpDir = makeTmpDir();
    const subDir = join(tmpDir, "my-project");
    assert.throws(
      () =>
        execSync(`npx tsx ${cliPath} init ${subDir} --template bogus`, {
          encoding: "utf-8",
        }),
      (err: unknown) => {
        const e = err as { stderr: string };
        assert.ok(e.stderr.includes("Unknown template"));
        return true;
      }
    );
  });

  it("help text includes template option", () => {
    const output = execSync(`npx tsx ${cliPath} --help`, {
      encoding: "utf-8",
    });
    assert.ok(output.includes("--template"), "help should show --template");
    assert.ok(output.includes("Templates:"), "help should list templates");
  });
});
