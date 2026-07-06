import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, afterEach, beforeEach, describe, it } from "node:test";

import { main } from "./cli.js";
import { makeTmpDir, writeFile, writeSkill } from "./testutil.js";

const tmp = makeTmpDir();
after(() => tmp.cleanup());

let logs: string[] = [];
let errors: string[] = [];
const realLog = console.log;
const realError = console.error;

beforeEach(() => {
  logs = [];
  errors = [];
  console.log = (...args: unknown[]) => logs.push(args.join(" "));
  console.error = (...args: unknown[]) => errors.push(args.join(" "));
  process.exitCode = undefined;
});

afterEach(() => {
  console.log = realLog;
  console.error = realError;
  process.exitCode = undefined;
});

let counter = 0;
function newProject(): string {
  return join(tmp.path, `proj${counter++}`);
}

describe("cli", () => {
  it("prints help with no command", async () => {
    await main([]);
    assert.match(logs.join("\n"), /declarative skill manager/);
    assert.match(logs.join("\n"), /skillfold add/);
  });

  it("prints the version", async () => {
    await main(["--version"]);
    assert.match(logs[0], /^\d+\.\d+\.\d+/);
  });

  it("rejects unknown commands", async () => {
    await assert.rejects(main(["frobnicate"]), /unknown command/);
  });

  it("rejects unknown options", async () => {
    await assert.rejects(main(["install", "--fast"]), /unknown option/);
  });

  it("runs init, install, check, and list end to end", async () => {
    const dir = newProject();
    writeFile(dir, ".keep", "");
    await main(["init", "--dir", dir]);
    assert.ok(existsSync(join(dir, "skillfold.yaml")));
    assert.ok(existsSync(join(dir, "skills", "hello-skillfold", "SKILL.md")));

    await main(["install", "--dir", dir]);
    assert.ok(existsSync(join(dir, ".claude", "skills", "hello-skillfold", "SKILL.md")));
    assert.ok(existsSync(join(dir, "skillfold.lock")));

    await main(["check", "--dir", dir]);
    assert.equal(process.exitCode, undefined);
    assert.match(logs.join("\n"), /ok: 1 skill in sync/);

    await main(["list", "--dir", dir]);
    assert.match(logs.join("\n"), /hello-skillfold.*ok/);
  });

  it("fails check with a nonzero exit on drift", async () => {
    const dir = newProject();
    writeFile(dir, ".keep", "");
    await main(["init", "--dir", dir]);
    await main(["install", "--dir", dir]);
    writeFile(dir, ".claude/skills/hello-skillfold/SKILL.md", "tampered");
    await main(["check", "--dir", dir]);
    assert.equal(process.exitCode, 1);
    assert.match(errors.join("\n"), /skillfold check failed/);
  });

  it("adds and removes local skills", async () => {
    const dir = newProject();
    await main(["init", "--dir", dir]);
    writeSkill(dir, "skills/extra", "extra");
    await main(["add", "./skills/extra", "--dir", dir]);
    assert.match(readFileSync(join(dir, "skillfold.yaml"), "utf-8"), /extra: .\/skills\/extra/);
    assert.ok(existsSync(join(dir, ".claude", "skills", "extra", "SKILL.md")));

    await main(["remove", "extra", "--dir", dir]);
    assert.doesNotMatch(readFileSync(join(dir, "skillfold.yaml"), "utf-8"), /extra:/);
    assert.equal(existsSync(join(dir, ".claude", "skills", "extra")), false);
  });

  it("respects --name on add", async () => {
    const dir = newProject();
    await main(["init", "--dir", dir]);
    writeSkill(dir, "skills/extra", "extra");
    await main(["add", "./skills/extra", "--name", "renamed", "--dir", dir]);
    assert.match(readFileSync(join(dir, "skillfold.yaml"), "utf-8"), /renamed: .\/skills\/extra/);
    assert.ok(existsSync(join(dir, ".claude", "skills", "renamed", "SKILL.md")));
  });

  it("shows info for a skill", async () => {
    const dir = newProject();
    await main(["init", "--dir", dir]);
    await main(["install", "--dir", dir]);
    await main(["info", "hello-skillfold", "--dir", dir]);
    const out = logs.join("\n");
    assert.match(out, /name: {6}hello-skillfold/);
    assert.match(out, /status: {4}ok/);
  });

  it("supports a custom skillsDir", async () => {
    const dir = newProject();
    writeSkill(dir, "skills/custom", "custom");
    writeFile(dir, "skillfold.yaml", "skillsDir: my/skills\nskills:\n  custom: ./skills/custom\n");
    await main(["install", "--dir", dir]);
    assert.ok(existsSync(join(dir, "my", "skills", "custom", "SKILL.md")));
  });

  it("supports compose end to end", async () => {
    const dir = newProject();
    writeSkill(dir, "skills/a", "a", "# A body");
    writeSkill(dir, "skills/b", "b", "# B body");
    writeFile(
      dir,
      "skillfold.yaml",
      [
        "skills:",
        "  a: ./skills/a",
        "  b: ./skills/b",
        "compose:",
        "  ab:",
        "    description: A and B.",
        "    use: [a, b]",
      ].join("\n")
    );
    await main(["install", "--dir", dir]);
    const generated = readFileSync(join(dir, ".claude", "skills", "ab", "SKILL.md"), "utf-8");
    assert.match(generated, /# A body/);
    assert.match(generated, /# B body/);
    await main(["check", "--dir", dir]);
    assert.equal(process.exitCode, undefined);
  });

  it("supports rules end to end", async () => {
    const dir = newProject();
    writeSkill(dir, "skills/alpha", "alpha");
    writeFile(dir, "rules/style.md", "Always write tests.\n");
    writeFile(
      dir,
      "skillfold.yaml",
      ["skills:", "  alpha: ./skills/alpha", "rules:", "  style: ./rules/style.md"].join("\n")
    );
    await main(["install", "--dir", dir]);
    assert.equal(
      readFileSync(join(dir, ".claude", "rules", "style.md"), "utf-8"),
      "Always write tests.\n"
    );
    assert.match(logs.join("\n"), /style \(rule\)/);

    logs = [];
    await main(["check", "--dir", dir]);
    assert.match(logs.join("\n"), /ok: 1 skill, 1 rule in sync/);

    logs = [];
    await main(["list", "--dir", dir]);
    assert.match(logs.join("\n"), /style.*rules\/style.md.*ok/);

    logs = [];
    await main(["remove", "style", "--dir", dir]);
    assert.match(logs.join("\n"), /removed style/);
    assert.ok(!existsSync(join(dir, ".claude", "rules", "style.md")));
  });

  it("install --frozen fails without a lockfile", async () => {
    const dir = newProject();
    await main(["init", "--dir", dir]);
    await assert.rejects(main(["install", "--frozen", "--dir", dir]), /--frozen/);
  });

  it("install --frozen succeeds after a normal install", async () => {
    const dir = newProject();
    await main(["init", "--dir", dir]);
    await main(["install", "--dir", dir]);
    await main(["install", "--frozen", "--dir", dir]);
    assert.match(logs.join("\n"), /1 unchanged/);
  });

  it("errors helpfully when there is no manifest", async () => {
    const dir = newProject();
    writeFile(dir, ".keep", "");
    await assert.rejects(main(["install", "--dir", dir]), /skillfold init/);
  });
});
