import { Graph, GraphNode, isConditionalThen, isMapNode } from "./graph.js";

// Sanitize a name into a valid Mermaid node ID by replacing non-alphanumeric
// characters with underscores.
function sanitizeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

// Only emit a label declaration if the name differs from its sanitized ID.
function nodeDecl(name: string): string {
  const id = sanitizeId(name);
  if (id !== name) {
    return `${id}["${name}"]`;
  }
  return id;
}

// Build a mapping from graph-level node labels ("skill" for steps, "map" for
// map nodes) to their Mermaid IDs. This lets `then: "map"` resolve to the
// correct subgraph ID.
function buildIdMap(nodes: GraphNode[]): Map<string, string> {
  const ids = new Map<string, string>();
  for (const node of nodes) {
    if (isMapNode(node)) {
      ids.set("map", `map_${sanitizeId(node.over)}`);
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

// Render nodes at one level of the graph, collecting lines into the output array.
function renderNodes(
  nodes: GraphNode[],
  lines: string[],
  indent: string,
  endNodeId: string,
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
      renderNodes(node.graph, lines, innerIndent, innerEndId);
      lines.push(`${indent}end`);

      // Connect map subgraph to the next node if there's a then
      if (node.then !== undefined) {
        renderThen(lines, indent, subgraphId, node.then, endNodeId, idMap);
      } else {
        // Implicit fall-through: connect to next sibling if present
        const nextNode = nodes[i + 1];
        if (nextNode) {
          const nextId = isMapNode(nextNode)
            ? `map_${sanitizeId(nextNode.over)}`
            : sanitizeId(nextNode.skill);
          lines.push(`${indent}${subgraphId} --> ${nextId}`);
        }
      }
    } else {
      const currentId = sanitizeId(node.skill);

      // Emit a node declaration if the name needs a label
      if (currentId !== node.skill) {
        lines.push(`${indent}${nodeDecl(node.skill)}`);
      }

      if (node.then !== undefined) {
        renderThen(lines, indent, currentId, node.then, endNodeId, idMap);
      } else {
        // Implicit fall-through
        const nextNode = nodes[i + 1];
        if (nextNode) {
          const nextTarget = isMapNode(nextNode)
            ? `map_${sanitizeId(nextNode.over)}`
            : sanitizeId(nextNode.skill);
          lines.push(`${indent}${currentId} --> ${nextTarget}`);
        } else {
          // Last node with no then: arrow to end
          lines.push(`${indent}${currentId} --> ${endNodeId}([end])`);
        }
      }
    }
  }
}

function renderThen(
  lines: string[],
  indent: string,
  fromId: string,
  then: NonNullable<GraphNode["then"]>,
  endNodeId: string,
  idMap: Map<string, string>,
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
      lines.push(`${indent}${fromId} --> ${endNodeId}([end])`);
    } else {
      lines.push(`${indent}${fromId} --> ${resolveTarget(then, idMap)}`);
    }
  }
}

export function generateMermaid(graph: Graph): string {
  const lines: string[] = ["graph TD"];
  renderNodes(graph.nodes, lines, "    ", "end_node");
  return lines.join("\n") + "\n";
}
