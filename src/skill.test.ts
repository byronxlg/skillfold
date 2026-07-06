import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { after, describe, it } from "node:test";
import { join } from "node:path";

import { ResolveError } from "./errors.js";
import {
  computeIntegrity,
  normalizeSkillName,
  parseAllowedTools,
  parseFrontmatter,
  readDirFiles,
  readSkillDir,
  renameSkill,
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

describe("parseAllowedTools", () => {
  it("parses a comma-separated string", () => {
    assert.deepEqual(
      parseAllowedTools({ "allowed-tools": "Read, Grep,Bash(git:*)" }),
      ["Read", "Grep", "Bash(git:*)"]
    );
  });

  it("parses a list of strings", () => {
    assert.deepEqual(parseAllowedTools({ "allowed-tools": ["Read", "Grep"] }), [
      "Read",
      "Grep",
    ]);
  });

  it("returns undefined when absent, empty, or malformed", () => {
    assert.equal(parseAllowedTools({}), undefined);
    assert.equal(parseAllowedTools({ "allowed-tools": " , " }), undefined);
    assert.equal(parseAllowedTools({ "allowed-tools": 42 }), undefined);
  });
});

describe("normalizeSkillName", () => {
  const skillMd = (text: string) => [{ path: "SKILL.md", content: Buffer.from(text) }];

  it("rewrites only the name line", () => {
    const files = skillMd(
      "---\nname: old-name\ndescription: Desc.\nallowed-tools: Read\n---\n\n# Body\n"
    );
    const out = normalizeSkillName(files, "new-name");
    assert.equal(
      out[0].content.toString(),
      "---\nname: new-name\ndescription: Desc.\nallowed-tools: Read\n---\n\n# Body\n"
    );
  });

  it("inserts a name line when the frontmatter has none", () => {
    const files = skillMd("---\ndescription: Desc.\n---\n\n# Body\n");
    const out = normalizeSkillName(files, "fresh");
    const { attrs } = parseFrontmatter(out[0].content.toString());
    assert.equal(attrs.name, "fresh");
    assert.equal(attrs.description, "Desc.");
  });

  it("returns the files untouched when the name already matches", () => {
    const files = skillMd("---\nname: same\ndescription: D.\n---\n\n# B\n");
    assert.equal(normalizeSkillName(files, "same"), files);
  });

  it("leaves files without frontmatter alone", () => {
    const files = skillMd("# Just a body\n");
    assert.equal(normalizeSkillName(files, "anything"), files);
  });

  it("does not touch supporting files", () => {
    const files = [
      { path: "SKILL.md", content: Buffer.from("---\nname: a\n---\n\nx\n") },
      { path: "references/notes.md", content: Buffer.from("name: a\n") },
    ];
    const out = normalizeSkillName(files, "b");
    assert.equal(out[1].content.toString(), "name: a\n");
    const { attrs } = parseFrontmatter(out[0].content.toString());
    assert.equal(attrs.name, "b");
  });
});

describe("renameSkill", () => {
  it("re-derives metadata from the rewritten SKILL.md", () => {
    const dir = join(tmp.path, "rename-me");
    writeFile(tmp.path, "rename-me/SKILL.md", "---\nname: old\ndescription: D.\n---\n\n# B\n");
    const skill = readSkillDir(dir, "old");
    const renamed = renameSkill(skill, "brand-new");
    assert.equal(renamed.name, "brand-new");
    assert.equal(renamed.attrs.name, "brand-new");
    assert.equal(renamed.description, "D.");
    assert.notEqual(computeIntegrity(renamed.files), computeIntegrity(skill.files));
  });

  it("is a no-op when the name matches", () => {
    const dir = join(tmp.path, "keep-me");
    writeFile(tmp.path, "keep-me/SKILL.md", "---\nname: keep-me\ndescription: D.\n---\n\nx\n");
    const skill = readSkillDir(dir, "keep-me");
    assert.equal(renameSkill(skill, "keep-me"), skill);
  });
});
