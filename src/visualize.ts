import { type Config, type SkillEntry, isComposed } from "./config.js";
import { type GraphNode, isAsyncNode, isConditionalThen, isMapNode } from "./graph.js";

// Sanitize a name into a valid Mermaid node ID by replacing non-alphanumeric
// characters with underscores.
function sanitizeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

// Resolve a composed skill to its leaf atomic skill names (deduplicated,
// order-preserving). Recursion handles nested composition.
function getLeafAtomics(
  name: string,
  skills: Record<string, SkillEntry>,
  visited?: Set<string>,
): string[] {
  const skill = skills[name];
  if (!skill || !isComposed(skill)) return [name];

  visited = visited ?? new Set();
  if (visited.has(name)) return [];
  visited.add(name);

  const leaves: string[] = [];
  const seen = new Set<string>();
  for (const ref of skill.compose) {
    for (const leaf of getLeafAtomics(ref, skills, new Set(visited))) {
      if (!seen.has(leaf)) {
        seen.add(leaf);
        leaves.push(leaf);
      }
    }
  }
  return leaves;
}

// Format state writes as a Mermaid edge label. Strips the "state." prefix
// for brevity.
function formatWritesLabel(writes: string[]): string {
  if (writes.length === 0) return "";
  return writes.map((w) => w.replace(/^state\./, "")).join(", ");
}

// Build a mapping from graph-level node labels ("skill" for steps, "map" for
// map nodes) to their Mermaid IDs. This lets `then: "map"` resolve to the
// correct subgraph ID.
function buildIdMap(nodes: GraphNode[]): Map<string, string> {
  const ids = new Map<string, string>();
  for (const node of nodes) {
    if (isMapNode(node)) {
      ids.set("map", `map_${sanitizeId(node.over)}`);
    } else if (isAsyncNode(node)) {
      ids.set(node.name, sanitizeId(node.name));
    } else {
      ids.set(node.skill, sanitizeId(node.skill));
    }
  }
  return ids;
}

// Resolve a then-target name to a Mermaid ID using the id map.
function resolveTarget(target: string, idMap: Map<string, string>): string {
  return idMap.get(target) ?? sanitizeId(target);
}

// Render an edge with an optional writes label.
function renderEdge(
  lines: string[],
  indent: string,
  fromId: string,
  toId: string,
  writes: string[],
): void {
  const label = formatWritesLabel(writes);
  if (label) {
    lines.push(`${indent}${fromId} -->|"${label}"| ${toId}`);
  } else {
    lines.push(`${indent}${fromId} --> ${toId}`);
  }
}

function renderThen(
  lines: string[],
  indent: string,
  fromId: string,
  then: NonNullable<GraphNode["then"]>,
  endNodeId: string,
  idMap: Map<string, string>,
  writes: string[],
): void {
  if (isConditionalThen(then)) {
    for (const branch of then) {
      const targetId =
        branch.to === "end"
          ? `${endNodeId}([end])`
          : resolveTarget(branch.to, idMap);
      lines.push(`${indent}${fromId} -->|"${branch.when}"| ${targetId}`);
    }
  } else {
    if (then === "end") {
      renderEdge(lines, indent, fromId, `${endNodeId}([end])`, writes);
    } else {
      renderEdge(lines, indent, fromId, resolveTarget(then, idMap), writes);
    }
  }
}

// Get the Mermaid ID for a node when it's the target of a fall-through edge.
function getNextTarget(node: GraphNode): string {
  if (isMapNode(node)) return `map_${sanitizeId(node.over)}`;
  if (isAsyncNode(node)) return sanitizeId(node.name);
  return sanitizeId(node.skill);
}

// Render nodes at one level of the graph, collecting lines into the output array.
function renderNodes(
  nodes: GraphNode[],
  lines: string[],
  indent: string,
  endNodeId: string,
  skills: Record<string, SkillEntry>,
): void {
  const idMap = buildIdMap(nodes);

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    if (isMapNode(node)) {
      const subgraphId = `map_${sanitizeId(node.over)}`;
      const subgraphLabel = `map over ${node.over}`;
      lines.push(`${indent}subgraph ${subgraphId}["${subgraphLabel}"]`);
      const innerIndent = indent + "    ";
      const innerEndId = `end_${subgraphId}`;
      renderNodes(node.graph, lines, innerIndent, innerEndId, skills);
      lines.push(`${indent}end`);

      if (node.then !== undefined) {
        renderThen(lines, indent, subgraphId, node.then, endNodeId, idMap, []);
      } else {
        const nextNode = nodes[i + 1];
        if (nextNode) {
          const nextId = getNextTarget(nextNode);
          lines.push(`${indent}${subgraphId} --> ${nextId}`);
        }
      }
    } else if (isAsyncNode(node)) {
      // Async nodes render with stadium shape ([name])
      const currentId = sanitizeId(node.name);
      lines.push(`${indent}${currentId}([${node.name}])`);

      if (node.then !== undefined) {
        renderThen(
          lines,
          indent,
          currentId,
          node.then,
          endNodeId,
          idMap,
          node.writes,
        );
      } else {
        const nextNode = nodes[i + 1];
        if (nextNode) {
          const nextTarget = getNextTarget(nextNode);
          renderEdge(lines, indent, currentId, nextTarget, node.writes);
        } else {
          renderEdge(
            lines,
            indent,
            currentId,
            `${endNodeId}([end])`,
            node.writes,
          );
        }
      }
    } else {
      const currentId = sanitizeId(node.skill);
      const skill = skills[node.skill];
      const composed = skill !== undefined && isComposed(skill);

      if (composed) {
        // Render composed skill as a subgraph with leaf atomics
        const leaves = getLeafAtomics(node.skill, skills);
        if (currentId !== node.skill) {
          lines.push(
            `${indent}subgraph ${currentId}["${node.skill}"]`,
          );
        } else {
          lines.push(`${indent}subgraph ${currentId}`);
        }
        const innerIndent = indent + "    ";
        for (const leaf of leaves) {
          const leafId = `${currentId}_${sanitizeId(leaf)}`;
          lines.push(`${innerIndent}${leafId}["${leaf}"]`);
        }
        lines.push(`${indent}end`);
      } else {
        // Atomic or unknown skill: plain node
        if (currentId !== node.skill) {
          lines.push(`${indent}${currentId}["${node.skill}"]`);
        }
      }

      if (node.then !== undefined) {
        renderThen(
          lines,
          indent,
          currentId,
          node.then,
          endNodeId,
          idMap,
          node.writes,
        );
      } else {
        const nextNode = nodes[i + 1];
        if (nextNode) {
          const nextTarget = getNextTarget(nextNode);
          renderEdge(lines, indent, currentId, nextTarget, node.writes);
        } else {
          renderEdge(
            lines,
            indent,
            currentId,
            `${endNodeId}([end])`,
            node.writes,
          );
        }
      }
    }
  }
}

export function generateMermaid(config: Config): string {
  const lines: string[] = ["graph TD"];
  renderNodes(
    config.team!.flow.nodes,
    lines,
    "    ",
    "end_node",
    config.skills,
  );
  return lines.join("\n") + "\n";
}
