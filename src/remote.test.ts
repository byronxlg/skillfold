import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ConfigError, ResolveError } from "./errors.js";
import { fetchRemoteConfig, fetchRemoteSkill, getGitHubHeaders, parseGitHubUrl } from "./remote.js";

describe("getGitHubHeaders", () => {
  it("returns Authorization header when GITHUB_TOKEN is set", () => {
    const original = process.env.GITHUB_TOKEN;
    try {
      process.env.GITHUB_TOKEN = "ghp_test123";
      const headers = getGitHubHeaders();
      assert.deepEqual(headers, { Authorization: "token ghp_test123" });
    } finally {
      if (original === undefined) {
        delete process.env.GITHUB_TOKEN;
      } else {
        process.env.GITHUB_TOKEN = original;
      }
    }
  });

  it("returns empty headers when GITHUB_TOKEN is not set", () => {
    const original = process.env.GITHUB_TOKEN;
    try {
      delete process.env.GITHUB_TOKEN;
      const headers = getGitHubHeaders();
      assert.deepEqual(headers, {});
    } finally {
      if (original === undefined) {
        delete process.env.GITHUB_TOKEN;
      } else {
        process.env.GITHUB_TOKEN = original;
      }
    }
  });
});

describe("parseGitHubUrl", () => {
  it("parses a valid GitHub tree URL into parts", () => {
    const parts = parseGitHubUrl(
      "https://github.com/org/skills/tree/main/code-review"
    );
    assert.deepEqual(parts, {
      owner: "org",
      repo: "skills",
      ref: "main",
      path: "code-review",
    });
  });

  it("parses a URL with nested path", () => {
    const parts = parseGitHubUrl(
      "https://github.com/owner/repo/tree/v2.0/src/skills/review"
    );
    assert.deepEqual(parts, {
      owner: "owner",
      repo: "repo",
      ref: "v2.0",
      path: "src/skills/review",
    });
  });

  it("throws on a non-GitHub URL", () => {
    assert.throws(
      () => parseGitHubUrl("https://example.com/skill"),
      /URL does not match GitHub tree URL pattern/
    );
  });

  it("throws on a malformed GitHub URL with only owner", () => {
    assert.throws(
      () => parseGitHubUrl("https://github.com/only-owner"),
      /URL does not match GitHub tree URL pattern/
    );
  });

  it("throws on a GitHub URL missing tree segment", () => {
    assert.throws(
      () => parseGitHubUrl("https://github.com/owner/repo/blob/main/file.md"),
      /URL does not match GitHub tree URL pattern/
    );
  });

  it("throws on a GitHub URL with tree but no path after ref", () => {
    assert.throws(
      () => parseGitHubUrl("https://github.com/owner/repo/tree/main"),
      /URL does not match GitHub tree URL pattern/
    );
  });

  it("throws on a bare GitHub domain with no path segments", () => {
    assert.throws(
      () => parseGitHubUrl("https://github.com/"),
      /URL does not match GitHub tree URL pattern/
    );
  });

  it("throws on an HTTP (non-HTTPS) GitHub URL", () => {
    assert.throws(
      () => parseGitHubUrl("http://github.com/owner/repo/tree/main/skill"),
      /URL does not match GitHub tree URL pattern/
    );
  });

  it("parses a URL with a ref containing dots (e.g. tag)", () => {
    const parts = parseGitHubUrl(
      "https://github.com/org/repo/tree/v1.2.3/skills/shared"
    );
    assert.deepEqual(parts, {
      owner: "org",
      repo: "repo",
      ref: "v1.2.3",
      path: "skills/shared",
    });
  });
});

describe("fetchRemoteSkill", () => {
  it("rejects non-GitHub URLs with ResolveError", async () => {
    await assert.rejects(
      () => fetchRemoteSkill("my-skill", "https://example.com/skill"),
      (err: unknown) => {
        assert.ok(err instanceof ResolveError);
        assert.match(err.message, /Unsupported URL format/);
        assert.match(err.message, /my-skill/);
        return true;
      }
    );
  });

  it("rejects malformed GitHub URLs with ResolveError", async () => {
    await assert.rejects(
      () =>
        fetchRemoteSkill("bad-url", "https://github.com/only-owner"),
      (err: unknown) => {
        assert.ok(err instanceof ResolveError);
        assert.match(err.message, /Unsupported URL format/);
        assert.match(err.message, /bad-url/);
        return true;
      }
    );
  });

  it("rejects GitHub URL with owner/repo but no tree segment", async () => {
    await assert.rejects(
      () => fetchRemoteSkill("no-tree", "https://github.com/owner/repo"),
      (err: unknown) => {
        assert.ok(err instanceof ResolveError);
        assert.match(err.message, /Unsupported URL format/);
        assert.match(err.message, /no-tree/);
        return true;
      }
    );
  });

  it("fetches a real skill from GitHub (code-review)", async () => {
    const content = await fetchRemoteSkill(
      "code-review",
      "https://github.com/byronxlg/skillfold/tree/main/skills/code-review"
    );
    assert.ok(
      content.includes("Code Review"),
      "Fetched content should contain Code Review"
    );
  });
});

describe("fetchRemoteConfig", () => {
  it("rejects non-GitHub URLs with ConfigError", async () => {
    await assert.rejects(
      () => fetchRemoteConfig("https://example.com/config"),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError);
        assert.match(err.message, /Unsupported import URL format/);
        return true;
      }
    );
  });

  it("rejects malformed GitHub URLs with ConfigError", async () => {
    await assert.rejects(
      () => fetchRemoteConfig("https://github.com/owner-only"),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError);
        assert.match(err.message, /Unsupported import URL format/);
        return true;
      }
    );
  });
});
