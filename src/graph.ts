import { SkillEntry } from "./config.js";
import { GraphError } from "./errors.js";
import { StateSchema } from "./state.js";

export interface ConditionalBranch {
  when: string;
  to: string;
}

export type Then = string | ConditionalBranch[];

export interface StepNode {
  skill: string;
  reads: string[];
  writes: string[];
  then?: Then;
}

export interface MapNode {
  over: string;
  as: string;
  graph: GraphNode[];
  then?: Then;
}

export type GraphNode = StepNode | MapNode;

export interface Graph {
  nodes: GraphNode[];
}

export function isMapNode(node: GraphNode): node is MapNode {
  return "over" in node;
}

export function isConditionalThen(then: Then): then is ConditionalBranch[] {
  return Array.isArray(then);
}

function parseThen(raw: unknown, context: string): Then | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  if (typeof raw === "string") {
    return raw;
  }

  if (Array.isArray(raw)) {
    const branches: ConditionalBranch[] = [];
    for (const item of raw) {
      if (typeof item !== "object" || item === null) {
        throw new GraphError(
          `${context}: conditional then must be an array of {when, to} objects`
        );
      }
      const obj = item as Record<string, unknown>;
      if (typeof obj.when !== "string" || typeof obj.to !== "string") {
        throw new GraphError(
          `${context}: conditional branch must have "when" (string) and "to" (string)`
        );
      }
      branches.push({ when: obj.when, to: obj.to });
    }
    if (branches.length === 0) {
      throw new GraphError(`${context}: conditional then must not be empty`);
    }
    return branches;
  }

  throw new GraphError(`${context}: then must be a string or array of {when, to}`);
}

function parseGraphNodes(raw: unknown[]): GraphNode[] {
  const nodes: GraphNode[] = [];

  for (let i = 0; i < raw.length; i++) {
    const element = raw[i];

    if (typeof element !== "object" || element === null || Array.isArray(element)) {
      throw new GraphError(`Graph element at index ${i}: must be an object`);
    }

    const obj = element as Record<string, unknown>;
    const keys = Object.keys(obj);
    const primaryKeys = keys.filter((k) => k !== "then");

    if (primaryKeys.length !== 1) {
      throw new GraphError(
        `Graph element at index ${i}: must have exactly one primary key (found ${primaryKeys.length})`
      );
    }

    const primaryKey = primaryKeys[0];
    const value = obj[primaryKey];
    const then = parseThen(obj.then, `Graph element "${primaryKey}"`);

    if (primaryKey === "map") {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new GraphError(`Graph element "map": value must be an object`);
      }

      const mapObj = value as Record<string, unknown>;

      if (typeof mapObj.over !== "string") {
        throw new GraphError(`Graph element "map": must have "over" (string)`);
      }

      if (typeof mapObj.as !== "string") {
        throw new GraphError(`Graph element "map": must have "as" (string)`);
      }

      if (!Array.isArray(mapObj.graph)) {
        throw new GraphError(`Graph element "map": must have "graph" (array)`);
      }

      const subNodes = parseGraphNodes(mapObj.graph);

      nodes.push({
        over: mapObj.over,
        as: mapObj.as,
        graph: subNodes,
        ...(then !== undefined ? { then } : {}),
      });
    } else {
      const reads: string[] = [];
      const writes: string[] = [];

      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        const stepObj = value as Record<string, unknown>;

        if (stepObj.reads !== undefined) {
          if (!Array.isArray(stepObj.reads) || !stepObj.reads.every((r) => typeof r === "string")) {
            throw new GraphError(
              `Graph element "${primaryKey}": reads must be an array of strings`
            );
          }
          reads.push(...(stepObj.reads as string[]));
        }

        if (stepObj.writes !== undefined) {
          if (!Array.isArray(stepObj.writes) || !stepObj.writes.every((w) => typeof w === "string")) {
            throw new GraphError(
              `Graph element "${primaryKey}": writes must be an array of strings`
            );
          }
          writes.push(...(stepObj.writes as string[]));
        }
      } else if (value !== null && value !== undefined) {
        throw new GraphError(
          `Graph element "${primaryKey}": value must be an object or omitted`
        );
      }

      nodes.push({
        skill: primaryKey,
        reads,
        writes,
        ...(then !== undefined ? { then } : {}),
      });
    }
  }

  return nodes;
}

export function parseGraph(raw: unknown): Graph {
  if (!Array.isArray(raw)) {
    throw new GraphError("Graph must be an array");
  }

  if (raw.length === 0) {
    throw new GraphError("Graph must have at least one node");
  }

  const nodes = parseGraphNodes(raw);
  return { nodes };
}

// Collect all node labels (skill names for steps, "map" for map nodes)
function collectNodeLabels(nodes: GraphNode[]): string[] {
  return nodes.map((node) => isMapNode(node) ? "map" : node.skill);
}

// Get all "to" targets from a Then value
function getThenTargets(then: Then | undefined): string[] {
  if (then === undefined) return [];
  if (typeof then === "string") return [then];
  return then.map((b) => b.to);
}

// Get a label for a node (skill name or "map")
function nodeLabel(node: GraphNode): string {
  return isMapNode(node) ? "map" : node.skill;
}

