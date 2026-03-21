import type { Config } from "./config.js";
import { isAtomic } from "./config.js";
import { isAsyncNode, isConditionalThen, isMapNode, isSubFlowNode } from "./graph.js";
import type { AsyncNode, GraphNode, Then } from "./graph.js";
import type { StateField, StateType } from "./state.js";

export interface StepMapping {
  label: string;
  number: string;
}

export function formatType(type: StateType): string {
  switch (type.kind) {
    case "primitive":
      return type.value;
    case "list":
      return `list<${type.element}>`;
    case "custom":
      return type.name;
  }
}

export function formatLocation(
  field: StateField,
  skillResources?: Record<string, string>,
): string {
  if (!field.location) return "";
  const { skill, path, kind } = field.location;

  if (skillResources) {
    const slashIdx = path.indexOf("/");
    const namespace = slashIdx === -1 ? path : path.slice(0, slashIdx);
    const subPath = slashIdx === -1 ? "" : path.slice(slashIdx + 1);
    const baseUrl = skillResources[namespace];
    if (baseUrl) {
      const resolved = subPath ? `${baseUrl}/${subPath}` : baseUrl;
      return kind ? `${resolved} (${kind})` : resolved;
    }
  }

  if (kind) {
    return `${skill}: ${path} (${kind})`;
  }
  return `${skill}: ${path}`;
}

/**
 * Build a flat map from skill name (or "map" or async name) to step number string,
 * for a given list of nodes at a given prefix.
 */
export function buildStepMap(
  nodes: GraphNode[],
  prefix: string
): StepMapping[] {
  const mappings: StepMapping[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const stepNum = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
    let label: string;
    if (isMapNode(node)) {
      label = "map";
    } else if (isSubFlowNode(node)) {
      label = node.name;
    } else if (isAsyncNode(node)) {
      label = node.name;
    } else {
      label = node.skill;
    }
    mappings.push({ label, number: stepNum });
  }
  return mappings;
}

export function renderThen(
  then: Then | undefined,
  stepMap: StepMapping[],
  isLastNode: boolean
): string {
  if (then === undefined) {
    if (isLastNode) {
      return "Then: end";
    }
    // Implicit fall-through: shouldn't happen for well-formed graphs,
    // but handle it by finding the next step
    return "Then: end";
  }

  if (!isConditionalThen(then)) {
    if (then === "end") {
      return "Then: end";
    }
    const target = stepMap.find((m) => m.label === then);
    if (target) {
      return `Then: proceed to step ${target.number}.`;
    }
    return "Then: end";
  }

  const lines: string[] = ["Then:"];
  for (const branch of then) {
    if (branch.to === "end") {
      lines.push(`- If \`${branch.when}\`: end`);
    } else {
      const target = stepMap.find((m) => m.label === branch.to);
      if (target) {
        lines.push(
          `- If \`${branch.when}\`: go to step ${target.number}`
        );
      } else {
        lines.push(`- If \`${branch.when}\`: end`);
      }
    }
  }
  return lines.join("\n");
}

function renderPolicyText(policy: AsyncNode["policy"]): string {
  switch (policy) {
    case "block":
      return "If the value is not yet available, wait for the external agent to provide it before proceeding.";
    case "skip":
      return "If the value is not yet available, skip this step and proceed.";
    case "use-latest":
      return "If no new value is available, use the most recent value and proceed.";
  }
}

