import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { installedDrift, installedVersion } from "./installed.js";
import { makeTmpDir, writeFile } from "./testutil.js";

const tmp = makeTmpDir();
after(() => tmp.cleanup());

let counter = 0;
/** A fresh directory marked as a repository root, so lookups never walk past it. */
function repo(): string {
  const dir = join(tmp.path, `repo${counter++}`);
  mkdirSync(join(dir, ".git"), { recursive: true });
  return dir;
}

function npmLock(packages: Record<string, unknown>): string {
  return JSON.stringify({ name: "app", lockfileVersion: 3, packages: { "": {}, ...packages } });
}

function nodeModule(root: string, pkg: string, version: string): void {
  writeFile(root, `node_modules/${pkg}/package.json`, JSON.stringify({ name: pkg, version }));
}

describe("installedVersion from package-lock.json", () => {
  it("reads the hoisted entry", () => {
    const dir = repo();
    writeFile(dir, "package-lock.json", npmLock({ "node_modules/skillfold": { version: "2.6.0" } }));
    assert.deepEqual(installedVersion("skillfold", dir), {
      version: "2.6.0",
      from: "package-lock.json",
    });
  });

  it("reads scoped packages", () => {
    const dir = repo();
    writeFile(dir, "package-lock.json", npmLock({ "node_modules/@playwright/cli": { version: "0.1.21" } }));
    assert.equal(installedVersion("@playwright/cli", dir)?.version, "0.1.21");
  });

  it("prefers the lockfile over a stale node_modules copy", () => {
    const dir = repo();
    writeFile(dir, "package-lock.json", npmLock({ "node_modules/tool": { version: "2.0.0" } }));
    nodeModule(dir, "tool", "1.0.0");
    assert.equal(installedVersion("tool", dir)?.version, "2.0.0");
  });

  it("finds a workspace's nested entry before the hoisted one", () => {
    const dir = repo();
    writeFile(
      dir,
      "package-lock.json",
      npmLock({
        "node_modules/tool": { version: "1.0.0" },
        "packages/app/node_modules/tool": { version: "2.0.0" },
      })
    );
    const app = join(dir, "packages", "app");
    mkdirSync(app, { recursive: true });
    assert.deepEqual(installedVersion("tool", app), {
      version: "2.0.0",
      from: join("..", "..", "package-lock.json"),
    });
    const other = join(dir, "packages", "other");
    mkdirSync(other, { recursive: true });
    assert.equal(installedVersion("tool", other)?.version, "1.0.0");
  });

  it("follows workspace links to the linked package's version", () => {
    const dir = repo();
    writeFile(
      dir,
      "package-lock.json",
      npmLock({
        "node_modules/tool": { resolved: "packages/tool", link: true },
        "packages/tool": { version: "3.1.4" },
      })
    );
    assert.equal(installedVersion("tool", dir)?.version, "3.1.4");
  });

  it("reads lockfileVersion 1", () => {
    const dir = repo();
    writeFile(dir, "package-lock.json", JSON.stringify({ lockfileVersion: 1, dependencies: { tool: { version: "1.2.3" } } }));
    assert.equal(installedVersion("tool", dir)?.version, "1.2.3");
  });

  it("prefers npm-shrinkwrap.json", () => {
    const dir = repo();
    writeFile(dir, "package-lock.json", npmLock({ "node_modules/tool": { version: "1.0.0" } }));
    writeFile(dir, "npm-shrinkwrap.json", npmLock({ "node_modules/tool": { version: "1.5.0" } }));
    assert.equal(installedVersion("tool", dir)?.version, "1.5.0");
  });

  it("ignores non-registry versions and falls back to node_modules", () => {
    const dir = repo();
    writeFile(dir, "package-lock.json", npmLock({ "node_modules/tool": { version: "file:../tool" } }));
    assert.equal(installedVersion("tool", dir), null);
    nodeModule(dir, "tool", "0.9.0");
    assert.equal(installedVersion("tool", dir)?.version, "0.9.0");
  });

  it("falls back to node_modules when the lockfile does not list the package", () => {
    const dir = repo();
    writeFile(dir, "package-lock.json", npmLock({}));
    nodeModule(dir, "tool", "4.0.0");
    const found = installedVersion("tool", dir);
    assert.equal(found?.version, "4.0.0");
    assert.equal(found?.from, join("node_modules", "tool"));
    assert.ok(found?.dir?.endsWith(join("node_modules", "tool")));
  });

  it("treats a corrupt lockfile as absent", () => {
    const dir = repo();
    writeFile(dir, "package-lock.json", "{ not json");
    assert.equal(installedVersion("tool", dir), null);
  });
});