function validateNodes(
  nodes: GraphNode[],
  skills: Record<string, SkillEntry>,
  state: StateSchema | undefined,
): void {
  const nodeLabels = new Set(collectNodeLabels(nodes));

  // Rule 1: Skill references
  for (const node of nodes) {
    if (!isMapNode(node)) {
      if (!(node.skill in skills)) {
        throw new GraphError(
          `Graph node "${node.skill}": skill "${node.skill}" is not declared`
        );
      }
    }
  }

  // Rule 2: Transition targets
  for (const node of nodes) {
    const label = nodeLabel(node);
    const targets = getThenTargets(node.then);
    for (const target of targets) {
      if (target === "end") continue;
      if (!nodeLabels.has(target)) {
        throw new GraphError(
          `Graph node "${label}": transition target "${target}" is not a declared skill or "end"`
        );
      }
    }
  }

  // Rule 3: State path validation
  for (const node of nodes) {
    if (isMapNode(node)) continue;
    const label = node.skill;

    for (const path of node.reads) {
      if (!path.startsWith("state.")) continue;
      if (!state) {
        throw new GraphError(
          `Graph node "${label}": reads state field "${path}" but no state is declared`
        );
      }
      const fieldName = path.slice("state.".length);
      if (!(fieldName in state.fields)) {
        throw new GraphError(
          `Graph node "${label}": reads state field "${path}" which is not declared`
        );
      }
    }

    for (const path of node.writes) {
      if (!path.startsWith("state.")) continue;
      if (!state) {
        throw new GraphError(
          `Graph node "${label}": writes state field "${path}" but no state is declared`
        );
      }
      const fieldName = path.slice("state.".length);
      if (!(fieldName in state.fields)) {
        throw new GraphError(
          `Graph node "${label}": writes state field "${path}" which is not declared`
        );
      }
    }
  }

  // Rule 4: Write conflicts (same graph level)
  const writeOwners = new Map<string, string>();
  for (const node of nodes) {
    if (isMapNode(node)) continue;
    for (const path of node.writes) {
      if (!path.startsWith("state.")) continue;
      const existing = writeOwners.get(path);
      if (existing !== undefined && existing !== node.skill) {
        throw new GraphError(
          `Write conflict: nodes "${existing}" and "${node.skill}" both write "${path}"`
        );
      }
      writeOwners.set(path, node.skill);
    }
  }

  // Rules 7 & 8: Map validation
  for (const node of nodes) {
    if (!isMapNode(node)) continue;

    // Rule 7: map.over must reference a state field with list type
    if (node.over.startsWith("state.")) {
      if (!state) {
        throw new GraphError(
          `Map node: "${node.over}" references state but no state is declared`
        );
      }
      const fieldName = node.over.slice("state.".length);
      const field = state.fields[fieldName];
      if (!field) {
        throw new GraphError(
          `Map node: "${node.over}" is not a declared state field`
        );
      }
      if (field.type.kind !== "list") {
        throw new GraphError(`Map node: "${node.over}" is not a list field`);
      }
    }

    // Rule 8: map.as must not shadow a state field name
    if (state && node.as in state.fields) {
      throw new GraphError(
        `Map node: loop variable "${node.as}" shadows state field`
      );
    }

    // Recursively validate the subgraph
    validateNodes(node.graph, skills, state);
  }

  // Build index: node label -> position in this level's node list
  // Step nodes use their skill name; map nodes use "map"
  const nodeIndex = new Map<string, number>();
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const label = nodeLabel(node);
    // If there are duplicate labels, keep the first occurrence
    if (!nodeIndex.has(label)) {
      nodeIndex.set(label, i);
    }
  }

  // Rule 5: Cycle exit condition
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node.then || !isConditionalThen(node.then)) continue;

    const hasBackEdge = node.then.some((branch) => {
      if (branch.to === "end") return false;
      const targetIdx = nodeIndex.get(branch.to);
      return targetIdx !== undefined && targetIdx <= i;
    });

    if (!hasBackEdge) continue;

    // Has a back-edge - check that at least one branch exits
    const hasExit = node.then.some((branch) => {
      if (branch.to === "end") return true;
      const targetIdx = nodeIndex.get(branch.to);
      return targetIdx !== undefined && targetIdx > i;
    });

    if (!hasExit) {
      const label = nodeLabel(node);
      throw new GraphError(
        `Graph node "${label}": conditional cycle has no exit condition`
      );
    }
  }

  // Rule 6: Reachability
  if (nodes.length > 1) {
    const reachable = new Set<number>();
    const queue: number[] = [0];
    reachable.add(0);

    while (queue.length > 0) {
      const idx = queue.shift()!;
      const current = nodes[idx];
      const targets = getThenTargets(current.then);

      if (targets.length === 0) {
        // Implicit fall-through to next node
        const next = idx + 1;
        if (next < nodes.length && !reachable.has(next)) {
          reachable.add(next);
          queue.push(next);
        }
      } else {
        for (const target of targets) {
          if (target === "end") continue;
          const targetIdx = nodeIndex.get(target);
          if (targetIdx !== undefined && !reachable.has(targetIdx)) {
            reachable.add(targetIdx);
            queue.push(targetIdx);
          }
        }
      }
    }

    for (let i = 0; i < nodes.length; i++) {
      if (!reachable.has(i)) {
        const label = nodeLabel(nodes[i]);
        throw new GraphError(`Graph node "${label}" is unreachable`);
      }
    }
  }
}

export function validateGraph(
  graph: Graph,
  skills: Record<string, SkillEntry>,
  state: StateSchema | undefined,
): void {
  validateNodes(graph.nodes, skills, state);
}
