import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, rmSync, statSync } from "node:fs";
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
    assert.ok(existsSync(join(dir, "skills", "skillfold", "SKILL.md")));

    await main(["install", "--dir", dir]);
    assert.ok(existsSync(join(dir, ".claude", "skills", "skillfold", "SKILL.md")));
    assert.ok(existsSync(join(dir, "skillfold.lock")));

    await main(["check", "--dir", dir]);
    assert.equal(process.exitCode, undefined);
    assert.match(logs.join("\n"), /ok: 1 skill in sync/);

    await main(["list", "--dir", dir]);
    assert.match(logs.join("\n"), /skillfold.*ok/);
  });

  it("shows the active targets and the next commands on init", async () => {
    const dir = newProject();
    await main(["init", "--dir", dir]);
    const out = logs.join("\n");
    assert.match(out, /targets: claude/);
    assert.match(out, /skills -> \.claude\/skills/);
    assert.match(out, /rules {2}-> \.claude\/rules/);
    assert.match(out, /targets: \[claude, codex, cursor\]" in skillfold\.yaml/);
    assert.match(out, /skillfold install +install every declared skill/);
    assert.match(out, /skillfold\.yaml lists every command/);
  });

  it("scaffolds a manifest documenting the commands, targets, and sources", async () => {
    const dir = newProject();
    await main(["init", "--dir", dir]);
    const manifest = readFileSync(join(dir, "skillfold.yaml"), "utf-8");
    for (const command of ["install", "add", "remove", "list", "info", "check", "update", "search"]) {
      assert.match(manifest, new RegExp(`# {3}skillfold ${command}`));
    }
    assert.match(manifest, /# targets: \[claude, codex, cursor\]/);
    assert.match(manifest, /codex +\.agents\/skills/);
    assert.match(manifest, /github:owner\/repo\/path\/to\/skill@v1\.2\.0/);
    assert.match(manifest, /skillfold add npm:skillfold\/code-review/);
    assert.match(manifest, /# rules:/);
  });

  it("names the global install directories on init -g", async () => {
    const dir = newProject();
    process.env.XDG_CONFIG_HOME = join(dir, "config");
    try {
      await main(["init", "-g"]);
    } finally {
      delete process.env.XDG_CONFIG_HOME;
    }
    const out = logs.join("\n");
    assert.match(out, /skills -> ~\/\.claude\/skills/);
    assert.match(out, /skillfold install -g/);
    assert.match(out, /skillfold add -g npm:skillfold\/planning/);
  });

  it("fails check with a nonzero exit on drift", async () => {
    const dir = newProject();
    writeFile(dir, ".keep", "");
    await main(["init", "--dir", dir]);
    await main(["install", "--dir", dir]);
    writeFile(dir, ".claude/skills/skillfold/SKILL.md", "tampered");
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
    await main(["info", "skillfold", "--dir", dir]);
    const out = logs.join("\n");
    assert.match(out, /name: {6}skillfold/);
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

  it("supports the codex target end to end", async () => {
    const dir = newProject();
    writeSkill(dir, "skills/alpha", "alpha");
    writeFile(dir, "rules/style.md", "Always write tests.\n");
    writeFile(dir, "AGENTS.md", "# Hand-written intro\n");
    writeFile(
      dir,
      "skillfold.yaml",
      [
        "targets: [claude, codex]",
        "skills:",
        "  alpha: ./skills/alpha",
        "rules:",
        "  style: ./rules/style.md",
      ].join("\n")
    );
    await main(["install", "--dir", dir]);
    // Skills land in both trees; rules land as files and as an AGENTS.md block.
    assert.ok(existsSync(join(dir, ".claude", "skills", "alpha", "SKILL.md")));
    assert.ok(existsSync(join(dir, ".agents", "skills", "alpha", "SKILL.md")));
    assert.ok(existsSync(join(dir, ".claude", "rules", "style.md")));
    const agentsMd = readFileSync(join(dir, "AGENTS.md"), "utf-8");
    assert.match(agentsMd, /^# Hand-written intro/);
    assert.match(agentsMd, /skillfold:rule:style/);
    assert.match(agentsMd, /Always write tests\./);
    assert.match(logs.join("\n"), /\.agents\/skills/);

    logs = [];
    await main(["check", "--dir", dir]);
    assert.match(logs.join("\n"), /ok: 1 skill, 1 rule in sync/);

    // Drift in the codex tree only is caught and labeled.
    rmSync(join(dir, ".agents", "skills", "alpha"), { recursive: true });
    process.exitCode = undefined;
    errors = [];
    await main(["check", "--dir", dir]);
    assert.equal(process.exitCode, 1);
    assert.match(errors.join("\n"), /\[codex\] "alpha" is not installed/);
    process.exitCode = undefined;

    // Reinstall repairs it.
    logs = [];
    await main(["install", "--dir", dir]);
    assert.ok(existsSync(join(dir, ".agents", "skills", "alpha", "SKILL.md")));
  });

  it("supports the cursor target end to end", async () => {
    const dir = newProject();
    writeSkill(dir, "skills/alpha", "alpha");
    writeFile(dir, "rules/style.md", "Always write tests.\n");
    writeFile(
      dir,
      "skillfold.yaml",
      "targets: [cursor]\nskills:\n  alpha: ./skills/alpha\nrules:\n  style: ./rules/style.md"
    );

    await main(["install", "--dir", dir]);

    assert.ok(existsSync(join(dir, ".cursor", "skills", "alpha", "SKILL.md")));
    assert.match(
      readFileSync(join(dir, ".cursor", "rules", "style.mdc"), "utf-8"),
      /alwaysApply: true[\s\S]*Always write tests\./
    );

    logs = [];
    await main(["check", "--dir", dir]);
    assert.match(logs.join("\n"), /ok: 1 skill, 1 rule in sync/);
  });

  it("protects hand-authored files when a target is added later", async () => {
    const dir = newProject();
    writeSkill(dir, "skills/alpha", "alpha");
    writeFile(dir, "skillfold.yaml", "skills:\n  alpha: ./skills/alpha");
    await main(["install", "--dir", dir]);
    // Hand-authored codex skill with the same name, then the codex target is added.
    writeFile(dir, ".agents/skills/alpha/SKILL.md", "---\nname: alpha\n---\n\nHand-made.\n");
    writeFile(
      dir,
      "skillfold.yaml",
      "targets: [claude, codex]\nskills:\n  alpha: ./skills/alpha"
    );
    await assert.rejects(main(["install", "--dir", dir]), /was not installed by skillfold/);
    assert.match(
      readFileSync(join(dir, ".agents", "skills", "alpha", "SKILL.md"), "utf-8"),
      /Hand-made/
    );
    // --force takes ownership; afterwards the layout is managed.
    await main(["install", "--dir", dir, "--force"]);
    assert.match(
      readFileSync(join(dir, ".agents", "skills", "alpha", "SKILL.md"), "utf-8"),
      /Test skill alpha/
    );
    logs = [];
    await main(["check", "--dir", dir]);
    assert.match(logs.join("\n"), /ok: 1 skill in sync/);
  });

  it("warns when a project skill shadows a user-level skill", async () => {
    const dir = newProject();
    writeSkill(dir, "skills/alpha", "alpha");
    writeFile(dir, "skillfold.yaml", "skills:\n  alpha: ./skills/alpha");
    await main(["install", "--dir", dir]);
    const fakeHome = join(tmp.path, `home${counter++}`);
    writeSkill(fakeHome, ".claude/skills/alpha", "alpha");
    const realHome = process.env.HOME;
    process.env.HOME = fakeHome;
    try {
      errors = [];
      await main(["check", "--dir", dir]);
      assert.match(
        errors.join("\n"),
        /warning: skill "alpha" is also installed at the user level \(~\/.claude\/skills\)/
      );
      assert.equal(process.exitCode, undefined); // warnings never fail check
      assert.match(logs.join("\n"), /ok: 1 skill in sync/);
    } finally {
      process.env.HOME = realHome;
    }
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

describe("per-skill targets", () => {
  it("installs, checks, lists, and reports paths only for selected targets", async () => {
    const dir = newProject();
    writeSkill(dir, "skills/shared", "shared", "Shared");
    writeSkill(dir, "skills/only", "only", "Claude only");
    writeFile(dir, "skillfold.yaml", `targets: [claude, codex]
skills:
  shared: ./skills/shared
  only:
    source: ./skills/only
    targets: [claude]
compose:
  combined:
    use: [shared, only]
    targets: [claude]
`);
    await main(["install", "--dir", dir]);
    assert.ok(existsSync(join(dir, ".claude/skills/only/SKILL.md")));
    assert.ok(existsSync(join(dir, ".agents/skills/shared/SKILL.md")));
    assert.ok(!existsSync(join(dir, ".agents/skills/only")));
    assert.ok(!existsSync(join(dir, ".agents/skills/combined")));
    await main(["install", "--frozen", "--dir", dir]);
    await main(["check", "--dir", dir]);
    assert.equal(process.exitCode, undefined);
    await main(["list", "--dir", dir]);
    assert.match(logs.join("\n"), /only.*ok/);
    logs = [];
    await main(["info", "only", "--dir", dir]);
    assert.match(logs.join("\n"), /\.claude/);
    assert.doesNotMatch(logs.join("\n"), /\.agents/);
  });

  it("prunes a deselected target, rejects frozen changes, and protects unowned copies", async () => {
    const dir = newProject();
    writeSkill(dir, "skills/example", "example", "Managed");
    const manifest = (targets: string) => `targets: [claude, codex]\nskills:\n  example:\n    source: ./skills/example\n    targets: ${targets}\n`;
    writeFile(dir, "skillfold.yaml", manifest("[claude, codex]"));
    await main(["install", "--dir", dir]);
    writeFile(dir, "skillfold.yaml", manifest("[claude]"));
    await assert.rejects(main(["install", "--frozen", "--dir", dir]), /changed targets/);
    await main(["install", "--dir", dir]);
    assert.ok(!existsSync(join(dir, ".agents/skills/example")));
    writeSkill(dir, ".agents/skills/example", "example", "Unowned");
    await main(["install", "--dir", dir]);
    assert.match(readFileSync(join(dir, ".agents/skills/example/SKILL.md"), "utf8"), /Unowned/);
    writeFile(dir, "skillfold.yaml", manifest("[codex]"));
    await assert.rejects(main(["install", "--dir", dir]), /not managed|unmanaged|--force/);
    assert.match(readFileSync(join(dir, ".agents/skills/example/SKILL.md"), "utf8"), /Unowned/);
    await main(["install", "--force", "--dir", dir]);
    await main(["check", "--dir", dir]);
    assert.equal(process.exitCode, undefined);
    assert.ok(!existsSync(join(dir, ".claude/skills/example")));
  });
});


it("runs shebang helpers after install and repairs modes on frozen reinstall", {
  skip: process.platform === "win32",
}, async () => {
  const dir = newProject();
  writeSkill(dir, "source", "helper");
  writeFile(dir, "source/scripts/hello.sh", "#!/bin/sh\nprintf 'hello\\n'\n");
  writeFile(dir, "source/reference.md", "Not executable.\n");
  writeFile(dir, "skillfold.yaml", "skills:\n  helper: ./source\n");
  await main(["install", "--dir", dir]);
  const installed = join(dir, ".claude/skills/helper");
  const script = join(installed, "scripts/hello.sh");
  assert.equal(execFileSync(script, { encoding: "utf8" }), "hello\n");
  assert.equal(statSync(join(installed, "reference.md")).mode & 0o111, 0);
  const lock = readFileSync(join(dir, "skillfold.lock"), "utf8");
  chmodSync(script, 0o644);
  await main(["check", "--dir", dir]);
  assert.equal(process.exitCode, 1);
  assert.match(errors.join("\n"), /not executable/);
  logs = [];
  await main(["list", "--dir", dir]);
  assert.match(logs.join("\n"), /helper.*modified/);
  process.exitCode = undefined;
  await main(["install", "--frozen", "--dir", dir]);
  assert.equal(execFileSync(script, { encoding: "utf8" }), "hello\n");
  assert.equal(readFileSync(join(dir, "skillfold.lock"), "utf8"), lock);
  await main(["check", "--dir", dir]);
  assert.equal(process.exitCode, undefined);
});

async function withGlobalHome(run: (home: string) => Promise<void>): Promise<void> {
  const dir = newProject();
  const saved = { HOME: process.env.HOME, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME, CODEX_HOME: process.env.CODEX_HOME };
  process.env.HOME = dir;
  process.env.XDG_CONFIG_HOME = join(dir, "xdg");
  process.env.CODEX_HOME = join(dir, ".codex");
  try { await run(dir); }
  finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("agent-independent global config", () => {
  it("initializes in XDG config while installing into the agent directories", async () => {
    await withGlobalHome(async (home) => {
      await main(["init", "-g"]);
      const root = join(home, "xdg/skillfold");
      assert.ok(existsSync(join(root, "skillfold.yaml")));
      writeFile(root, "skillfold.yaml", "targets: [claude, codex, cursor]\nskills:\n  skillfold: ./skills/skillfold\n");
      await main(["install", "-g"]);
      assert.ok(existsSync(join(home, ".claude/skills/skillfold/SKILL.md")));
      assert.ok(existsSync(join(home, ".agents/skills/skillfold/SKILL.md")));
      assert.ok(existsSync(join(home, ".cursor/skills/skillfold/SKILL.md")));
      assert.ok(!existsSync(join(home, ".claude/skillfold.yaml")));
      await main(["install", "-g", "--frozen"]);
      await main(["check", "-g"]);
      assert.equal(process.exitCode, undefined);
    });
  });
  it("explains that Cursor user rules are not file-based", async () => {
    await withGlobalHome(async (home) => {
      const root = join(home, "xdg/skillfold");
      writeFile(root, "rule.md", "A rule.\n");
      writeFile(
        root,
        "skillfold.yaml",
        "targets: [cursor]\nrules:\n  style: ./rule.md\n"
      );
      await assert.rejects(
        main(["install", "-g"]),
        /Cursor user rules are managed in Customize > Rules/
      );
    });
  });
  it("migrates a legacy local config and keeps frozen installs valid", async () => {
    await withGlobalHome(async (home) => {
      writeSkill(home, ".claude/source/alpha", "alpha");
      writeFile(home, ".claude/source/style.md", "A rule.\n");
      writeFile(home, ".claude/skillfold.yaml", "targets: [claude, codex]\nskills:\n  alpha: ./source/alpha\nrules:\n  style: ./source/style.md\n");
      await main(["install", "-g"]);
      assert.match(errors.join("\n"), /legacy/);
      await main(["migrate", "-g"]);
      errors = [];
      await main(["install", "-g", "--frozen"]);
      await main(["check", "-g"]);
      assert.equal(process.exitCode, undefined);
      assert.doesNotMatch(errors.join("\n"), /legacy/);
      assert.ok(existsSync(join(home, ".claude/skills/alpha/SKILL.md")));
      assert.ok(existsSync(join(home, ".agents/skills/alpha/SKILL.md")));
      assert.equal(readFileSync(join(home, ".claude/rules/style.md"), "utf8"), "A rule.\n");
      assert.match(readFileSync(join(home, ".codex/AGENTS.md"), "utf8"), /A rule/);
      await main(["remove", "-g", "alpha"]);
      assert.ok(!existsSync(join(home, ".claude/skills/alpha")));
      assert.ok(!existsSync(join(home, ".agents/skills/alpha")));
    });
  });
  it("requires the explicit global migration command", async () => {
    await assert.rejects(main(["migrate"]), /usage: skillfold migrate -g/);
    await assert.rejects(main(["migrate", "-g", "--force"]), /usage/);
  });
});

describe("rule target and host selection", () => {
  it("installs selected rules, preserves manual instructions, and prunes on host changes", async () => {
    const dir = newProject();
    writeFile(dir, "rules/shared.md", "Shared rule.\n");
    writeFile(dir, "rules/codex.md", "Codex rule.\n");
    writeFile(dir, "rules/host.md", "Host rule.\n");
    writeFile(dir, "AGENTS.md", "Handwritten instructions.\n");
    writeFile(dir, ".claude/rules/unmanaged.md", "Unmanaged rule.\n");
    writeFile(dir, "skillfold.yaml", `targets: [claude, codex]
rules:
  shared: ./rules/shared.md
  codex-only:
    source: ./rules/codex.md
    targets: [codex]
  host-only:
    source: ./rules/host.md
    hosts: [first-host]
`);
    const original = process.env.SKILLFOLD_HOST;
    try {
      process.env.SKILLFOLD_HOST = "first-host";
      await main(["install", "--dir", dir]);
      assert.ok(!existsSync(join(dir, ".claude/rules/codex-only.md")));
      assert.ok(existsSync(join(dir, ".claude/rules/host-only.md")));
      assert.match(readFileSync(join(dir, "AGENTS.md"), "utf8"), /Handwritten instructions/);
      assert.match(readFileSync(join(dir, "AGENTS.md"), "utf8"), /Codex rule/);
      const lock = readFileSync(join(dir, "skillfold.lock"), "utf8");
      await main(["check", "--dir", dir]);
      assert.equal(process.exitCode, undefined);
      logs = [];
      await main(["info", "codex-only", "--dir", dir]);
      assert.doesNotMatch(logs.join("\n"), /\.claude/);
      process.env.SKILLFOLD_HOST = "second-host";
      await main(["check", "--dir", dir]);
      assert.equal(process.exitCode, 1);
      process.exitCode = undefined;
      await main(["install", "--frozen", "--dir", dir]);
      assert.equal(readFileSync(join(dir, "skillfold.lock"), "utf8"), lock);
      assert.ok(!existsSync(join(dir, ".claude/rules/host-only.md")));
      assert.doesNotMatch(readFileSync(join(dir, "AGENTS.md"), "utf8"), /Host rule/);
      assert.match(readFileSync(join(dir, "AGENTS.md"), "utf8"), /Handwritten instructions/);
      assert.ok(existsSync(join(dir, ".claude/rules/unmanaged.md")));
      await main(["check", "--dir", dir]);
      assert.equal(process.exitCode, undefined);
      logs = [];
      await main(["list", "--dir", dir]);
      assert.match(logs.join("\n"), /host-only.*not selected/);
      process.env.SKILLFOLD_HOST = "first-host";
      await main(["install", "--frozen", "--dir", dir]);
      assert.ok(existsSync(join(dir, ".claude/rules/host-only.md")));
      const manifestPath = join(dir, "skillfold.yaml");
      writeFile(dir, "skillfold.yaml", readFileSync(manifestPath, "utf8").replace("targets: [codex]", "targets: [claude]").replace("hosts: [first-host]", "hosts: [second-host]"));
      await assert.rejects(main(["install", "--frozen", "--dir", dir]), /changed targets|changed hosts/);
      await main(["install", "--dir", dir]);
      assert.ok(existsSync(join(dir, ".claude/rules/codex-only.md")));
      assert.ok(!existsSync(join(dir, ".claude/rules/host-only.md")));
      assert.doesNotMatch(readFileSync(join(dir, "AGENTS.md"), "utf8"), /Codex rule/);
      await main(["check", "--dir", dir]);
      assert.equal(process.exitCode, undefined);
    } finally {
      if (original === undefined) delete process.env.SKILLFOLD_HOST;
      else process.env.SKILLFOLD_HOST = original;
    }
  });
});
