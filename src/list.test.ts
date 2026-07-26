import assert from "node:assert/strict";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { syncSkillsDir } from "./install.js";
import { renderRows, skillRows } from "./list.js";
import { parseManifest } from "./manifest.js";
import { resolveManifest } from "./resolve.js";
import { makeTmpDir, writeFile, writeSkill } from "./testutil.js";

const tmp = makeTmpDir();
after(() => tmp.cleanup());

describe("skillRows", () => {
  it("computes status per skill", async () => {
    const baseDir = join(tmp.path, "p1");
    const skillsDir = join(baseDir, ".claude", "skills");
    writeSkill(baseDir, "skills/here", "here");
    writeSkill(baseDir, "skills/pending", "pending");
    const manifest = parseManifest(
      [
        "skills:",
        "  here: ./skills/here",
        "  pending: ./skills/pending",
        "compose:",
        "  combo:",
        "    use: [here]",
      ].join("\n"),
      "t.yaml"
    );
    const { resolved, lock } = await resolveManifest(manifest, { baseDir });
    // Install everything, then remove "pending" and drift "here".
    syncSkillsDir({ skillsDir, resolved, previousLock: null });
    writeFile(skillsDir, "here/SKILL.md", "drifted");
    const { rmSync } = await import("node:fs");
    rmSync(join(skillsDir, "pending"), { recursive: true });

    const rows = skillRows(manifest, lock, baseDir, [{ target: "claude", skillsDir: skillsDir, rulesDir: join(baseDir, ".claude", "rules") }]);
    const byName = new Map(rows.map((row) => [row.name, row]));
    assert.equal(byName.get("here")?.status, "modified");
    assert.equal(byName.get("pending")?.status, "not installed");
    assert.equal(byName.get("combo")?.status, "ok");
    assert.equal(byName.get("combo")?.source, "compose(here)");
  });

  it("warns when an installed skill has no description", async () => {
    const baseDir = join(tmp.path, "p-warn");
    const skillsDir = join(baseDir, ".claude", "skills");
    // A source skill with a valid name but no description.
    writeFile(baseDir, "skills/nodesc/SKILL.md", "---\nname: nodesc\n---\n# No desc\n");
    const manifest = parseManifest("skills:\n  nodesc: ./skills/nodesc", "t.yaml");
    const { resolved, lock } = await resolveManifest(manifest, { baseDir });
    syncSkillsDir({ skillsDir, resolved, previousLock: null });
    const rows = skillRows(manifest, lock, baseDir, [
      { target: "claude", skillsDir: skillsDir, rulesDir: join(baseDir, ".claude", "rules") },
    ]);
    assert.equal(rows[0].status, "ok");
    assert.equal(rows[0].warning, "no description");
    assert.match(renderRows(rows), /warn: no description/);
  });

  it("reports not locked when the lock is missing", async () => {
    const baseDir = join(tmp.path, "p2");
    const skillsDir = join(baseDir, ".claude", "skills");
    writeSkill(baseDir, "skills/x", "x");
    const manifest = parseManifest("skills:\n  x: github:o/r/x@v1", "t.yaml");
    writeSkill(skillsDir, "x", "x"); // installed but unlocked
    const rows = skillRows(manifest, null, baseDir, [{ target: "claude", skillsDir: skillsDir, rulesDir: join(baseDir, ".claude", "rules") }]);
    assert.equal(rows[0].status, "not locked");
  });
});

describe("renderRows", () => {
  it("renders an aligned table", () => {
    const text = renderRows([
      { name: "a", kind: "local", source: "./skills/a", status: "ok" },
      { name: "long-name", kind: "github", source: "github:o/r/x", pinned: "8f3a9c1", status: "modified" },
    ]);
    const lines = text.split("\n");
    assert.match(lines[0], /name\s+source\s+pinned\s+status/);
    assert.match(text, /8f3a9c1/);
  });

  it("hints at add when empty", () => {
    assert.match(renderRows([]), /skillfold add/);
  });

  it("shows a frontmatter warning only in place of an ok status", () => {
    const text = renderRows([
      { name: "a", kind: "local", source: "./a", status: "ok", warning: "no description" },
      { name: "b", kind: "local", source: "./b", status: "modified", warning: "no description" },
    ]);
    assert.match(text, /warn: no description/);
    // A worse status wins over the warning.
    assert.match(text, /\bmodified\b/);
  });
});