describe("installedVersion from pnpm-lock.yaml", () => {
  it("reads v9 importers and strips peer suffixes", () => {
    const dir = repo();
    writeFile(
      dir,
      "pnpm-lock.yaml",
      [
        "lockfileVersion: '9.0'",
        "importers:",
        "  .:",
        "    devDependencies:",
        "      tool:",
        "        specifier: ^1.0.0",
        "        version: 1.4.0(react@18.3.1)",
      ].join("\n")
    );
    assert.deepEqual(installedVersion("tool", dir), { version: "1.4.0", from: "pnpm-lock.yaml" });
  });

  it("reads the workspace importer for a nested package", () => {
    const dir = repo();
    writeFile(
      dir,
      "pnpm-lock.yaml",
      [
        "lockfileVersion: '9.0'",
        "importers:",
        "  .: {}",
        "  apps/web:",
        "    dependencies:",
        "      tool:",
        "        specifier: 2.0.0",
        "        version: 2.0.0",
      ].join("\n")
    );
    const web = join(dir, "apps", "web");
    mkdirSync(web, { recursive: true });
    assert.equal(installedVersion("tool", web)?.version, "2.0.0");
  });

  it("reads v5 top-level dependencies with underscore peer suffixes", () => {
    const dir = repo();
    writeFile(dir, "pnpm-lock.yaml", "lockfileVersion: 5.4\ndependencies:\n  tool: 1.1.0_react@18.0.0\n");
    assert.equal(installedVersion("tool", dir)?.version, "1.1.0");
  });

  it("skips link: versions", () => {
    const dir = repo();
    writeFile(
      dir,
      "pnpm-lock.yaml",
      "lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      tool:\n        specifier: workspace:*\n        version: link:../tool\n"
    );
    assert.equal(installedVersion("tool", dir), null);
  });
});

describe("installedVersion lookup boundaries", () => {
  it("returns null when nothing is installed", () => {
    assert.equal(installedVersion("tool", repo()), null);
  });

  it("does not walk past the repository root", () => {
    const outer = join(tmp.path, `outer${counter++}`);
    writeFile(outer, "package-lock.json", npmLock({ "node_modules/tool": { version: "9.9.9" } }));
    const inner = join(outer, "inner");
    mkdirSync(join(inner, ".git"), { recursive: true });
    assert.equal(installedVersion("tool", inner), null);
  });

  it("walks up to a lockfile above the manifest directory", () => {
    const dir = repo();
    writeFile(dir, "package-lock.json", npmLock({ "node_modules/tool": { version: "1.0.0" } }));
    const sub = join(dir, "config", "agents");
    mkdirSync(sub, { recursive: true });
    assert.equal(installedVersion("tool", sub)?.version, "1.0.0");
  });
});

describe("installedVersion in global mode", () => {
  it("reads the global npm root", () => {
    const root = join(tmp.path, `global${counter++}`);
    nodeModule(root, "tool", "5.0.0");
    const globalRoot = () => join(root, "node_modules");
    const found = installedVersion("tool", repo(), { global: true, globalRoot });
    assert.equal(found?.version, "5.0.0");
    assert.equal(found?.dir, join(root, "node_modules", "tool"));
  });

  it("ignores project lockfiles", () => {
    const dir = repo();
    writeFile(dir, "package-lock.json", npmLock({ "node_modules/tool": { version: "1.0.0" } }));
    assert.equal(installedVersion("tool", dir, { global: true, globalRoot: () => null }), null);
  });

  it("falls back to the running CLI for its own package", () => {
    const self = { name: "skillfold", version: "2.7.0", dir: "/opt/skillfold" };
    const lookup = { global: true, globalRoot: () => null, self };
    assert.deepEqual(installedVersion("skillfold", repo(), lookup), {
      version: "2.7.0",
      from: "the running skillfold CLI",
      dir: "/opt/skillfold",
    });
    assert.equal(installedVersion("other", repo(), lookup), null);
  });

  it("prefers the global install over the running CLI", () => {
    const root = join(tmp.path, `global${counter++}`);
    nodeModule(root, "skillfold", "2.6.0");
    const lookup = {
      global: true,
      globalRoot: () => join(root, "node_modules"),
      self: { name: "skillfold", version: "2.7.0" },
    };
    assert.equal(installedVersion("skillfold", repo(), lookup)?.version, "2.6.0");
  });
});

describe("installedDrift", () => {
  const dir = repo();
  writeFile(dir, "package-lock.json", npmLock({ "node_modules/tool": { version: "2.0.0" } }));

  it("is null for sources that do not follow the installed package", () => {
    assert.equal(installedDrift('"x"', "npm:tool/x@1.0.0", "npm:tool/x@1.0.0", dir), null);
    assert.equal(installedDrift('"x"', "./skills/x", undefined, dir), null);
  });

  it("is null when the pin matches", () => {
    assert.equal(installedDrift('"x"', "npm:tool/x@installed", "npm:tool/x@2.0.0", dir), null);
  });

  it("reports a pin that trails the installed package", () => {
    const drift = installedDrift('"x"', "npm:tool/x@installed", "npm:tool/x@1.0.0", dir);
    assert.match(drift ?? "", /"x" follows tool@installed: 2\.0\.0 is installed \(package-lock\.json\) but the lockfile pins 1\.0\.0/);
    assert.match(drift ?? "", /run "skillfold install"/);
  });

  it("reports a package that is no longer installed", () => {
    const drift = installedDrift('"y"', "npm:gone/y@installed", "npm:gone/y@1.0.0", dir);
    assert.match(drift ?? "", /"y": gone@installed needs gone as a dependency/);
  });
});
