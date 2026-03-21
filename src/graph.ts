import { SkillEntry } from "./config.js";
import { didYouMean, GraphError } from "./errors.js";
import { CustomType, StateSchema } from "./state.js";

export interface WhenClause {
  path: string;
  operator: "==" | "!=";
  value: string | boolean | number;
}

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

export interface AsyncNode {
  name: string;
  async: true;
  reads: string[];
  writes: string[];
  policy: "block" | "skip" | "use-latest";
  then?: Then;
}

export interface MapNode {
  over: string;
  as: string;
  graph: GraphNode[];
  then?: Then;
}

export interface SubFlowNode {
  name: string;
  flow: string;
  reads: string[];
  writes: string[];
  graph: GraphNode[];
  then?: Then;
}

export type GraphNode = StepNode | AsyncNode | MapNode | SubFlowNode;

export interface Graph {
  nodes: GraphNode[];
}

export function isAsyncNode(node: GraphNode): node is AsyncNode {
  return "async" in node && (node as AsyncNode).async === true;
}

export function isMapNode(node: GraphNode): node is MapNode {
  return "over" in node;
}

export function isSubFlowNode(node: GraphNode): node is SubFlowNode {
  return "flow" in node;
}

export function isConditionalThen(then: Then): then is ConditionalBranch[] {
  return Array.isArray(then);
}

function parseWhenValue(raw: string): string | boolean | number {
  if (raw === "true") return true;
  if (raw === "false") return false;

  // Quoted string: "value"
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
    return raw.slice(1, -1);
  }

  // Number
  const num = Number(raw);
  if (!Number.isNaN(num) && raw.length > 0) {
    return num;
  }

  // Treat as unquoted string
  return raw;
}

