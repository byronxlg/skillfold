import type { Config } from "./config.js";
import { isConditionalThen, isMapNode } from "./graph.js";
import type { GraphNode, Then } from "./graph.js";
import type { StateField, StateType } from "./state.js";

interface StepMapping {
  label: string;
  number: string;
}

function formatType(type: StateType): string {
  switch (type.kind) {
    case "primitive":
      return type.value;
    case "list":
      return `list<${type.element}>`;
    case "custom":
      return type.name;
  }
}

function formatLocation(field: StateField): string {
  if (!field.location) return "";
  const { skill, path, kind } = field.location;
  if (kind) {
    return `${skill}: ${path} (${kind})`;
  }
  return `${skill}: ${path}`;
}

/**
 * Build a flat map from skill name (or "map") to step number string,
 * for a given list of nodes at a given prefix.
 */
function buildStepMap(
  nodes: GraphNode[],
  prefix: string
): StepMapping[] {
  const mappings: StepMapping[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const stepNum = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
    const label = isMapNode(node) ? "map" : node.skill;
    mappings.push({ label, number: stepNum });
  }
  return mappings;
}

function renderThen(
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

function renderNodes(
  nodes: GraphNode[],
  stepMap: StepMapping[],
  prefix: string,
  headingLevel: string
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
        subHeading
      );
      lines.push(...subSections);

      // Render then for the map node itself, if present
      if (node.then !== undefined) {
        lines.push("");
        lines.push(renderThen(node.then, stepMap, isLast));
      }

      sections.push(lines.join("\n"));
    } else {
      const lines: string[] = [];
      lines.push(`${headingLevel} Step ${stepNum}: ${node.skill}`);
      lines.push("");
      lines.push(`Invoke **${node.skill}**.`);

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

export function generateOrchestrator(config: Config): string {
  const lines: string[] = [];

  lines.push(`# Orchestrator: ${config.name}`);
  lines.push("");
  lines.push(
    `You are the orchestrator for the **${config.name}** pipeline. You have full visibility into the execution topology. Individual agents do not know about each other or the pipeline structure - you manage all coordination.`
  );
  lines.push("");
  lines.push(
    "To invoke an agent, read its compiled skill from `dist/{name}.md` and spawn a subagent with that content as its instructions. Give each agent the inputs the plan says it reads, and collect the outputs it writes."
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
      const locStr = formatLocation(field);
      lines.push(`| ${name} | ${typeStr} | ${locStr} |`);
    }
  }

  // Execution Plan section
  if (config.graph) {
    lines.push("");
    lines.push("## Execution Plan");

    const stepMap = buildStepMap(config.graph.nodes, "");
    const sections = renderNodes(
      config.graph.nodes,
      stepMap,
      "",
      "###"
    );

    for (const section of sections) {
      lines.push("");
      lines.push(section);
    }
  }

  return lines.join("\n") + "\n";
}
