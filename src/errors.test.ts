import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { didYouMean, levenshtein, suggest } from "./errors.js";

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    assert.equal(levenshtein("abc", "abc"), 0);
  });

  it("returns length of other string when one is empty", () => {
    assert.equal(levenshtein("", "abc"), 3);
    assert.equal(levenshtein("abc", ""), 3);
  });

  it("returns 0 for two empty strings", () => {
    assert.equal(levenshtein("", ""), 0);
  });

  it("returns 1 for single-character substitution", () => {
    assert.equal(levenshtein("cat", "car"), 1);
  });

  it("returns 1 for single-character insertion", () => {
    assert.equal(levenshtein("lint", "lints"), 1);
  });

  it("returns 1 for single-character deletion", () => {
    assert.equal(levenshtein("lints", "lint"), 1);
  });

  it("handles transpositions as 2 edits", () => {
    assert.equal(levenshtein("ab", "ba"), 2);
  });

  it("computes distance for completely different strings", () => {
    assert.equal(levenshtein("abc", "xyz"), 3);
  });

  it("computes distance for a realistic typo", () => {
    // "reveiw" vs "review" - 2 edits (transpose e and i)
    assert.equal(levenshtein("reveiw", "review"), 2);
  });
});

describe("suggest", () => {
  const candidates = ["review", "lint", "format", "testing", "planning"];

  it("finds exact match with distance 0", () => {
    assert.equal(suggest("review", candidates), "review");
  });

  it("finds close match within default max distance", () => {
    assert.equal(suggest("reveiw", candidates), "review");
  });

  it("returns undefined when no match is close enough", () => {
    assert.equal(suggest("zzzzzzzzz", candidates), undefined);
  });

  it("respects custom max distance", () => {
    // "lnt" -> "lint" is distance 1, should match with maxDistance 1
    assert.equal(suggest("lnt", candidates, 1), "lint");
    // "reveiw" -> "review" is distance 2, should not match with maxDistance 1
    assert.equal(suggest("reveiw", candidates, 1), undefined);
  });

  it("returns undefined for empty candidates", () => {
    assert.equal(suggest("review", []), undefined);
  });

  it("picks the closest among multiple candidates", () => {
    assert.equal(suggest("formatt", candidates), "format");
  });
});

describe("didYouMean", () => {
  const candidates = ["review", "lint", "format"];

  it("returns suggestion suffix for close match", () => {
    const result = didYouMean("reveiw", candidates);
    assert.equal(result, '. Did you mean "review"?');
  });

  it("returns empty string when no match is close", () => {
    const result = didYouMean("zzzzzzzzz", candidates);
    assert.equal(result, "");
  });

  it("returns empty string for empty candidates", () => {
    const result = didYouMean("anything", []);
    assert.equal(result, "");
  });
});
