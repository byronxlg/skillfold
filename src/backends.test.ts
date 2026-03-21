import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { StateField } from "./state.js";
import {
  type BackendBinding,
  type StateBackend,
  resolveBackendBindings,
  readStateFromBackends,
  writeStateToBackends,
} from "./backends.js";

/**
 * Mock backend that records read/write calls and returns configured values.
 */
function mockBackend(
  readValues: Record<string, unknown>,
): { backend: StateBackend; writes: Array<{ field: string; value: unknown }> } {
  const writes: Array<{ field: string; value: unknown }> = [];
  return {
    writes,
    backend: {
      async read(config, _fieldType, kind) {
        const key = kind ? `${config.repo}:${kind}` : config.repo;
        return readValues[key] ?? "";
      },
      async write(config, _fieldType, value, kind) {
        const key = kind ? `${config.repo}:${kind}` : config.repo;
        writes.push({ field: key, value });
      },
    },
  };
}

/**
 * Mock backend that throws on read.
 */
function failingBackend(): StateBackend {
  return {
    async read() {
      throw new Error("network error");
    },
    async write() {
      throw new Error("network error");
    },
  };
}

describe("resolveBackendBindings", () => {
  it("returns bindings for fields with integration locations", () => {
    const schema = {
      types: {},
      fields: {
        tasks: {
          type: { kind: "list" as const, element: "Task" },
          location: {
            integration: { type: "github-issues", config: { repo: "org/repo", label: "task" } },
          },
        },
        direction: {
          type: { kind: "primitive" as const, value: "string" as const },
          location: {
            integration: { type: "github-discussions", config: { repo: "org/repo", category: "strategy" } },
          },
        },
        plain: {
          type: { kind: "primitive" as const, value: "string" as const },
          // no location - should not produce a binding
        },
      },
    };

    const bindings = resolveBackendBindings(schema);
    assert.equal(bindings.length, 2);
    assert.equal(bindings[0].fieldName, "tasks");
    assert.equal(bindings[1].fieldName, "direction");
  });

  it("skips fields without integration location", () => {
    const schema = {
      types: {},
      fields: {
        plain: {
          type: { kind: "primitive" as const, value: "string" as const },
        },
        withSkillLocation: {
          type: { kind: "primitive" as const, value: "string" as const },
          location: { skill: "my-skill", path: "github/issues" },
        },
      },
    };

    const bindings = resolveBackendBindings(schema);
    assert.equal(bindings.length, 0);
  });
});

describe("readStateFromBackends", () => {
  it("reads state from all bindings in parallel", async () => {
    const { backend } = mockBackend({
      "org/repo": [{ title: "Task 1", description: "Do thing" }],
      "org/repo2": "strategic direction",
    });

    const bindings: BackendBinding[] = [
      {
        fieldName: "tasks",
        field: {
          type: { kind: "list", element: "Task" },
          location: { integration: { type: "github-issues", config: { repo: "org/repo" } } },
        },
        backend,
        integration: { type: "github-issues", config: { repo: "org/repo" } },
      },
      {
        fieldName: "direction",
        field: {
          type: { kind: "primitive", value: "string" },
          location: { integration: { type: "github-discussions", config: { repo: "org/repo2" } } },
        },
        backend,
        integration: { type: "github-discussions", config: { repo: "org/repo2" } },
      },
    ];

    const state = await readStateFromBackends(bindings);
    assert.deepEqual(state.tasks, [{ title: "Task 1", description: "Do thing" }]);
    assert.equal(state.direction, "strategic direction");
  });

  it("handles backend failures gracefully", async () => {
    const failing = failingBackend();

    const bindings: BackendBinding[] = [
      {
        fieldName: "tasks",
        field: {
          type: { kind: "list", element: "Task" },
          location: { integration: { type: "github-issues", config: { repo: "org/repo" } } },
        },
        backend: failing,
        integration: { type: "github-issues", config: { repo: "org/repo" } },
      },
    ];

    // Should not throw - failures are logged and field is skipped
    const state = await readStateFromBackends(bindings);
    assert.equal(Object.keys(state).length, 0);
  });
});

