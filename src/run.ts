import { execFile, execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import { type Config } from "./config.js";
import { type CompileTarget, expandComposedBodies } from "./compiler.js";
import { RunError } from "./errors.js";
import {
  type ConditionalBranch,
  type GraphNode,
  type WhenClause,
  isAsyncNode,
  isConditionalThen,
  isMapNode,
  isSubFlowNode,
  parseWhenClause,
} from "./graph.js";

const execFileAsync = promisify(execFile);

/** Default maximum loop iterations before aborting. */
export const DEFAULT_MAX_ITERATIONS = 10;

export interface RunOptions {
  config: Config;
  bodies: Map<string, string>;
  target: CompileTarget;
  outDir: string;
  dryRun: boolean;
  maxIterations?: number;
}

export interface StepResult {
  step: number;
  agent: string;
  status: "ok" | "error" | "skipped";
  error?: string;
}

export interface RunResult {
  steps: StepResult[];
  state: Record<string, unknown>;
}

export interface Spawner {
  spawn(
    agentName: string,
    skillContent: string,
    state: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
}

export class ClaudeSpawner implements Spawner {
  constructor() {
    try {
      execFileSync("claude", ["--version"], { stdio: "pipe" });
    } catch {
      throw new RunError(
        "claude CLI not found. Install it from https://docs.anthropic.com/en/docs/claude-cli",
      );
    }
  }

  async spawn(
    _agentName: string,
    skillContent: string,
    state: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const prompt = [
      skillContent,
      "",
      "Current state:",
      "```json",
      JSON.stringify(state, null, 2),
      "```",
      "",
      "After completing your task, output your state updates as a JSON block in a fenced code block tagged `json` with the key `stateUpdates`. Only include fields you want to update.",
    ].join("\n");

    const { stdout } = await execFileAsync("claude", ["--print", "-p", prompt], {
      maxBuffer: 10 * 1024 * 1024,
    });

    return parseStateUpdates(stdout);
  }
}

/**
 * Parse agent output looking for a JSON code block containing stateUpdates.
 */
function parseStateUpdates(output: string): Record<string, unknown> {
  const jsonBlockRe = /```json\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = jsonBlockRe.exec(output)) !== null) {
    try {
      const parsed: unknown = JSON.parse(match[1]);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed) &&
        "stateUpdates" in parsed
      ) {
        const updates = (parsed as Record<string, unknown>).stateUpdates;
        if (typeof updates === "object" && updates !== null && !Array.isArray(updates)) {
          return updates as Record<string, unknown>;
        }
      }
    } catch {
      // Not valid JSON, try next block
    }
  }

  return {};
}

/**
 * Strip the "state." prefix from field paths used in reads/writes.
 */
function stripStatePrefix(path: string): string {
  return path.startsWith("state.") ? path.slice("state.".length) : path;
}

/**
 * Get the node label (agent name) for a graph node.
 */
function nodeLabel(node: GraphNode): string {
  if (isMapNode(node)) return "map";
  if (isSubFlowNode(node)) return node.name;
  if (isAsyncNode(node)) return node.name;
  return node.skill;
}

/**
 * Build an index mapping node labels to their array indices for O(1) lookup.
 */
function buildNodeIndex(nodes: GraphNode[]): Map<string, number> {
  const index = new Map<string, number>();
  for (let i = 0; i < nodes.length; i++) {
    const label = nodeLabel(nodes[i]);
    if (!index.has(label)) {
      index.set(label, i);
    }
  }
  return index;
}

/**
 * Read a nested value from the state object by dot-separated path.
 * For example, "review.approved" reads state.review.approved.
 */
export function readStatePath(
  state: Record<string, unknown>,
  path: string,
): unknown {
  const stripped = stripStatePrefix(path);
  const parts = stripped.split(".");
  let current: unknown = state;

  for (const part of parts) {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Evaluate a single when-clause against the current state.
 */
export function evaluateWhenClause(
  clause: WhenClause,
  state: Record<string, unknown>,
): boolean {
  const actual = readStatePath(state, clause.path);

  // Coerce for comparison: the clause value is already typed (string | boolean | number)
  // from parseWhenValue. We compare loosely to handle string/boolean mismatches in state JSON.
  if (clause.operator === "==") {
    return actual === clause.value;
  }
  // clause.operator === "!="
  return actual !== clause.value;
}

/**
 * Evaluate conditional branches and return the target node label of the first matching branch.
 * Returns undefined if no branch matches.
 */
export function evaluateConditionalBranches(
  branches: ConditionalBranch[],
  state: Record<string, unknown>,
): string | undefined {
  for (const branch of branches) {
    const clause = parseWhenClause(branch.when, "run");
    if (evaluateWhenClause(clause, state)) {
      return branch.to;
    }
  }
  return undefined;
}

/**
 * Determine the next node index after executing a node, based on its `then` field
 * and the current state. Returns -1 to signal "end".
 */
function resolveNextIndex(
  node: GraphNode,
  currentIndex: number,
  nodes: GraphNode[],
  nodeIndex: Map<string, number>,
  state: Record<string, unknown>,
): number {
  if (node.then === undefined) {
    // Implicit fall-through to next sequential node
    const next = currentIndex + 1;
    return next < nodes.length ? next : -1;
  }

  if (!isConditionalThen(node.then)) {
    // Simple string target
    if (node.then === "end") return -1;
    const targetIdx = nodeIndex.get(node.then);
    if (targetIdx === undefined) {
      throw new RunError(
        `Node "${nodeLabel(node)}": transition target "${node.then}" not found`,
      );
    }
    return targetIdx;
  }

  // Conditional routing: evaluate branches
  const target = evaluateConditionalBranches(node.then, state);
  if (target === undefined) {
    throw new RunError(
      `Node "${nodeLabel(node)}": no conditional branch matched the current state`,
    );
  }
  if (target === "end") return -1;
  const targetIdx = nodeIndex.get(target);
  if (targetIdx === undefined) {
    throw new RunError(
      `Node "${nodeLabel(node)}": conditional target "${target}" not found`,
    );
  }
  return targetIdx;
}

export async function run(
  options: RunOptions,
  spawner?: Spawner,
): Promise<RunResult> {
  const { config, bodies, dryRun, maxIterations } = options;
  const iterLimit = maxIterations ?? DEFAULT_MAX_ITERATIONS;

  if (!config.team) {
    throw new RunError("Config has no team.flow defined - nothing to run");
  }

  const nodes = config.team.flow.nodes;
  const composedBodies = expandComposedBodies(config, bodies);
  const nodeIndex = buildNodeIndex(nodes);

  // Load initial state from state.json if it exists
  const statePath = join(process.cwd(), "state.json");
  let state: Record<string, unknown> = {};
  if (!dryRun && existsSync(statePath)) {
    try {
      const raw = readFileSync(statePath, "utf-8");
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        state = parsed as Record<string, unknown>;
      }
    } catch {
      // Ignore malformed state.json, start fresh
    }
  }

  const activeSpawner = dryRun ? undefined : (spawner ?? new ClaudeSpawner());
  const steps: StepResult[] = [];

  // Track per-node visit counts for loop detection
  const visitCounts = new Map<number, number>();

  // Walk the graph starting from node 0
  let currentIdx = nodes.length > 0 ? 0 : -1;
  let stepNumber = 0;

  while (currentIdx >= 0 && currentIdx < nodes.length) {
    const node = nodes[currentIdx];
    stepNumber++;
    const label = nodeLabel(node);

    // Loop guard: check if we've visited this node too many times
    const visits = (visitCounts.get(currentIdx) ?? 0) + 1;
    visitCounts.set(currentIdx, visits);
    if (visits > iterLimit) {
      throw new RunError(
        `Node "${label}": exceeded max iterations (${iterLimit}) - possible infinite loop`,
      );
    }

    if (isMapNode(node)) {
      throw new RunError(
        `Step ${stepNumber} "map": map nodes not supported in skillfold run - use the orchestrator`,
      );
    }

    if (isSubFlowNode(node)) {
      throw new RunError(
        `Step ${stepNumber} "${label}": sub-flow nodes not supported in skillfold run - use the orchestrator`,
      );
    }

    if (isAsyncNode(node)) {
      if (dryRun) {
        process.stderr.write(
          `Step ${stepNumber}: [skip] ${label} (async)\n`,
        );
      }
      steps.push({ step: stepNumber, agent: label, status: "skipped" });
      currentIdx = resolveNextIndex(node, currentIdx, nodes, nodeIndex, state);
      continue;
    }

    // StepNode
    const skillBody = composedBodies.get(node.skill);
    if (!skillBody) {
      throw new RunError(
        `Step ${stepNumber} "${node.skill}": no composed skill body found`,
      );
    }

    if (dryRun) {
      const reads = node.reads.map(stripStatePrefix);
      const writes = node.writes.map(stripStatePrefix);
      process.stderr.write(
        `Step ${stepNumber}: ${node.skill}` +
          (reads.length > 0 ? ` reads=[${reads.join(", ")}]` : "") +
          (writes.length > 0 ? ` writes=[${writes.join(", ")}]` : "") +
          "\n",
      );
      steps.push({ step: stepNumber, agent: node.skill, status: "skipped" });

      // In dry-run mode with conditionals, we cannot evaluate the branches
      // (no real state). Fall through to next sequential node.
      if (node.then !== undefined && isConditionalThen(node.then)) {
        currentIdx = currentIdx + 1 < nodes.length ? currentIdx + 1 : -1;
      } else {
        currentIdx = resolveNextIndex(node, currentIdx, nodes, nodeIndex, state);
      }
      continue;
    }

    try {
      const updates = await activeSpawner!.spawn(node.skill, skillBody, state);

      // Apply state updates (only for fields declared in writes)
      for (const writePath of node.writes) {
        const field = stripStatePrefix(writePath);
        if (field in updates) {
          state[field] = updates[field];
        }
      }

      // Write updated state to disk after each step
      writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf-8");

      steps.push({ step: stepNumber, agent: node.skill, status: "ok" });
      currentIdx = resolveNextIndex(node, currentIdx, nodes, nodeIndex, state);
    } catch (err) {
      // Re-throw routing errors (these are infrastructure failures, not agent errors)
      if (err instanceof RunError) throw err;

      const message = err instanceof Error ? err.message : String(err);
      steps.push({
        step: stepNumber,
        agent: node.skill,
        status: "error",
        error: message,
      });
      // Stop on first agent error
      break;
    }
  }

  return { steps, state };
}
