import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseState } from "./state.js";
import type { SkillInfo } from "./state.js";
import { ConfigError } from "./errors.js";

const NO_SKILLS: Record<string, SkillInfo> = {};
const SOME_SKILLS: Record<string, SkillInfo> = { review: {}, lint: {}, format: {} };

describe("parseState", () => {
  describe("custom type definitions", () => {
    it("parses a valid custom type with multiple fields", () => {
      const raw = {
        FileInfo: {
          name: "string",
          size: "number",
          valid: "bool",
        },
      };
      const schema = parseState(raw, NO_SKILLS);
      assert.deepEqual(schema.types["FileInfo"], {
        fields: { name: "string", size: "number", valid: "bool" },
      });
      assert.deepEqual(schema.fields, {});
    });

    it("rejects custom type with no fields", () => {
      const raw = {
        Empty: {},
      };
      assert.throws(
        () => parseState(raw, NO_SKILLS),
        (err: unknown) => {
          assert.ok(err instanceof ConfigError);
          assert.match(err.message, /State type "Empty": must define at least one field/);
          return true;
        }
      );
    });

    it("rejects custom type with invalid field type", () => {
      const raw = {
        Bad: {
          name: "string",
          data: "object",
        },
      };
      assert.throws(
        () => parseState(raw, NO_SKILLS),
        (err: unknown) => {
          assert.ok(err instanceof ConfigError);
          assert.match(
            err.message,
            /State type "Bad": field "data" has invalid type "object" \(expected string, bool, or number\)/
          );
          return true;
        }
      );
    });

    it("rejects custom type name shadowing primitive 'string'", () => {
      const raw = {
        string: { value: "number" },
      };
      assert.throws(
        () => parseState(raw, NO_SKILLS),
        (err: unknown) => {
          assert.ok(err instanceof ConfigError);
          assert.match(err.message, /State type "string": cannot redefine primitive type/);
          return true;
        }
      );
    });

    it("rejects custom type name shadowing primitive 'bool'", () => {
      const raw = {
        bool: { flag: "string" },
      };
      assert.throws(
        () => parseState(raw, NO_SKILLS),
        (err: unknown) => {
          assert.ok(err instanceof ConfigError);
          assert.match(err.message, /State type "bool": cannot redefine primitive type/);
          return true;
        }
      );
    });

    it("rejects custom type name shadowing primitive 'number'", () => {
      const raw = {
        number: { val: "string" },
      };
      assert.throws(
        () => parseState(raw, NO_SKILLS),
        (err: unknown) => {
          assert.ok(err instanceof ConfigError);
          assert.match(err.message, /State type "number": cannot redefine primitive type/);
          return true;
        }
      );
    });
  });

  describe("state fields with primitive types", () => {
    it("parses a field with type 'string'", () => {
      const raw = {
        username: { type: "string" },
      };
      const schema = parseState(raw, NO_SKILLS);
      assert.deepEqual(schema.fields["username"], {
        type: { kind: "primitive", value: "string" },
      });
    });

    it("parses a field with type 'bool'", () => {
      const raw = {
        active: { type: "bool" },
      };
      const schema = parseState(raw, NO_SKILLS);
      assert.deepEqual(schema.fields["active"], {
        type: { kind: "primitive", value: "bool" },
      });
    });

    it("parses a field with type 'number'", () => {
      const raw = {
        count: { type: "number" },
      };
      const schema = parseState(raw, NO_SKILLS);
      assert.deepEqual(schema.fields["count"], {
        type: { kind: "primitive", value: "number" },
      });
    });
  });

  describe("state fields with list type", () => {
    it("parses list<CustomType> when type is defined", () => {
      const raw = {
        Issue: {
          title: "string",
          priority: "number",
        },
        issues: { type: "list<Issue>" },
      };
      const schema = parseState(raw, NO_SKILLS);
      assert.deepEqual(schema.fields["issues"], {
        type: { kind: "list", element: "Issue" },
      });
    });

    it("rejects list with unknown element type", () => {
      const raw = {
        items: { type: "list<Unknown>" },
      };
      assert.throws(
        () => parseState(raw, NO_SKILLS),
        (err: unknown) => {
          assert.ok(err instanceof ConfigError);
          assert.match(err.message, /State field "items": unknown type "Unknown"/);
          return true;
        }
      );
    });

    it("rejects malformed list<> with empty angle brackets", () => {
      const raw = {
        items: { type: "list<>" },
      };
      assert.throws(
        () => parseState(raw, NO_SKILLS),
        (err: unknown) => {
          assert.ok(err instanceof ConfigError);
          assert.match(
            err.message,
            /State field "items": invalid type "list<>" \(expected list<TypeName>\)/
          );
          return true;
        }
      );
    });
  });

  describe("state fields with custom type reference", () => {
    it("parses a field referencing a defined custom type", () => {
      const raw = {
        FileInfo: {
          name: "string",
          size: "number",
        },
        currentFile: { type: "FileInfo" },
      };
      const schema = parseState(raw, NO_SKILLS);
      assert.deepEqual(schema.fields["currentFile"], {
        type: { kind: "custom", name: "FileInfo" },
      });
    });

    it("rejects a field referencing an unknown type", () => {
      const raw = {
        currentFile: { type: "FileInfo" },
      };
      assert.throws(
        () => parseState(raw, NO_SKILLS),
        (err: unknown) => {
          assert.ok(err instanceof ConfigError);
          assert.match(err.message, /State field "currentFile": unknown type "FileInfo"/);
          return true;
        }
      );
    });
  });

  describe("state field type validation", () => {
    it("rejects non-string type value", () => {
      const raw = {
        broken: { type: 42 },
      };
      assert.throws(
        () => parseState(raw, NO_SKILLS),
        (err: unknown) => {
          assert.ok(err instanceof ConfigError);
          assert.match(err.message, /State field "broken": type must be a string/);
          return true;
        }
      );
    });
  });

  describe("location validation", () => {
    it("parses valid location with skill and path", () => {
      const raw = {
        output: {
          type: "string",
          location: { skill: "review", path: "output.md" },
        },
      };
      const schema = parseState(raw, SOME_SKILLS);
      assert.deepEqual(schema.fields["output"], {
        type: { kind: "primitive", value: "string" },
        location: { skill: "review", path: "output.md" },
      });
    });

    it("parses location with optional kind field", () => {
      const raw = {
        output: {
          type: "string",
          location: { skill: "lint", path: "report.json", kind: "artifact" },
        },
      };
      const schema = parseState(raw, SOME_SKILLS);
      assert.deepEqual(schema.fields["output"]!.location, {
        skill: "lint",
        path: "report.json",
        kind: "artifact",
      });
    });

    it("rejects location that is not an object", () => {
      const raw = {
        output: {
          type: "string",
          location: "review:output.md",
        },
      };
      assert.throws(
        () => parseState(raw, SOME_SKILLS),
        (err: unknown) => {
          assert.ok(err instanceof ConfigError);
          assert.match(err.message, /State field "output": location must be an object/);
          return true;
        }
      );
    });

    it("rejects location missing skill field", () => {
      const raw = {
        output: {
          type: "string",
          location: { path: "output.md" },
        },
      };
      assert.throws(
        () => parseState(raw, SOME_SKILLS),
        (err: unknown) => {
          assert.ok(err instanceof ConfigError);
          assert.match(err.message, /State field "output": location must have a "skill" field/);
          return true;
        }
      );
    });

    it("rejects location missing path field", () => {
      const raw = {
        output: {
          type: "string",
          location: { skill: "review" },
        },
      };
      assert.throws(
        () => parseState(raw, SOME_SKILLS),
        (err: unknown) => {
          assert.ok(err instanceof ConfigError);
          assert.match(err.message, /State field "output": location must have a "path" field/);
          return true;
        }
      );
    });

    it("rejects location referencing unknown skill", () => {
      const raw = {
        output: {
          type: "string",
          location: { skill: "nonexistent", path: "output.md" },
        },
      };
      assert.throws(
        () => parseState(raw, SOME_SKILLS),
        (err: unknown) => {
          assert.ok(err instanceof ConfigError);
          assert.match(
            err.message,
            /State field "output": location references unknown skill "nonexistent"/
          );
          return true;
        }
      );
    });
  });

  describe("mixed config: custom types + state fields", () => {
    it("parses types and fields together", () => {
      const raw = {
        Issue: {
          title: "string",
          priority: "number",
        },
        Reviewer: {
          name: "string",
          approved: "bool",
        },
        issues: { type: "list<Issue>" },
        currentReviewer: { type: "Reviewer" },
        status: { type: "string" },
        report: {
          type: "string",
          location: { skill: "review", path: "report.md" },
        },
      };
      const schema = parseState(raw, SOME_SKILLS);

      assert.deepEqual(Object.keys(schema.types).sort(), ["Issue", "Reviewer"]);
      assert.deepEqual(Object.keys(schema.fields).sort(), [
        "currentReviewer",
        "issues",
        "report",
        "status",
      ]);

      assert.deepEqual(schema.types["Issue"], {
        fields: { title: "string", priority: "number" },
      });
      assert.deepEqual(schema.fields["issues"], {
        type: { kind: "list", element: "Issue" },
      });
      assert.deepEqual(schema.fields["currentReviewer"], {
        type: { kind: "custom", name: "Reviewer" },
      });
      assert.deepEqual(schema.fields["status"], {
        type: { kind: "primitive", value: "string" },
      });
      assert.deepEqual(schema.fields["report"], {
        type: { kind: "primitive", value: "string" },
        location: { skill: "review", path: "report.md" },
      });
    });
  });

  describe("ambiguous entries", () => {
    it("entry with non-object non-null value is ignored (no types or fields)", () => {
      const raw = {
        something: "not-an-object",
      };
      const schema = parseState(raw, NO_SKILLS);
      assert.deepEqual(schema.types, {});
      assert.deepEqual(schema.fields, {});
    });

    it("entry with type key set to non-string produces clear error", () => {
      const raw = {
        broken: { type: true },
      };
      assert.throws(
        () => parseState(raw, NO_SKILLS),
        (err: unknown) => {
          assert.ok(err instanceof ConfigError);
          assert.match(err.message, /State field "broken": type must be a string/);
          return true;
        }
      );
    });
  });

  describe("empty state", () => {
    it("empty object produces empty schema", () => {
      const schema = parseState({}, NO_SKILLS);
      assert.deepEqual(schema.types, {});
      assert.deepEqual(schema.fields, {});
    });
  });

  describe("list of primitives", () => {
    it("rejects list<string> since element must be a custom type", () => {
      const raw = {
        names: { type: "list<string>" },
      };
      assert.throws(
        () => parseState(raw, NO_SKILLS),
        (err: unknown) => {
          assert.ok(err instanceof ConfigError);
          assert.match(err.message, /unknown type "string"/);
          return true;
        }
      );
    });
  });

  describe("field missing type key", () => {
    it("entry with object but no type key is treated as custom type definition", () => {
      const raw = {
        MyType: { name: "string", age: "number" },
      };
      const schema = parseState(raw, NO_SKILLS);
      assert.ok("MyType" in schema.types);
      assert.deepEqual(schema.types["MyType"].fields, { name: "string", age: "number" });
    });
  });

  describe("non-string field values in custom type", () => {
    it("rejects custom type field with non-string type value", () => {
      const raw = {
        BadType: { name: 42 },
      };
      assert.throws(
        () => parseState(raw, NO_SKILLS),
        (err: unknown) => {
          assert.ok(err instanceof ConfigError);
          return true;
        }
      );
    });
  });

  describe("location with unknown extra keys", () => {
    it("parses location even with extra keys (only skill, path, kind used)", () => {
      const raw = {
        output: {
          type: "string",
          location: { skill: "review", path: "out.md", kind: "artifact", extra: "ignored" },
        },
      };
      const schema = parseState(raw, SOME_SKILLS);
      assert.deepEqual(schema.fields["output"]!.location, {
        skill: "review",
        path: "out.md",
        kind: "artifact",
      });
    });
  });

  describe("did-you-mean suggestions", () => {
    it("suggests close match for unknown custom type reference", () => {
      const raw = {
        FileInfo: { name: "string", size: "number" },
        currentFile: { type: "FileInf" },
      };
      assert.throws(
        () => parseState(raw, NO_SKILLS),
        (err: unknown) => {
          assert.ok(err instanceof ConfigError);
          assert.match(err.message, /unknown type "FileInf"/);
          assert.match(err.message, /Did you mean "FileInfo"\?/);
          return true;
        }
      );
    });

    it("suggests close match for unknown list element type", () => {
      const raw = {
        Issue: { title: "string", priority: "number" },
        items: { type: "list<Issu>" },
      };
      assert.throws(
        () => parseState(raw, NO_SKILLS),
        (err: unknown) => {
          assert.ok(err instanceof ConfigError);
          assert.match(err.message, /unknown type "Issu"/);
          assert.match(err.message, /Did you mean "Issue"\?/);
          return true;
        }
      );
    });

    it("suggests primitive type for close misspelling", () => {
      const raw = {
        count: { type: "nubmer" },
      };
      assert.throws(
        () => parseState(raw, NO_SKILLS),
        (err: unknown) => {
          assert.ok(err instanceof ConfigError);
          assert.match(err.message, /unknown type "nubmer"/);
          assert.match(err.message, /Did you mean "number"\?/);
          return true;
        }
      );
    });

    it("omits suggestion when no close match exists", () => {
      const raw = {
        data: { type: "CompletelyWrong" },
      };
      assert.throws(
        () => parseState(raw, NO_SKILLS),
        (err: unknown) => {
          assert.ok(err instanceof ConfigError);
          assert.match(err.message, /unknown type "CompletelyWrong"/);
          assert.ok(!err.message.includes("Did you mean"), "should not suggest when no close match");
          return true;
        }
      );
    });
  });

  describe("resource namespace validation (#277)", () => {
    it("accepts location path matching a declared namespace", () => {
      const skills: Record<string, SkillInfo> = {
        github: {
          resources: {
            discussions: "https://github.com/owner/repo/discussions",
            issues: "https://github.com/owner/repo/issues",
          },
        },
      };
      const raw = {
        direction: {
          type: "string",
          location: { skill: "github", path: "discussions/general" },
        },
      };
      const schema = parseState(raw, skills);
      assert.deepEqual(schema.fields["direction"]!.location, {
        skill: "github",
        path: "discussions/general",
      });
    });

    it("accepts location path that is just a namespace with no sub-path", () => {
      const skills: Record<string, SkillInfo> = {
        github: {
          resources: {
            issues: "https://github.com/owner/repo/issues",
          },
        },
      };
      const raw = {
        tasks: {
          type: "string",
          location: { skill: "github", path: "issues" },
        },
      };
      const schema = parseState(raw, skills);
      assert.deepEqual(schema.fields["tasks"]!.location, {
        skill: "github",
        path: "issues",
      });
    });

    it("rejects location path not matching any declared namespace", () => {
      const skills: Record<string, SkillInfo> = {
        github: {
          resources: {
            discussions: "https://github.com/owner/repo/discussions",
            issues: "https://github.com/owner/repo/issues",
          },
        },
      };
      const raw = {
        data: {
          type: "string",
          location: { skill: "github", path: "wiki/page" },
        },
      };
      assert.throws(
        () => parseState(raw, skills),
        (err: unknown) => {
          assert.ok(err instanceof ConfigError);
          assert.match(err.message, /location path "wiki\/page" references namespace "wiki"/);
          assert.match(err.message, /not declared by skill "github"/);
          assert.match(err.message, /Declared namespaces: discussions, issues/);
          return true;
        }
      );
    });

    it("includes didYouMean hint for close namespace name", () => {
      const skills: Record<string, SkillInfo> = {
        github: {
          resources: {
            discussions: "https://github.com/owner/repo/discussions",
            issues: "https://github.com/owner/repo/issues",
          },
        },
      };
      const raw = {
        data: {
          type: "string",
          location: { skill: "github", path: "discussons/general" },
        },
      };
      assert.throws(
        () => parseState(raw, skills),
        (err: unknown) => {
          assert.ok(err instanceof ConfigError);
          assert.match(err.message, /namespace "discussons"/);
          assert.match(err.message, /Did you mean "discussions"\?/);
          return true;
        }
      );
    });

    it("skill with no resources accepts any path (backward compat)", () => {
      const skills: Record<string, SkillInfo> = {
        slack: {},
      };
      const raw = {
        goal: {
          type: "string",
          location: { skill: "slack", path: "any/path/here" },
        },
      };
      const schema = parseState(raw, skills);
      assert.deepEqual(schema.fields["goal"]!.location, {
        skill: "slack",
        path: "any/path/here",
      });
    });

    it("skill with undefined resources accepts any path (backward compat)", () => {
      const skills: Record<string, SkillInfo> = {
        slack: { resources: undefined },
      };
      const raw = {
        goal: {
          type: "string",
          location: { skill: "slack", path: "channel/general" },
        },
      };
      const schema = parseState(raw, skills);
      assert.deepEqual(schema.fields["goal"]!.location, {
        skill: "slack",
        path: "channel/general",
      });
    });
  });

  describe("implicit location warning (#278)", () => {
    it("emits warning for skill with no resources but config remains valid", () => {
      const skills: Record<string, SkillInfo> = {
        slack: {},
      };
      const raw = {
        goal: {
          type: "string",
          location: { skill: "slack", path: "channel" },
        },
      };
      // The config should still parse without error
      const schema = parseState(raw, skills);
      assert.deepEqual(schema.fields["goal"]!.location, {
        skill: "slack",
        path: "channel",
      });
    });

    it("does not emit warning for skill with resources", () => {
      const skills: Record<string, SkillInfo> = {
        github: {
          resources: {
            issues: "https://github.com/owner/repo/issues",
          },
        },
      };
      const raw = {
        tasks: {
          type: "string",
          location: { skill: "github", path: "issues" },
        },
      };
      // Should parse without warning (resources declared)
      const schema = parseState(raw, skills);
      assert.ok(schema.fields["tasks"]!.location);
    });
  });
});
