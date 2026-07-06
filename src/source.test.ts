import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SourceError } from "./errors.js";
import {
  defaultSkillName,
  extractRef,
  formatSource,
  isCommitSha,
  isFullSha,
  parseSource,
} from "./source.js";

describe("extractRef", () => {
  it("splits a trailing @ref", () => {
    assert.deepEqual(extractRef("github:o/r/path@v1.2.0"), ["github:o/r/path", "v1.2.0"]);
  });

  it("returns undefined when there is no ref", () => {
    assert.deepEqual(extractRef("github:o/r/path"), ["github:o/r/path", undefined]);
  });

  it("does not split @ in earlier segments", () => {
    assert.deepEqual(extractRef("npm:@scope/pkg"), ["npm:@scope/pkg", undefined]);
  });

  it("does not treat a leading @ in the tail as a ref", () => {
    assert.deepEqual(extractRef("@scope"), ["@scope", undefined]);
  });

  it("splits versions on scoped packages", () => {
    assert.deepEqual(extractRef("npm:@scope/pkg@2.0.0"), ["npm:@scope/pkg", "2.0.0"]);
  });

  it("rejects an empty ref", () => {
    assert.throws(() => extractRef("github:o/r/path@"), SourceError);
  });
});

describe("parseSource: local", () => {
  it("parses relative paths", () => {
    assert.deepEqual(parseSource("./skills/foo"), { kind: "local", path: "./skills/foo" });
  });

  it("parses bare paths", () => {
    assert.deepEqual(parseSource("skills/foo"), { kind: "local", path: "skills/foo" });
  });

  it("parses parent-relative paths", () => {
    assert.equal(parseSource("../shared/foo").kind, "local");
  });

  it("rejects unknown schemes", () => {
    assert.throws(() => parseSource("gitlab:o/r/path"), SourceError);
  });

  it("rejects empty strings", () => {
    assert.throws(() => parseSource("  "), SourceError);
  });
});

describe("parseSource: github", () => {
  it("parses the shorthand", () => {
    assert.deepEqual(parseSource("github:anthropics/skills/code-review"), {
      kind: "github",
      owner: "anthropics",
      repo: "skills",
      path: "code-review",
      ref: undefined,
    });
  });

  it("parses deep paths with refs", () => {
    assert.deepEqual(parseSource("github:o/r/a/b/c@v2"), {
      kind: "github",
      owner: "o",
      repo: "r",
      path: "a/b/c",
      ref: "v2",
    });
  });

  it("parses repo-root skills", () => {
    assert.deepEqual(parseSource("github:o/r@main"), {
      kind: "github",
      owner: "o",
      repo: "r",
      path: "",
      ref: "main",
    });
  });

  it("parses tree URLs", () => {
    assert.deepEqual(parseSource("https://github.com/o/r/tree/main/skills/foo"), {
      kind: "github",
      owner: "o",
      repo: "r",
      path: "skills/foo",
      ref: "main",
    });
  });

  it("lets @ref pins override the tree URL ref", () => {
    const source = parseSource("https://github.com/o/r/tree/main/skills/foo@v3");
    assert.equal(source.kind === "github" && source.ref, "v3");
  });

  it("rejects non-tree URLs", () => {
    assert.throws(() => parseSource("https://github.com/o/r"), SourceError);
  });

  it("rejects owner-only shorthand", () => {
    assert.throws(() => parseSource("github:owner-only"), SourceError);
  });
});

describe("parseSource: npm", () => {
  it("parses bare packages", () => {
    assert.deepEqual(parseSource("npm:my-skill"), {
      kind: "npm",
      pkg: "my-skill",
      subpath: undefined,
      version: undefined,
    });
  });

  it("parses package + skill", () => {
    assert.deepEqual(parseSource("npm:skillfold/planning"), {
      kind: "npm",
      pkg: "skillfold",
      subpath: "planning",
      version: undefined,
    });
  });

  it("parses versions", () => {
    assert.deepEqual(parseSource("npm:skillfold/planning@1.2.3"), {
      kind: "npm",
      pkg: "skillfold",
      subpath: "planning",
      version: "1.2.3",
    });
  });

  it("parses scoped packages with skill and version", () => {
    assert.deepEqual(parseSource("npm:@scope/pkg/skills/foo@0.1.0"), {
      kind: "npm",
      pkg: "@scope/pkg",
      subpath: "skills/foo",
      version: "0.1.0",
    });
  });

  it("rejects a bare scope", () => {
    assert.throws(() => parseSource("npm:@scope"), SourceError);
    assert.throws(() => parseSource("npm:"), SourceError);
  });
});

describe("formatSource", () => {
  const cases = [
    "./skills/foo",
    "github:o/r/a/b@v1",
    "github:o/r@main",
    "npm:skillfold/planning@1.2.3",
    "npm:@scope/pkg/foo",
    "npm:pkg",
  ];
  for (const raw of cases) {
    it(`roundtrips ${raw}`, () => {
      assert.equal(formatSource(parseSource(raw)), raw);
    });
  }

  it("canonicalizes tree URLs to the shorthand", () => {
    assert.equal(
      formatSource(parseSource("https://github.com/o/r/tree/main/skills/foo")),
      "github:o/r/skills/foo@main"
    );
  });
});

describe("defaultSkillName", () => {
  it("uses the last path segment for local sources", () => {
    assert.equal(defaultSkillName(parseSource("./skills/code-review")), "code-review");
  });

  it("uses the last path segment for github sources", () => {
    assert.equal(defaultSkillName(parseSource("github:o/r/skills/planning@v1")), "planning");
  });

  it("falls back to the repo name for repo-root skills", () => {
    assert.equal(defaultSkillName(parseSource("github:o/my-skill")), "my-skill");
  });

  it("uses the subpath for npm sources", () => {
    assert.equal(defaultSkillName(parseSource("npm:skillfold/planning")), "planning");
  });

  it("strips the scope for bare scoped packages", () => {
    assert.equal(defaultSkillName(parseSource("npm:@scope/tdd-skill")), "tdd-skill");
  });
});

describe("sha helpers", () => {
  it("recognizes shas", () => {
    assert.equal(isCommitSha("8f3a9c1"), true);
    assert.equal(isCommitSha("v1.2.3"), false);
    assert.equal(isFullSha("8f3a9c1"), false);
    assert.equal(isFullSha("a".repeat(40)), true);
  });
});