export function renderNodes(
  nodes: GraphNode[],
  stepMap: StepMapping[],
  prefix: string,
  headingLevel: string,
  useAgentTool = false,
): string[] {
  const sections: string[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const stepNum = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
    const isLast = i === nodes.length - 1;

    if (isMapNode(node)) {
      const lines: string[] = [];
      lines.push(
        `${headingLevel} Step ${stepNum}: map over ${node.over}`
      );
      lines.push("");
      lines.push(
        `For each item in \`${node.over}\` (as \`${node.as}\`), run the following subgraph:`
      );

      // Build sub-step map for inner nodes
      const subMap = buildStepMap(node.graph, stepNum);
      const subHeading = headingLevel + "#";
      const subSections = renderNodes(
        node.graph,
        subMap,
        stepNum,
        subHeading,
        useAgentTool,
      );
      lines.push(...subSections);

      // Render then for the map node itself, if present
      if (node.then !== undefined) {
        lines.push("");
        lines.push(renderThen(node.then, stepMap, isLast));
      }

      sections.push(lines.join("\n"));
    } else if (isAsyncNode(node)) {
      const lines: string[] = [];
      lines.push(`${headingLevel} Step ${stepNum}: ${node.name} (async)`);
      lines.push("");

      // Async nodes check external locations instead of invoking agents
      const writeFields = node.writes
        .filter((w) => w.startsWith("state."))
        .map((w) => `\`${w}\``);
      if (writeFields.length > 0) {
        lines.push(
          `Check ${writeFields.join(", ")} at its external location.`
        );
      } else {
        lines.push(`Check state at its external location.`);
      }

      lines.push("");
      lines.push(renderPolicyText(node.policy));

      if (node.reads.length > 0) {
        lines.push("");
        lines.push(`Reads: ${node.reads.map((r) => `\`${r}\``).join(", ")}`);
      }

      if (node.writes.length > 0) {
        lines.push("");
        lines.push(
          `Writes: ${node.writes.map((w) => `\`${w}\``).join(", ")}`
        );
      }

      lines.push("");

      if (node.then !== undefined) {
        lines.push(renderThen(node.then, stepMap, isLast));
      } else if (isLast) {
        lines.push(renderThen(undefined, stepMap, true));
      } else {
        const nextStep = stepMap[i + 1];
        if (nextStep) {
          lines.push(`Then: proceed to step ${nextStep.number}.`);
        } else {
          lines.push("Then: end");
        }
      }

      sections.push(lines.join("\n"));
    } else if (isSubFlowNode(node)) {
      const lines: string[] = [];
      lines.push(`${headingLevel} Step ${stepNum}: ${node.name} (sub-flow)`);
      lines.push("");
      lines.push(
        `Run the **${node.name}** sub-flow (${node.flow}).`
      );

      if (node.reads.length > 0) {
        lines.push("");
        lines.push(`Reads: ${node.reads.map((r) => `\`${r}\``).join(", ")}`);
      }

      if (node.writes.length > 0) {
        lines.push("");
        lines.push(
          `Writes: ${node.writes.map((w) => `\`${w}\``).join(", ")}`
        );
      }

      // Render inner graph if resolved
      if (node.graph && node.graph.length > 0) {
        lines.push("");
        lines.push("Sub-flow steps:");

        const subMap = buildStepMap(node.graph, stepNum);
        const subHeading = headingLevel + "#";
        const subSections = renderNodes(
          node.graph,
          subMap,
          stepNum,
          subHeading,
          useAgentTool,
        );
        lines.push(...subSections);
      }

      lines.push("");

      if (node.then !== undefined) {
        lines.push(renderThen(node.then, stepMap, isLast));
      } else if (isLast) {
        lines.push(renderThen(undefined, stepMap, true));
      } else {
        const nextStep = stepMap[i + 1];
        if (nextStep) {
          lines.push(`Then: proceed to step ${nextStep.number}.`);
        } else {
          lines.push("Then: end");
        }
      }

      sections.push(lines.join("\n"));
    } else {
      const lines: string[] = [];
      lines.push(`${headingLevel} Step ${stepNum}: ${node.skill}`);
      lines.push("");
      lines.push(
        useAgentTool
          ? `Invoke **${node.skill}** using the Agent tool.`
          : `Invoke **${node.skill}**.`,
      );

      if (node.reads.length > 0) {
        lines.push("");
        lines.push(`Reads: ${node.reads.map((r) => `\`${r}\``).join(", ")}`);
      }

      if (node.writes.length > 0) {
        lines.push("");
        lines.push(
          `Writes: ${node.writes.map((w) => `\`${w}\``).join(", ")}`
        );
      }

      lines.push("");

      // Determine the then target. For non-last nodes without explicit then,
      // fall through to the next step.
      if (node.then !== undefined) {
        lines.push(renderThen(node.then, stepMap, isLast));
      } else if (isLast) {
        lines.push(renderThen(undefined, stepMap, true));
      } else {
        // Implicit fall-through to next step
        const nextStep = stepMap[i + 1];
        if (nextStep) {
          lines.push(`Then: proceed to step ${nextStep.number}.`);
        } else {
          lines.push("Then: end");
        }
      }

      sections.push(lines.join("\n"));
    }
  }

  return sections;
}

export function generateOrchestrator(
  config: Config,
  useAgentTool = false,
): string {
  const lines: string[] = [];

  lines.push(`# Orchestrator: ${config.name}`);
  lines.push("");
  lines.push(
    `You are the orchestrator for the **${config.name}** pipeline. You have full visibility into the execution topology. Individual agents do not know about each other or the pipeline structure - you manage all coordination.`
  );

  // State section
  if (config.state) {
    lines.push("");
    lines.push("## State");
    lines.push("");
    lines.push("| Field | Type | Location |");
    lines.push("|-------|------|----------|");

    for (const [name, field] of Object.entries(config.state.fields)) {
      const typeStr = formatType(field.type);
      let resources: Record<string, string> | undefined;
      if (field.location) {
        const skill = config.skills[field.location.skill];
        if (skill && isAtomic(skill)) {
          resources = skill.resources;
        }
      }
      const locStr = formatLocation(field, resources);
      lines.push(`| ${name} | ${typeStr} | ${locStr} |`);
    }
  }

  // Agent Invocation section
  lines.push("");
  lines.push("## Agent Invocation");
  lines.push("");
  if (useAgentTool) {
    lines.push(
      "Use the Agent tool to spawn each agent by name. The Agent tool accepts a `prompt` and optional `isolation: worktree` for agents that modify files."
    );
  } else {
    lines.push(
      "To invoke an agent, read its compiled skill from `build/{name}/SKILL.md` and spawn a subagent with that content as its instructions. Give each agent the inputs the plan says it reads, and collect the outputs it writes."
    );
    lines.push("");
    lines.push(
      "Agents that write code or modify files should run in isolation (e.g., a git worktree) to prevent conflicts with the orchestrator's working directory."
    );
  }

  // State management guidance when locations are defined
  const hasLocations = config.state &&
    Object.values(config.state.fields).some((f) => f.location);
  if (hasLocations) {
    lines.push("");
    lines.push(
      useAgentTool
        ? "State fields have external locations (see the state table above). Read inputs from and write outputs to those locations between agent invocations."
        : "State fields have external locations (see the state table above). The orchestrator is responsible for reading inputs from and writing outputs to those locations between agent invocations."
    );
  }

  // Execution Plan section
  if (config.team) {
    lines.push("");
    lines.push("## Execution Plan");

    const stepMap = buildStepMap(config.team.flow.nodes, "");
    const sections = renderNodes(
      config.team.flow.nodes,
      stepMap,
      "",
      "###",
      useAgentTool,
    );

    for (const section of sections) {
      lines.push("");
      lines.push(section);
    }
  }

  return lines.join("\n") + "\n";
}
