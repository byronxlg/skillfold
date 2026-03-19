# Skillfold Project Context

You are working on Skillfold, a configuration language and compiler for building multi-agent AI pipelines.

## What Skillfold Does

Skillfold compiles YAML config into standard SKILL.md files per the Agent Skills open standard. It handles:

1. **Skill Composition** - Atomic skills (referenced by path) are combined into composed skills by concatenating their SKILL.md bodies. Composition is recursive.
2. **Skill Graphing** - Agents are wired into typed execution graphs with conditional routing, loops, and parallel map. The graph compiles into an orchestrator skill.
3. **State Validation** - A typed state schema validates that reads/writes are consistent across the graph.

## Architecture

The compiler pipeline is: parse config -> resolve skill paths -> compile compositions -> validate state -> validate graph -> generate orchestrator.

The codebase is TypeScript (strict, ESM modules). Key modules:
- `src/config.ts` - YAML parsing, config types, validation
- `src/resolver.ts` - Reads SKILL.md files from skill directories
- `src/compiler.ts` - Recursive composition and concatenation
- `src/errors.ts` - Structured error types
- `src/cli.ts` - CLI entry point

## Key Design Principles

- Single source of truth - the pipeline config owns composition, state, and topology
- Compile to the standard - output is plain SKILL.md files
- Skills all the way down - an agent is just a skill in a graph
- Separation of concerns - capability in skills, topology in graph, state in schema
- Validated at compile time - type mismatches and broken references are compiler errors

## Current State

The compiler handles skill composition. State validation, graph validation, orchestrator generation, and map support are not yet implemented.
