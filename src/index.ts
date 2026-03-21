// Public API surface for programmatic use of skillfold.

// Config loading and types
export {
  loadConfig,
  readConfig,
  isAtomic,
  isComposed,
} from "./config.js";
export type {
  AtomicSkill,
  ComposedSkill,
  Config,
  RawConfig,
  SkillEntry,
  TeamConfig,
} from "./config.js";

// Skill resolution
export { resolveSkills, stripFrontmatter } from "./resolver.js";

// Agent generation
export { assignColor, generateAgents } from "./agent.js";
export type { AgentColor, AgentDefinition, AgentResult } from "./agent.js";

// Compilation
export { check, compile, expandComposedBodies, generate, generateClaudeCode, generateGemini } from "./compiler.js";
export type { CheckResult, CompileResult, CompileTarget, GenerateResult } from "./compiler.js";

// Plugin packaging
export { buildPlugin } from "./plugin.js";

// Graph parsing and validation
export {
  isConditionalThen,
  isMapNode,
  parseGraph,
  validateGraph,
} from "./graph.js";
export type {
  ConditionalBranch,
  Graph,
  GraphNode,
  MapNode,
  StepNode,
  Then,
  WhenClause,
} from "./graph.js";

// State schema
export { parseState } from "./state.js";
export type {
  CustomType,
  PrimitiveType,
  StateField,
  StateLocation,
  StateSchema,
  StateType,
} from "./state.js";

// State integrations
export {
  getIntegration,
  INTEGRATION_NAMES,
  isIntegrationLocation,
  parseIntegrationLocation,
  renderIntegrationInstructions,
  resolveIntegrationUrl,
} from "./integrations.js";
export type {
  IntegrationLocation,
  IntegrationType,
} from "./integrations.js";

// Orchestrator generation
export { generateOrchestrator } from "./orchestrator.js";

// Visualization
export { generateMermaid } from "./visualize.js";

// Pipeline introspection
export { listPipeline } from "./list.js";

// Init and templates
export { initFromTemplate, initProject, TEMPLATES } from "./init.js";
export type { Template } from "./init.js";

// Adopt existing agents
export { adoptProject } from "./adopt.js";
export type { AdoptedAgent, AdoptResult } from "./adopt.js";

// Pipeline execution
export { ClaudeSpawner, run } from "./run.js";
export type { RunOptions, RunResult, Spawner, StepResult } from "./run.js";

// Errors
export {
  CompileError,
  ConfigError,
  GraphError,
  ResolveError,
  RunError,
} from "./errors.js";
