import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { after, describe, it } from "node:test";
import { join } from "node:path";

import { ResolveError } from "./errors.js";
import {
  computeIntegrity,
  parseFrontmatter,
  readDirFiles,
  readSkillDir,
} from "./skill.js";
import { makeTmpDir, writeFile, writeSkill } from "./testutil.js";

const tmp = makeTmpDir();
after(() => tmp.cleanup());

describe("parseFrontmatter", () => {
  it("splits attrs and body", () => {
    const { attrs, body } = parseFrontmatter(
      "---\nname: foo\ndescription: A skill.\n---\n\n# Foo\n"
    );
    assert.equal(attrs.name, "foo");
    assert.equal(attrs.description, "A skill.");
    assert.equal(body, "# Foo");
  });

  it("handles missing frontmatter", () => {
    const { attrs, body } = parseFrontmatter("# Just a body\n");
    assert.deepEqual(attrs, {});
    assert.equal(body, "# Just a body");
  });

  it("tolerates malformed frontmatter", () => {
    const { attrs, body } = parseFrontmatter("---\n[not: yaml: at all\n---\nbody");
    assert.deepEqual(attrs, {});
    assert.equal(body, "body");
  });

  it("handles CRLF line endings", () => {
    const { attrs, body } = parseFrontmatter("---\r\nname: foo\r\n---\r\nbody\r\n");
    assert.equal(attrs.name, "foo");
    assert.equal(body, "body");
  });
});

describe("readSkillDir", () => {
  it("reads metadata, body, and all files", () => {
    writeSkill(tmp.path, "skills/reader", "reader", "# Reader\n\nRead things.");
    writeFile(tmp.path, "skills/reader/references/notes.md", "extra notes");
    const skill = readSkillDir(join(tmp.path, "skills/reader"), "reader");
    assert.equal(skill.name, "reader");
    assert.equal(skill.description, "Test skill reader.");
    assert.match(skill.body, /^# Reader/);
    assert.deepEqual(
      skill.files.map((f) => f.path),
      ["SKILL.md", "references/notes.md"]
    );
  });

  it("falls back to the given name when frontmatter has none", () => {
    writeFile(tmp.path, "skills/bare/SKILL.md", "# No frontmatter\n");
    const skill = readSkillDir(join(tmp.path, "skills/bare"), "bare");
    assert.equal(skill.name, "bare");
    assert.equal(skill.description, "");
  });

  it("throws for a missing directory", () => {
    assert.throws(() => readSkillDir(join(tmp.path, "nope"), "nope"), ResolveError);
  });

  it("throws when SKILL.md is missing", () => {
    writeFile(tmp.path, "skills/empty/readme.txt", "not a skill");
    assert.throws(() => readSkillDir(join(tmp.path, "skills/empty"), "empty"), ResolveError);
  });

  it("skips node_modules and .git", () => {
    writeSkill(tmp.path, "skills/clean", "clean");
    writeFile(tmp.path, "skills/clean/node_modules/x/package.json", "{}");
    writeFile(tmp.path, "skills/clean/.git/HEAD", "ref");
    const skill = readSkillDir(join(tmp.path, "skills/clean"), "clean");
    assert.deepEqual(
      skill.files.map((f) => f.path),
      ["SKILL.md"]
    );
  });
});

describe("readDirFiles", () => {
  it("returns empty for a missing directory", () => {
    assert.deepEqual(readDirFiles(join(tmp.path, "missing")), []);
  });
});

describe("computeIntegrity", () => {
  const files = [
    { path: "SKILL.md", content: Buffer.from("hello") },
    { path: "ref/a.md", content: Buffer.from("aaa") },
  ];

  it("is deterministic", () => {
    assert.equal(computeIntegrity(files), computeIntegrity(files));
    assert.match(computeIntegrity(files), /^sha256-[A-Za-z0-9+/]+=*$/);
  });

  it("is order-independent", () => {
    assert.equal(computeIntegrity(files), computeIntegrity([...files].reverse()));
  });

  it("changes when content changes", () => {
    const changed = [files[0], { path: "ref/a.md", content: Buffer.from("bbb") }];
    assert.notEqual(computeIntegrity(files), computeIntegrity(changed));
  });

  it("changes when a path changes", () => {
    const changed = [files[0], { path: "ref/b.md", content: Buffer.from("aaa") }];
    assert.notEqual(computeIntegrity(files), computeIntegrity(changed));
  });
});
