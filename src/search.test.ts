import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderSearchHits, searchSkills } from "./search.js";
import { makeFetcher } from "./testutil.js";

const RESULT = {
  total: 2,
  objects: [
    {
      package: {
        name: "skillfold",
        version: "2.0.0",
        description: "Declarative skill manager",
        keywords: ["skillfold-skill"],
      },
    },
    { package: { name: "tdd-skill", version: "0.3.0" } },
  ],
};

describe("searchSkills", () => {
  it("queries the registry with the skill keyword", async () => {
    const { fetcher, requests } = makeFetcher({
      "https://registry.npmjs.org/-/v1/search": RESULT,
    });
    const hits = await searchSkills("tdd", fetcher);
    assert.match(requests[0], /keywords%3Askillfold-skill/);
    assert.match(requests[0], /tdd/);
    assert.equal(hits.length, 2);
    assert.equal(hits[0].name, "skillfold");
  });

  it("throws on registry errors", async () => {
    const fetcher = (async () => new Response("nope", { status: 503 })) as typeof fetch;
    await assert.rejects(searchSkills(undefined, fetcher), /503/);
  });
});

describe("renderSearchHits", () => {
  it("renders hits with an add hint", () => {
    const text = renderSearchHits(
      [{ name: "x", version: "1.0.0", description: "desc", skills: [] }],
      "x"
    );
    assert.match(text, /x {2}1\.0\.0/);
    assert.match(text, /skillfold add npm:/);
  });

  it("handles empty results", () => {
    assert.match(renderSearchHits([], "nope"), /no published skills match "nope"/);
  });
});
