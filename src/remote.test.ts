import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ConfigError, ResolveError } from "./errors.js";
import { extractPinnedRef, fetchRemoteConfig, fetchRemoteSkill, getGitHubHeaders, parseGitHubUrl } from "./remote.js";

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

describe("extractPinnedRef", () => {
  it("returns undefined ref when no @ is present", () => {
    const [url, ref] = extractPinnedRef(
      "https://github.com/org/repo/tree/main/skills/foo"
    );
    assert.equal(url, "https://github.com/org/repo/tree/main/skills/foo");
    assert.equal(ref, undefined);
  });

  it("extracts a tag ref from the end of the URL", () => {
    const [url, ref] = extractPinnedRef(
      "https://github.com/org/repo/tree/main/skills/foo@v1.0.0"
    );
    assert.equal(url, "https://github.com/org/repo/tree/main/skills/foo");
    assert.equal(ref, "v1.0.0");
  });

  it("extracts a SHA ref from the end of the URL", () => {
    const [url, ref] = extractPinnedRef(
      "https://github.com/org/repo/tree/main/skills/foo@abc1234"
    );
    assert.equal(url, "https://github.com/org/repo/tree/main/skills/foo");
    assert.equal(ref, "abc1234");
  });

  it("throws on empty ref after @", () => {
    assert.throws(
      () => extractPinnedRef("https://github.com/org/repo/tree/main/skills/foo@"),
      /Empty version ref after @/
    );
  });

  it("throws on SHA shorter than 7 characters", () => {
    assert.throws(
      () => extractPinnedRef("https://github.com/org/repo/tree/main/skills/foo@abc12"),
      /Invalid commit SHA.*must be 7-40 hex characters/
    );
  });

  it("throws on SHA longer than 40 characters", () => {
    const longSha = "a".repeat(41);
    assert.throws(
      () => extractPinnedRef(`https://github.com/org/repo/tree/main/skills/foo@${longSha}`),
      /Invalid commit SHA.*must be 7-40 hex characters/
    );
  });

  it("accepts a full 40-character SHA", () => {
    const sha = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
    const [url, ref] = extractPinnedRef(
      `https://github.com/org/repo/tree/main/skills/foo@${sha}`
    );
    assert.equal(url, "https://github.com/org/repo/tree/main/skills/foo");
    assert.equal(ref, sha);
  });

  it("does not split on @ in earlier path segments", () => {
    const [url, ref] = extractPinnedRef(
      "https://github.com/org/repo/tree/main/skills/foo"
    );
    assert.equal(url, "https://github.com/org/repo/tree/main/skills/foo");
    assert.equal(ref, undefined);
  });

  it("accepts non-hex tag-like refs without SHA validation", () => {
    const [url, ref] = extractPinnedRef(
      "https://github.com/org/repo/tree/main/skills/foo@release-2024"
    );
    assert.equal(url, "https://github.com/org/repo/tree/main/skills/foo");
    assert.equal(ref, "release-2024");
  });
});

describe("parseGitHubUrl with @ref pinning", () => {
  it("uses pinned tag ref instead of branch from URL path", () => {
    const parts = parseGitHubUrl(
      "https://github.com/org/repo/tree/main/skills/foo@v1.0.0"
    );
    assert.deepEqual(parts, {
      owner: "org",
      repo: "repo",
      ref: "v1.0.0",
      path: "skills/foo",
    });
  });

  it("uses pinned SHA ref instead of branch from URL path", () => {
    const parts = parseGitHubUrl(
      "https://github.com/org/repo/tree/main/skills/foo@abc1234"
    );
    assert.deepEqual(parts, {
      owner: "org",
      repo: "repo",
      ref: "abc1234",
      path: "skills/foo",
    });
  });

  it("falls back to branch ref when no @ suffix is present", () => {
    const parts = parseGitHubUrl(
      "https://github.com/org/repo/tree/main/skills/foo"
    );
    assert.deepEqual(parts, {
      owner: "org",
      repo: "repo",
      ref: "main",
      path: "skills/foo",
    });
  });

  it("throws on empty ref after @", () => {
    assert.throws(
      () => parseGitHubUrl("https://github.com/org/repo/tree/main/skills/foo@"),
      /Empty version ref after @/
    );
  });

  it("constructs correct raw URL with pinned ref via fetchRemoteSkill", async () => {
    const fetchedUrls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: string | URL | Request, _init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      fetchedUrls.push(url);
      return new Response("# Pinned Skill", { status: 200 });
    };

    try {
      const content = await fetchRemoteSkill(
        "pinned-skill",
        "https://github.com/org/repo/tree/main/skills/foo@v2.0.0"
      );
      assert.equal(content, "# Pinned Skill");
      assert.equal(fetchedUrls.length, 1);
      assert.equal(
        fetchedUrls[0],
        "https://raw.githubusercontent.com/org/repo/v2.0.0/skills/foo/SKILL.md"
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("constructs correct raw URL without pinned ref (backward compat)", async () => {
    const fetchedUrls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: string | URL | Request, _init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      fetchedUrls.push(url);
      return new Response("# Branch Skill", { status: 200 });
    };

    try {
      const content = await fetchRemoteSkill(
        "branch-skill",
        "https://github.com/org/repo/tree/develop/skills/foo"
      );
      assert.equal(content, "# Branch Skill");
      assert.equal(fetchedUrls.length, 1);
      assert.equal(
        fetchedUrls[0],
        "https://raw.githubusercontent.com/org/repo/develop/skills/foo/SKILL.md"
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("constructs correct raw URL with SHA pinned ref via fetchRemoteSkill", async () => {
    const fetchedUrls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: string | URL | Request, _init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      fetchedUrls.push(url);
      return new Response("# SHA Skill", { status: 200 });
    };

    try {
      await fetchRemoteSkill(
        "sha-skill",
        "https://github.com/org/repo/tree/main/skills/foo@abc1234def"
      );
      assert.equal(
        fetchedUrls[0],
        "https://raw.githubusercontent.com/org/repo/abc1234def/skills/foo/SKILL.md"
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
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

  it("rejects empty ref after @ with specific error message", async () => {
    await assert.rejects(
      () =>
        fetchRemoteSkill(
          "empty-ref",
          "https://github.com/org/repo/tree/main/skills/foo@"
        ),
      (err: unknown) => {
        assert.ok(err instanceof ResolveError);
        assert.match(err.message, /Empty version ref/);
        assert.match(err.message, /empty-ref/);
        return true;
      }
    );
  });

  it("rejects invalid short SHA with specific error message", async () => {
    await assert.rejects(
      () =>
        fetchRemoteSkill(
          "bad-sha",
          "https://github.com/org/repo/tree/main/skills/foo@abc"
        ),
      (err: unknown) => {
        assert.ok(err instanceof ResolveError);
        assert.match(err.message, /Invalid commit SHA/);
        assert.match(err.message, /bad-sha/);
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
