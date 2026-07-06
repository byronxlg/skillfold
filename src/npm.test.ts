import assert from "node:assert/strict";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import {
  findInstalledPackage,
  resolveNpmFile,
  resolveNpmSkill,
  resolveNpmVersion,
} from "./npm.js";
import { parseSource, type NpmSource } from "./source.js";
import { makeFetcher, makeTmpDir, writeFile, writeSkill } from "./testutil.js";

const tmp = makeTmpDir();
after(() => tmp.cleanup());

/** Lay down a fake installed package in <root>/node_modules/<pkg>. */
function installFakePackage(root: string, pkg: string, version: string): void {
  const base = `node_modules/${pkg}`;
  writeFile(
    root,
    `${base}/package.json`,
    JSON.stringify({
      name: pkg,
      version,
      agentskills: { planning: "./skills/planning" },
    })
  );
  writeSkill(root, `${base}/skills/planning`, "planning");
  writeSkill(root, `${base}/skills/extra`, "extra");
}

describe("findInstalledPackage", () => {
  it("finds packages under node_modules", () => {
    installFakePackage(tmp.path, "fake-pkg", "1.0.0");
    const dir = findInstalledPackage("fake-pkg", tmp.path);
    assert.ok(dir?.endsWith(join("node_modules", "fake-pkg")));
  });

  it("returns null when not installed", () => {
    assert.equal(findInstalledPackage("not-installed-pkg", tmp.path), null);
  });
});

describe("resolveNpmSkill via node_modules", () => {
  it("maps agentskills keys to their directories", async () => {
    installFakePackage(tmp.path, "fake-pkg", "1.0.0");
    const source = parseSource("npm:fake-pkg/planning") as NpmSource;
    const result = await resolveNpmSkill(source, "planning", tmp.path, undefined, { env: {} });
    assert.equal(result.version, "1.0.0");
    assert.equal(result.fetched, false);
    assert.equal(result.skill.name, "planning");
  });

  it("falls back to literal subpaths", async () => {
    installFakePackage(tmp.path, "fake-pkg", "1.0.0");
    const source = parseSource("npm:fake-pkg/skills/extra") as NpmSource;
    const result = await resolveNpmSkill(source, "extra", tmp.path, undefined, { env: {} });
    assert.equal(result.skill.name, "extra");
  });

  it("errors with the available skills listed", async () => {
    installFakePackage(tmp.path, "fake-pkg", "1.0.0");
    const source = parseSource("npm:fake-pkg/ghost") as NpmSource;
    await assert.rejects(
      resolveNpmSkill(source, "ghost", tmp.path, undefined, { env: {} }),
      /package provides: planning/
    );
  });

  it("uses the package root when there is no subpath", async () => {
    writeFile(
      tmp.path,
      "node_modules/root-skill/package.json",
      JSON.stringify({ name: "root-skill", version: "2.0.0" })
    );
    writeSkill(tmp.path, "node_modules/root-skill", "root-skill");
    const source = parseSource("npm:root-skill") as NpmSource;
    const result = await resolveNpmSkill(source, "root-skill", tmp.path, undefined, { env: {} });
    assert.equal(result.version, "2.0.0");
    assert.equal(result.skill.name, "root-skill");
  });

  it("skips node_modules when the installed version does not satisfy a pin", async () => {
    installFakePackage(tmp.path, "fake-pkg", "1.0.0");
    const env = { SKILLFOLD_CACHE: join(tmp.path, "cache-pin") };
    const source = parseSource("npm:fake-pkg/planning") as NpmSource;
    let packed: string | undefined;
    const result = await resolveNpmSkill(source, "planning", tmp.path, "3.0.0", {
      env,
      packDownloader: (spec, destDir) => {
        packed = spec;
        writeFile(destDir, "package.json", JSON.stringify({ name: "fake-pkg", version: "3.0.0" }));
        writeSkill(destDir, "skills/planning", "planning");
        writeFile(
          destDir,
          "package.json",
          JSON.stringify({
            name: "fake-pkg",
            version: "3.0.0",
            agentskills: { planning: "./skills/planning" },
          })
        );
      },
    });
    assert.equal(packed, "fake-pkg@3.0.0");
    assert.equal(result.version, "3.0.0");
    assert.equal(result.fetched, true);
  });

  it("reuses the cache on the second fetch", async () => {
    const env = { SKILLFOLD_CACHE: join(tmp.path, "cache-reuse") };
    const source = parseSource("npm:cached-pkg/planning@5.0.0") as NpmSource;
    let downloads = 0;
    const packDownloader = (_spec: string, destDir: string) => {
      downloads++;
      writeFile(
        destDir,
        "package.json",
        JSON.stringify({
          name: "cached-pkg",
          version: "5.0.0",
          agentskills: { planning: "./skills/planning" },
        })
      );
      writeSkill(destDir, "skills/planning", "planning");
    };
    const first = await resolveNpmSkill(source, "planning", tmp.path, undefined, {
      env,
      packDownloader,
    });
    const second = await resolveNpmSkill(source, "planning", tmp.path, undefined, {
      env,
      packDownloader,
    });
    assert.equal(downloads, 1);
    assert.equal(first.fetched, true);
    assert.equal(second.fetched, false);
  });
});

