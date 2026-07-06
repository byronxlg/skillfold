import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { InstallError } from "./errors.js";
import { checkProject, syncSkillsDir } from "./install.js";
import { emptyLockfile } from "./lock.js";
import { parseManifest } from "./manifest.js";
import { resolveManifest } from "./resolve.js";
import type { ResolvedSkill } from "./resolve.js";
import { readSkillDir } from "./skill.js";
import { makeTmpDir, writeFile, writeSkill } from "./testutil.js";

const tmp = makeTmpDir();
after(() => tmp.cleanup());

let counter = 0;
function project(manifestText: string): {
  baseDir: string;
  skillsDir: string;
  manifest: ReturnType<typeof parseManifest>;
} {
  const baseDir = join(tmp.path, `p${counter++}`);
  writeSkill(baseDir, "skills/alpha", "alpha", "# Alpha\n\nFirst.");
  writeSkill(baseDir, "skills/beta", "beta", "# Beta\n\nSecond.");
  return {
    baseDir,
    skillsDir: join(baseDir, ".claude", "skills"),
    manifest: parseManifest(manifestText, "t.yaml"),
  };
}

const TWO_SKILLS = "skills:\n  alpha: ./skills/alpha\n  beta: ./skills/beta";
const WITH_COMPOSE = `${TWO_SKILLS}\ncompose:\n  both:\n    use: [alpha, beta]`;

async function resolveAll(manifest: ReturnType<typeof parseManifest>, baseDir: string) {
  return resolveManifest(manifest, { baseDir });
}

