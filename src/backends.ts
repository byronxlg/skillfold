import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { RunError } from "./errors.js";
import { type IntegrationLocation } from "./integrations.js";
import { type StateField, type StateSchema, type StateType } from "./state.js";

const execFileAsync = promisify(execFile);

/**
 * A state backend that can read from and write to an external service.
 */
export interface StateBackend {
  read(
    config: Record<string, string>,
    fieldType: StateType,
    kind?: string,
  ): Promise<unknown>;
  write(
    config: Record<string, string>,
    fieldType: StateType,
    value: unknown,
    kind?: string,
  ): Promise<void>;
}

/**
 * Run a gh CLI command and return stdout.
 */
async function gh(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("gh", args, {
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

/**
 * GitHub Issues backend.
 * Read: list issues by label/assignee -> Task array.
 * Write: create new issues, update existing ones (tracked via _github_number).
 */
class GitHubIssuesBackend implements StateBackend {
  async read(
    config: Record<string, string>,
    fieldType: StateType,
  ): Promise<unknown> {
    const args = [
      "issue", "list",
      "--repo", config.repo,
      "--state", "open",
      "--json", "number,title,body",
      "--limit", "100",
    ];
    if (config.label) {
      args.push("--label", config.label);
    }
    if (config.assignee) {
      args.push("--assignee", config.assignee);
    }

    const output = await gh(args);
    const issues = JSON.parse(output) as Array<{
      number: number;
      title: string;
      body: string;
    }>;

    if (fieldType.kind === "list") {
      return issues.map(issue => ({
        title: issue.title,
        description: issue.body ?? "",
        _github_number: issue.number,
      }));
    }

    return issues.length > 0 ? issues[0].body : "";
  }

  async write(
    config: Record<string, string>,
    fieldType: StateType,
    value: unknown,
  ): Promise<void> {
    if (fieldType.kind !== "list" || !Array.isArray(value)) return;

    for (const item of value) {
      if (typeof item !== "object" || item === null) continue;
      const task = item as Record<string, unknown>;
      const title = String(task.title ?? "");
      const body = String(task.description ?? "");

      if (typeof task._github_number === "number") {
        await gh([
          "issue", "edit",
          String(task._github_number),
          "--repo", config.repo,
          "--title", title,
          "--body", body,
        ]);
      } else {
        const createArgs = [
          "issue", "create",
          "--repo", config.repo,
          "--title", title,
          "--body", body,
        ];
        if (config.label) {
          createArgs.push("--label", config.label);
        }
        if (config.assignee) {
          createArgs.push("--assignee", config.assignee);
        }
        const createOutput = await gh(createArgs);
        const match = createOutput.trim().match(/\/issues\/(\d+)$/);
        if (match) {
          task._github_number = parseInt(match[1], 10);
        }
      }
    }
  }
}

/**
 * GitHub Discussions backend.
 * Read: fetch latest discussion in a category.
 * Write: create a new discussion or add a reply (kind: "reply").
 */
class GitHubDiscussionsBackend implements StateBackend {
  async read(
    config: Record<string, string>,
    _fieldType: StateType,
    kind?: string,
  ): Promise<unknown> {
    const [owner, name] = config.repo.split("/");
    const categoryFilter = config.category
      ? `, categoryId: $categoryId`
      : "";
    const categoryVar = config.category
      ? `, $categoryId: ID!`
      : "";

    let categoryId: string | undefined;
    if (config.category) {
      categoryId = await this.resolveCategoryId(owner, name, config.category);
      if (!categoryId) return "";
    }

    const query = `query($owner: String!, $name: String!${categoryVar}) {
  repository(owner: $owner, name: $name) {
    discussions(first: 1, orderBy: {field: CREATED_AT, direction: DESC}${categoryFilter}) {
      nodes {
        number
        title
        body
        comments(first: 1, orderBy: {field: CREATED_AT, direction: DESC}) {
          nodes { body }
        }
      }
    }
  }
}`;

    const variables: Record<string, string> = { owner, name };
    if (categoryId) {
      variables.categoryId = categoryId;
    }

    const output = await gh([
      "api", "graphql",
      "-f", `query=${query}`,
      ...Object.entries(variables).flatMap(([k, v]) => ["-f", `${k}=${v}`]),
    ]);
    const data = JSON.parse(output);
    const discussions = data?.data?.repository?.discussions?.nodes ?? [];
    if (discussions.length === 0) return "";

    const discussion = discussions[0];
    if (kind === "reply") {
      const comments = discussion.comments?.nodes ?? [];
      return comments.length > 0 ? comments[0].body : "";
    }
    return discussion.body ?? "";
  }

  async write(
    config: Record<string, string>,
    _fieldType: StateType,
    value: unknown,
    kind?: string,
  ): Promise<void> {
    if (typeof value !== "string" || !value) return;

    const [owner, name] = config.repo.split("/");
    const categoryId = config.category
      ? await this.resolveCategoryId(owner, name, config.category)
      : undefined;

    if (kind === "reply") {
      // Add a reply to the latest discussion in the category
      const discussionId = await this.getLatestDiscussionId(owner, name, categoryId);
      if (!discussionId) return;

      const mutation = `mutation($discussionId: ID!, $body: String!) {
  addDiscussionComment(input: {discussionId: $discussionId, body: $body}) {
    comment { id }
  }
}`;
      await gh([
        "api", "graphql",
        "-f", `query=${mutation}`,
        "-f", `discussionId=${discussionId}`,
        "-f", `body=${value}`,
      ]);
    } else {
      // Create a new discussion
      const repoId = await this.getRepoId(owner, name);
      if (!repoId || !categoryId) return;

      const mutation = `mutation($repoId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
  createDiscussion(input: {repositoryId: $repoId, categoryId: $categoryId, title: $title, body: $body}) {
    discussion { number }
  }
}`;
      const title = value.split("\n")[0].slice(0, 100) || "State update";
      await gh([
        "api", "graphql",
        "-f", `query=${mutation}`,
        "-f", `repoId=${repoId}`,
        "-f", `categoryId=${categoryId}`,
        "-f", `title=${title}`,
        "-f", `body=${value}`,
      ]);
    }
  }

  private async resolveCategoryId(
    owner: string,
    name: string,
    category: string,
  ): Promise<string | undefined> {
    const query = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    discussionCategories(first: 25) {
      nodes { id, name, slug }
    }
  }
}`;
    const output = await gh([
      "api", "graphql",
      "-f", `query=${query}`,
      "-f", `owner=${owner}`,
      "-f", `name=${name}`,
    ]);
    const data = JSON.parse(output);
    const categories = data?.data?.repository?.discussionCategories?.nodes ?? [];
    const match = categories.find(
      (c: { name: string; slug: string }) =>
        c.name.toLowerCase() === category.toLowerCase() ||
        c.slug.toLowerCase() === category.toLowerCase(),
    );
    return match?.id;
  }

  private async getLatestDiscussionId(
    owner: string,
    name: string,
    categoryId?: string,
  ): Promise<string | undefined> {
    const categoryFilter = categoryId ? `, categoryId: $categoryId` : "";
    const categoryVar = categoryId ? `, $categoryId: ID!` : "";

    const query = `query($owner: String!, $name: String!${categoryVar}) {
  repository(owner: $owner, name: $name) {
    discussions(first: 1, orderBy: {field: CREATED_AT, direction: DESC}${categoryFilter}) {
      nodes { id }
    }
  }
}`;
    const args = [
      "api", "graphql",
      "-f", `query=${query}`,
      "-f", `owner=${owner}`,
      "-f", `name=${name}`,
    ];
    if (categoryId) {
      args.push("-f", `categoryId=${categoryId}`);
    }

    const output = await gh(args);
    const data = JSON.parse(output);
    const nodes = data?.data?.repository?.discussions?.nodes ?? [];
    return nodes.length > 0 ? nodes[0].id : undefined;
  }

  private async getRepoId(
    owner: string,
    name: string,
  ): Promise<string | undefined> {
    const query = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) { id }
}`;
    const output = await gh([
      "api", "graphql",
      "-f", `query=${query}`,
      "-f", `owner=${owner}`,
      "-f", `name=${name}`,
    ]);
    const data = JSON.parse(output);
    return data?.data?.repository?.id;
  }
}

/**
 * GitHub Pull Requests backend.
 * Read: list open PRs and extract info.
 * Write: read-only - agents create PRs as part of their work.
 */
class GitHubPullRequestsBackend implements StateBackend {
  async read(
    config: Record<string, string>,
    _fieldType: StateType,
    kind?: string,
  ): Promise<unknown> {
    const args = [
      "pr", "list",
      "--repo", config.repo,
      "--state", config.state ?? "open",
      "--json", "number,title,body,reviews,headRefName",
      "--limit", "20",
    ];
    const output = await gh(args);
    const prs = JSON.parse(output) as Array<{
      number: number;
      title: string;
      body: string;
      headRefName: string;
      reviews: Array<{ body: string; state: string }>;
    }>;

    if (kind === "review") {
      // Return the latest review info across all open PRs
      for (const pr of prs) {
        if (pr.reviews && pr.reviews.length > 0) {
          const latest = pr.reviews[pr.reviews.length - 1];
          return {
            approved: latest.state === "APPROVED",
            feedback: latest.body ?? "",
          };
        }
      }
      return { approved: false, feedback: "" };
    }

    // Return the latest PR body as a string
    return prs.length > 0 ? (prs[0].body ?? "") : "";
  }

  async write(
    _config: Record<string, string>,
    _fieldType: StateType,
    _value: unknown,
    _kind?: string,
  ): Promise<void> {
    // PRs are created by agents during execution, not by the runner directly
  }
}

const BACKENDS: Record<string, StateBackend> = {
  "github-issues": new GitHubIssuesBackend(),
  "github-discussions": new GitHubDiscussionsBackend(),
  "github-pull-requests": new GitHubPullRequestsBackend(),
};

/**
 * Get the backend for an integration type, or undefined if none exists.
 */
export function getBackend(integrationName: string): StateBackend | undefined {
  return BACKENDS[integrationName];
}

/**
 * Describes a state field that has an external backend.
 */
export interface BackendBinding {
  fieldName: string;
  field: StateField;
  backend: StateBackend;
  integration: IntegrationLocation;
}

/**
 * Resolve backend bindings for all state fields with integration locations.
 */
export function resolveBackendBindings(
  schema: StateSchema,
): BackendBinding[] {
  const bindings: BackendBinding[] = [];

  for (const [fieldName, field] of Object.entries(schema.fields)) {
    if (!field.location?.integration) continue;

    const backend = getBackend(field.location.integration.type);
    if (!backend) continue;

    bindings.push({
      fieldName,
      field,
      backend,
      integration: field.location.integration,
    });
  }

  return bindings;
}

/**
 * Read initial state from all configured backends.
 * Returns a state object populated from external sources.
 * Failures are logged to stderr and the field is skipped (graceful fallback).
 */
export async function readStateFromBackends(
  bindings: BackendBinding[],
): Promise<Record<string, unknown>> {
  const state: Record<string, unknown> = {};

  const results = await Promise.allSettled(
    bindings.map(async (binding) => {
      const value = await binding.backend.read(
        binding.integration.config,
        binding.field.type,
        binding.field.location?.kind,
      );
      return { fieldName: binding.fieldName, value };
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      state[result.value.fieldName] = result.value.value;
    } else {
      const err = result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
      process.stderr.write(`Warning: failed to read state from backend: ${err}\n`);
    }
  }

  return state;
}

/**
 * Write state changes to backends for fields that were updated.
 * Only writes fields that appear in the updatedFields set.
 * Failures are logged to stderr (graceful fallback).
 */
export async function writeStateToBackends(
  bindings: BackendBinding[],
  state: Record<string, unknown>,
  updatedFields: Set<string>,
): Promise<void> {
  const toWrite = bindings.filter(b => updatedFields.has(b.fieldName));
  if (toWrite.length === 0) return;

  const results = await Promise.allSettled(
    toWrite.map(async (binding) => {
      const value = state[binding.fieldName];
      await binding.backend.write(
        binding.integration.config,
        binding.field.type,
        value,
        binding.field.location?.kind,
      );
    }),
  );

  for (const result of results) {
    if (result.status === "rejected") {
      const err = result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
      process.stderr.write(`Warning: failed to write state to backend: ${err}\n`);
    }
  }
}
