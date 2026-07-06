import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { ManifestError } from "./errors.js";
import {
  addSkillToManifest,
  loadManifest,
  parseManifest,
  removeSkillFromManifest,
  validateSkillName,
} from "./manifest.js";
import { makeTmpDir, writeFile } from "./testutil.js";

const tmp = makeTmpDir();
after(() => tmp.cleanup());

describe("parseManifest", () => {
  it("parses skills and compose", () => {
    const manifest = parseManifest(
      [
        "skills:",
        "  local-one: ./skills/local-one",
        "  remote: github:o/r/skills/remote@v1",
        "compose:",
        "  both:",
        "    description: Both of them.",
        "    use: [local-one, remote]",
      ].join("\n"),
      "test.yaml"
    );
    assert.deepEqual(manifest.skills, {
      "local-one": "./skills/local-one",
      remote: "github:o/r/skills/remote@v1",
    });
    assert.deepEqual(manifest.compose.both, {
      description: "Both of them.",
      use: ["local-one", "remote"],
    });
    assert.equal(manifest.skillsDir, undefined);
  });

  it("normalizes { source, version } entries", () => {
    const manifest = parseManifest(
      ["skills:", "  a:", "    source: github:o/r/a", "    version: v2"].join("\n"),
      "test.yaml"
    );
    assert.equal(manifest.skills.a, "github:o/r/a@v2");
  });

  it("accepts an empty manifest", () => {
    const manifest = parseManifest("", "test.yaml");
    assert.deepEqual(manifest.skills, {});
    assert.deepEqual(manifest.compose, {});
  });

  it("rejects unknown top-level keys", () => {
    assert.throws(() => parseManifest("team:\n  flow: []", "test.yaml"), /unknown top-level key "team"/);
  });

  it("rejects invalid skill names", () => {
    assert.throws(() => parseManifest("skills:\n  Bad Name: ./x", "t.yaml"), ManifestError);
    assert.throws(() => parseManifest("skills:\n  -bad: ./x", "t.yaml"), ManifestError);
  });

  it("rejects invalid sources", () => {
    assert.throws(() => parseManifest("skills:\n  a: gitlab:x/y", "t.yaml"), /unknown source scheme/);
  });

  it("rejects names in both skills and compose", () => {
    assert.throws(
      () =>
        parseManifest(
          ["skills:", "  a: ./a", "compose:", "  a:", "    use: [a]"].join("\n"),
          "t.yaml"
        ),
      /defined in both/
    );
  });

  it("rejects compose entries using unknown skills", () => {
    assert.throws(
      () => parseManifest("compose:\n  c:\n    use: [ghost]", "t.yaml"),
      /unknown skill "ghost"/
    );
  });

  it("rejects self-referencing compose entries", () => {
    assert.throws(
      () => parseManifest("compose:\n  c:\n    use: [c]", "t.yaml"),
      ManifestError
    );
  });

  it("rejects duplicate use entries", () => {
    assert.throws(
      () =>
        parseManifest(
          ["skills:", "  a: ./a", "compose:", "  c:", "    use: [a, a]"].join("\n"),
          "t.yaml"
        ),
      /listed more than once/
    );
  });

  it("rejects compose cycles", () => {
    assert.throws(
      () =>
        parseManifest(
          [
            "skills:",
            "  a: ./a",
            "compose:",
            "  x:",
            "    use: [y, a]",
            "  y:",
            "    use: [x, a]",
          ].join("\n"),
          "t.yaml"
        ),
      /Compose cycle/
    );
  });

  it("allows nested compose without cycles", () => {
    const manifest = parseManifest(
      [
        "skills:",
        "  a: ./a",
        "compose:",
        "  inner:",
        "    use: [a]",
        "  outer:",
        "    use: [inner, a]",
      ].join("\n"),
      "t.yaml"
    );
    assert.deepEqual(manifest.compose.outer.use, ["inner", "a"]);
  });

  it("reads skillsDir", () => {
    const manifest = parseManifest("skillsDir: custom/skills", "t.yaml");
    assert.equal(manifest.skillsDir, "custom/skills");
  });
});

describe("validateSkillName", () => {
  it("accepts kebab-case names", () => {
    validateSkillName("code-review");
    validateSkillName("a1");
  });

  it("rejects bad names", () => {
    assert.throws(() => validateSkillName("Code-Review"), ManifestError);
    assert.throws(() => validateSkillName("has space"), ManifestError);
    assert.throws(() => validateSkillName("trailing-"), ManifestError);
    assert.throws(() => validateSkillName("x".repeat(65)), ManifestError);
  });
});

describe("loadManifest", () => {
  it("gives a helpful error when the manifest is missing", () => {
    assert.throws(
      () => loadManifest(join(tmp.path, "nowhere", "skillfold.yaml")),
      /skillfold init/
    );
  });
});

describe("manifest editing", () => {
  it("adds a skill while preserving comments", () => {
    const path = join(tmp.path, "edit.yaml");
    writeFile(tmp.path, "edit.yaml", "# my comment\nskills:\n  existing: ./skills/existing\n");
    addSkillToManifest(path, "fresh", "github:o/r/fresh@v1");
    const text = readFileSync(path, "utf-8");
    assert.match(text, /# my comment/);
    assert.match(text, /fresh: github:o\/r\/fresh@v1/);
    const manifest = loadManifest(path);
    assert.equal(manifest.skills.fresh, "github:o/r/fresh@v1");
    assert.equal(manifest.skills.existing, "./skills/existing");
  });

  it("creates the file when missing", () => {
    const path = join(tmp.path, "new.yaml");
    addSkillToManifest(path, "first", "./skills/first");
    assert.equal(loadManifest(path).skills.first, "./skills/first");
  });

  it("rejects duplicate names", () => {
    const path = join(tmp.path, "dup.yaml");
    writeFile(tmp.path, "dup.yaml", "skills:\n  taken: ./a\n");
    assert.throws(() => addSkillToManifest(path, "taken", "./b"), /already exists/);
  });

  it("removes a skill and reports its section", () => {
    const path = join(tmp.path, "rm.yaml");
    writeFile(
      tmp.path,
      "rm.yaml",
      ["skills:", "  a: ./a", "  b: ./b", "compose:", "  c:", "    use: [a]"].join("\n")
    );
    assert.equal(removeSkillFromManifest(path, "b"), "skills");
    assert.equal(removeSkillFromManifest(path, "c"), "compose");
    const manifest = loadManifest(path);
    assert.deepEqual(Object.keys(manifest.skills), ["a"]);
    assert.deepEqual(manifest.compose, {});
    // The now-empty compose section is dropped entirely.
    assert.doesNotMatch(readFileSync(path, "utf-8"), /compose/);
  });

  it("errors when removing an unknown skill", () => {
    const path = join(tmp.path, "rm2.yaml");
    writeFile(tmp.path, "rm2.yaml", "skills:\n  a: ./a\n");
    assert.throws(() => removeSkillFromManifest(path, "ghost"), /not in the manifest/);
  });
});
