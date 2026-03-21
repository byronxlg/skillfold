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
  isAsyncNode,
  isConditionalThen,
  isMapNode,
  isSubFlowNode,
  parseWhenClause,
} from "./graph.js";

const execFileAsync = promisify(execFile);

const DEFAULT_MAX_ITERATIONS = 10;
const DEFAULT_MAX_RETRIES = 3;

export type OnErrorMode = "retry" | "skip" | "abort";

export interface RunOptions {
  config: Config;
  bodies: Map<string, string>;
  target: CompileTarget;
  outDir: string;
  dryRun: boolean;
  maxIterations?: number;
  onError?: OnErrorMode;
  maxRetries?: number;
}

export interface StepResult {
  step: number;
  agent: string;
  status: "ok" | "error" | "skipped";
  error?: string;
  attempts?: number;
  durationMs?: number;
}

export interface RunResult {
  steps: StepResult[];
  state: Record<string, unknown>;
  durationMs: number;
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
 * Read a value from state by dot-separated path.
 * Supports nested access like "review.approved" -> state.review.approved
 */
export function getStateValue(
  state: Record<string, unknown>,
  path: string,
): unknown {
  const stripped = stripStatePrefix(path);
  const parts = stripped.split(".");
  let current: unknown = state;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Evaluate a when-clause expression against the current state.
 * Returns true if the condition matches.
 */
export function evaluateWhenClause(
  expression: string,
  state: Record<string, unknown>,
): boolean {
  const clause = parseWhenClause(expression, "run");
  const actual = getStateValue(state, clause.path);

  if (clause.operator === "==") {
    return actual === clause.value;
  }
  // operator === "!="
  return actual !== clause.value;
}

/**
 * Evaluate conditional branches against state and return the target node name.
 * Returns undefined if no branch matches (which is an error condition).
 */
function resolveConditionalTarget(
  branches: ConditionalBranch[],
  state: Record<string, unknown>,
): string | undefined {
  for (const branch of branches) {
    if (evaluateWhenClause(branch.when, state)) {
      return branch.to;
    }
  }
  return undefined;
}

/**
 * Format a duration in milliseconds as a human-readable string.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

export async function run(
  options: RunOptions,
  spawner?: Spawner,
): Promise<RunResult> {
  const { config, bodies, dryRun } = options;
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const onError: OnErrorMode = options.onError ?? "abort";
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

  if (!config.team) {
    throw new RunError("Config has no team.flow defined - nothing to run");
  }

  const nodes = config.team.flow.nodes;
  const composedBodies = expandComposedBodies(config, bodies);

  // Build node lookup: label -> index
  const nodeLookup = new Map<string, number>();
  for (let i = 0; i < nodes.length; i++) {
    const label = nodeLabel(nodes[i]);
    if (!nodeLookup.has(label)) {
      nodeLookup.set(label, i);
    }
  }

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
  const pipelineStart = Date.now();

  // Track visit counts per node for loop detection
  const visitCounts = new Map<number, number>();

  let currentIndex = 0;
  let stepNumber = 0;

  while (currentIndex >= 0 && currentIndex < nodes.length) {
    const node = nodes[currentIndex];
    stepNumber++;
    const label = nodeLabel(node);

    // Check iteration limit for loops
    const visits = (visitCounts.get(currentIndex) ?? 0) + 1;
    visitCounts.set(currentIndex, visits);
    if (visits > maxIterations) {
      throw new RunError(
        `Step ${stepNumber} "${label}": exceeded max iterations (${maxIterations}) - possible infinite loop`,
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

      // Resolve next node
      const nextIndex = resolveNextIndex(node, currentIndex, nodeLookup, state, dryRun);
      if (nextIndex === -1) break; // "end" target
      currentIndex = nextIndex;
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

      // Resolve next node
      const nextIndex = resolveNextIndex(node, currentIndex, nodeLookup, state, dryRun);
      if (nextIndex === -1) break;
      currentIndex = nextIndex;
      continue;
    }

    const stepStart = Date.now();
    let stepSucceeded = false;
    let lastError: string | undefined;
    let attempts = 0;
    const attemptsAllowed = onError === "retry" ? maxRetries : 1;

    for (let attempt = 1; attempt <= attemptsAllowed; attempt++) {
      attempts = attempt;
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

        stepSucceeded = true;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    const stepDuration = Date.now() - stepStart;

    if (stepSucceeded) {
      steps.push({
        step: stepNumber,
        agent: node.skill,
        status: "ok",
        attempts: attempts > 1 ? attempts : undefined,
        durationMs: stepDuration,
      });
    } else {
      // Record error in state for debugging
      const errors: unknown[] = Array.isArray(state._errors) ? state._errors : [];
      errors.push({
        step: stepNumber,
        agent: node.skill,
        error: lastError,
        attempts,
      });
      state._errors = errors;
      writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf-8");

      if (onError === "skip") {
        steps.push({
          step: stepNumber,
          agent: node.skill,
          status: "skipped",
          error: lastError,
          attempts,
          durationMs: stepDuration,
        });
      } else {
        // abort or retry-exhausted
        steps.push({
          step: stepNumber,
          agent: node.skill,
          status: "error",
          error: lastError,
          attempts: onError === "retry" ? attempts : undefined,
          durationMs: stepDuration,
        });
        break;
      }
    }

    // Resolve next node (outside try/catch so routing errors propagate)
    const nextIndex = resolveNextIndex(node, currentIndex, nodeLookup, state, dryRun);
    if (nextIndex === -1) break;
    currentIndex = nextIndex;
  }

  const pipelineDuration = Date.now() - pipelineStart;
  return { steps, state, durationMs: pipelineDuration };
}

/**
 * Determine the next node index based on the current node's `then` field.
 * Returns -1 to signal "end" (stop execution), or the index of the next node.
 */
function resolveNextIndex(
  node: GraphNode,
  currentIndex: number,
  nodeLookup: Map<string, number>,
  state: Record<string, unknown>,
  dryRun: boolean,
): number {
  if (node.then === undefined) {
    // Implicit fall-through to next sequential node
    return currentIndex + 1;
  }

  if (isConditionalThen(node.then)) {
    if (dryRun) {
      // In dry-run mode we have no real state to evaluate, so fall through sequentially
      return currentIndex + 1;
    }
    const target = resolveConditionalTarget(node.then, state);
    if (target === undefined) {
      const label = nodeLabel(node);
      throw new RunError(
        `Step "${label}": no conditional branch matched current state`,
      );
    }
    if (target === "end") return -1;
    const idx = nodeLookup.get(target);
    if (idx === undefined) {
      throw new RunError(
        `Step "${nodeLabel(node)}": conditional target "${target}" not found in flow`,
      );
    }
    return idx;
  }

  // Simple string then
  if (node.then === "end") return -1;

  const idx = nodeLookup.get(node.then);
  if (idx === undefined) {
    throw new RunError(
      `Step "${nodeLabel(node)}": target "${node.then}" not found in flow`,
    );
  }
  return idx;
}
