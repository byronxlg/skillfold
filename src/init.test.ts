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
  it("scaffolds a manifest and the skillfold skill that validate", () => {
    const dir = join(tmp.path, "fresh");
    const result = initProject(dir);
    assert.ok(existsSync(result.manifestPath));
    assert.ok(existsSync(result.skillPath));
    const manifest = loadManifest(result.manifestPath);
    assert.deepEqual(Object.keys(manifest.skills), ["skillfold"]);
    assert.equal(result.skillPath, join(dir, "skills", "skillfold", "SKILL.md"));
  });

  it("scaffolds the library CLI skill under the skillfold name", () => {
    const dir = join(tmp.path, "cli-skill");
    const result = initProject(dir);
    const body = readFileSync(result.skillPath, "utf-8");
    assert.match(body, /^name: skillfold$/m);
    assert.doesNotMatch(body, /skillfold-cli/);
    assert.match(body, /skillfold install/);
    assert.match(body, /skillfold\.lock/);
  });

  it("refuses to overwrite an existing manifest", () => {
    const dir = join(tmp.path, "twice");
    initProject(dir);
    assert.throws(() => initProject(dir), ManifestError);
  });
});
