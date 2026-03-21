---
name: skillfold-context
description: Context about the Skillfold project, its architecture, and design principles.
metadata:
  internal: true
---

# Skillfold Project Context

You are working on Skillfold, a configuration language and compiler for building multi-agent AI pipelines. The vision is a widely adopted, agent-first tool where agents author the config, agents consume the output, and humans provide direction.

## What Skillfold Does

Skillfold compiles YAML config into standard SKILL.md files per the Agent Skills open standard. It handles:

1. **Skill Composition** - Atomic skills (referenced by path) are combined into composed skills by concatenating their SKILL.md bodies. Composition is recursive. Skills are split into `atomic` and `composed` sub-sections.
2. **Team Flow** - Agents are wired into typed execution flows with conditional routing, loops, and parallel map. The flow compiles into an orchestrator skill. Flow and orchestrator live under the `team` config section.
3. **State Validation** - A typed state schema validates that reads/writes are consistent across the flow. State is a top-level section, independently importable.
4. **Orchestrator Generation** - The compiler generates a structured execution plan from the team flow definition and appends it to the orchestrator skill.

## Config Structure

Four top-level sections: `resources`, `skills`, `state`, `team`.

- `resources` - Resource declarations mapping group names to namespace URLs for state location validation and orchestrator URL resolution
- `skills.atomic` - Path references to atomic skill directories (local or GitHub URLs)
- `skills.composed` - Composition declarations combining atomic skills into agents
- `state` - Typed state schema with custom types, primitives, lists, and external locations
- `team.orchestrator` - Optional skill name to append generated plan to
- `team.flow` - Directed execution flow with conditional routing, loops, and parallel map

Imports pull in `resources`, `skills`, and `state`, ignore `team`.

## Architecture

The compiler pipeline is: parse config -> resolve skill paths (local + remote) -> compile compositions -> validate state -> validate flow -> generate orchestrator.

The codebase is TypeScript (strict, ESM modules). Key modules:
- `src/config.ts` - YAML parsing, config types, validation
- `src/state.ts` - State schema parsing, type system, location validation
- `src/graph.ts` - Flow parsing, validation (skills, state, conflicts, cycles)
- `src/orchestrator.ts` - Orchestrator SKILL.md generation from flow
- `src/resolver.ts` - Reads SKILL.md files from skill directories and GitHub URLs
- `src/remote.ts` - GitHub URL parsing and remote skill fetching
- `src/compiler.ts` - Recursive composition, orchestrator integration
- `src/visualize.ts` - Mermaid flowchart generation with composition lineage
- `src/list.ts` - Pipeline introspection (skillfold list)
- `src/init.ts` - skillfold init scaffolding
- `src/errors.ts` - ConfigError, ResolveError, CompileError, GraphError
- `src/cli.ts` - CLI entry point

## Key Design Principles

- Single source of truth - the pipeline config owns composition, state, and topology
- Compile to the standard - output is plain SKILL.md files
- Skills all the way down - an agent is just a skill in a flow
- Separation of concerns - capability in skills, topology in team flow, state in schema
- Validated at compile time - type mismatches and broken references are compiler errors

## What's Implemented

All compiler features are working: skill composition with atomic/composed sub-sections, state schema, flow validation, map subgraph validation, when-clause parsing, orchestrator generation, spec-compliant output, URL-based skill references (with private repo auth via GITHUB_TOKEN), pipeline imports, graph visualization with full composition lineage and interactive HTML output (`skillfold graph --html`), `skillfold init`, `skillfold adopt`, `skillfold validate`, `skillfold list`, `--check` for CI integration, async flow nodes for external agents, top-level resource declarations with compile-time location path validation (skill-level resources deprecated but backward compatible), sub-flow imports for nested pipeline composition, npm skill search (`skillfold search`), `npm:` prefix resolution for skill imports, local config overrides (`skillfold.local.yaml`), built-in state integrations for GitHub services (issues, discussions, pull requests), VitePress documentation site with live demo and GitHub Pages deployment, skill publishing guide, multi-platform compilation targets (`--target cursor`, `--target windsurf`, `--target codex`, `--target copilot`, `--target gemini`), `agentConfig` with full Claude Code frontmatter parity (including `mcpServers` and `skills` fields), and `skillfold run` for executing linear pipeline flows via agent spawning. Published on npm as `skillfold`. 722 tests across 136 suites, CI on GitHub Actions. The project self-hosts its own dev team via `skillfold.yaml`.

## What's Next

Features driven by user demand.
