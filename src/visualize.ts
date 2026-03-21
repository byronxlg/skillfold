import { type Config, type SkillEntry, isComposed } from "./config.js";
import { type GraphNode, isAsyncNode, isConditionalThen, isMapNode, isSubFlowNode } from "./graph.js";

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

// Build a mapping from graph-level node labels to their Mermaid IDs.
function buildIdMap(nodes: GraphNode[]): Map<string, string> {
  const ids = new Map<string, string>();
  for (const node of nodes) {
    if (isMapNode(node)) {
      ids.set("map", `map_${sanitizeId(node.over)}`);
    } else if (isSubFlowNode(node)) {
      ids.set(node.name, `subflow_${sanitizeId(node.name)}`);
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
  if (isSubFlowNode(node)) return `subflow_${sanitizeId(node.name)}`;
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
      renderNodes(node.flow, lines, innerIndent, innerEndId, skills);
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
      lines.push(`${indent}${currentId}([${node.name}]):::async`);

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
    } else if (isSubFlowNode(node)) {
      // Sub-flow nodes render as subgraphs containing their inner flow
      const subgraphId = `subflow_${sanitizeId(node.name)}`;
      const subgraphLabel = `sub-flow: ${node.name}`;
      lines.push(`${indent}subgraph ${subgraphId}["${subgraphLabel}"]`);

      if (node.graph && node.graph.length > 0) {
        const innerIndent = indent + "    ";
        const innerEndId = `end_${subgraphId}`;
        renderNodes(node.graph, lines, innerIndent, innerEndId, skills);
      }

      lines.push(`${indent}end`);

      if (node.then !== undefined) {
        renderThen(lines, indent, subgraphId, node.then, endNodeId, idMap, node.writes);
      } else {
        const nextNode = nodes[i + 1];
        if (nextNode) {
          const nextId = getNextTarget(nextNode);
          renderEdge(lines, indent, subgraphId, nextId, node.writes);
        } else {
          renderEdge(
            lines,
            indent,
            subgraphId,
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

function hasAsyncNodes(nodes: GraphNode[]): boolean {
  for (const node of nodes) {
    if (isAsyncNode(node)) return true;
    if (isMapNode(node) && hasAsyncNodes(node.flow)) return true;
    if (isSubFlowNode(node) && node.graph && hasAsyncNodes(node.graph)) return true;
  }
  return false;
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
  if (hasAsyncNodes(config.team!.flow.nodes)) {
    lines.push("    classDef async stroke-dasharray: 5 5");
  }
  return lines.join("\n") + "\n";
}

// Metadata for each node, used by the interactive HTML view.
interface NodeMeta {
  id: string;
  label: string;
  type: "step" | "async" | "map" | "subflow";
  composition?: string[];
  reads: string[];
  writes: string[];
  description?: string;
}

// Collect metadata for all nodes in the graph.
function collectNodeMeta(
  nodes: GraphNode[],
  skills: Record<string, SkillEntry>,
): NodeMeta[] {
  const metas: NodeMeta[] = [];

  for (const node of nodes) {
    if (isMapNode(node)) {
      metas.push({
        id: `map_${sanitizeId(node.over)}`,
        label: `map over ${node.over}`,
        type: "map",
        reads: [],
        writes: [],
      });
      metas.push(...collectNodeMeta(node.flow, skills));
    } else if (isSubFlowNode(node)) {
      const meta: NodeMeta = {
        id: `subflow_${sanitizeId(node.name)}`,
        label: node.name,
        type: "subflow",
        reads: node.reads,
        writes: node.writes,
      };
      metas.push(meta);
      if (node.graph) {
        metas.push(...collectNodeMeta(node.graph, skills));
      }
    } else if (isAsyncNode(node)) {
      metas.push({
        id: sanitizeId(node.name),
        label: node.name,
        type: "async",
        reads: node.reads,
        writes: node.writes,
      });
    } else {
      const skill = skills[node.skill];
      const composed = skill !== undefined && isComposed(skill);
      const meta: NodeMeta = {
        id: sanitizeId(node.skill),
        label: node.skill,
        type: "step",
        reads: node.reads,
        writes: node.writes,
      };
      if (composed) {
        meta.composition = getLeafAtomics(node.skill, skills);
        meta.description = skill.description;
      }
      metas.push(meta);
    }
  }

  return metas;
}

export function generateHtml(config: Config): string {
  const mermaid = generateMermaid(config);
  const nodeMeta = collectNodeMeta(config.team!.flow.nodes, config.skills);
  const metaJson = JSON.stringify(nodeMeta);
  const escapedMermaid = mermaid
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${config.name} - Pipeline Graph</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0d1117; color: #c9d1d9; display: flex; height: 100vh; overflow: hidden; }
  #graph-container { flex: 1; overflow: auto; padding: 24px; display: flex; align-items: flex-start; justify-content: center; }
  #graph-container svg { max-width: 100%; height: auto; }
  #sidebar { width: 320px; background: #161b22; border-left: 1px solid #30363d; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; transition: transform 0.2s; }
  #sidebar.collapsed { transform: translateX(320px); }
  h1 { font-size: 16px; font-weight: 600; color: #f0f6fc; }
  h2 { font-size: 13px; font-weight: 600; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; }
  .meta-section { display: flex; flex-direction: column; gap: 8px; }
  .meta-label { font-size: 11px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; }
  .meta-value { font-size: 13px; color: #c9d1d9; }
  .tag { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; margin: 2px; }
  .tag-read { background: #0d419d; color: #79c0ff; }
  .tag-write { background: #3d1e00; color: #f0883e; }
  .tag-skill { background: #1b4721; color: #56d364; }
  .tag-type { background: #3d1e3e; color: #d2a8ff; }
  .placeholder { color: #484f58; font-size: 13px; text-align: center; margin-top: 40px; }
  #toolbar { display: flex; gap: 8px; padding: 12px 20px; background: #161b22; border-bottom: 1px solid #30363d; position: absolute; top: 0; left: 0; z-index: 10; }
  .btn { padding: 6px 12px; background: #21262d; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; font-size: 12px; cursor: pointer; }
  .btn:hover { background: #30363d; }
  #graph-container { padding-top: 56px; }
  .node-label, .nodeLabel, .label { cursor: pointer !important; }
  .cluster-label span, .nodeLabel p { cursor: pointer !important; }
</style>
</head>
<body>

<div id="toolbar">
  <button class="btn" onclick="exportSvg()">Export SVG</button>
  <button class="btn" onclick="toggleSidebar()">Toggle Details</button>
</div>

<div id="graph-container">
  <pre class="mermaid">${escapedMermaid}</pre>
</div>

<div id="sidebar">
  <h1>${config.name}</h1>
  <div id="detail-content">
    <p class="placeholder">Click a node to see details</p>
  </div>
</div>

<script type="module">
import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

const nodeMeta = ${metaJson};
const metaMap = new Map(nodeMeta.map(n => [n.id, n]));

mermaid.initialize({
  startOnLoad: true,
  theme: "dark",
  securityLevel: "loose",
  flowchart: { curve: "basis", padding: 16 },
});

// Wait for Mermaid to render, then attach click handlers
setTimeout(() => {
  const svg = document.querySelector("#graph-container svg");
  if (!svg) return;

  // Click handlers for nodes and subgraphs
  svg.querySelectorAll(".node, .cluster").forEach(el => {
    el.style.cursor = "pointer";
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = el.id || el.getAttribute("data-id") || "";
      // Mermaid prefixes IDs; extract the node name
      const cleanId = id.replace(/^flowchart-/, "").replace(/-\\d+$/, "");
      showDetail(cleanId);
    });
  });
}, 500);

function showDetail(nodeId) {
  const meta = metaMap.get(nodeId);
  const detail = document.getElementById("detail-content");
  if (!meta) {
    // Try partial match
    for (const [key, val] of metaMap) {
      if (nodeId.includes(key) || key.includes(nodeId)) {
        renderDetail(val);
        return;
      }
    }
    detail.innerHTML = '<p class="placeholder">No metadata for this node</p>';
    return;
  }
  renderDetail(meta);
}

function renderDetail(meta) {
  const detail = document.getElementById("detail-content");
  let html = '<div class="meta-section">';
  html += '<div><span class="meta-label">Name</span><div class="meta-value">' + esc(meta.label) + '</div></div>';
  html += '<div><span class="meta-label">Type</span><div class="meta-value"><span class="tag tag-type">' + meta.type + '</span></div></div>';

  if (meta.description) {
    html += '<div><span class="meta-label">Description</span><div class="meta-value">' + esc(meta.description) + '</div></div>';
  }

  if (meta.composition && meta.composition.length > 0) {
    html += '<div><span class="meta-label">Composition</span><div class="meta-value">';
    meta.composition.forEach(s => { html += '<span class="tag tag-skill">' + esc(s) + '</span>'; });
    html += '</div></div>';
  }

  if (meta.reads.length > 0) {
    html += '<div><span class="meta-label">Reads</span><div class="meta-value">';
    meta.reads.forEach(r => { html += '<span class="tag tag-read">' + esc(r) + '</span>'; });
    html += '</div></div>';
  }

  if (meta.writes.length > 0) {
    html += '<div><span class="meta-label">Writes</span><div class="meta-value">';
    meta.writes.forEach(w => { html += '<span class="tag tag-write">' + esc(w) + '</span>'; });
    html += '</div></div>';
  }

  html += '</div>';
  detail.innerHTML = html;
}

function esc(s) {
  const el = document.createElement("span");
  el.textContent = s;
  return el.innerHTML;
}

// Expose to global for button handlers
window.exportSvg = function() {
  const svg = document.querySelector("#graph-container svg");
  if (!svg) return;
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svg);
  const blob = new Blob([svgStr], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "${config.name}-pipeline.svg";
  a.click();
  URL.revokeObjectURL(url);
};

window.toggleSidebar = function() {
  document.getElementById("sidebar").classList.toggle("collapsed");
};
</script>
</body>
</html>
`;
}