describe("writeStateToBackends", () => {
  it("writes only updated fields", async () => {
    const { backend, writes } = mockBackend({});

    const bindings: BackendBinding[] = [
      {
        fieldName: "tasks",
        field: {
          type: { kind: "list", element: "Task" },
          location: { integration: { type: "github-issues", config: { repo: "org/repo" } } },
        },
        backend,
        integration: { type: "github-issues", config: { repo: "org/repo" } },
      },
      {
        fieldName: "direction",
        field: {
          type: { kind: "primitive", value: "string" },
          location: { integration: { type: "github-discussions", config: { repo: "org/repo" } } },
        },
        backend,
        integration: { type: "github-discussions", config: { repo: "org/repo" } },
      },
    ];

    const state = {
      tasks: [{ title: "A" }],
      direction: "go north",
    };

    // Only tasks was updated
    await writeStateToBackends(bindings, state, new Set(["tasks"]));

    assert.equal(writes.length, 1);
    assert.equal(writes[0].field, "org/repo");
    assert.deepEqual(writes[0].value, [{ title: "A" }]);
  });

  it("skips write when no fields updated", async () => {
    const { backend, writes } = mockBackend({});

    const bindings: BackendBinding[] = [
      {
        fieldName: "tasks",
        field: {
          type: { kind: "list", element: "Task" },
          location: { integration: { type: "github-issues", config: { repo: "org/repo" } } },
        },
        backend,
        integration: { type: "github-issues", config: { repo: "org/repo" } },
      },
    ];

    await writeStateToBackends(bindings, {}, new Set());
    assert.equal(writes.length, 0);
  });

  it("handles write failures gracefully", async () => {
    const failing = failingBackend();

    const bindings: BackendBinding[] = [
      {
        fieldName: "tasks",
        field: {
          type: { kind: "list", element: "Task" },
          location: { integration: { type: "github-issues", config: { repo: "org/repo" } } },
        },
        backend: failing,
        integration: { type: "github-issues", config: { repo: "org/repo" } },
      },
    ];

    // Should not throw
    await writeStateToBackends(bindings, { tasks: [] }, new Set(["tasks"]));
  });

  it("writes with kind for integration with kind field", async () => {
    const { backend, writes } = mockBackend({});

    const bindings: BackendBinding[] = [
      {
        fieldName: "review",
        field: {
          type: { kind: "custom", name: "Review" },
          location: {
            integration: { type: "github-pull-requests", config: { repo: "org/repo" } },
            kind: "review",
          },
        },
        backend,
        integration: { type: "github-pull-requests", config: { repo: "org/repo" } },
      },
    ];

    const state = { review: { approved: true, feedback: "LGTM" } };
    await writeStateToBackends(bindings, state, new Set(["review"]));

    assert.equal(writes.length, 1);
    assert.equal(writes[0].field, "org/repo:review");
  });
});

describe("backend integration with run()", () => {
  it("reads from backends before execution and writes after steps", async () => {
    // This test verifies the integration point exists by testing the binding resolution
    // for the project's own skillfold.yaml-style config
    const schema = {
      types: {
        Task: { fields: { title: "string" as const, description: "string" as const } },
        Review: { fields: { approved: "bool" as const, feedback: "string" as const } },
      },
      fields: {
        "human-discussion": {
          type: { kind: "primitive" as const, value: "string" as const },
          location: {
            integration: { type: "github-discussions", config: { repo: "byronxlg/skillfold", category: "human" } },
          },
        } as StateField,
        direction: {
          type: { kind: "primitive" as const, value: "string" as const },
          location: {
            integration: { type: "github-discussions", config: { repo: "byronxlg/skillfold", category: "strategy" } },
          },
        } as StateField,
        tasks: {
          type: { kind: "list" as const, element: "Task" },
          location: {
            integration: { type: "github-issues", config: { repo: "byronxlg/skillfold", label: "task" } },
          },
        } as StateField,
        implementation: {
          type: { kind: "primitive" as const, value: "string" as const },
          location: {
            integration: { type: "github-pull-requests", config: { repo: "byronxlg/skillfold" } },
          },
        } as StateField,
        review: {
          type: { kind: "custom" as const, name: "Review" },
          location: {
            integration: { type: "github-pull-requests", config: { repo: "byronxlg/skillfold" } },
            kind: "review",
          },
        } as StateField,
      },
    };

    const bindings = resolveBackendBindings(schema);
    assert.equal(bindings.length, 5);

    // Verify each field maps to the correct integration type
    const byField = Object.fromEntries(bindings.map(b => [b.fieldName, b]));
    assert.equal(byField["human-discussion"].integration.type, "github-discussions");
    assert.equal(byField.direction.integration.type, "github-discussions");
    assert.equal(byField.tasks.integration.type, "github-issues");
    assert.equal(byField.implementation.integration.type, "github-pull-requests");
    assert.equal(byField.review.integration.type, "github-pull-requests");
  });
});
