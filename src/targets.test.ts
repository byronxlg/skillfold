import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { parseManifest } from "./manifest.js";
import { targetLayouts } from "./targets.js";

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