export function parseWhenClause(when: string, context: string): WhenClause {
  // Try splitting on " == " first, then " != "
  for (const operator of ["==", "!="] as const) {
    const separator = ` ${operator} `;
    const idx = when.indexOf(separator);
    if (idx !== -1) {
      const path = when.slice(0, idx);
      const rawValue = when.slice(idx + separator.length);
      if (path.length === 0 || rawValue.length === 0) {
        break;
      }
      return {
        path,
        operator,
        value: parseWhenValue(rawValue),
      };
    }
  }

  throw new GraphError(
    `${context}: invalid when clause "${when}" (expected: <path> == <value> or <path> != <value>)`
  );
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

const VALID_POLICIES = new Set(["block", "skip", "use-latest"]);

function parseGraphNodes(raw: unknown[], insideMap = false): GraphNode[] {
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

      const subNodes = parseGraphNodes(mapObj.graph, true);

      nodes.push({
        over: mapObj.over,
        as: mapObj.as,
        graph: subNodes,
        ...(then !== undefined ? { then } : {}),
      });
    } else {
      const reads: string[] = [];
      const writes: string[] = [];
      let isAsync = false;
      let flowPath: string | undefined;
      let policy: "block" | "skip" | "use-latest" = "block";

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

        if (stepObj.flow !== undefined) {
          if (typeof stepObj.flow !== "string" || stepObj.flow.length === 0) {
            throw new GraphError(
              `Graph element "${primaryKey}": flow must be a non-empty string (config path)`
            );
          }
          flowPath = stepObj.flow;
          if (insideMap) {
            throw new GraphError(
              `Graph element "${primaryKey}": sub-flow nodes are not allowed inside map subgraphs`
            );
          }
        }

        if (stepObj.async === true) {
          isAsync = true;
          if (insideMap) {
            throw new GraphError(
              `Graph element "${primaryKey}": async nodes are not allowed inside map subgraphs`
            );
          }
        }

        if (stepObj.policy !== undefined) {
          if (typeof stepObj.policy !== "string" || !VALID_POLICIES.has(stepObj.policy)) {
            throw new GraphError(
              `Graph element "${primaryKey}": policy must be "block", "skip", or "use-latest"`
            );
          }
          policy = stepObj.policy as "block" | "skip" | "use-latest";
        }
      } else if (value !== null && value !== undefined) {
        throw new GraphError(
          `Graph element "${primaryKey}": value must be an object or omitted`
        );
      }

      if (flowPath !== undefined) {
        nodes.push({
          name: primaryKey,
          flow: flowPath,
          reads,
          writes,
          graph: [], // populated during config resolution
          ...(then !== undefined ? { then } : {}),
        });
      } else if (isAsync) {
        nodes.push({
          name: primaryKey,
          async: true,
          reads,
          writes,
          policy,
          ...(then !== undefined ? { then } : {}),
        });
      } else {
        nodes.push({
          skill: primaryKey,
          reads,
          writes,
          ...(then !== undefined ? { then } : {}),
        });
      }
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

// Collect all node labels (skill names for steps, async node names, "map" for map nodes, sub-flow names)
function collectNodeLabels(nodes: GraphNode[]): string[] {
  return nodes.map((node) => {
    if (isMapNode(node)) return "map";
    if (isAsyncNode(node)) return node.name;
    if (isSubFlowNode(node)) return node.name;
    return node.skill;
  });
}

// Get all "to" targets from a Then value
function getThenTargets(then: Then | undefined): string[] {
  if (then === undefined) return [];
  if (typeof then === "string") return [then];
  return then.map((b) => b.to);
}

// Get a label for a node (skill name, async name, sub-flow name, or "map")
function nodeLabel(node: GraphNode): string {
  if (isMapNode(node)) return "map";
  if (isAsyncNode(node)) return node.name;
  if (isSubFlowNode(node)) return node.name;
  return node.skill;
}

// Context for validating paths inside a map subgraph
interface MapContext {
  as: string;
  typeName: string;
  type: CustomType;
}

function validateNodes(
  nodes: GraphNode[],
  skills: Record<string, SkillEntry>,
  state: StateSchema | undefined,
  mapCtx?: MapContext,
): void {
  const nodeLabels = new Set(collectNodeLabels(nodes));

  // Rule 1: Skill references (async and sub-flow nodes skip this check)
  const skillNames = Object.keys(skills);
  for (const node of nodes) {
    if (!isMapNode(node) && !isAsyncNode(node) && !isSubFlowNode(node)) {
      if (!(node.skill in skills)) {
        const hint = didYouMean(node.skill, skillNames);
        throw new GraphError(
          `Graph node "${node.skill}": skill "${node.skill}" is not declared${hint}`
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
        const hint = didYouMean(target, [...nodeLabels, "end"]);
        throw new GraphError(
          `Graph node "${label}": transition target "${target}" is not a declared skill or "end"${hint}`
        );
      }
    }
  }

  // Rule 3: State path validation (applies identically to step, async, and sub-flow nodes)
  const stateFieldNames = state ? Object.keys(state.fields) : [];
  for (const node of nodes) {
    if (isMapNode(node)) continue;
    const label = isAsyncNode(node) ? node.name : isSubFlowNode(node) ? node.name : node.skill;

    for (const path of node.reads) {
      if (path.startsWith("state.")) {
        if (!state) {
          throw new GraphError(
            `Graph node "${label}": reads state field "${path}" but no state is declared. Add a top-level "state" section to your config`
          );
        }
        const fieldName = path.slice("state.".length);
        if (!(fieldName in state.fields)) {
          const hint = didYouMean(fieldName, stateFieldNames);
          throw new GraphError(
            `Graph node "${label}": reads state field "${path}" which is not declared${hint}`
          );
        }
      } else if (mapCtx && path.startsWith(mapCtx.as + ".")) {
        const fieldName = path.slice(mapCtx.as.length + 1);
        if (!(fieldName in mapCtx.type.fields)) {
          throw new GraphError(
            `Map subgraph node "${label}": reads "${path}" but type "${mapCtx.typeName}" has no field "${fieldName}"`
          );
        }
      }
    }

    for (const path of node.writes) {
      if (path.startsWith("state.")) {
        if (!state) {
          throw new GraphError(
            `Graph node "${label}": writes state field "${path}" but no state is declared. Add a top-level "state" section to your config`
          );
        }
        const fieldName = path.slice("state.".length);
        if (!(fieldName in state.fields)) {
          const hint = didYouMean(fieldName, stateFieldNames);
          throw new GraphError(
            `Graph node "${label}": writes state field "${path}" which is not declared${hint}`
          );
        }
      } else if (mapCtx && path.startsWith(mapCtx.as + ".")) {
        const fieldName = path.slice(mapCtx.as.length + 1);
        if (!(fieldName in mapCtx.type.fields)) {
          throw new GraphError(
            `Map subgraph node "${label}": writes "${path}" but type "${mapCtx.typeName}" has no field "${fieldName}"`
          );
        }
      }
    }
  }

  // When-clause validation: parse and validate paths
  for (const node of nodes) {
    if (!node.then || !isConditionalThen(node.then)) continue;
    const label = nodeLabel(node);

    for (const branch of node.then) {
      const clause = parseWhenClause(branch.when, `Graph node "${label}"`);

      if (clause.path.startsWith("state.")) {
        if (!state) {
          throw new GraphError(
            `Graph node "${label}": when clause references state field "${clause.path}" but no state is declared`
          );
        }
        const fieldName = clause.path.slice("state.".length);
        if (!(fieldName in state.fields)) {
          throw new GraphError(
            `Graph node "${label}": when clause references state field "${clause.path}" which is not declared`
          );
        }
      } else if (mapCtx && clause.path.startsWith(mapCtx.as + ".")) {
        const fieldName = clause.path.slice(mapCtx.as.length + 1);
        if (!(fieldName in mapCtx.type.fields)) {
          throw new GraphError(
            `Graph node "${label}": when clause references "${clause.path}" but type "${mapCtx.typeName}" has no field "${fieldName}"`
          );
        }
      } else if (state) {
        // Handle paths like "review.approved" where "review" is a state field of custom type
        const dotIndex = clause.path.indexOf(".");
        if (dotIndex === -1) {
          throw new GraphError(
            `Graph node "${label}": when clause references "${clause.path}" which is not a valid state path`
          );
        }
        const fieldName = clause.path.slice(0, dotIndex);
        const subField = clause.path.slice(dotIndex + 1);
        if (!(fieldName in state.fields)) {
          throw new GraphError(
            `Graph node "${label}": when clause references "${clause.path}" but "${fieldName}" is not a declared state field`
          );
        }
        const field = state.fields[fieldName];
        if (field.type.kind === "custom" && field.type.name in state.types) {
          const customType = state.types[field.type.name];
          if (!(subField in customType.fields)) {
            throw new GraphError(
              `Graph node "${label}": when clause references "${clause.path}" but type "${field.type.name}" has no field "${subField}"`
            );
          }
        }
      } else {
        throw new GraphError(
          `Graph node "${label}": when clause references "${clause.path}" which is not a state or map variable path`
        );
      }
    }
  }

  // Rule 4: Write conflicts (same graph level)
  // Track whether each write owner is async for mixed-conflict warnings
  const writeOwners = new Map<string, { label: string; isAsync: boolean }>();
  for (const node of nodes) {
    if (isMapNode(node)) continue;
    const label = isAsyncNode(node) ? node.name : isSubFlowNode(node) ? node.name : node.skill;
    const nodeIsAsync = isAsyncNode(node);
    for (const path of node.writes) {
      if (!path.startsWith("state.")) continue;
      const existing = writeOwners.get(path);
      if (existing !== undefined && existing.label !== label) {
        if (!existing.isAsync && !nodeIsAsync) {
          // Both non-async: hard error
          throw new GraphError(
            `Write conflict: nodes "${existing.label}" and "${label}" both write "${path}"`
          );
        } else {
          // One is async: warning to stderr
          process.stderr.write(
            `Warning: nodes "${existing.label}" and "${label}" both write "${path}" (async conflict)\n`
          );
        }
      }
      writeOwners.set(path, { label, isAsync: nodeIsAsync });
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

    // Resolve the element type for subgraph path validation
    let subMapCtx: MapContext | undefined;
    if (node.over.startsWith("state.") && state) {
      const fieldName = node.over.slice("state.".length);
      const field = state.fields[fieldName];
      if (field && field.type.kind === "list") {
        const elementTypeName = field.type.element;
        const elementType = state.types[elementTypeName];
        if (elementType) {
          subMapCtx = { as: node.as, typeName: elementTypeName, type: elementType };
        }
      }
    }

    // Recursively validate the subgraph
    validateNodes(node.graph, skills, state, subMapCtx);
  }

  // Rule 9: Sub-flow validation - recursively validate inner graph
  for (const node of nodes) {
    if (!isSubFlowNode(node)) continue;
    if (node.graph.length > 0) {
      validateNodes(node.graph, skills, state);
    }
  }

  // Build index: node label -> position in this level's node list
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
