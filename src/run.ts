import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  type BackendBinding,
  readStateFromBackends,
  resolveBackendBindings,
  writeStateToBackends,
} from "./backends.js";
import { type Config } from "./config.js";
import { type CompileTarget, expandComposedBodies } from "./compiler.js";
import { RunError } from "./errors.js";
import {
  type ConditionalBranch,
  type GraphNode,
  type MapNode,
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
  resume?: boolean;
  configHash?: string;
  spawnerType?: SpawnerType;
}

export interface Checkpoint {
  configHash: string;
  completedSteps: string[];
  currentStepIndex: number;
  state: Record<string, unknown>;
  startedAt: string;
  /** Tracks completed item indices for map nodes during resume. */
  completedMapItems?: Record<string, number[]>;
}

export interface MapItemResult {
  index: number;
  status: "ok" | "error" | "skipped";
  steps: StepResult[];
  error?: string;
  durationMs?: number;
}

export interface StepResult {
  step: number;
  agent: string;
  status: "ok" | "error" | "skipped";
  error?: string;
  attempts?: number;
  durationMs?: number;
  mapItems?: MapItemResult[];
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

export type SpawnerType = "cli" | "sdk";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic import of optional peer dep
type SdkQueryFn = (args: { prompt: string; options?: Record<string, unknown> }) => AsyncIterable<Record<string, unknown>>;

export class SdkSpawner implements Spawner {
  private queryFn: SdkQueryFn | undefined;

  async spawn(
    agentName: string,
    skillContent: string,
    state: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!this.queryFn) {
      try {
        // Dynamic import - SDK is an optional peer dependency
        // Module name constructed to prevent tsc from resolving it at compile time
        const modName = ["@anthropic-ai", "claude-agent-sdk"].join("/");
        const sdk: { query: SdkQueryFn } = await import(modName);
        this.queryFn = sdk.query;
      } catch {
        throw new RunError(
          "Agent SDK not found. Install it with: npm install @anthropic-ai/claude-agent-sdk",
        );
      }
    }

    const prompt = [
      skillContent,
      "",
      "Current state:",
      "```json",
      JSON.stringify(state, null, 2),
      "```",
      "",
      "Complete your task. When done, output your state updates as a JSON block in a fenced code block tagged `json` with the key `stateUpdates`. Only include fields you want to update.",
    ].join("\n");

    const q = this.queryFn({
      prompt,
      options: {
        systemPrompt: { type: "preset", preset: "claude_code" },
        tools: { type: "preset", preset: "claude_code" },
        settingSources: ["user", "project"],
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
      },
    });

    let resultText = "";
    for await (const message of q) {
      if (
        message.type === "result" &&
        (message as Record<string, unknown>).subtype === "success"
      ) {
        resultText = (message as Record<string, unknown>).result as string;
      } else if (
        message.type === "result" &&
        (message as Record<string, unknown>).subtype !== "success"
      ) {
        throw new RunError(
          `Agent "${agentName}" failed: ${(message as Record<string, unknown>).subtype}`,
        );
      }
    }

    return parseStateUpdates(resultText);
  }
}

/**
 * Create a spawner based on the type string.
 * Falls back to ClaudeSpawner if SDK is not available.
 */
