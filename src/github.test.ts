import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { ResolveError } from "./errors.js";
import { fetchGitHubFile, fetchGitHubSkill, resolveGitHubRef } from "./github.js";
import { parseSource, type GitHubSource } from "./source.js";
import { makeFetcher, makeTmpDir } from "./testutil.js";

const tmp = makeTmpDir();
after(() => tmp.cleanup());

const SHA = "b".repeat(40);
const source = parseSource("github:o/r/skills/foo@v1") as GitHubSource;

function githubRoutes() {
  return {
    [`https://api.github.com/repos/o/r/commits/v1`]: { sha: SHA },
    [`https://api.github.com/repos/o/r/commits/HEAD`]: { sha: SHA },
    [`https://api.github.com/repos/o/r/contents/skills/foo?ref=${SHA}`]: [
      {
        type: "file",
        path: "skills/foo/SKILL.md",
        download_url: `https://raw.test/skills/foo/SKILL.md`,
      },
      { type: "dir", path: "skills/foo/references", download_url: null },
    ],
    [`https://api.github.com/repos/o/r/contents/skills/foo/references?ref=${SHA}`]: [
      {
        type: "file",
        path: "skills/foo/references/notes.md",
        download_url: `https://raw.test/skills/foo/references/notes.md`,
      },
    ],
    "https://raw.test/skills/foo/SKILL.md":
      "---\nname: foo\ndescription: Foo skill.\n---\n\n# Foo\n",
    "https://raw.test/skills/foo/references/notes.md": "notes",
  };
}

describe("resolveGitHubRef", () => {
  it("resolves a tag to a sha via the API", async () => {
    const { fetcher, requests } = makeFetcher(githubRoutes());
    const sha = await resolveGitHubRef(source, "foo", { fetcher, env: {} });
    assert.equal(sha, SHA);
    assert.equal(requests.length, 1);
  });

  it("short-circuits full shas without the network", async () => {
    const { fetcher, requests } = makeFetcher({});
    const pinned = { ...source, ref: SHA.toUpperCase() };
    assert.equal(await resolveGitHubRef(pinned, "foo", { fetcher, env: {} }), SHA);
    assert.equal(requests.length, 0);
  });

  it("resolves HEAD when no ref is given", async () => {
    const { fetcher, requests } = makeFetcher(githubRoutes());
    const unpinned = { ...source, ref: undefined };
    assert.equal(await resolveGitHubRef(unpinned, "foo", { fetcher, env: {} }), SHA);
    assert.match(requests[0], /commits\/HEAD/);
  });

  it("suggests GITHUB_TOKEN on rate limits", async () => {
    const fetcher = (async () => new Response("limited", { status: 403 })) as typeof fetch;
    await assert.rejects(
      resolveGitHubRef(source, "foo", { fetcher, env: {} }),
      /GITHUB_TOKEN/
    );
  });

  it("sends the auth token when configured", async () => {
    let seenAuth: string | null = null;
    const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
      seenAuth = new Headers(init?.headers).get("Authorization");
      return new Response(JSON.stringify({ sha: SHA }), { status: 200 });
    }) as typeof fetch;
    await resolveGitHubRef(source, "foo", { fetcher, env: { GITHUB_TOKEN: "tok123" } });
    assert.equal(seenAuth, "Bearer tok123");
  });
});

