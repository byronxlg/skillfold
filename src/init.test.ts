import assert from "node:assert/strict";
import { existsSync } from "node:fs";
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
    assert.deepEqual(Object.keys(manifest.skills), ["hello-skillfold"]);
  });

  it("refuses to overwrite an existing manifest", () => {
    const dir = join(tmp.path, "twice");
    initProject(dir);
    assert.throws(() => initProject(dir), ManifestError);
  });
});
