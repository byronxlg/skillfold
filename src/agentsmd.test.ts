import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import {
  buildRulesBlock,
  extractRulesBlock,
  syncAgentsMd,
  upsertRulesBlock,
} from "./agentsmd.js";
import { InstallError } from "./errors.js";
import { makeTmpDir, writeFile } from "./testutil.js";

const tmp = makeTmpDir();
after(() => tmp.cleanup());

const rule = (name: string, content: string) => ({ name, content: Buffer.from(content) });

describe("rules block round-trip", () => {
  it("recovers rule contents byte for byte", () => {
    const rules = [
      rule("with-newline", "Ends with newline.\n"),
      rule("without-newline", "No trailing newline"),
      rule("multi-blank", "Trailing blanks.\n\n\n"),
    ];
    const block = buildRulesBlock(rules);
    const extracted = extractRulesBlock(block, "AGENTS.md")!;
    assert.deepEqual(
      extracted.map((r) => [r.name, r.content.toString()]),
      rules.map((r) => [r.name, r.content.toString()])
    );
  });

  it("returns null when no block is present", () => {
    assert.equal(extractRulesBlock("# Plain AGENTS.md\n", "AGENTS.md"), null);
  });

  it("throws on unpaired markers", () => {
    assert.throws(
      () => extractRulesBlock("<!-- skillfold:rules:start -->\nno end", "AGENTS.md"),
      InstallError
    );
  });
});

describe("upsertRulesBlock", () => {
  const rules = [rule("style", "Be stylish.\n")];

  it("appends the block to existing hand-written content", () => {
    const out = upsertRulesBlock("# My repo\n\nHand-written.\n", rules);
    assert.match(out, /^# My repo\n\nHand-written\.\n\n<!-- skillfold:rules:start -->/);
    assert.match(out, /<!-- skillfold:rules:end -->\n$/);
  });

  it("replaces an existing block and preserves surrounding content", () => {
    const v1 = upsertRulesBlock("# Intro\n", rules);
    const v2 = upsertRulesBlock(`${v1}\nOutro.\n`, [rule("style", "Be very stylish.\n")]);
    assert.match(v2, /^# Intro\n/);
    assert.match(v2, /Outro\.\n$/);
    assert.match(v2, /Be very stylish\./);
    assert.ok(!v2.includes("Be stylish.\n"));
    assert.equal(v2.match(/skillfold:rules:start/g)!.length, 1);
  });

  it("removes the block with an empty rule set", () => {
    const withBlock = upsertRulesBlock("# Intro\n", rules);
    const removed = upsertRulesBlock(withBlock, []);
    assert.equal(removed.includes("skillfold:rules"), false);
    assert.match(removed, /# Intro/);
  });
});

describe("syncAgentsMd", () => {
  it("creates, keeps, and deletes a fully managed file", () => {
    const path = join(tmp.path, "managed", "AGENTS.md");
    assert.deepEqual(syncAgentsMd(path, [rule("style", "Rule.\n")]), {
      installed: ["style"],
      unchanged: [],
      pruned: [],
    });
    assert.deepEqual(syncAgentsMd(path, [rule("style", "Rule.\n")]), {
      installed: [],
      unchanged: ["style"],
      pruned: [],
    });
    assert.deepEqual(syncAgentsMd(path, []), {
      installed: [],
      unchanged: [],
      pruned: ["style"],
    });
    assert.ok(!existsSync(path));
    assert.deepEqual(syncAgentsMd(path, []), { installed: [], unchanged: [], pruned: [] });
  });

  it("reports per-rule granularity when one of several rules changes", () => {
    const path = join(tmp.path, "granular", "AGENTS.md");
    syncAgentsMd(path, [rule("a", "A.\n"), rule("b", "B.\n"), rule("c", "C.\n")]);
    const result = syncAgentsMd(path, [rule("a", "A.\n"), rule("b", "B2.\n")]);
    assert.deepEqual(result, { installed: ["b"], unchanged: ["a"], pruned: ["c"] });
  });

  it("preserves hand-written content around the block", () => {
    writeFile(tmp.path, "hand/AGENTS.md", "# Ours\n\nKeep me.\n");
    const path = join(tmp.path, "hand", "AGENTS.md");
    assert.deepEqual(syncAgentsMd(path, [rule("style", "Rule.\n")]).installed, ["style"]);
    assert.deepEqual(syncAgentsMd(path, []).pruned, ["style"]);
    const rest = readFileSync(path, "utf-8");
    assert.match(rest, /Keep me\./);
    assert.ok(!rest.includes("skillfold:rules"));
  });

  it("rejects rule content containing skillfold marker lines", () => {
    const path = join(tmp.path, "inject", "AGENTS.md");
    assert.throws(
      () => syncAgentsMd(path, [rule("evil", "text\n<!-- skillfold:rules:end -->\nmore\n")]),
      /contains a skillfold marker line/
    );
    assert.throws(
      () => syncAgentsMd(path, [rule("evil", "<!-- skillfold:rule:other -->\n")]),
      /contains a skillfold marker line/
    );
    assert.ok(!existsSync(path));
  });

  it("rejects rules that are not valid UTF-8", () => {
    const path = join(tmp.path, "binary", "AGENTS.md");
    const bad = { name: "bin", content: Buffer.from([0x68, 0x69, 0xff, 0xfe, 0x0a]) };
    assert.throws(() => syncAgentsMd(path, [bad]), /not valid UTF-8/);
  });
});