describe("fetchGitHubSkill", () => {
  it("downloads all files into the cache", async () => {
    const env = { SKILLFOLD_CACHE: join(tmp.path, "cache1") };
    const { fetcher } = makeFetcher(githubRoutes());
    const result = await fetchGitHubSkill(source, SHA, "foo", { fetcher, env });
    assert.equal(result.fetched, true);
    assert.equal(result.skill.name, "foo");
    assert.deepEqual(
      result.skill.files.map((f) => f.path),
      ["SKILL.md", "references/notes.md"]
    );
  });

  it("serves repeat fetches from the cache without the network", async () => {
    const env = { SKILLFOLD_CACHE: join(tmp.path, "cache2") };
    const first = makeFetcher(githubRoutes());
    await fetchGitHubSkill(source, SHA, "foo", { fetcher: first.fetcher, env });
    const second = makeFetcher(githubRoutes());
    const result = await fetchGitHubSkill(source, SHA, "foo", { fetcher: second.fetcher, env });
    assert.equal(result.fetched, false);
    assert.equal(second.requests.length, 0);
  });

  it("errors when the directory has no SKILL.md", async () => {
    const env = { SKILLFOLD_CACHE: join(tmp.path, "cache3") };
    const { fetcher } = makeFetcher({
      [`https://api.github.com/repos/o/r/contents/skills/foo?ref=${SHA}`]: [
        { type: "file", path: "skills/foo/readme.md", download_url: "https://raw.test/x" },
      ],
      "https://raw.test/x": "hi",
    });
    await assert.rejects(
      fetchGitHubSkill(source, SHA, "foo", { fetcher, env }),
      /no SKILL.md/
    );
  });

  it("leaves no cache entry when a download fails midway", async () => {
    const env = { SKILLFOLD_CACHE: join(tmp.path, "cache5") };
    const routes = githubRoutes();
    delete (routes as Record<string, unknown>)[
      "https://raw.test/skills/foo/references/notes.md"
    ];
    const broken = makeFetcher(routes); // second download 500s
    await assert.rejects(fetchGitHubSkill(source, SHA, "foo", { fetcher: broken.fetcher, env }));
    const cacheDir = join(tmp.path, "cache5", "github", "o", "r", SHA, "skills", "foo");
    assert.ok(!existsSync(cacheDir), "partial cache entry must not exist");
    const parent = join(tmp.path, "cache5", "github", "o", "r", SHA, "skills");
    if (existsSync(parent)) {
      assert.deepEqual(
        readdirSync(parent).filter((n) => n.includes("partial")),
        [],
        "staging directory must be cleaned up"
      );
    }
    // A retry with a working fetcher succeeds from scratch.
    const good = makeFetcher(githubRoutes());
    const result = await fetchGitHubSkill(source, SHA, "foo", { fetcher: good.fetcher, env });
    assert.equal(result.fetched, true);
    assert.equal(result.skill.files.length, 2);
  });

  it("errors clearly when the path is not a directory", async () => {
    const env = { SKILLFOLD_CACHE: join(tmp.path, "cache4") };
    const { fetcher } = makeFetcher({
      [`https://api.github.com/repos/o/r/contents/skills/foo?ref=${SHA}`]: {
        type: "file",
      },
    });
    await assert.rejects(
      fetchGitHubSkill(source, SHA, "foo", { fetcher, env }),
      ResolveError
    );
  });
});

describe("fetchGitHubFile", () => {
  const fileSource = parseSource("github:o/r/rules/style.md@v1") as GitHubSource;
  const routes = {
    [`https://raw.githubusercontent.com/o/r/${SHA}/rules/style.md`]: "rule text",
  };

  it("downloads and caches a single file", async () => {
    const env = { SKILLFOLD_CACHE: join(tmp.path, "fcache1") };
    const first = makeFetcher(routes);
    const result = await fetchGitHubFile(fileSource, SHA, "style", { fetcher: first.fetcher, env });
    assert.equal(result.content.toString(), "rule text");
    assert.equal(result.fetched, true);
    const second = makeFetcher({});
    const cached = await fetchGitHubFile(fileSource, SHA, "style", { fetcher: second.fetcher, env });
    assert.equal(cached.fetched, false);
    assert.equal(cached.content.toString(), "rule text");
    assert.equal(second.requests.length, 0);
  });

  it("rejects sources without a file path", async () => {
    const env = { SKILLFOLD_CACHE: join(tmp.path, "fcache2") };
    const bare = parseSource("github:o/r") as GitHubSource;
    const { fetcher } = makeFetcher(routes);
    await assert.rejects(
      fetchGitHubFile(bare, SHA, "style", { fetcher, env }),
      /point at a file/
    );
  });
});
