import assert from "node:assert/strict";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { LockError } from "./errors.js";
import { emptyLockfile, type Lockfile } from "./lock.js";
import { parseManifest } from "./manifest.js";
import { resolveManifest, resolveSingle } from "./resolve.js";
import { parseFrontmatter } from "./skill.js";
import { makeFetcher, makeTmpDir, writeFile, writeSkill } from "./testutil.js";

const tmp = makeTmpDir();
after(() => tmp.cleanup());

const SHA = "c".repeat(40);
const SHA2 = "d".repeat(40);

function githubRoutes(sha: string) {
  return {
    "https://api.github.com/repos/o/r/commits/v1": { sha },
    [`https://api.github.com/repos/o/r/contents/skills/remote?ref=${sha}`]: [
      {
        type: "file",
        path: "skills/remote/SKILL.md",
        download_url: `https://raw.test/${sha}/SKILL.md`,
      },
    ],
    [`https://raw.test/${sha}/SKILL.md`]:
      `---\nname: remote\ndescription: Remote skill at ${sha.slice(0, 7)}.\n---\n\n# Remote\n`,
  };
}

function project(name: string): { baseDir: string; env: NodeJS.ProcessEnv } {
  const baseDir = join(tmp.path, name);
  writeSkill(baseDir, "skills/local-one", "local-one");
  return { baseDir, env: { SKILLFOLD_CACHE: join(baseDir, ".cache") } };
}

const MANIFEST = [
  "skills:",
  "  local-one: ./skills/local-one",
  "  remote: github:o/r/skills/remote@v1",
  "compose:",
  "  combo:",
  "    use: [local-one, remote]",
].join("\n");

