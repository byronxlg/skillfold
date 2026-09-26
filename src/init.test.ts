import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { ManifestError } from "./errors.js";
import { initProject } from "./init.js";
import { loadManifest } from "./manifest.js";
import { makeTmpDir } from "./testutil.js";

const tmp = makeTmpDir();
after(() => tmp.cleanup());

describe("initProject", () => {
  it("scaffolds a manifest and example skill that validate", () => {
    const dir = join(tmp.path, "fresh");
    const result = initProject(dir);
    assert.ok(existsSync(result.manifestPath));
    assert.ok(existsSync(result.skillPath));
    const manifest = loadManifest(result.manifestPath);
    assert.deepEqual(Object.keys(manifest.skills), ["skillfold-cli", "hello-skillfold"]);
    assert.equal(manifest.skills["skillfold-cli"], "npm:skillfold/skillfold-cli");
    assert.deepEqual(manifest.targets, ["claude"]);
    assert.equal(result.skillPath, join(dir, "skills", "hello-skillfold", "SKILL.md"));
  });

  it("scaffolds the example skill under the hello-skillfold name", () => {
    const dir = join(tmp.path, "example-skill");
    const result = initProject(dir);
    const body = readFileSync(result.skillPath, "utf-8");
    assert.match(body, /^name: hello-skillfold$/m);
    assert.match(body, /skillfold install/);
  });

  it("declares the usage skill as following the installed package when asked", () => {
    const dir = join(tmp.path, "follow");
    const result = initProject(dir, { followInstalled: true });
    const manifest = loadManifest(result.manifestPath);
    assert.equal(manifest.skills["skillfold-cli"], "npm:skillfold/skillfold-cli@installed");
    assert.equal(manifest.skills["hello-skillfold"], "./skills/hello-skillfold");
    assert.ok(existsSync(result.skillPath));
  });

  it("refuses to overwrite an existing manifest", () => {
    const dir = join(tmp.path, "twice");
    initProject(dir);
    assert.throws(() => initProject(dir), ManifestError);
  });
});
