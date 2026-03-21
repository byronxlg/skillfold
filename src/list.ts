import { type Config, type SkillEntry, isAtomic, isComposed } from "./config.js";
import { type GraphNode, isAsyncNode, isConditionalThen, isMapNode, isSubFlowNode } from "./graph.js";
import { type StateField, type StateSchema } from "./state.js";

function formatStateType(field: StateField): string {
  switch (field.type.kind) {
    case "primitive":
      return field.type.value;
    case "list":
      return `list<${field.type.element}>`;
    case "custom":
      return field.type.name;
  }
}

function formatLocation(field: StateField): string {
  if (!field.location) return "";
  const parts = [field.location.skill + ": " + field.location.path];
  if (field.location.kind) {
    parts.push(`(${field.location.kind})`);
  }
  return "-> " + parts.join(" ");
}

function isRemote(skill: SkillEntry): boolean {
  return isAtomic(skill) && skill.path.startsWith("https://");
}

function renderSkills(
  skills: Record<string, SkillEntry>,
): string[] {
  const entries = Object.entries(skills);
  const atomics = entries.filter(([, s]) => isAtomic(s));
  const composed = entries.filter(([, s]) => isComposed(s));
  const lines: string[] = [];

  lines.push(`Skills (${atomics.length} atomic, ${composed.length} composed):`);

  for (const [name, skill] of atomics) {
    const tags: string[] = ["atomic"];
    if (isRemote(skill)) tags.push("remote");
    lines.push(`  ${name.padEnd(20)} (${tags.join(", ")})`);
  }

  for (const [name, skill] of composed) {
    if (!isComposed(skill)) continue;
    lines.push(`  ${name.padEnd(20)} = ${skill.compose.join(" + ")}`);
  }

  return lines;
}

function renderState(state: StateSchema): string[] {
  const fieldEntries = Object.entries(state.fields);
  const typeEntries = Object.entries(state.types);
  const lines: string[] = [];

  lines.push(`State (${fieldEntries.length} fields, ${typeEntries.length} types):`);

  for (const [name, field] of fieldEntries) {
    const typeStr = formatStateType(field).padEnd(20);
    const location = formatLocation(field);
    lines.push(`  ${name.padEnd(20)} ${typeStr} ${location}`.trimEnd());
  }

  for (const [name, type] of typeEntries) {
    const fieldDefs = Object.entries(type.fields)
      .map(([fn, ft]) => `${fn}: ${ft}`)
      .join(", ");
    lines.push(`  ${name} { ${fieldDefs} }`);
  }

  return lines;
}

function nodeLabel(node: GraphNode): string {
  if (isMapNode(node)) return "map";
  if (isSubFlowNode(node)) return `${node.name} (sub-flow)`;
  if (isAsyncNode(node)) return `${node.name} (async)`;
  return node.skill;
}

function renderFlowEdges(nodes: GraphNode[]): string[] {
  const lines: string[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const label = nodeLabel(node);

    if (node.then === undefined) {
      const next = i + 1 < nodes.length ? nodeLabel(nodes[i + 1]) : "end";
      lines.push(`  ${label} -> ${next}`);
    } else if (isConditionalThen(node.then)) {
      for (const branch of node.then) {
        const whenStr = `when ${branch.when}`;
        lines.push(`  ${label} -> ${branch.to} (${whenStr})`);
      }
    } else {
      lines.push(`  ${label} -> ${node.then}`);
    }
  }

  return lines;
}

export function listPipeline(config: Config): string {
  const sections: string[] = [];

  sections.push(config.name);
  sections.push("");
  sections.push(...renderSkills(config.skills));

  if (config.state) {
    sections.push("");
    sections.push(...renderState(config.state));
  }

  if (config.team) {
    sections.push("");
    sections.push("Team Flow:");
    sections.push(...renderFlowEdges(config.team.flow.nodes));
  }

  return sections.join("\n") + "\n";
}
