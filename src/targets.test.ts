import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { parseManifest } from "./manifest.js";
import { shadowedSkillWarnings, targetLayouts } from "./targets.js";
import { makeTmpDir, writeSkill } from "./testutil.js";

const tmp = makeTmpDir();
after(() => tmp.cleanup());

describe("manifest targets", () => {
  it("parses and dedupes targets", () => {
    const manifest = parseManifest("targets: [codex, claude, codex]", "t.yaml");
    assert.deepEqual(manifest.targets, ["codex", "claude"]);
  });

  it("defaults to undefined (claude)", () => {
    assert.equal(parseManifest("skills:\n  a: ./skills/a", "t.yaml").targets, undefined);
  });

  it("rejects unknown targets", () => {
    assert.throws(() => parseManifest("targets: [cursor]", "t.yaml"), /unknown target "cursor"/);
  });

  it("rejects an empty list", () => {
    assert.throws(() => parseManifest("targets: []", "t.yaml"), /non-empty/);
  });
});

describe("targetLayouts", () => {
  it("defaults to the claude layout", () => {
    const manifest = parseManifest("skills:\n  a: ./skills/a", "t.yaml");
    const layouts = targetLayouts(manifest, "/proj", false);
    assert.deepEqual(layouts, [
      {
        target: "claude",
        skillsDir: join("/proj", ".claude", "skills"),
        rulesDir: join("/proj", ".claude", "rules"),
      },
    ]);
  });

  it("honors skillsDir/rulesDir for claude only", () => {
    const manifest = parseManifest(
      "targets: [claude, codex]\nskillsDir: custom/skills\nrulesDir: custom/rules",
      "t.yaml"
    );
    const [claude, codex] = targetLayouts(manifest, "/proj", false);
    assert.equal(claude.skillsDir, join("/proj", "custom", "skills"));
    assert.equal(claude.rulesDir, join("/proj", "custom", "rules"));
    assert.equal(codex.skillsDir, join("/proj", ".agents", "skills"));
    assert.equal(codex.rulesDir, undefined);
    assert.equal(codex.agentsMdPath, join("/proj", "AGENTS.md"));
  });

  it("maps global mode to the home locations", () => {
    const manifest = parseManifest("targets: [claude, codex]", "t.yaml");
    const [claude, codex] = targetLayouts(manifest, join(homedir(), ".claude"), true, {});
    assert.equal(claude.skillsDir, join(homedir(), ".claude", "skills"));
    assert.equal(claude.rulesDir, join(homedir(), ".claude", "rules"));
    assert.equal(codex.skillsDir, join(homedir(), ".agents", "skills"));
    assert.equal(codex.agentsMdPath, join(homedir(), ".codex", "AGENTS.md"));
  });

  it("respects CODEX_HOME for the global AGENTS.md", () => {
    const manifest = parseManifest("targets: [codex]", "t.yaml");
    const [codex] = targetLayouts(manifest, join(homedir(), ".claude"), true, {
      CODEX_HOME: "/custom/codex",
    });
    assert.equal(codex.agentsMdPath, join("/custom/codex", "AGENTS.md"));
  });
});

describe("shadowedSkillWarnings", () => {
  it("warns when a project skill name exists in a user-level tree", () => {
    writeSkill(tmp.path, "userskills/code-review", "code-review");
    const manifest = parseManifest(
      "skills:\n  code-review: ./skills/code-review\n  unique: ./skills/unique",
      "t.yaml"
    );
    const warnings = shadowedSkillWarnings(manifest, [
      { target: "claude", skillsDir: join(tmp.path, "userskills") },
    ]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /"code-review" is also installed at the user level/);
  });

  it("covers composed skill names and dedupes locations", () => {
    writeSkill(tmp.path, "userskills2/combo", "combo");
    const manifest = parseManifest(
      "skills:\n  a: ./skills/a\ncompose:\n  combo:\n    use: [a]",
      "t.yaml"
    );
    const dir = join(tmp.path, "userskills2");
    const warnings = shadowedSkillWarnings(manifest, [
      { target: "claude", skillsDir: dir },
      { target: "codex", skillsDir: dir },
    ]);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].match(/userskills2/g)!.length, 1);
  });

  it("stays silent with no user-level copies", () => {
    const manifest = parseManifest("skills:\n  a: ./skills/a", "t.yaml");
    assert.deepEqual(
      shadowedSkillWarnings(manifest, [
        { target: "claude", skillsDir: join(tmp.path, "empty-userskills") },
      ]),
      []
    );
  });
});
