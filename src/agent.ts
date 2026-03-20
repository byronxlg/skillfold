import { join } from "node:path";

import { type Config, isComposed } from "./config.js";
import type { GraphNode, StepNode } from "./graph.js";
import { isMapNode } from "./graph.js";

export type AgentColor = "blue" | "green" | "red" | "yellow" | "cyan";

export interface AgentDefinition {
  name: string;
  description: string;
  color: AgentColor;
  isOrchestrator: boolean;
  reads: string[];
  writes: string[];
  body: string;
}

export interface AgentResult {
  name: string;
  path: string;
  content: string;
}

/** Collect all step nodes from a graph, recursing into map subgraphs. */
function collectStepNodes(nodes: GraphNode[]): StepNode[] {
  const steps: StepNode[] = [];
  for (const node of nodes) {
    if (isMapNode(node)) {
      steps.push(...collectStepNodes(node.graph));
    } else {
      steps.push(node);
    }
  }
  return steps;
}

/** Find the step node(s) for a given skill name in the team flow. */
function findStepsForSkill(config: Config, skillName: string): StepNode[] {
  if (!config.team) return [];
  return collectStepNodes(config.team.flow.nodes).filter(
    (n) => n.skill === skillName,
  );
}

const CODE_WRITE_PATTERNS = [
  "code",
  "implementation",
  "output",
  "result",
  "pr",
  "branch",
  "commit",
  "file",
  "source",
];

const REVIEW_PATTERNS = ["review", "feedback", "approved", "approval"];

const PLANNING_PATTERNS = [
  "plan",
  "strategy",
  "goal",
  "task",
  "decision",
  "scope",
];

function matchesPatterns(paths: string[], patterns: string[]): boolean {
  return paths.some((p) => {
    const lower = p.toLowerCase();
    return patterns.some((pat) => lower.includes(pat));
  });
}

/** Assign a color based on agent role heuristics. */
export function assignColor(
  skillName: string,
  writes: string[],
  isOrchestrator: boolean,
  config: Config,
): AgentColor {
  if (isOrchestrator) return "blue";

  // Check composed skill references for role hints
  const skill = config.skills[skillName];
  if (skill && isComposed(skill)) {
    const hasReviewSkill = skill.compose.some(
      (ref) => ref.includes("review") || ref.includes("reviewing"),
    );
    if (hasReviewSkill) return "red";

    const hasCodeSkill = skill.compose.some(
      (ref) =>
        ref.includes("code") ||
        ref.includes("coding") ||
        ref.includes("engineer"),
    );
    if (hasCodeSkill && matchesPatterns(writes, CODE_WRITE_PATTERNS)) {
      return "green";
    }
  }

  if (matchesPatterns(writes, CODE_WRITE_PATTERNS)) return "green";
  if (matchesPatterns(writes, REVIEW_PATTERNS)) return "red";
  if (matchesPatterns(writes, PLANNING_PATTERNS)) return "yellow";

  return "cyan";
}

/** Format agent markdown with frontmatter. */
function formatAgentMarkdown(agent: AgentDefinition): string {
  const frontmatter: string[] = [
    "---",
    `name: ${agent.name}`,
    `description: ${agent.description}`,
    "model: inherit",
    `color: ${agent.color}`,
  ];
  frontmatter.push("---");

  const sections: string[] = [frontmatter.join("\n")];

  sections.push("");
  if (agent.isOrchestrator) {
    sections.push(`# ${agent.name} (orchestrator)`);
    sections.push("");
    sections.push(
      "You are the lead orchestrator agent for this pipeline. You coordinate the execution of other agents and manage pipeline state.",
    );
  } else {
    sections.push(`# ${agent.name}`);
    sections.push("");
    sections.push(agent.description);
  }

  if (agent.reads.length > 0) {
    sections.push("");
    sections.push("## Reads");
    sections.push("");
    for (const r of agent.reads) {
      sections.push(`- \`${r}\``);
    }
  }

  if (agent.writes.length > 0) {
    sections.push("");
    sections.push("## Writes");
    sections.push("");
    for (const w of agent.writes) {
      sections.push(`- \`${w}\``);
    }
  }

  if (agent.body) {
    sections.push("");
    sections.push("## Instructions");
    sections.push("");
    sections.push(agent.body);
  }

  return sections.join("\n") + "\n";
}

/**
 * Generate agent markdown files from a compiled pipeline config.
 * Each composed skill that appears in the team flow becomes an agent.
 */
export function generateAgents(
  config: Config,
  composedBodies: Map<string, string>,
  outDir: string,
  version: string,
  configFile: string,
): AgentResult[] {
  const results: AgentResult[] = [];
  const orchestratorName = config.team?.orchestrator;

  for (const [name, skill] of Object.entries(config.skills)) {
    if (!isComposed(skill)) continue;

    const body = composedBodies.get(name) ?? "";
    const steps = findStepsForSkill(config, name);
    const reads = [...new Set(steps.flatMap((s) => s.reads))];
    const writes = [...new Set(steps.flatMap((s) => s.writes))];
    const isOrchestrator = name === orchestratorName;
    const color = assignColor(name, writes, isOrchestrator, config);

    const agent: AgentDefinition = {
      name,
      description: skill.description,
      color,
      isOrchestrator,
      reads,
      writes,
      body,
    };

    const provenance = `<!-- Generated by skillfold v${version} from ${config.name} (${configFile}). Do not edit directly. -->\n`;
    const content = provenance + formatAgentMarkdown(agent);

    results.push({
      name,
      path: join(outDir, "agents", `${name}.md`),
      content,
    });
  }

  return results;
}
