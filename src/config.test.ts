import assert from "node:assert/strict";
import { existsSync, readFileSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { after, describe, it } from "node:test";

import { globalConfigDir, globalConfigRoot, migrateGlobalConfig } from "./config.js";
import { emptyLockfile, readLockfile, writeLockfile } from "./lock.js";
import { loadManifest } from "./manifest.js";
import { makeTmpDir, writeFile } from "./testutil.js";

const tmp = makeTmpDir();
after(() => tmp.cleanup());
let counter = 0;
const home = (): string => join(tmp.path, `home${counter++}`);

describe("global config location", () => {
  it("uses .config/skillfold by default and honors only absolute XDG_CONFIG_HOME", () => {
    const dir = home();
    assert.equal(globalConfigDir({}, dir), join(dir, ".config/skillfold"));
    assert.equal(globalConfigDir({ XDG_CONFIG_HOME: "/custom" }, dir), "/custom/skillfold");
    for (const xdg of ["", "relative/path"]) {
      assert.equal(globalConfigDir({ XDG_CONFIG_HOME: xdg }, dir), join(dir, ".config/skillfold"));
    }
  });
  it("falls back to legacy but prefers the new manifest or lockfile", () => {
    const dir = home();
    writeFile(dir, ".claude/skillfold.yaml", "skills: {}\n");
    assert.equal(globalConfigRoot({}, dir), join(dir, ".claude"));
    writeFile(dir, ".config/skillfold/skillfold.lock", "incomplete");
    assert.equal(globalConfigRoot({}, dir), join(dir, ".config/skillfold"));
  });
});

describe("global config migration", () => {
  it("preserves remote pins, comments, and original files", () => {
    const dir = home();
    const original = "# Keep this comment\ntargets: [claude, codex]\nskills:\n  remote: github:owner/repo/path\n";
    writeFile(dir, ".claude/skillfold.yaml", original);
    const lock = emptyLockfile();
    lock.targets = ["claude", "codex"];
    lock.skills.remote = { source: "github:owner/repo/path", resolved: "github:owner/repo/path@" + "a".repeat(40), integrity: "sha256-pinned", targets: ["codex"] };
    writeLockfile(join(dir, ".claude/skillfold.lock"), lock);
    const destination = migrateGlobalConfig({}, dir);
    assert.equal(readFileSync(join(destination, "skillfold.yaml"), "utf8"), original);
    assert.deepEqual(readLockfile(join(destination, "skillfold.lock")), lock);
    assert.equal(readFileSync(join(dir, ".claude/skillfold.yaml"), "utf8"), original);
    assert.throws(() => migrateGlobalConfig({}, dir), /will not overwrite/);
  });
  it("rebases local sources and explicit install paths, including mapping sources", () => {
    const dir = home();
    writeFile(dir, ".claude/skillfold.yaml", `skillsDir: installs
rulesDir: rule-installs
skills:
  local:
    source: ./sources/local
  absolute: /absolute/source
rules:
  style: ./source-rules/style.md
`);
    const destination = migrateGlobalConfig({ XDG_CONFIG_HOME: join(dir, "custom") }, dir);
    const manifest = loadManifest(join(destination, "skillfold.yaml"));
    assert.equal(resolve(destination, manifest.skills.local), join(dir, ".claude/sources/local"));
    assert.equal(manifest.skills.absolute, "/absolute/source");
    assert.equal(resolve(destination, manifest.rules.style), join(dir, ".claude/source-rules/style.md"));
    assert.equal(resolve(destination, manifest.skillsDir!), join(dir, ".claude/installs"));
    assert.equal(resolve(destination, manifest.rulesDir!), join(dir, ".claude/rule-installs"));
    assert.ok(!existsSync(join(destination, "skillfold.lock")));
  });
  it("refuses a dangling destination symlink without touching legacy files", () => {
    const dir = home();
    writeFile(dir, ".claude/skillfold.yaml", "skills: {}\n");
    writeFile(dir, ".config/skillfold/.keep", "");
    symlinkSync("missing", join(dir, ".config/skillfold/skillfold.yaml"));
    assert.throws(() => migrateGlobalConfig({}, dir), /will not overwrite/);
    assert.equal(readFileSync(join(dir, ".claude/skillfold.yaml"), "utf8"), "skills: {}\n");
  });
});
