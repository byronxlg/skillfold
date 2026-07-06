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
    assert.equal(syncAgentsMd(path, [rule("style", "Rule.\n")]), "installed");
    assert.equal(syncAgentsMd(path, [rule("style", "Rule.\n")]), "unchanged");
    assert.equal(syncAgentsMd(path, []), "removed");
    assert.ok(!existsSync(path));
    assert.equal(syncAgentsMd(path, []), "skipped");
  });

  it("preserves hand-written content around the block", () => {
    writeFile(tmp.path, "hand/AGENTS.md", "# Ours\n\nKeep me.\n");
    const path = join(tmp.path, "hand", "AGENTS.md");
    assert.equal(syncAgentsMd(path, [rule("style", "Rule.\n")]), "installed");
    assert.equal(syncAgentsMd(path, []), "removed");
    const rest = readFileSync(path, "utf-8");
    assert.match(rest, /Keep me\./);
    assert.ok(!rest.includes("skillfold:rules"));
  });
});
