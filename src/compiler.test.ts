import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { Config } from "./config.js";
import { CompileError } from "./errors.js";
import { compile } from "./compiler.js";

function makeTmpDir(): string {
  const dir = join(tmpdir(), `skillfold-compiler-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("compile", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("single composed skill produces file with bodies joined by double newline", () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");

    const config: Config = {
      name: "test",
      skills: {
        lint: { path: "./skills/lint" },
        format: { path: "./skills/format" },
        quality: { compose: ["lint", "format"] },
      },
    };

    const bodies = new Map<string, string>();
    bodies.set("lint", "Run the linter.");
    bodies.set("format", "Format the code.");

    const results = compile(config, bodies, outDir);

    assert.equal(results.length, 1);
    assert.equal(results[0].name, "quality");

    const content = readFileSync(results[0].path, "utf-8");
    assert.equal(content, "Run the linter.\n\nFormat the code.\n");
  });

  it("recursive composition flattens to all leaf bodies in correct order", () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");

    const config: Config = {
      name: "test",
      skills: {
        a: { path: "./skills/a" },
        b: { path: "./skills/b" },
        c: { path: "./skills/c" },
        inner: { compose: ["a", "b"] },
        outer: { compose: ["inner", "c"] },
      },
    };

    const bodies = new Map<string, string>();
    bodies.set("a", "Body A");
    bodies.set("b", "Body B");
    bodies.set("c", "Body C");

    const results = compile(config, bodies, outDir);

    const outerResult = results.find((r) => r.name === "outer");
    assert.ok(outerResult);

    const content = readFileSync(outerResult.path, "utf-8");
    assert.equal(content, "Body A\n\nBody B\n\nBody C\n");
  });

  it("output files named {skill-name}.md", () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");

    const config: Config = {
      name: "test",
      skills: {
        leaf: { path: "./skills/leaf" },
        bundle: { compose: ["leaf"] },
      },
    };

    const bodies = new Map<string, string>();
    bodies.set("leaf", "Leaf body");

    const results = compile(config, bodies, outDir);

    assert.equal(results[0].path, join(outDir, "bundle.md"));
    assert.ok(existsSync(join(outDir, "bundle.md")));
  });

  it("atomic skills do not produce output files", () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");

    const config: Config = {
      name: "test",
      skills: {
        leaf: { path: "./skills/leaf" },
        bundle: { compose: ["leaf"] },
      },
    };

    const bodies = new Map<string, string>();
    bodies.set("leaf", "Leaf body");

    compile(config, bodies, outDir);

    assert.ok(!existsSync(join(outDir, "leaf.md")));
  });

  it("unknown skill reference throws CompileError", () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");

    const config: Config = {
      name: "test",
      skills: {
        broken: { compose: ["nonexistent"] },
      },
    };

    const bodies = new Map<string, string>();

    assert.throws(() => compile(config, bodies, outDir), (err: unknown) => {
      assert.ok(err instanceof CompileError);
      assert.match(err.message, /Unknown skill/);
      return true;
    });
  });

  it("missing body for atomic skill throws CompileError", () => {
    tmpDir = makeTmpDir();
    const outDir = join(tmpDir, "dist");

    const config: Config = {
      name: "test",
      skills: {
        leaf: { path: "./skills/leaf" },
        bundle: { compose: ["leaf"] },
      },
    };

    // Intentionally omit body for "leaf"
    const bodies = new Map<string, string>();

    assert.throws(() => compile(config, bodies, outDir), (err: unknown) => {
      assert.ok(err instanceof CompileError);
      assert.match(err.message, /No resolved body for atomic skill/);
      return true;
    });
  });
});