describe("resolveManifest", () => {
  it("resolves local, github, and composed skills into a lockfile", async () => {
    const { baseDir, env } = project("p1");
    const manifest = parseManifest(MANIFEST, "t.yaml");
    const { fetcher } = makeFetcher(githubRoutes(SHA));
    const { resolved, lock } = await resolveManifest(manifest, { baseDir, fetcher, env });

    assert.deepEqual(
      resolved.map((r) => [r.name, r.kind]),
      [
        ["local-one", "local"],
        ["remote", "github"],
        ["combo", "compose"],
      ]
    );
    assert.deepEqual(lock.skills["local-one"], {
      source: "./skills/local-one",
      resolved: undefined,
      integrity: undefined,
    });
    assert.equal(lock.skills.remote.resolved, `github:o/r/skills/remote@${SHA}`);
    assert.match(lock.skills.remote.integrity!, /^sha256-/);
    assert.deepEqual(lock.compose.combo.use, ["local-one", "remote"]);
    const combo = resolved.find((r) => r.name === "combo")!;
    assert.match(combo.skill.body, /# Remote/);
  });

  it("reuses lockfile pins instead of re-resolving refs", async () => {
    const { baseDir, env } = project("p2");
    const manifest = parseManifest(MANIFEST, "t.yaml");
    const first = makeFetcher(githubRoutes(SHA));
    const { lock } = await resolveManifest(manifest, { baseDir, fetcher: first.fetcher, env });

    // v1 now points at SHA2 upstream, but the lock pins SHA.
    const second = makeFetcher(githubRoutes(SHA2));
    const result = await resolveManifest(manifest, {
      baseDir,
      lock,
      fetcher: second.fetcher,
      env,
    });
    assert.equal(result.lock.skills.remote.resolved, `github:o/r/skills/remote@${SHA}`);
    // Cache hit at the pinned sha: no network at all.
    assert.equal(second.requests.length, 0);
  });

  it("re-resolves when the skill is in the update list", async () => {
    const { baseDir, env } = project("p3");
    const manifest = parseManifest(MANIFEST, "t.yaml");
    const first = makeFetcher(githubRoutes(SHA));
    const { lock } = await resolveManifest(manifest, { baseDir, fetcher: first.fetcher, env });

    const second = makeFetcher(githubRoutes(SHA2));
    const result = await resolveManifest(manifest, {
      baseDir,
      lock,
      update: ["remote"],
      fetcher: second.fetcher,
      env,
    });
    assert.equal(result.lock.skills.remote.resolved, `github:o/r/skills/remote@${SHA2}`);
  });

  it("re-resolves when the manifest source changes", async () => {
    const { baseDir, env } = project("p4");
    const manifest = parseManifest(MANIFEST, "t.yaml");
    const first = makeFetcher(githubRoutes(SHA));
    const { lock } = await resolveManifest(manifest, { baseDir, fetcher: first.fetcher, env });

    const changed = parseManifest(MANIFEST.replace("@v1", "@v2"), "t.yaml");
    const second = makeFetcher({
      "https://api.github.com/repos/o/r/commits/v2": { sha: SHA2 },
      ...githubRoutes(SHA2),
    });
    const result = await resolveManifest(changed, {
      baseDir,
      lock,
      fetcher: second.fetcher,
      env,
    });
    assert.equal(result.lock.skills.remote.resolved, `github:o/r/skills/remote@${SHA2}`);
  });

  describe("frozen", () => {
    it("rejects a missing lockfile", async () => {
      const { baseDir, env } = project("p5");
      const manifest = parseManifest(MANIFEST, "t.yaml");
      const { fetcher } = makeFetcher({});
      await assert.rejects(
        resolveManifest(manifest, { baseDir, lock: null, frozen: true, fetcher, env }),
        LockError
      );
    });

    it("rejects manifest drift", async () => {
      const { baseDir, env } = project("p6");
      const manifest = parseManifest(MANIFEST, "t.yaml");
      const { fetcher } = makeFetcher(githubRoutes(SHA));
      const { lock } = await resolveManifest(manifest, { baseDir, fetcher, env });
      const changed = parseManifest(MANIFEST.replace("@v1", "@v2"), "t.yaml");
      await assert.rejects(
        resolveManifest(changed, { baseDir, lock, frozen: true, fetcher, env }),
        /out of sync/
      );
    });

    it("rejects integrity mismatches", async () => {
      const { baseDir, env } = project("p7");
      const manifest = parseManifest(MANIFEST, "t.yaml");
      const { fetcher } = makeFetcher(githubRoutes(SHA));
      const { lock } = await resolveManifest(manifest, { baseDir, fetcher, env });
      const tampered: Lockfile = structuredClone(lock);
      tampered.skills.remote.integrity = "sha256-doesnotmatch=";
      await assert.rejects(
        resolveManifest(manifest, { baseDir, lock: tampered, frozen: true, fetcher, env }),
        /content hash does not match/
      );
    });

    it("installs exactly the pinned revision when in sync", async () => {
      const { baseDir, env } = project("p8");
      const manifest = parseManifest(MANIFEST, "t.yaml");
      const first = makeFetcher(githubRoutes(SHA));
      const { lock } = await resolveManifest(manifest, { baseDir, fetcher: first.fetcher, env });
      const second = makeFetcher(githubRoutes(SHA2)); // upstream moved; must not matter
      const result = await resolveManifest(manifest, {
        baseDir,
        lock,
        frozen: true,
        fetcher: second.fetcher,
        env,
      });
      assert.equal(result.lock.skills.remote.resolved, `github:o/r/skills/remote@${SHA}`);
    });
  });
});

describe("resolveSingle", () => {
  it("resolves a lone source without a manifest", async () => {
    const { baseDir, env } = project("p9");
    const single = await resolveSingle("./skills/local-one", baseDir, { env });
    assert.equal(single.kind, "local");
    assert.equal(single.skill.name, "local-one");
  });

  it("fetches github sources", async () => {
    const { baseDir, env } = project("p10");
    const { fetcher } = makeFetcher(githubRoutes(SHA));
    const single = await resolveSingle("github:o/r/skills/remote@v1", baseDir, {
      fetcher,
      env,
    });
    assert.equal(single.kind, "github");
    assert.equal(single.resolved, `github:o/r/skills/remote@${SHA}`);
    assert.equal(single.skill.name, "remote");
  });
});

describe("lockfile shape", () => {
  it("does not create entries for skills that failed to resolve", async () => {
    const { baseDir, env } = project("p11");
    const manifest = parseManifest("skills:\n  ghost: ./skills/ghost", "t.yaml");
    const { fetcher } = makeFetcher({});
    await assert.rejects(
      resolveManifest(manifest, { baseDir, lock: emptyLockfile(), fetcher, env }),
      /directory not found/
    );
  });
});

describe("frontmatter name normalization", () => {
  it("rewrites the frontmatter name to the manifest name", async () => {
    const { baseDir } = project("norm1");
    const manifest = parseManifest("skills:\n  renamed: ./skills/local-one", "t.yaml");
    const { resolved } = await resolveManifest(manifest, { baseDir });
    const skillMd = resolved[0].skill.files.find((f) => f.path === "SKILL.md")!;
    const { attrs } = parseFrontmatter(skillMd.content.toString());
    assert.equal(attrs.name, "renamed");
    assert.equal(attrs.description, "Test skill local-one.");
    assert.equal(resolved[0].skill.name, "renamed");
  });

  it("computes github integrity over the normalized files", async () => {
    const { baseDir, env } = project("norm2");
    const manifest = parseManifest(
      "skills:\n  other-name: github:o/r/skills/remote@v1",
      "t.yaml"
    );
    const { fetcher } = makeFetcher(githubRoutes(SHA));
    const { resolved } = await resolveManifest(manifest, { baseDir, fetcher, env });
    const { attrs } = parseFrontmatter(
      resolved[0].skill.files[0].content.toString()
    );
    assert.equal(attrs.name, "other-name");
    // The lock hash must match the files as installed, i.e. after the rename.
    const { computeIntegrity } = await import("./skill.js");
    assert.equal(resolved[0].integrity, computeIntegrity(resolved[0].skill.files));
  });

  it("resolveSingle keeps the original frontmatter name for `add`", async () => {
    const { baseDir } = project("norm3");
    writeFile(
      baseDir,
      "skills/dir-name/SKILL.md",
      "---\nname: pretty-name\ndescription: D.\n---\n\nx\n"
    );
    const single = await resolveSingle("./skills/dir-name", baseDir);
    assert.equal(single.skill.name, "pretty-name");
  });
});

describe("composed skills with supporting files", () => {
  it("carries dependency files into the composed skill", async () => {
    const { baseDir } = project("files1");
    writeFile(baseDir, "skills/local-one/references/notes.md", "shared notes");
    const manifest = parseManifest(
      [
        "skills:",
        "  local-one: ./skills/local-one",
        "compose:",
        "  combo:",
        "    use: [local-one]",
      ].join("\n"),
      "t.yaml"
    );
    const { resolved } = await resolveManifest(manifest, { baseDir });
    const combo = resolved.find((r) => r.name === "combo")!;
    assert.deepEqual(
      combo.skill.files.map((f) => f.path),
      ["SKILL.md", "references/notes.md"]
    );
  });

  it("unions allowed-tools when every dependency declares them", async () => {
    const { baseDir } = project("tools1");
    writeFile(
      baseDir,
      "skills/tooled/SKILL.md",
      "---\nname: tooled\ndescription: T.\nallowed-tools: Read, Grep\n---\n\nx\n"
    );
    writeFile(
      baseDir,
      "skills/bashy/SKILL.md",
      "---\nname: bashy\ndescription: B.\nallowed-tools: [Bash, Read]\n---\n\nx\n"
    );
    const manifest = parseManifest(
      [
        "skills:",
        "  tooled: ./skills/tooled",
        "  bashy: ./skills/bashy",
        "compose:",
        "  combo:",
        "    use: [tooled, bashy]",
      ].join("\n"),
      "t.yaml"
    );
    const { resolved } = await resolveManifest(manifest, { baseDir });
    const combo = resolved.find((r) => r.name === "combo")!;
    assert.equal(combo.skill.attrs["allowed-tools"], "Read, Grep, Bash");
  });

  it("leaves the composed skill unrestricted when any dependency is", async () => {
    const { baseDir } = project("tools2");
    writeFile(
      baseDir,
      "skills/tooled/SKILL.md",
      "---\nname: tooled\ndescription: T.\nallowed-tools: Read\n---\n\nx\n"
    );
    // local-one has no allowed-tools, i.e. it is unrestricted.
    const manifest = parseManifest(
      [
        "skills:",
        "  tooled: ./skills/tooled",
        "  local-one: ./skills/local-one",
        "compose:",
        "  combo:",
        "    use: [tooled, local-one]",
      ].join("\n"),
      "t.yaml"
    );
    const { resolved } = await resolveManifest(manifest, { baseDir });
    const combo = resolved.find((r) => r.name === "combo")!;
    assert.equal(combo.skill.attrs["allowed-tools"], undefined);
  });
});

describe("rules resolution", () => {
  const ruleRoutes = (sha: string) => ({
    "https://api.github.com/repos/o/r/commits/v1": { sha },
    [`https://raw.githubusercontent.com/o/r/${sha}/rules/style.md`]: "Remote rule text.\n",
  });

  it("resolves local and github rules into the lockfile", async () => {
    const { baseDir, env } = project("rules1");
    writeFile(baseDir, "rules/local.md", "Local rule.\n");
    const manifest = parseManifest(
      [
        "rules:",
        "  local: ./rules/local.md",
        "  style: github:o/r/rules/style.md@v1",
      ].join("\n"),
      "t.yaml"
    );
    const { fetcher } = makeFetcher(ruleRoutes(SHA));
    const { rules, lock } = await resolveManifest(manifest, { baseDir, fetcher, env });
    assert.deepEqual(
      rules.map((r) => [r.name, r.kind]),
      [
        ["local", "local"],
        ["style", "github"],
      ]
    );
    assert.equal(rules[0].content.toString(), "Local rule.\n");
    assert.equal(rules[1].content.toString(), "Remote rule text.\n");
    assert.equal(lock.rules.local.resolved, undefined);
    assert.equal(lock.rules.style.resolved, `github:o/r/rules/style.md@${SHA}`);
    assert.match(lock.rules.style.integrity!, /^sha256-/);
  });

  it("reuses rule pins from the lockfile", async () => {
    const { baseDir, env } = project("rules2");
    const manifest = parseManifest("rules:\n  style: github:o/r/rules/style.md@v1", "t.yaml");
    const first = makeFetcher(ruleRoutes(SHA));
    const { lock } = await resolveManifest(manifest, { baseDir, fetcher: first.fetcher, env });
    // Same source with a lockfile pin: no ref resolution, cache hit for content.
    const second = makeFetcher({});
    const { rules } = await resolveManifest(manifest, {
      baseDir,
      fetcher: second.fetcher,
      env,
      lock,
    });
    assert.equal(second.requests.length, 0);
    assert.equal(rules[0].resolved, `github:o/r/rules/style.md@${SHA}`);
  });

  it("errors clearly for a missing local rule file", async () => {
    const { baseDir } = project("rules3");
    const manifest = parseManifest("rules:\n  gone: ./rules/gone.md", "t.yaml");
    await assert.rejects(resolveManifest(manifest, { baseDir }), /file not found/);
  });

  it("errors clearly when a local rule source is a directory", async () => {
    const { baseDir } = project("rules5");
    const manifest = parseManifest("rules:\n  dir: ./skills/local-one", "t.yaml");
    await assert.rejects(resolveManifest(manifest, { baseDir }), /not a file/);
  });

  it("frozen requires pinned rules", async () => {
    const { baseDir, env } = project("rules4");
    const manifest = parseManifest("rules:\n  style: github:o/r/rules/style.md@v1", "t.yaml");
    const { fetcher } = makeFetcher(ruleRoutes(SHA));
    const lock = emptyLockfile();
    // Cover the manifest's rule so lockfileProblems passes, but without a pin.
    lock.rules.style = { source: "github:o/r/rules/style.md@v1" };
    await assert.rejects(
      resolveManifest(manifest, { baseDir, fetcher, env, lock, frozen: true }),
      /not pinned in the lockfile/
    );
  });
});

describe("@installed npm sources", () => {
  /** A fake "tool" package at `version` in <root>/node_modules, shipping a skill and a rule. */
  function installTool(root: string, version: string): void {
    writeFile(
      root,
      "node_modules/tool/package.json",
      JSON.stringify({ name: "tool", version, agentskills: { "tool-cli": "./skills/tool-cli" } })
    );
    writeSkill(root, "node_modules/tool/skills/tool-cli", "tool-cli", `# tool ${version}\n\nFlags for ${version}.`);
    writeFile(root, "node_modules/tool/rules/style.md", `# style for ${version}\n`);
  }

  /** A project directory marked as a repository root so lookups stay inside it. */
  function repoDir(name: string): string {
    const baseDir = join(tmp.path, name);
    writeFile(baseDir, ".git/HEAD", "");
    return baseDir;
  }

  function toolProject(name: string, version: string): { baseDir: string; env: NodeJS.ProcessEnv } {
    const baseDir = repoDir(name);
    installTool(baseDir, version);
    return { baseDir, env: { SKILLFOLD_CACHE: join(baseDir, ".cache") } };
  }

  const FOLLOW = "skills:\n  tool-cli: npm:tool/tool-cli@installed";

  it("pins the installed version and keeps the source string", async () => {
    const { baseDir, env } = toolProject("inst1", "1.0.0");
    const { resolved, lock } = await resolveManifest(parseManifest(FOLLOW, "t.yaml"), { baseDir, env });
    assert.equal(lock.skills["tool-cli"].source, "npm:tool/tool-cli@installed");
    assert.equal(lock.skills["tool-cli"].resolved, "npm:tool/tool-cli@1.0.0");
    assert.equal(resolved[0].fetched, false);
    assert.match(resolved[0].skill.body, /Flags for 1\.0\.0/);
  });

  it("re-pins on install when the dependency moves, without an update", async () => {
    const { baseDir, env } = toolProject("inst2", "1.0.0");
    const manifest = parseManifest(FOLLOW, "t.yaml");
    const first = await resolveManifest(manifest, { baseDir, env });
    installTool(baseDir, "1.1.0");
    const second = await resolveManifest(manifest, { baseDir, env, lock: first.lock });
    assert.equal(second.lock.skills["tool-cli"].resolved, "npm:tool/tool-cli@1.1.0");
    assert.notEqual(second.lock.skills["tool-cli"].integrity, first.lock.skills["tool-cli"].integrity);
    assert.match(second.resolved[0].skill.body, /Flags for 1\.1\.0/);
  });

  it("frozen fails when the lockfile trails the installed package", async () => {
    const { baseDir, env } = toolProject("inst3", "1.0.0");
    const manifest = parseManifest(FOLLOW, "t.yaml");
    const { lock } = await resolveManifest(manifest, { baseDir, env });
    installTool(baseDir, "2.0.0");
    await assert.rejects(
      resolveManifest(manifest, { baseDir, env, lock, frozen: true }),
      (err: unknown) =>
        err instanceof LockError &&
        /"tool-cli" follows tool@installed: the lockfile pins 1\.0\.0 but 2\.0\.0 is installed/.test(err.message)
    );
  });

  it("frozen passes when in step", async () => {
    const { baseDir, env } = toolProject("inst4", "1.0.0");
    const manifest = parseManifest(FOLLOW, "t.yaml");
    const { lock } = await resolveManifest(manifest, { baseDir, env });
    const again = await resolveManifest(manifest, { baseDir, env, lock, frozen: true });
    assert.equal(again.lock.skills["tool-cli"].resolved, "npm:tool/tool-cli@1.0.0");
  });

  it("downloads the lockfile's version when node_modules is stale", async () => {
    const { baseDir, env } = toolProject("inst5", "1.0.0");
    writeFile(
      baseDir,
      "package-lock.json",
      JSON.stringify({ lockfileVersion: 3, packages: { "": {}, "node_modules/tool": { version: "1.2.0" } } })
    );
    const specs: string[] = [];
    const packDownloader = (spec: string, destDir: string) => {
      specs.push(spec);
      writeFile(
        destDir,
        "package.json",
        JSON.stringify({ name: "tool", version: "1.2.0", agentskills: { "tool-cli": "./skills/tool-cli" } })
      );
      writeSkill(destDir, "skills/tool-cli", "tool-cli", "# tool 1.2.0\n\nFlags for 1.2.0.");
    };
    const { resolved, lock } = await resolveManifest(parseManifest(FOLLOW, "t.yaml"), {
      baseDir,
      env,
      npmOptions: { packDownloader },
    });
    assert.deepEqual(specs, ["tool@1.2.0"]);
    assert.equal(lock.skills["tool-cli"].resolved, "npm:tool/tool-cli@1.2.0");
    assert.match(resolved[0].skill.body, /Flags for 1\.2\.0/);
  });

  it("errors clearly when the package is not installed", async () => {
    const baseDir = repoDir("inst6");
    await assert.rejects(
      resolveManifest(parseManifest(FOLLOW, "t.yaml"), { baseDir, env: {} }),
      /tool@installed needs tool as a dependency of this project/
    );
  });

  it("follows the installed package for rules", async () => {
    const { baseDir, env } = toolProject("inst7", "1.0.0");
    const manifest = parseManifest("rules:\n  style: npm:tool/rules/style.md@installed", "t.yaml");
    const first = await resolveManifest(manifest, { baseDir, env });
    assert.equal(first.lock.rules.style.resolved, "npm:tool/rules/style.md@1.0.0");
    installTool(baseDir, "1.3.0");
    await assert.rejects(
      resolveManifest(manifest, { baseDir, env, lock: first.lock, frozen: true }),
      /rule "style" follows tool@installed/
    );
    const second = await resolveManifest(manifest, { baseDir, env, lock: first.lock });
    assert.equal(second.lock.rules.style.resolved, "npm:tool/rules/style.md@1.3.0");
    assert.equal(second.rules[0].content.toString(), "# style for 1.3.0\n");
  });

  it("reads a global install from its directory, offline", async () => {
    const globalDir = join(tmp.path, "inst8-global");
    installTool(globalDir, "3.0.0");
    const baseDir = repoDir("inst8");
    const { lock } = await resolveManifest(parseManifest(FOLLOW, "t.yaml"), {
      baseDir,
      env: { SKILLFOLD_CACHE: join(baseDir, ".cache") },
      installed: { global: true, globalRoot: () => join(globalDir, "node_modules") },
      npmOptions: {
        packDownloader: () => {
          throw new Error("must not download");
        },
      },
    });
    assert.equal(lock.skills["tool-cli"].resolved, "npm:tool/tool-cli@3.0.0");
  });

  it("resolveSingle resolves an @installed source for add", async () => {
    const { baseDir, env } = toolProject("inst9", "1.0.0");
    const single = await resolveSingle("npm:tool/tool-cli@installed", baseDir, { env });
    assert.equal(single.source, "npm:tool/tool-cli@installed");
    assert.equal(single.resolved, "npm:tool/tool-cli@1.0.0");
  });
});