export function createSpawner(type: SpawnerType): Spawner {
  if (type === "sdk") {
    return new SdkSpawner();
  }
  return new ClaudeSpawner();
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

const CHECKPOINT_DIR = ".skillfold/run";
const CHECKPOINT_FILE = "checkpoint.json";

function checkpointPath(): string {
  return join(process.cwd(), CHECKPOINT_DIR, CHECKPOINT_FILE);
}

function loadCheckpoint(): Checkpoint | undefined {
  const path = checkpointPath();
  if (!existsSync(path)) return undefined;
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as Checkpoint;
}

function saveCheckpoint(checkpoint: Checkpoint): void {
  const dir = join(process.cwd(), CHECKPOINT_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(checkpointPath(), JSON.stringify(checkpoint, null, 2) + "\n", "utf-8");
}

function clearCheckpointDir(): void {
  const dir = join(process.cwd(), CHECKPOINT_DIR);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

interface MapExecutionResult {
  stepResult: StepResult;
  updatedItems: unknown[];
}

/**
 * Execute a map node by running its subgraph for each item in the list concurrently.
 */
async function executeMapNode(
  node: MapNode,
  stepNumber: number,
  state: Record<string, unknown>,
  composedBodies: Map<string, string>,
  spawner: Spawner | undefined,
  dryRun: boolean,
  onError: OnErrorMode,
  maxRetries: number,
  maxIterations: number,
  _completedSteps: string[],
  _configHash: string,
  _startedAt: string,
  _currentIndex: number,
): Promise<MapExecutionResult> {
  const overField = stripStatePrefix(node.over);
  const items = state[overField];

  if (dryRun) {
    const count = Array.isArray(items) ? items.length : 0;
    process.stderr.write(
      `Step ${stepNumber}: map over ${node.over} (${count} items)\n`,
    );
    for (let si = 0; si < node.flow.length; si++) {
      const subNode = node.flow[si];
      const subLabel = nodeLabel(subNode);
      process.stderr.write(
        `  Step ${stepNumber}.${si + 1}: ${subLabel}\n`,
      );
    }
    return {
      stepResult: {
        step: stepNumber,
        agent: "map",
        status: "skipped",
        mapItems: Array.isArray(items)
          ? items.map((_, i) => ({ index: i, status: "skipped" as const, steps: [] as StepResult[] }))
          : [],
      },
      updatedItems: Array.isArray(items) ? items : [],
    };
  }

  if (!Array.isArray(items)) {
    throw new RunError(
      `Step ${stepNumber} "map": "${node.over}" is not an array in current state`,
    );
  }

  const mapStart = Date.now();

  // Execute all items concurrently
  const itemPromises = items.map((item, itemIndex) =>
    executeMapItem(
      node,
      stepNumber,
      itemIndex,
      item,
      state,
      composedBodies,
      spawner!,
      onError,
      maxRetries,
      maxIterations,
    ),
  );

  const itemResults = await Promise.allSettled(itemPromises);

  const mapItems: MapItemResult[] = [];
  const updatedItems: unknown[] = [...items];
  let hasError = false;

  for (let i = 0; i < itemResults.length; i++) {
    const result = itemResults[i];
    if (result.status === "fulfilled") {
      mapItems.push(result.value.itemResult);
      updatedItems[i] = result.value.updatedItem;
      if (result.value.itemResult.status === "error") {
        hasError = true;
      }
    } else {
      hasError = true;
      mapItems.push({
        index: i,
        status: "error",
        steps: [],
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }

  const mapDuration = Date.now() - mapStart;

  // Determine overall map status
  const allOk = mapItems.every(r => r.status === "ok" || r.status === "skipped");
  const overallStatus: "ok" | "error" | "skipped" =
    allOk ? "ok" : (onError === "skip" ? "ok" : "error");

  return {
    stepResult: {
      step: stepNumber,
      agent: "map",
      status: overallStatus,
      durationMs: mapDuration,
      mapItems,
    },
    updatedItems,
  };
}

interface MapItemExecutionResult {
  itemResult: MapItemResult;
  updatedItem: unknown;
}

/**
 * Execute the subgraph for a single map item.
 */
async function executeMapItem(
  node: MapNode,
  parentStep: number,
  itemIndex: number,
  item: unknown,
  parentState: Record<string, unknown>,
  composedBodies: Map<string, string>,
  spawner: Spawner,
  onError: OnErrorMode,
  maxRetries: number,
  maxIterations: number,
): Promise<MapItemExecutionResult> {
  const subNodes = node.flow;
  const subSteps: StepResult[] = [];
  const itemStart = Date.now();

  // The item scope: reads/writes using node.as prefix access fields on the item
  let currentItem: Record<string, unknown> =
    typeof item === "object" && item !== null ? { ...(item as Record<string, unknown>) } : {};

  // Build node lookup for the subgraph
  const subNodeLookup = new Map<string, number>();
  for (let i = 0; i < subNodes.length; i++) {
    const label = nodeLabel(subNodes[i]);
    if (!subNodeLookup.has(label)) {
      subNodeLookup.set(label, i);
    }
  }

  const visitCounts = new Map<number, number>();
  let subIndex = 0;
  let subStepNumber = 0;

  while (subIndex >= 0 && subIndex < subNodes.length) {
    const subNode = subNodes[subIndex];
    subStepNumber++;
    const subLabel = nodeLabel(subNode);

    // Loop detection
    const visits = (visitCounts.get(subIndex) ?? 0) + 1;
    visitCounts.set(subIndex, visits);
    if (visits > maxIterations) {
      throw new RunError(
        `Step ${parentStep}.${subStepNumber} "${subLabel}" (item ${itemIndex}): exceeded max iterations (${maxIterations})`,
      );
    }

    if (isAsyncNode(subNode)) {
      subSteps.push({
        step: subStepNumber,
        agent: subLabel,
        status: "skipped",
      });
      const nextIdx = resolveSubgraphNext(subNode, subIndex, subNodeLookup, parentState, currentItem, node.as);
      if (nextIdx === -1) break;
      subIndex = nextIdx;
      continue;
    }

    if (isMapNode(subNode) || isSubFlowNode(subNode)) {
      throw new RunError(
        `Step ${parentStep}.${subStepNumber} "${subLabel}" (item ${itemIndex}): nested map/sub-flow nodes not supported inside map subgraphs`,
      );
    }

    // StepNode
    const skillBody = composedBodies.get(subNode.skill);
    if (!skillBody) {
      throw new RunError(
        `Step ${parentStep}.${subStepNumber} "${subNode.skill}" (item ${itemIndex}): no composed skill body found`,
      );
    }

    // Build scoped state for this spawn: parent state + item fields under node.as
    const scopedState: Record<string, unknown> = { ...parentState, [node.as]: currentItem };

    const stepStart = Date.now();
    let stepSucceeded = false;
    let lastError: string | undefined;
    let attempts = 0;
    const attemptsAllowed = onError === "retry" ? maxRetries : 1;

    for (let attempt = 1; attempt <= attemptsAllowed; attempt++) {
      attempts = attempt;
      try {
        const updates = await spawner.spawn(subNode.skill, skillBody, scopedState);

        // Apply updates to item scope (node.as prefix) and parent state scope
        for (const writePath of subNode.writes) {
          if (writePath.startsWith(node.as + ".")) {
            const field = writePath.slice(node.as.length + 1);
            if (field in updates) {
              currentItem[field] = updates[field];
            }
          } else {
            const field = stripStatePrefix(writePath);
            if (field in updates) {
              parentState[field] = updates[field];
            }
          }
        }

        stepSucceeded = true;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    const stepDuration = Date.now() - stepStart;

    if (stepSucceeded) {
      subSteps.push({
        step: subStepNumber,
        agent: subNode.skill,
        status: "ok",
        attempts: attempts > 1 ? attempts : undefined,
        durationMs: stepDuration,
      });
    } else if (onError === "skip") {
      subSteps.push({
        step: subStepNumber,
        agent: subNode.skill,
        status: "skipped",
        error: lastError,
        attempts,
        durationMs: stepDuration,
      });
    } else {
      subSteps.push({
        step: subStepNumber,
        agent: subNode.skill,
        status: "error",
        error: lastError,
        attempts: onError === "retry" ? attempts : undefined,
        durationMs: stepDuration,
      });
      const itemDuration = Date.now() - itemStart;
      return {
        itemResult: {
          index: itemIndex,
          status: "error",
          steps: subSteps,
          error: lastError,
          durationMs: itemDuration,
        },
        updatedItem: currentItem,
      };
    }

    // Resolve next subgraph node
    const nextIdx = resolveSubgraphNext(subNode, subIndex, subNodeLookup, parentState, currentItem, node.as);
    if (nextIdx === -1) break;
    subIndex = nextIdx;
  }

  const itemDuration = Date.now() - itemStart;
  return {
    itemResult: {
      index: itemIndex,
      status: "ok",
      steps: subSteps,
      durationMs: itemDuration,
    },
    updatedItem: currentItem,
  };
}

/**
 * Resolve the next node index within a map subgraph.
 * When-clauses can reference both parent state and item-scoped fields.
 */
function resolveSubgraphNext(
  node: GraphNode,
  currentIndex: number,
  nodeLookup: Map<string, number>,
  parentState: Record<string, unknown>,
  currentItem: Record<string, unknown>,
  asName: string,
): number {
  if (node.then === undefined) {
    return currentIndex + 1;
  }

  if (isConditionalThen(node.then)) {
    // Build a merged state view for when-clause evaluation
    const mergedState: Record<string, unknown> = { ...parentState, [asName]: currentItem };
    const target = resolveConditionalTarget(node.then, mergedState);
    if (target === undefined) {
      throw new RunError(
        `Map subgraph step "${nodeLabel(node)}": no conditional branch matched current state`,
      );
    }
    if (target === "end") return -1;
    const idx = nodeLookup.get(target);
    if (idx === undefined) {
      throw new RunError(
        `Map subgraph step "${nodeLabel(node)}": conditional target "${target}" not found`,
      );
    }
    return idx;
  }

  if (node.then === "end") return -1;

  const idx = nodeLookup.get(node.then);
  if (idx === undefined) {
    throw new RunError(
      `Map subgraph step "${nodeLabel(node)}": target "${node.then}" not found`,
    );
  }
  return idx;
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

  // Handle resume / clean start
  let completedSteps: string[] = [];
  let resumeFromIndex = 0;
  let startedAt = new Date().toISOString();

  if (options.resume) {
    const checkpoint = loadCheckpoint();
    if (!checkpoint) {
      throw new RunError("No checkpoint found - cannot resume. Run without --resume first.");
    }
    if (options.configHash && checkpoint.configHash !== options.configHash) {
      throw new RunError(
        "Config has changed since the last run - cannot resume. Run without --resume to start fresh.",
      );
    }
    completedSteps = checkpoint.completedSteps;
    resumeFromIndex = checkpoint.currentStepIndex;
    startedAt = checkpoint.startedAt;
  } else if (!dryRun) {
    clearCheckpointDir();
  }

  // Resolve backend bindings for state fields with integration locations
  const backendBindings: BackendBinding[] = !dryRun && config.state
    ? resolveBackendBindings(config.state)
    : [];

  // Load initial state from state.json (local cache)
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

  // If resuming, prefer backend state over checkpoint (backends are source of truth)
  if (options.resume) {
    const checkpoint = loadCheckpoint();
    if (checkpoint) {
      state = checkpoint.state;
    }
    if (backendBindings.length > 0) {
      const backendState = await readStateFromBackends(backendBindings);
      Object.assign(state, backendState);
    }
  } else if (!dryRun && backendBindings.length > 0) {
    // Fresh run: read initial state from backends
    const backendState = await readStateFromBackends(backendBindings);
    Object.assign(state, backendState);
    writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf-8");
  }

  const activeSpawner = dryRun ? undefined : (spawner ?? createSpawner(options.spawnerType ?? "cli"));
  const steps: StepResult[] = [];
  const pipelineStart = Date.now();

  // Track visit counts per node for loop detection
  const visitCounts = new Map<number, number>();

  let currentIndex = options.resume ? resumeFromIndex : 0;
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
      const mapResult = await executeMapNode(
        node,
        stepNumber,
        state,
        composedBodies,
        activeSpawner,
        dryRun,
        onError,
        maxRetries,
        maxIterations,
        completedSteps,
        options.configHash ?? "",
        startedAt,
        currentIndex,
      );
      steps.push(mapResult.stepResult);

      if (!dryRun) {
        // Merge map results back into the list in state
        const overField = stripStatePrefix(node.over);
        state[overField] = mapResult.updatedItems;
        writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf-8");

        // Sync map results to external backends
        if (backendBindings.length > 0) {
          await writeStateToBackends(backendBindings, state, new Set([overField]));
        }

        completedSteps.push("map");
        const nextIdx = resolveNextIndex(node, currentIndex, nodeLookup, state, dryRun);
        saveCheckpoint({
          configHash: options.configHash ?? "",
          completedSteps,
          currentStepIndex: nextIdx === -1 ? currentIndex + 1 : nextIdx,
          state,
          startedAt,
        });
      }

      // If any item errored and we're in abort mode, stop
      if (mapResult.stepResult.status === "error") break;

      const nextIndex = resolveNextIndex(node, currentIndex, nodeLookup, state, dryRun);
      if (nextIndex === -1) break;
      currentIndex = nextIndex;
      continue;
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
        const updatedFields = new Set<string>();
        for (const writePath of node.writes) {
          const field = stripStatePrefix(writePath);
          if (field in updates) {
            state[field] = updates[field];
            updatedFields.add(field);
          }
        }

        // Write updated state to disk after each step
        writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf-8");

        // Sync to external backends
        if (backendBindings.length > 0 && updatedFields.size > 0) {
          await writeStateToBackends(backendBindings, state, updatedFields);
        }

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

      // Save checkpoint after each successful step
      completedSteps.push(node.skill);
      const nextIdx = resolveNextIndex(node, currentIndex, nodeLookup, state, dryRun);
      saveCheckpoint({
        configHash: options.configHash ?? "",
        completedSteps,
        currentStepIndex: nextIdx === -1 ? currentIndex + 1 : nextIdx,
        state,
        startedAt,
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
