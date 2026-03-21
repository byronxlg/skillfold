import { join } from "node:path";

import { stringify } from "yaml";

import { type Config, isComposed } from "./config.js";
import type { GraphNode, StepNode } from "./graph.js";
import { isAsyncNode, isConditionalThen, isMapNode, isSubFlowNode } from "./graph.js";
import {
  buildStepMap,
  formatLocation,
  formatType,
  generateOrchestrator,
  renderNodes,
} from "./orchestrator.js";

export type AgentColor = "blue" | "green" | "red" | "yellow" | "cyan";

export interface AgentDefinition {
  name: string;
  description: string;
  color: AgentColor;
  isOrchestrator: boolean;
  reads: string[];
  writes: string[];
  body: string;
  frontmatter?: Record<string, unknown>;
}

export interface AgentResult {
  name: string;
  path: string;
  content: string;
}

/** Collect all step nodes from a graph, recursing into map and sub-flow subgraphs. Skips async and sub-flow nodes themselves. */
function collectStepNodes(nodes: GraphNode[]): StepNode[] {
  const steps: StepNode[] = [];
  for (const node of nodes) {
    if (isMapNode(node)) {
      steps.push(...collectStepNodes(node.flow));
    } else if (isSubFlowNode(node)) {
      if (node.graph) {
        steps.push(...collectStepNodes(node.graph));
      }
    } else if (!isAsyncNode(node)) {
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

/** Serialize extra frontmatter fields to YAML lines (without the --- delimiters). */
function serializeExtraFrontmatter(extra: Record<string, unknown>): string[] {
  const yamlStr = stringify(extra, { lineWidth: 0 }).trimEnd();
  return yamlStr.split("\n");
}

/** Format agent markdown with frontmatter. */
function formatAgentMarkdown(agent: AgentDefinition): string {
  const model = agent.frontmatter?.model ?? "inherit";

  const frontmatter: string[] = [
    "---",
    `name: ${agent.name}`,
    `description: ${agent.description}`,
    `model: ${model}`,
    `color: ${agent.color}`,
  ];

  if (agent.frontmatter) {
    const { model: _model, ...rest } = agent.frontmatter;
    if (Object.keys(rest).length > 0) {
      frontmatter.push(...serializeExtraFrontmatter(rest));
    }
  }

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

/** Collect non-orchestrator agent names from the team flow. Skips async nodes. */
function collectWorkerNames(config: Config): string[] {
  if (!config.team) return [];
  const orchestratorName = config.team.orchestrator;
  const stepNodes = collectStepNodes(config.team.flow.nodes);
  const seen = new Set<string>();
  const names: string[] = [];
  for (const node of stepNodes) {
    if (node.skill !== orchestratorName && !seen.has(node.skill)) {
      seen.add(node.skill);
      names.push(node.skill);
    }
  }
  return names;
}

export function generateAgents(
  config: Config,
  composedBodies: Map<string, string>,
  outDir: string,
  version: string,
  configFile: string,
  target: "skill" | "claude-code" = "skill",
): AgentResult[] {
  const results: AgentResult[] = [];
  const orchestratorName = config.team?.orchestrator;
  const isClaudeCode = target === "claude-code";

  for (const [name, skill] of Object.entries(config.skills)) {
    if (!isComposed(skill)) continue;

    let body = composedBodies.get(name) ?? "";
    const steps = findStepsForSkill(config, name);
    const reads = [...new Set(steps.flatMap((s) => s.reads))];
    const writes = [...new Set(steps.flatMap((s) => s.writes))];
    const isOrchestrator = name === orchestratorName;
    const color = assignColor(name, writes, isOrchestrator, config);

    const frontmatter: Record<string, unknown> = skill.frontmatter
      ? { ...skill.frontmatter }
      : {};

    if (isClaudeCode && skill.agentConfig) {
      for (const [key, val] of Object.entries(skill.agentConfig)) {
        if (val !== undefined) {
          frontmatter[key] = val;
        }
      }
    }

    if (isClaudeCode && isOrchestrator && config.team) {
      if (!frontmatter.tools) {
        const workerNames = collectWorkerNames(config);
        const agentList = workerNames.length > 0
          ? `Agent(${workerNames.join(", ")})`
          : "Agent";
        frontmatter.tools = [agentList, "Read", "Write", "Bash", "Grep", "Glob"];
      }

      const orchestratorPlan = generateOrchestrator(config, true);
      body = body ? body + "\n\n" + orchestratorPlan : orchestratorPlan;
    }

    const agent: AgentDefinition = {
      name,
      description: skill.description,
      color,
      isOrchestrator,
      reads,
      writes,
      body,
      frontmatter: Object.keys(frontmatter).length > 0 ? frontmatter : undefined,
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

export function generateRunCommand(
  config: Config,
  version: string,
  configFile: string,
): AgentResult | null {
  if (!config.team) return null;

  const lines: string[] = [];

  if (config.team.orchestrator) {
    lines.push(
      `Execute the **${config.name}** pipeline by spawning the **${config.team.orchestrator}** orchestrator agent.`,
    );
    lines.push("");
    lines.push(
      `Use the Agent tool to invoke **${config.team.orchestrator}** from \`.claude/agents/${config.team.orchestrator}.md\`. The orchestrator will coordinate all other agents in the pipeline.`,
    );

    const provenance = `<!-- Generated by skillfold v${version} from ${config.name} (${configFile}). Do not edit directly. -->\n`;
    const content = provenance + lines.join("\n") + "\n";

    return {
      name: "run-pipeline",
      path: "",
      content,
    };
  }

  lines.push(
    `Execute the **${config.name}** pipeline by orchestrating the compiled agents.`,
  );

  lines.push("");
  lines.push("## Agent Invocation");
  lines.push("");
  lines.push(
    "Use the Agent tool to spawn each agent from its compiled markdown file. Pass the file path as the agent's task instructions.",
  );
  lines.push("");
  lines.push(
    "Agent files are located at `.claude/agents/{name}.md`. Agents that write code or modify files should be spawned with `isolation: \"worktree\"` to prevent conflicts with your working directory.",
  );

  const hasLocations = config.state &&
    Object.values(config.state.fields).some((f) => f.location);
  if (hasLocations) {
    lines.push("");
    lines.push(
      "State fields have external locations (see the state table below). Read inputs from and write outputs to those locations between agent invocations.",
    );
  }

  if (config.state) {
    lines.push("");
    lines.push("## State");
    lines.push("");
    lines.push("| Field | Type | Location |");
    lines.push("|-------|------|----------|");

    for (const [name, field] of Object.entries(config.state.fields)) {
      const typeStr = formatType(field.type);
      const locStr = formatLocation(field);
      lines.push(`| ${name} | ${typeStr} | ${locStr} |`);
    }
  }

  lines.push("");
  lines.push("## Execution Plan");

  const stepMap = buildStepMap(config.team.flow.nodes, "");
  const sections = renderNodes(
    config.team.flow.nodes,
    stepMap,
    "",
    "###",
    true,
  );

  for (const section of sections) {
    lines.push("");
    lines.push(section);
  }

  const provenance = `<!-- Generated by skillfold v${version} from ${config.name} (${configFile}). Do not edit directly. -->\n`;
  const content = provenance + lines.join("\n") + "\n";

  return {
    name: "run-pipeline",
    path: "",
    content,
  };
}

/** Generate a team bootstrap prompt for the agent-teams target. */
export function generateTeamBootstrap(
  config: Config,
  version: string,
  configFile: string,
): AgentResult | null {
  if (!config.team) return null;

  const lines: string[] = [];
  const orchestratorName = config.team.orchestrator;

  lines.push(
    `Create an Agent Team for the **${config.name}** pipeline.`,
  );
  lines.push("");

  // Describe team structure
  const workerNames = collectWorkerNames(config);
  if (workerNames.length > 0) {
    lines.push("## Team Structure");
    lines.push("");
    if (orchestratorName) {
      lines.push(
        `You are the team lead. Spawn ${workerNames.length} teammates:`,
      );
    } else {
      lines.push(`Spawn ${workerNames.length} teammates:`);
    }
    lines.push("");
    for (const name of workerNames) {
      const skill = config.skills[name];
      const desc = isComposed(skill) ? skill.description : name;
      lines.push(`- **${name}**: ${desc}`);
    }
  }

  // State table
  if (config.state) {
    lines.push("");
    lines.push("## Shared State");
    lines.push("");
    lines.push(
      "Teammates coordinate through these shared state fields. The team lead manages state handoffs between teammates.",
    );
    lines.push("");
    lines.push("| Field | Type | Location |");
    lines.push("|-------|------|----------|");

    for (const [name, field] of Object.entries(config.state.fields)) {
      const typeStr = formatType(field.type);
      const locStr = formatLocation(field);
      lines.push(`| ${name} | ${typeStr} | ${locStr} |`);
    }
  }

  // Task sequence derived from flow
  lines.push("");
  lines.push("## Task Sequence");
  lines.push("");
  lines.push(
    "Create these tasks for the team, in order. Each task should be assigned to the specified teammate. Tasks with dependencies should not be claimable until their dependencies are completed.",
  );
  lines.push("");

  const nodes = config.team.flow.nodes;
  let taskNum = 0;
  for (const node of nodes) {
    if (isAsyncNode(node)) continue;
    if (isMapNode(node)) {
      taskNum++;
      lines.push(
        `${taskNum}. **Map over \`${node.over}\`**: For each item in \`${node.over}\`, run the following subtasks in parallel:`,
      );
      for (const subNode of node.flow) {
        if (!isAsyncNode(subNode) && !isMapNode(subNode) && !isSubFlowNode(subNode)) {
          const subSkill = config.skills[subNode.skill];
          const subDesc = isComposed(subSkill) ? subSkill.description : subNode.skill;
          lines.push(`   - **${subNode.skill}**: ${subDesc}`);
          if (subNode.reads.length > 0) lines.push(`     Reads: ${subNode.reads.map(r => `\`${r}\``).join(", ")}`);
          if (subNode.writes.length > 0) lines.push(`     Writes: ${subNode.writes.map(w => `\`${w}\``).join(", ")}`);
        }
      }
      continue;
    }
    if (isSubFlowNode(node)) {
      taskNum++;
      lines.push(`${taskNum}. **Sub-flow: ${node.name}** (imported from \`${node.flow}\`)`);
      continue;
    }

    taskNum++;
    const skill = config.skills[node.skill];
    const desc = isComposed(skill) ? skill.description : node.skill;
    lines.push(`${taskNum}. **${node.skill}**: ${desc}`);
    if (node.reads.length > 0) lines.push(`   Reads: ${node.reads.map(r => `\`${r}\``).join(", ")}`);
    if (node.writes.length > 0) lines.push(`   Writes: ${node.writes.map(w => `\`${w}\``).join(", ")}`);

    if (node.then) {
      if (isConditionalThen(node.then)) {
        lines.push("   Routing:");
        for (const branch of node.then) {
          lines.push(`   - If \`${branch.when}\`: next is **${branch.to === "end" ? "done" : branch.to}**`);
        }
      } else if (node.then !== "end") {
        lines.push(`   Then: **${node.then}**`);
      }
    }
  }

  // Coordination instructions
  lines.push("");
  lines.push("## Coordination");
  lines.push("");
  lines.push("- Teammates load their skills automatically from `.claude/agents/{name}.md`");
  lines.push("- Use the shared task list to track progress");
  lines.push("- The team lead manages state handoffs: when a teammate completes a task, pass its output state to the next teammate");
  lines.push("- For conditional routing, evaluate the condition and assign the next task accordingly");
  lines.push("- Wait for all teammates to complete before synthesizing results");

  const provenance = `<!-- Generated by skillfold v${version} from ${config.name} (${configFile}). Do not edit directly. -->\n`;
  const content = provenance + lines.join("\n") + "\n";

  return {
    name: "start-team",
    path: "",
    content,
  };
}

/** Format Gemini agent markdown with Gemini-specific frontmatter. */
function formatGeminiAgentMarkdown(
  name: string,
  description: string,
  isOrchestrator: boolean,
  reads: string[],
  writes: string[],
  body: string,
  frontmatter: Record<string, unknown>,
): string {
  const fmLines: string[] = ["---"];
  fmLines.push(`name: ${name}`);
  fmLines.push(`description: ${description}`);

  // Emit Gemini-specific frontmatter fields
  if (frontmatter.model !== undefined) {
    fmLines.push(`model: ${frontmatter.model}`);
  }
  if (frontmatter.tools !== undefined) {
    fmLines.push(...serializeExtraFrontmatter({ tools: frontmatter.tools }));
  }
  if (frontmatter.max_turns !== undefined) {
    fmLines.push(`max_turns: ${frontmatter.max_turns}`);
  }
  if (frontmatter.timeout_mins !== undefined) {
    fmLines.push(`timeout_mins: ${frontmatter.timeout_mins}`);
  }
  if (frontmatter.temperature !== undefined) {
    fmLines.push(`temperature: ${frontmatter.temperature}`);
  }
  if (frontmatter.kind !== undefined) {
    fmLines.push(`kind: ${frontmatter.kind}`);
  }

  fmLines.push("---");

  const sections: string[] = [fmLines.join("\n")];

  sections.push("");
  if (isOrchestrator) {
    sections.push(`# ${name} (orchestrator)`);
    sections.push("");
    sections.push(
      "You are the lead orchestrator agent for this pipeline. You coordinate the execution of other agents and manage pipeline state.",
    );
  } else {
    sections.push(`# ${name}`);
    sections.push("");
    sections.push(description);
  }

  if (reads.length > 0) {
    sections.push("");
    sections.push("## Reads");
    sections.push("");
    for (const r of reads) {
      sections.push(`- \`${r}\``);
    }
  }

  if (writes.length > 0) {
    sections.push("");
    sections.push("## Writes");
    sections.push("");
    for (const w of writes) {
      sections.push(`- \`${w}\``);
    }
  }

  if (body) {
    sections.push("");
    sections.push("## Instructions");
    sections.push("");
    sections.push(body);
  }

  return sections.join("\n") + "\n";
}

export function generateGeminiAgents(
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

    let body = composedBodies.get(name) ?? "";
    const steps = findStepsForSkill(config, name);
    const reads = [...new Set(steps.flatMap((s) => s.reads))];
    const writes = [...new Set(steps.flatMap((s) => s.writes))];
    const isOrchestrator = name === orchestratorName;

    const frontmatter: Record<string, unknown> = {};

    // Map agentConfig fields to Gemini frontmatter
    if (skill.agentConfig) {
      if (skill.agentConfig.model !== undefined) {
        frontmatter.model = skill.agentConfig.model;
      }
      if (skill.agentConfig.tools !== undefined) {
        frontmatter.tools = skill.agentConfig.tools;
      }
      // maxTurns -> max_turns (snake_case convention)
      if (skill.agentConfig.maxTurns !== undefined) {
        frontmatter.max_turns = skill.agentConfig.maxTurns;
      }
    }

    // Append orchestrator plan for the orchestrator agent
    if (isOrchestrator && config.team) {
      const orchestratorPlan = generateOrchestrator(config, true);
      body = body ? body + "\n\n" + orchestratorPlan : orchestratorPlan;
    }

    const provenance = `<!-- Generated by skillfold v${version} from ${config.name} (${configFile}). Do not edit directly. -->\n`;
    const content = provenance + formatGeminiAgentMarkdown(
      name,
      skill.description,
      isOrchestrator,
      reads,
      writes,
      body,
      frontmatter,
    );

    results.push({
      name,
      path: join(outDir, "agents", `${name}.md`),
      content,
    });
  }

  return results;
}
