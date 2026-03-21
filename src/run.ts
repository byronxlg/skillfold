import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Config } from "./config.js";
import { expandComposedBodies } from "./compiler.js";
import {
  type GraphNode,
  type StepNode,
  isAsyncNode,
  isConditionalThen,
  isMapNode,
  isSubFlowNode,
} from "./graph.js";

export interface RunOptions {
  config: Config;
  bodies: Map<string, string>;
  outDir: string;
  dryRun: boolean;
  /** Working directory for state.json (defaults to process.cwd()) */
  workDir?: string;
  /** Override spawner for testing */
  spawner?: Spawner;
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
  spawn(agentName: string, skillContent: string, state: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export class ClaudeSpawner implements Spawner {
  private validated = false;

  validate(): void {
    if (this.validated) return;
    try {
      execFileSync("claude", ["--version"], { stdio: "pipe" });
    } catch {
      throw new Error(
        "claude CLI not found. Install it from https://docs.anthropic.com/en/docs/claude-code"
      );
    }
    this.validated = true;
  }

  async spawn(
    agentName: string,
    skillContent: string,
    state: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.validate();

    const prompt = [
      "You are the " + agentName + " agent.",
      "",
      "## Current State",
      "```json",
      JSON.stringify(state, null, 2),
      "```",
      "",
      "Execute your task. When done, output a JSON block with the updated state fields you are responsible for writing.",
      "Wrap the JSON in ```json fences.",
    ].join("\n");

    const result = execFileSync(
      "claude",
      ["--print", "--system-prompt", skillContent, prompt],
      { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 },
    );

    // Extract last JSON block from output
    return parseStateFromOutput(result);
  }
}

/**
 * Extract the last JSON code block from agent output.
 * Returns an empty object if no JSON block found.
 */
export function parseStateFromOutput(output: string): Record<string, unknown> {
  const jsonBlockRe = /```json\s*\n([\s\S]*?)```/g;
  let lastMatch: string | undefined;
  let match: RegExpExecArray | null;
  while ((match = jsonBlockRe.exec(output)) !== null) {
    lastMatch = match[1];
  }

  if (!lastMatch) return {};

  try {
    const parsed = JSON.parse(lastMatch.trim());
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Get the node label for display and identification.
 */
function nodeLabel(node: GraphNode): string {
  if (isMapNode(node)) return "map";
  if (isSubFlowNode(node)) return node.name;
  if (isAsyncNode(node)) return node.name;
  return (node as StepNode).skill;
}

/**
 * Strip the "state." prefix from a state path.
 */
function stripStatePrefix(path: string): string {
  return path.startsWith("state.") ? path.slice("state.".length) : path;
}

/**
 * Read state.json from the working directory.
 * Returns an empty object if the file does not exist.
 */
function readState(workDir: string): Record<string, unknown> {
  const statePath = join(workDir, "state.json");
  if (!existsSync(statePath)) return {};

  try {
    const content = readFileSync(statePath, "utf-8");
    const parsed = JSON.parse(content);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Write state.json to the working directory.
 */
function writeState(workDir: string, state: Record<string, unknown>): void {
  const statePath = join(workDir, "state.json");
  writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf-8");
}

/**
 * Validate that the flow is linear (no conditional routing, no map nodes,
 * no non-sequential jumps). Returns an error message if invalid, or undefined if valid.
 */
function validateLinearFlow(nodes: GraphNode[]): string | undefined {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const label = nodeLabel(node);

    if (isMapNode(node)) {
      return `map nodes not supported in skillfold run MVP - use the orchestrator`;
    }

    if (isSubFlowNode(node)) {
      return `sub-flow nodes not supported in skillfold run MVP - use the orchestrator`;
    }

    if (node.then !== undefined) {
      if (isConditionalThen(node.then)) {
        return `conditional routing not supported in skillfold run MVP - use the orchestrator`;
      }

      // Non-conditional then: must point to the next sequential node or "end"
      const target = node.then;
      if (target === "end") continue;

      if (i + 1 < nodes.length) {
        const nextLabel = nodeLabel(nodes[i + 1]);
        if (target !== nextLabel) {
          return `node "${label}" has non-linear jump to "${target}" - not supported in skillfold run MVP`;
        }
      }
    }
  }

  return undefined;
}

/**
 * Run a pipeline flow sequentially.
 */
export async function run(options: RunOptions): Promise<RunResult> {
  const { config, bodies, dryRun, spawner } = options;
  const workDir = options.workDir ?? process.cwd();

  if (!config.team) {
    throw new Error("No team flow defined in config");
  }

  const nodes = config.team.flow.nodes;
  const flowError = validateLinearFlow(nodes);
  if (flowError) {
    throw new Error(flowError);
  }

  // Dry-run mode: print plan without executing
  if (dryRun) {
    const steps: StepResult[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const label = nodeLabel(node);
      steps.push({ step: i + 1, agent: label, status: "skipped" });
      if (node.then === "end") break;
    }
    return { steps, state: {} };
  }

  // Build composed skill bodies (same logic as compiler expand)
  const composedBodies = expandComposedBodies(config, bodies);

  // Validate spawner (check claude CLI if using ClaudeSpawner)
  const activeSpawner = spawner ?? new ClaudeSpawner();
  if (activeSpawner instanceof ClaudeSpawner) {
    activeSpawner.validate();
  }

  // Read initial state
  let state = readState(workDir);

  const steps: StepResult[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const label = nodeLabel(node);

    // Skip async nodes
    if (isAsyncNode(node)) {
      process.stderr.write(
        `  [${i + 1}/${nodes.length}] ${label}... skipped (async node - requires external input)\n`
      );
      steps.push({ step: i + 1, agent: label, status: "skipped" });
      if (node.then === "end") break;
      continue;
    }

    const stepNode = node as StepNode;

    // Find the skill content for this agent
    const skillContent = composedBodies.get(stepNode.skill);
    if (!skillContent) {
      steps.push({
        step: i + 1,
        agent: label,
        status: "error",
        error: `No compiled skill content found for "${stepNode.skill}"`,
      });
      return { steps, state };
    }

    // Extract state fields this node reads
    const inputState: Record<string, unknown> = {};
    for (const path of stepNode.reads) {
      const key = stripStatePrefix(path);
      if (key in state) {
        inputState[key] = state[key];
      }
    }

    process.stderr.write(`  [${i + 1}/${nodes.length}] ${label}...`);

    try {
      const output = await activeSpawner.spawn(label, skillContent, inputState);

      // Merge output into state for fields this node writes
      for (const path of stepNode.writes) {
        const key = stripStatePrefix(path);
        if (key in output) {
          state[key] = output[key];
        }
      }

      // Write state after each step
      writeState(workDir, state);

      process.stderr.write(" done\n");
      steps.push({ step: i + 1, agent: label, status: "ok" });
      if (node.then === "end") break;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      process.stderr.write(` error\n`);
      steps.push({ step: i + 1, agent: label, status: "error", error: errorMsg });
      return { steps, state };
    }
  }

  return { steps, state };
}