describe("resolveNpmVersion", () => {
  const registryDoc = {
    "dist-tags": { latest: "2.1.0", next: "3.0.0-rc.1" },
    versions: { "2.0.0": {}, "2.1.0": {}, "3.0.0-rc.1": {} },
  };

  it("resolves latest by default", async () => {
    const { fetcher } = makeFetcher({ "https://registry.npmjs.org/some-pkg": registryDoc });
    const source = parseSource("npm:some-pkg/x") as NpmSource;
    assert.equal(await resolveNpmVersion(source, "x", { fetcher }), "2.1.0");
  });

  it("resolves dist-tags", async () => {
    const { fetcher } = makeFetcher({ "https://registry.npmjs.org/some-pkg": registryDoc });
    const source = parseSource("npm:some-pkg/x@next") as NpmSource;
    assert.equal(await resolveNpmVersion(source, "x", { fetcher }), "3.0.0-rc.1");
  });

  it("accepts exact versions that exist", async () => {
    const { fetcher } = makeFetcher({ "https://registry.npmjs.org/some-pkg": registryDoc });
    const source = parseSource("npm:some-pkg/x@2.0.0") as NpmSource;
    assert.equal(await resolveNpmVersion(source, "x", { fetcher }), "2.0.0");
  });

  it("rejects unknown versions", async () => {
    const { fetcher } = makeFetcher({ "https://registry.npmjs.org/some-pkg": registryDoc });
    const source = parseSource("npm:some-pkg/x@9.9.9") as NpmSource;
    await assert.rejects(resolveNpmVersion(source, "x", { fetcher }), /not found/);
  });

  it("reports missing packages", async () => {
    const { fetcher } = makeFetcher({ "https://registry.npmjs.org/ghost-pkg": null });
    const source = parseSource("npm:ghost-pkg") as NpmSource;
    await assert.rejects(resolveNpmVersion(source, "ghost-pkg", { fetcher }), /not found on the npm registry/);
  });

  it("encodes scoped package names", async () => {
    const { fetcher, requests } = makeFetcher({
      "https://registry.npmjs.org/@scope%2fpkg": registryDoc,
    });
    const source = parseSource("npm:@scope/pkg/x") as NpmSource;
    await resolveNpmVersion(source, "x", { fetcher });
    assert.match(requests[0], /@scope%2fpkg/);
  });
});

describe("resolveNpmFile", () => {
  it("reads a rule file from an installed package", async () => {
    installFakePackage(tmp.path, "rule-pkg", "1.0.0");
    writeFile(tmp.path, "node_modules/rule-pkg/rules/style.md", "npm rule\n");
    const source = parseSource("npm:rule-pkg/rules/style.md") as NpmSource;
    const result = await resolveNpmFile(source, "style", tmp.path);
    assert.equal(result.content.toString(), "npm rule\n");
    assert.equal(result.version, "1.0.0");
    assert.equal(result.fetched, false);
  });

  it("rejects sources without a file subpath", async () => {
    const source = parseSource("npm:rule-pkg") as NpmSource;
    await assert.rejects(resolveNpmFile(source, "style", tmp.path), /point at a file/);
  });

  it("rejects a subpath that is a directory", async () => {
    installFakePackage(tmp.path, "dir-pkg", "1.0.0");
    const source = parseSource("npm:dir-pkg/skills/planning") as NpmSource;
    await assert.rejects(resolveNpmFile(source, "style", tmp.path), /not a file/);
  });
});
