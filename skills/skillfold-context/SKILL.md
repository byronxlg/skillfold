# Skillfold Project Context

You are working on Skillfold, a configuration language and compiler for building multi-agent AI pipelines. The vision is a widely adopted, agent-first tool where agents author the config, agents consume the output, and humans provide direction.

## What Skillfold Does

Skillfold compiles YAML config into standard SKILL.md files per the Agent Skills open standard. It handles:

1. **Skill Composition** - Atomic skills (referenced by path) are combined into composed skills by concatenating their SKILL.md bodies. Composition is recursive.
2. **Skill Graphing** - Agents are wired into typed execution graphs with conditional routing, loops, and parallel map. The graph compiles into an orchestrator skill.
3. **State Validation** - A typed state schema validates that reads/writes are consistent across the graph.
4. **Orchestrator Generation** - The compiler generates a structured execution plan from the graph definition and appends it to the orchestrator skill.

## Architecture

The compiler pipeline is: parse config -> resolve skill paths (local + remote) -> compile compositions -> validate state -> validate graph -> generate orchestrator.

The codebase is TypeScript (strict, ESM modules). Key modules:
- `src/config.ts` - YAML parsing, config types, validation
- `src/state.ts` - State schema parsing, type system, location validation
- `src/graph.ts` - Graph parsing, validation (skills, state, conflicts, cycles)
- `src/orchestrator.ts` - Orchestrator SKILL.md generation from graph
- `src/resolver.ts` - Reads SKILL.md files from skill directories and GitHub URLs
- `src/remote.ts` - GitHub URL parsing and remote skill fetching
- `src/compiler.ts` - Recursive composition, orchestrator integration
- `src/init.ts` - skillfold init scaffolding
- `src/errors.ts` - ConfigError, ResolveError, CompileError, GraphError
- `src/cli.ts` - CLI entry point

## Key Design Principles

- Single source of truth - the pipeline config owns composition, state, and topology
- Compile to the standard - output is plain SKILL.md files
- Skills all the way down - an agent is just a skill in a graph
- Separation of concerns - capability in skills, topology in graph, state in schema
- Validated at compile time - type mismatches and broken references are compiler errors

## What's Implemented

All compiler features are working: skill composition, state schema, graph validation, map subgraph validation, when-clause parsing, orchestrator generation, spec-compliant output, URL-based skill references (GitHub), and `skillfold init`. Published on npm as `skillfold`. 175 tests, CI on GitHub Actions. The project self-hosts its own dev team via `skillfold.yaml`.

## What's Next

Pipeline imports/extends, private repo auth, package registry for shared skills.
