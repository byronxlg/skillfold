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
    assert.throws(() => parseManifest("targets: [windsurf]", "t.yaml"), /unknown target "windsurf"/);
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
      "targets: [claude, codex, cursor]\nskillsDir: custom/skills\nrulesDir: custom/rules",
      "t.yaml"
    );
    const [claude, codex, cursor] = targetLayouts(manifest, "/proj", false);
    assert.equal(claude.skillsDir, join("/proj", "custom", "skills"));
    assert.equal(claude.rulesDir, join("/proj", "custom", "rules"));
    assert.equal(codex.skillsDir, join("/proj", ".agents", "skills"));
    assert.equal(codex.rulesDir, undefined);
    assert.equal(codex.agentsMdPath, join("/proj", "AGENTS.md"));
    assert.equal(cursor.skillsDir, join("/proj", ".cursor", "skills"));
    assert.equal(cursor.rulesDir, join("/proj", ".cursor", "rules"));
    assert.equal(cursor.cursorRules, true);
  });

  it("maps global mode to the home locations", () => {
    const manifest = parseManifest("targets: [claude, codex, cursor]", "t.yaml");
    const [claude, codex, cursor] = targetLayouts(manifest, join(homedir(), ".claude"), true, {});
    assert.equal(claude.skillsDir, join(homedir(), ".claude", "skills"));
    assert.equal(claude.rulesDir, join(homedir(), ".claude", "rules"));
    assert.equal(codex.skillsDir, join(homedir(), ".agents", "skills"));
    assert.equal(codex.agentsMdPath, join(homedir(), ".codex", "AGENTS.md"));
    assert.equal(cursor.skillsDir, join(homedir(), ".cursor", "skills"));
    assert.equal(cursor.rulesDir, undefined);
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

describe("per-skill target validation", () => {
  it("rejects invalid, empty, and disabled targets", () => {
    for (const targets of ["[]", "[cursor]", "claude", "[codex]"]) {
      assert.throws(() => parseManifest(`skills:\n  a:\n    source: ./a\n    targets: ${targets}`, "t.yaml"), /target|non-empty/);
    }
  });
  it("rejects compositions whose inputs are unavailable on a selected target", () => {
    assert.throws(() => parseManifest(`targets: [claude, codex]
skills:
  a:
    source: ./a
    targets: [claude]
compose:
  combined:
    use: [a]
`, "t.yaml"), /dependency "a" is not installed for codex/);
  });
});

describe("rule selection validation", () => {
  it("rejects invalid hosts, targets and unknown keys", () => {
    for (const option of ["hosts: []", "hosts: [3]", "hosts: ['']", "hosts: laptop", "targets: []", "targets: [cursor]", "targets: [codex]", "typo: true"]) {
      assert.throws(() => parseManifest(`rules:\n  rule:\n    source: ./rule.md\n    ${option}`, "t.yaml"));
    }
  });
  it("accepts mapping sources with version, target and host selectors", () => {
    const manifest = parseManifest(`targets: [claude, codex]
rules:
  rule:
    source: github:owner/repo/rule.md
    version: v1
    targets: [codex]
    hosts: [laptop, laptop]
`, "t.yaml");
    assert.equal(manifest.rules.rule, "github:owner/repo/rule.md@v1");
    assert.deepEqual(manifest.ruleOptions?.rule, { targets: ["codex"], hosts: ["laptop"] });
  });
});
