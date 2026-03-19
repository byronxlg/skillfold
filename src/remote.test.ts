import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ResolveError } from "./errors.js";
import { fetchRemoteSkill, parseGitHubUrl } from "./remote.js";

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