describe("syncSkillsDir", () => {
  it("installs skills and composed skills", async () => {
    const { baseDir, skillsDir, manifest } = project(WITH_COMPOSE);
    const { resolved } = await resolveAll(manifest, baseDir);
    const result = syncSkillsDir({ skillsDir, resolved, previousLock: null });
    assert.deepEqual(result.installed.sort(), ["alpha", "beta", "both"]);
    assert.deepEqual(result.unchanged, []);
    const both = readSkillDir(join(skillsDir, "both"), "both");
    assert.match(both.body, /# Alpha/);
    assert.match(both.body, /# Beta/);
  });

  it("skips unchanged skills on reinstall", async () => {
    const { baseDir, skillsDir, manifest } = project(TWO_SKILLS);
    const { resolved, lock } = await resolveAll(manifest, baseDir);
    syncSkillsDir({ skillsDir, resolved, previousLock: null });
    const again = syncSkillsDir({ skillsDir, resolved, previousLock: lock });
    assert.deepEqual(again.installed, []);
    assert.deepEqual(again.unchanged.sort(), ["alpha", "beta"]);
  });

  it("rewrites managed skills that drifted", async () => {
    const { baseDir, skillsDir, manifest } = project(TWO_SKILLS);
    const { resolved, lock } = await resolveAll(manifest, baseDir);
    syncSkillsDir({ skillsDir, resolved, previousLock: null });
    writeFile(skillsDir, "alpha/SKILL.md", "tampered");
    const repair = syncSkillsDir({ skillsDir, resolved, previousLock: lock });
    assert.deepEqual(repair.installed, ["alpha"]);
    assert.match(readFileSync(join(skillsDir, "alpha", "SKILL.md"), "utf-8"), /# Alpha/);
  });

  it("refuses to overwrite unmanaged directories", async () => {
    const { baseDir, skillsDir, manifest } = project(TWO_SKILLS);
    writeFile(skillsDir, "alpha/SKILL.md", "hand-authored, precious");
    const { resolved } = await resolveAll(manifest, baseDir);
    assert.throws(
      () => syncSkillsDir({ skillsDir, resolved, previousLock: null }),
      InstallError
    );
  });

  it("overwrites unmanaged directories with force", async () => {
    const { baseDir, skillsDir, manifest } = project(TWO_SKILLS);
    writeFile(skillsDir, "alpha/SKILL.md", "hand-authored");
    const { resolved } = await resolveAll(manifest, baseDir);
    const result = syncSkillsDir({ skillsDir, resolved, previousLock: null, force: true });
    assert.ok(result.installed.includes("alpha"));
  });

  it("adopts identical unmanaged directories without error", async () => {
    const { baseDir, skillsDir, manifest } = project(TWO_SKILLS);
    const { resolved } = await resolveAll(manifest, baseDir);
    syncSkillsDir({ skillsDir, resolved, previousLock: null });
    // Same content, no lock: adopting is safe because nothing changes.
    const again = syncSkillsDir({ skillsDir, resolved, previousLock: null });
    assert.deepEqual(again.unchanged.sort(), ["alpha", "beta"]);
  });

  it("prunes skills that left the manifest", async () => {
    const { baseDir, skillsDir, manifest } = project(TWO_SKILLS);
    const { resolved, lock } = await resolveAll(manifest, baseDir);
    syncSkillsDir({ skillsDir, resolved, previousLock: null });

    const smaller = parseManifest("skills:\n  alpha: ./skills/alpha", "t.yaml");
    const next = await resolveAll(smaller, baseDir);
    const result = syncSkillsDir({
      skillsDir,
      resolved: next.resolved,
      previousLock: lock,
    });
    assert.deepEqual(result.pruned, ["beta"]);
    assert.equal(existsSync(join(skillsDir, "beta")), false);
    assert.equal(existsSync(join(skillsDir, "alpha")), true);
  });

  it("never prunes unmanaged directories", async () => {
    const { baseDir, skillsDir, manifest } = project(TWO_SKILLS);
    writeFile(skillsDir, "hand-made/SKILL.md", "mine");
    const { resolved, lock } = await resolveAll(manifest, baseDir);
    syncSkillsDir({ skillsDir, resolved, previousLock: null });
    syncSkillsDir({ skillsDir, resolved, previousLock: lock });
    assert.equal(existsSync(join(skillsDir, "hand-made", "SKILL.md")), true);
  });

  it("removes stale files from reinstalled skills", async () => {
    const { baseDir, skillsDir, manifest } = project(TWO_SKILLS);
    const { resolved, lock } = await resolveAll(manifest, baseDir);
    syncSkillsDir({ skillsDir, resolved, previousLock: null });
    writeFile(skillsDir, "alpha/stale-extra.md", "left over");
    syncSkillsDir({ skillsDir, resolved, previousLock: lock });
    assert.equal(existsSync(join(skillsDir, "alpha", "stale-extra.md")), false);
  });
});

describe("checkProject", () => {
  async function installedProject(manifestText: string) {
    const { baseDir, skillsDir, manifest } = project(manifestText);
    const { resolved, lock } = await resolveAll(manifest, baseDir);
    syncSkillsDir({ skillsDir, resolved, previousLock: null });
    return { baseDir, skillsDir, manifest, lock };
  }

  it("passes for a fully synced project", async () => {
    const { baseDir, skillsDir, manifest, lock } = await installedProject(WITH_COMPOSE);
    assert.deepEqual(checkProject(manifest, lock, baseDir, skillsDir), []);
  });

  it("reports a missing lockfile", async () => {
    const { baseDir, skillsDir, manifest } = project(TWO_SKILLS);
    const problems = checkProject(manifest, null, baseDir, skillsDir);
    assert.match(problems[0], /missing skillfold.lock/);
  });

  it("reports uninstalled skills", async () => {
    const { baseDir, skillsDir, manifest } = project(TWO_SKILLS);
    const { lock } = await resolveAll(manifest, baseDir);
    const problems = checkProject(manifest, lock, baseDir, skillsDir);
    assert.equal(problems.length, 2);
    assert.match(problems[0], /not installed/);
  });

  it("reports local skills whose source changed", async () => {
    const { baseDir, skillsDir, manifest, lock } = await installedProject(TWO_SKILLS);
    writeSkill(baseDir, "skills/alpha", "alpha", "# Alpha v2\n\nEdited.");
    const problems = checkProject(manifest, lock, baseDir, skillsDir);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /"alpha" is out of date/);
  });

  it("reports composed skills that would regenerate differently", async () => {
    const { baseDir, skillsDir, manifest, lock } = await installedProject(WITH_COMPOSE);
    writeFile(skillsDir, "both/SKILL.md", "tampered");
    const problems = checkProject(manifest, lock, baseDir, skillsDir);
    assert.match(problems.join("\n"), /composed skill "both" is out of date/);
  });

  it("reports missing local source directories", async () => {
    const { baseDir, skillsDir, manifest, lock } = await installedProject(
      "skills:\n  alpha: ./skills/alpha"
    );
    writeSkill(baseDir, "skills/alpha", "alpha"); // keep dir, then point manifest elsewhere
    const moved = parseManifest("skills:\n  alpha: ./skills/moved", "t.yaml");
    const problems = checkProject(moved, lock, baseDir, skillsDir);
    assert.match(problems.join("\n"), /source directory is missing/);
  });
});

describe("checkProject with remote lock entries", () => {
  it("flags installed files that differ from the lock hash", async () => {
    const { baseDir, skillsDir, manifest } = project("skills:\n  alpha: ./skills/alpha");
    const { resolved, lock } = await resolveAll(manifest, baseDir);
    syncSkillsDir({ skillsDir, resolved, previousLock: null });

    // Rewrite the manifest/lock to pretend alpha is remote with a stale hash.
    const remoteManifest = parseManifest("skills:\n  alpha: github:o/r/alpha@v1", "t.yaml");
    const remoteLock = emptyLockfile();
    remoteLock.skills.alpha = {
      source: "github:o/r/alpha@v1",
      resolved: `github:o/r/alpha@${"e".repeat(40)}`,
      integrity: "sha256-stale=",
    };
    const problems = checkProject(remoteManifest, remoteLock, baseDir, skillsDir);
    assert.match(problems.join("\n"), /do not match the lockfile/);
  });
});

describe("resolved skill shape", () => {
  it("marks composed skills distinctly", async () => {
    const { baseDir, manifest } = project(WITH_COMPOSE);
    const { resolved } = await resolveAll(manifest, baseDir);
    const kinds = new Map(resolved.map((r: ResolvedSkill) => [r.name, r.kind]));
    assert.equal(kinds.get("both"), "compose");
  });
});

describe("checkProject with renamed and multi-file skills", () => {
  it("passes when the manifest name differs from the source frontmatter name", async () => {
    const { baseDir, skillsDir } = project("skills:\n  other: ./skills/alpha");
    const manifest = parseManifest("skills:\n  other: ./skills/alpha", "t.yaml");
    const { resolved, lock } = await resolveAll(manifest, baseDir);
    syncSkillsDir({ skillsDir, resolved, previousLock: null });
    assert.deepEqual(checkProject(manifest, lock, baseDir, skillsDir), []);
  });

  it("passes for composed skills with supporting files", async () => {
    const { baseDir, skillsDir } = project(WITH_COMPOSE);
    writeFile(baseDir, "skills/alpha/references/notes.md", "alpha notes");
    const manifest = parseManifest(WITH_COMPOSE, "t.yaml");
    const { resolved, lock } = await resolveAll(manifest, baseDir);
    syncSkillsDir({ skillsDir, resolved, previousLock: null });
    assert.deepEqual(checkProject(manifest, lock, baseDir, skillsDir), []);
    // The composed skill carries the supporting file.
    assert.ok(existsSync(join(skillsDir, "both", "references", "notes.md")));
  });

  it("reports a compose file conflict as a problem, not a crash", async () => {
    const text = `${TWO_SKILLS}\ncompose:\n  both:\n    use: [alpha, beta]`;
    const { baseDir, skillsDir } = project(text);
    writeFile(baseDir, "skills/alpha/references/x.md", "from alpha");
    const manifest = parseManifest(text, "t.yaml");
    const { resolved, lock } = await resolveAll(manifest, baseDir);
    syncSkillsDir({ skillsDir, resolved, previousLock: null });
    // Introduce the conflict after install: beta now also ships x.md.
    writeFile(baseDir, "skills/beta/references/x.md", "from beta");
    writeFile(join(skillsDir, "beta"), "references/x.md", "from beta");
    const problems = checkProject(manifest, lock, baseDir, skillsDir);
    assert.ok(problems.some((p) => p.includes('both provide "references/x.md"')));
  });
});
