import { execFile, execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import { type Config } from "./config.js";
import { type CompileTarget, expandComposedBodies } from "./compiler.js";
import { RunError } from "./errors.js";
import {
  type GraphNode,
  isAsyncNode,
  isConditionalThen,
  isMapNode,
  isSubFlowNode,
} from "./graph.js";

const execFileAsync = promisify(execFile);

export interface RunOptions {
  config: Config;
  bodies: Map<string, string>;
  target: CompileTarget;
  outDir: string;
  dryRun: boolean;
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
      execSync("claude --version", { stdio: "pipe" });
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

export async function run(
  options: RunOptions,
  spawner?: Spawner,
): Promise<RunResult> {
  const { config, bodies, dryRun } = options;

  if (!config.team) {
    throw new RunError("Config has no team.flow defined - nothing to run");
  }

  const nodes = config.team.flow.nodes;
  const composedBodies = expandComposedBodies(config, bodies);

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

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const stepNumber = i + 1;
    const label = nodeLabel(node);

    // Validate that the flow is linear before processing the node
    if (node.then !== undefined) {
      if (isConditionalThen(node.then)) {
        throw new RunError(
          `Step ${stepNumber} "${label}": conditional routing not supported in skillfold run MVP - use the orchestrator`,
        );
      }

      // Non-conditional then pointing to a non-next-sequential node
      const thenTarget = node.then;
      if (thenTarget !== "end") {
        const nextLabel = i + 1 < nodes.length ? nodeLabel(nodes[i + 1]) : undefined;
        if (thenTarget !== nextLabel) {
          throw new RunError(
            `Step ${stepNumber} "${label}": non-linear jump to "${thenTarget}" not supported in skillfold run MVP - use the orchestrator`,
          );
        }
      }
    }

    if (isMapNode(node)) {
      throw new RunError(
        `Step ${stepNumber} "map": map nodes not supported in skillfold run MVP - use the orchestrator`,
      );
    }

    if (isSubFlowNode(node)) {
      throw new RunError(
        `Step ${stepNumber} "${label}": sub-flow nodes not supported in skillfold run MVP - use the orchestrator`,
      );
    }

    if (isAsyncNode(node)) {
      if (dryRun) {
        process.stderr.write(
          `Step ${stepNumber}: [skip] ${label} (async)\n`,
        );
      }
      steps.push({ step: stepNumber, agent: label, status: "skipped" });
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      steps.push({
        step: stepNumber,
        agent: node.skill,
        status: "error",
        error: message,
      });
      // Stop on first error
      break;
    }
  }

  return { steps, state };
}
