import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ConfigError } from "./errors.js";
import {
  getIntegration,
  INTEGRATION_NAMES,
  isIntegrationLocation,
  parseIntegrationLocation,
  renderIntegrationInstructions,
  resolveIntegrationUrl,
} from "./integrations.js";

describe("INTEGRATION_NAMES", () => {
  it("contains the three GitHub integration types", () => {
    assert.ok(INTEGRATION_NAMES.has("github-issues"));
    assert.ok(INTEGRATION_NAMES.has("github-discussions"));
    assert.ok(INTEGRATION_NAMES.has("github-pull-requests"));
  });

  it("has exactly 3 integrations", () => {
    assert.equal(INTEGRATION_NAMES.size, 3);
  });
});

describe("getIntegration", () => {
  it("returns integration type for known names", () => {
    assert.ok(getIntegration("github-issues"));
    assert.ok(getIntegration("github-discussions"));
    assert.ok(getIntegration("github-pull-requests"));
  });

  it("returns undefined for unknown names", () => {
    assert.equal(getIntegration("github-wikis"), undefined);
    assert.equal(getIntegration("slack"), undefined);
  });
});

describe("isIntegrationLocation", () => {
  it("detects github-issues location", () => {
    assert.ok(isIntegrationLocation({
      "github-issues": { repo: "org/repo" },
    }));
  });

  it("detects github-discussions location", () => {
    assert.ok(isIntegrationLocation({
      "github-discussions": { repo: "org/repo", category: "general" },
    }));
  });

  it("detects github-pull-requests location", () => {
    assert.ok(isIntegrationLocation({
      "github-pull-requests": { repo: "org/repo" },
    }));
  });

  it("detects integration location with kind key", () => {
    assert.ok(isIntegrationLocation({
      "github-issues": { repo: "org/repo" },
      kind: "artifact",
    }));
  });

  it("rejects location with skill key (traditional format)", () => {
    assert.ok(!isIntegrationLocation({
      skill: "github",
      path: "issues",
    }));
  });

  it("rejects location with unknown integration name", () => {
    assert.ok(!isIntegrationLocation({
      "github-wikis": { repo: "org/repo" },
    }));
  });

  it("rejects location with both skill and integration keys", () => {
    assert.ok(!isIntegrationLocation({
      skill: "github",
      "github-issues": { repo: "org/repo" },
    }));
  });

  it("rejects empty location", () => {
    assert.ok(!isIntegrationLocation({}));
  });
});

describe("parseIntegrationLocation", () => {
  describe("github-issues", () => {
    it("parses with required repo field", () => {
      const result = parseIntegrationLocation("tasks", {
        "github-issues": { repo: "org/repo" },
      });
      assert.deepEqual(result, {
        type: "github-issues",
        config: { repo: "org/repo" },
      });
    });

    it("parses with optional label field", () => {
      const result = parseIntegrationLocation("tasks", {
        "github-issues": { repo: "org/repo", label: "task" },
      });
      assert.deepEqual(result, {
        type: "github-issues",
        config: { repo: "org/repo", label: "task" },
      });
    });

    it("parses with optional assignee field", () => {
      const result = parseIntegrationLocation("tasks", {
        "github-issues": { repo: "org/repo", assignee: "alice" },
      });
      assert.deepEqual(result, {
        type: "github-issues",
        config: { repo: "org/repo", assignee: "alice" },
      });
    });

    it("parses with all fields", () => {
      const result = parseIntegrationLocation("tasks", {
        "github-issues": { repo: "org/repo", label: "bug", assignee: "bob" },
      });
      assert.deepEqual(result, {
        type: "github-issues",
        config: { repo: "org/repo", label: "bug", assignee: "bob" },
      });
    });

    it("rejects missing repo", () => {
      assert.throws(
        () => parseIntegrationLocation("tasks", {
          "github-issues": { label: "task" },
        }),
        (err: unknown) => {
          assert.ok(err instanceof ConfigError);
          assert.match(err.message, /github-issues requires a "repo" field/);
          return true;
        },
      );
    });

    it("rejects non-string repo", () => {
      assert.throws(
        () => parseIntegrationLocation("tasks", {
          "github-issues": { repo: 123 },
        }),
        (err: unknown) => {
          assert.ok(err instanceof ConfigError);
          assert.match(err.message, /github-issues requires a "repo" field/);
          return true;
        },
      );
    });

    it("rejects unknown fields", () => {
      assert.throws(
        () => parseIntegrationLocation("tasks", {
          "github-issues": { repo: "org/repo", unknown: "value" },
        }),
        (err: unknown) => {
          assert.ok(err instanceof ConfigError);
          assert.match(err.message, /github-issues has unknown field "unknown"/);
          return true;
        },
      );
    });
  });

  describe("github-discussions", () => {
    it("parses with required repo field", () => {
      const result = parseIntegrationLocation("direction", {
        "github-discussions": { repo: "org/repo" },
      });
      assert.deepEqual(result, {
        type: "github-discussions",
        config: { repo: "org/repo" },
      });
    });

    it("parses with optional category field", () => {
      const result = parseIntegrationLocation("direction", {
        "github-discussions": { repo: "org/repo", category: "strategy" },
      });
      assert.deepEqual(result, {
        type: "github-discussions",
        config: { repo: "org/repo", category: "strategy" },
      });
    });

    it("rejects unknown fields", () => {
      assert.throws(
        () => parseIntegrationLocation("direction", {
          "github-discussions": { repo: "org/repo", filter: "recent" },
        }),
        (err: unknown) => {
          assert.ok(err instanceof ConfigError);
          assert.match(err.message, /github-discussions has unknown field "filter"/);
          return true;
        },
      );
    });
  });

  describe("github-pull-requests", () => {
    it("parses with required repo field", () => {
      const result = parseIntegrationLocation("review", {
        "github-pull-requests": { repo: "org/repo" },
      });
      assert.deepEqual(result, {
        type: "github-pull-requests",
        config: { repo: "org/repo" },
      });
    });

    it("parses with optional state field", () => {
      const result = parseIntegrationLocation("review", {
        "github-pull-requests": { repo: "org/repo", state: "open" },
      });
      assert.deepEqual(result, {
        type: "github-pull-requests",
        config: { repo: "org/repo", state: "open" },
      });
    });

    it("rejects unknown fields", () => {
      assert.throws(
        () => parseIntegrationLocation("review", {
          "github-pull-requests": { repo: "org/repo", branch: "main" },
        }),
        (err: unknown) => {
          assert.ok(err instanceof ConfigError);
          assert.match(err.message, /github-pull-requests has unknown field "branch"/);
          return true;
        },
      );
    });
  });

  it("rejects non-object integration config", () => {
    assert.throws(
      () => parseIntegrationLocation("tasks", {
        "github-issues": "org/repo",
      }),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError);
        assert.match(err.message, /github-issues config must be an object/);
        return true;
      },
    );
  });

  it("rejects non-string optional field value", () => {
    assert.throws(
      () => parseIntegrationLocation("tasks", {
        "github-issues": { repo: "org/repo", label: 42 },
      }),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError);
        assert.match(err.message, /github-issues field "label" must be a string/);
        return true;
      },
    );
  });
});

