import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { searchSkills } from "./search.js";

// Capture console output
function captureConsole(): { logs: string[]; errors: string[]; restore: () => void } {
  const logs: string[] = [];
  const errors: string[] = [];
  const origLog = console.log;
  const origError = console.error;
  console.log = (...args: unknown[]) => logs.push(args.join(" "));
  console.error = (...args: unknown[]) => errors.push(args.join(" "));
  return {
    logs,
    errors,
    restore() {
      console.log = origLog;
      console.error = origError;
    },
  };
}

function makeFetchResponse(body: object, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const sampleResults = {
  objects: [
    {
      package: {
        name: "skillfold-planning",
        description: "Planning skills for AI agents",
        version: "1.0.0",
        keywords: ["skillfold-skill"],
        links: { npm: "https://www.npmjs.com/package/skillfold-planning" },
      },
      score: { detail: { popularity: 0.5 } },
    },
    {
      package: {
        name: "skillfold-testing",
        description: "Testing skills for AI agents",
        version: "2.1.0",
        keywords: ["skillfold-skill"],
        links: { npm: "https://www.npmjs.com/package/skillfold-testing" },
      },
      score: { detail: { popularity: 0.3 } },
    },
  ],
  total: 2,
};

describe("searchSkills", () => {
  let originalFetch: typeof globalThis.fetch;
  let originalExit: typeof process.exit;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalExit = process.exit;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.exit = originalExit;
  });

  it("displays results from npm registry", async () => {
    globalThis.fetch = async () => makeFetchResponse(sampleResults);
    const out = captureConsole();

    try {
      await searchSkills();
    } finally {
      out.restore();
    }

    const text = out.logs.join("\n");
    assert.ok(text.includes("Found 2 skills"));
    assert.ok(text.includes("skillfold-planning"));
    assert.ok(text.includes("v1.0.0"));
    assert.ok(text.includes("Planning skills for AI agents"));
    assert.ok(text.includes("skillfold-testing"));
    assert.ok(text.includes("v2.1.0"));
    assert.ok(text.includes("npm install <package>"));
    assert.ok(text.includes("imports: [npm:<package>]"));
  });

  it("passes query parameter to npm search", async () => {
    let calledUrl = "";
    globalThis.fetch = async (input: string | URL | Request) => {
      calledUrl = typeof input === "string" ? input : input.toString();
      return makeFetchResponse(sampleResults);
    };
    const out = captureConsole();

    try {
      await searchSkills("planning");
    } finally {
      out.restore();
    }

    assert.ok(calledUrl.includes("keywords%3Askillfold-skill"));
    assert.ok(calledUrl.includes("planning"));
  });

  it("displays singular 'skill' for one result", async () => {
    const singleResult = {
      objects: [sampleResults.objects[0]],
      total: 1,
    };
    globalThis.fetch = async () => makeFetchResponse(singleResult);
    const out = captureConsole();

    try {
      await searchSkills();
    } finally {
      out.restore();
    }

    const text = out.logs.join("\n");
    assert.ok(text.includes("Found 1 skill:"));
    assert.ok(!text.includes("Found 1 skills"));
  });

  it("shows message when no results found", async () => {
    globalThis.fetch = async () =>
      makeFetchResponse({ objects: [], total: 0 });
    const out = captureConsole();

    try {
      await searchSkills();
    } finally {
      out.restore();
    }

    const text = out.logs.join("\n");
    assert.ok(text.includes("No skillfold skills found"));
  });

  it("shows query in no-results message", async () => {
    globalThis.fetch = async () =>
      makeFetchResponse({ objects: [], total: 0 });
    const out = captureConsole();

    try {
      await searchSkills("nonexistent");
    } finally {
      out.restore();
    }

    const text = out.logs.join("\n");
    assert.ok(text.includes('No skillfold skills found matching "nonexistent"'));
  });

  it("handles network error", async () => {
    let exitCode: number | undefined;
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error("process.exit called");
    }) as typeof process.exit;

    globalThis.fetch = async () => {
      throw new Error("network failure");
    };
    const out = captureConsole();

    try {
      await searchSkills();
    } catch {
      // Expected: process.exit mock throws
    } finally {
      out.restore();
    }

    assert.equal(exitCode, 1);
    assert.ok(out.errors.join("\n").includes("could not reach npm registry"));
  });

  it("handles non-ok response", async () => {
    let exitCode: number | undefined;
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error("process.exit called");
    }) as typeof process.exit;

    globalThis.fetch = async () => makeFetchResponse({}, 503);
    const out = captureConsole();

    try {
      await searchSkills();
    } catch {
      // Expected: process.exit mock throws
    } finally {
      out.restore();
    }

    assert.equal(exitCode, 1);
    assert.ok(out.errors.join("\n").includes("npm registry returned 503"));
  });

  it("handles package with no description", async () => {
    const noDesc = {
      objects: [
        {
          package: {
            name: "skillfold-bare",
            description: "",
            version: "0.1.0",
            keywords: ["skillfold-skill"],
            links: { npm: "https://www.npmjs.com/package/skillfold-bare" },
          },
          score: { detail: { popularity: 0.1 } },
        },
      ],
      total: 1,
    };
    globalThis.fetch = async () => makeFetchResponse(noDesc);
    const out = captureConsole();

    try {
      await searchSkills();
    } finally {
      out.restore();
    }

    const text = out.logs.join("\n");
    assert.ok(text.includes("No description"));
  });

  it("uses correct npm search URL without query", async () => {
    let calledUrl = "";
    globalThis.fetch = async (input: string | URL | Request) => {
      calledUrl = typeof input === "string" ? input : input.toString();
      return makeFetchResponse({ objects: [], total: 0 });
    };
    const out = captureConsole();

    try {
      await searchSkills();
    } finally {
      out.restore();
    }

    assert.ok(calledUrl.startsWith("https://registry.npmjs.org/-/v1/search"));
    assert.ok(calledUrl.includes("keywords%3Askillfold-skill"));
    assert.ok(calledUrl.includes("size=25"));
  });
});