describe("resolveIntegrationUrl", () => {
  it("resolves github-issues URL", () => {
    assert.equal(
      resolveIntegrationUrl({ type: "github-issues", config: { repo: "org/repo" } }),
      "https://github.com/org/repo/issues",
    );
  });

  it("resolves github-discussions URL", () => {
    assert.equal(
      resolveIntegrationUrl({ type: "github-discussions", config: { repo: "org/repo" } }),
      "https://github.com/org/repo/discussions",
    );
  });

  it("resolves github-pull-requests URL", () => {
    assert.equal(
      resolveIntegrationUrl({ type: "github-pull-requests", config: { repo: "org/repo" } }),
      "https://github.com/org/repo/pulls",
    );
  });
});

describe("renderIntegrationInstructions", () => {
  it("renders github-issues with no filters", () => {
    assert.equal(
      renderIntegrationInstructions({ type: "github-issues", config: { repo: "org/repo" } }),
      "GitHub issues in org/repo",
    );
  });

  it("renders github-issues with label", () => {
    assert.equal(
      renderIntegrationInstructions({
        type: "github-issues",
        config: { repo: "org/repo", label: "task" },
      }),
      'GitHub issues in org/repo, labeled "task"',
    );
  });

  it("renders github-issues with assignee", () => {
    assert.equal(
      renderIntegrationInstructions({
        type: "github-issues",
        config: { repo: "org/repo", assignee: "alice" },
      }),
      "GitHub issues in org/repo, assigned to alice",
    );
  });

  it("renders github-issues with all filters", () => {
    assert.equal(
      renderIntegrationInstructions({
        type: "github-issues",
        config: { repo: "org/repo", label: "bug", assignee: "bob" },
      }),
      'GitHub issues in org/repo, labeled "bug", assigned to bob',
    );
  });

  it("renders github-discussions with no category", () => {
    assert.equal(
      renderIntegrationInstructions({
        type: "github-discussions",
        config: { repo: "org/repo" },
      }),
      "GitHub discussions in org/repo",
    );
  });

  it("renders github-discussions with category", () => {
    assert.equal(
      renderIntegrationInstructions({
        type: "github-discussions",
        config: { repo: "org/repo", category: "strategy" },
      }),
      'GitHub discussions in org/repo, category "strategy"',
    );
  });

  it("renders github-pull-requests with no state filter", () => {
    assert.equal(
      renderIntegrationInstructions({
        type: "github-pull-requests",
        config: { repo: "org/repo" },
      }),
      "GitHub pull requests in org/repo",
    );
  });

  it("renders github-pull-requests with state filter", () => {
    assert.equal(
      renderIntegrationInstructions({
        type: "github-pull-requests",
        config: { repo: "org/repo", state: "open" },
      }),
      "GitHub pull requests in org/repo, state: open",
    );
  });
});
