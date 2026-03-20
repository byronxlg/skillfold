# Skillfold

Configuration language and compiler for multi-agent AI pipelines. Compiles YAML config into standard SKILL.md files.

## GitHub

- **Repo**: https://github.com/byronxlg/skillfold
- Issues, PRs, releases, actions, and all other GitHub features are available for use

## Quick Reference

- **Run compiler**: `npx tsx src/cli.ts`
- **Compile to Claude Code agents**: `npx tsx src/cli.ts --target claude-code`
- **Package as plugin**: `npx tsx src/cli.ts plugin`
- **Watch mode**: `npx tsx src/cli.ts watch`
- **Validate config**: `npx tsx src/cli.ts validate`
- **Check output is current**: `npx tsx src/cli.ts --check`
- **List pipeline**: `npx tsx src/cli.ts list`
- **Run with custom config**: `npx tsx src/cli.ts --config path.yaml --out-dir out/`
- **Build**: `npm run build`
- **Build plugin**: `npm run build:plugin`
- **Type check**: `npx tsc --noEmit`

## Project Structure

```
src/
  cli.ts          - CLI entry point, arg parsing
  config.ts       - YAML parsing, config types, validation (cycles, references)
  state.ts        - State schema parsing, type system, location validation
  resolver.ts     - Reads SKILL.md files from skill directories (local + remote)
  remote.ts       - GitHub URL parsing and remote skill fetching
  agent.ts        - Claude Code agent markdown generation from composed skills
  compiler.ts     - Recursive composition, body concatenation, orchestrator integration
  graph.ts        - Graph parsing, validation (skills, state, conflicts, cycles)
  orchestrator.ts - Orchestrator SKILL.md generation from graph definition
  plugin.ts       - Claude Code plugin packaging (skillfold plugin)
  list.ts         - Pipeline introspection (skillfold list)
  watch.ts        - File watching and auto-recompile (skillfold watch)
  init.ts         - skillfold init scaffolding
  errors.ts       - ConfigError, ResolveError, CompileError, GraphError
skills/           - Atomic skill definitions (each has a SKILL.md)
library/          - Shared skills library (11 generic skills + 3 example configs)
plugin/           - Claude Code plugin (library skills + /skillfold command)
docs/             - Getting-started tutorial and documentation
dist/             - tsc compiled JS (npm package, gitignored)
build/            - Compiled skill output (default --out-dir, gitignored)
skillfold.yaml         - Pipeline config for the dev team itself
skillfold.schema.json  - JSON Schema for config validation and IDE autocompletion
BRIEF.md               - Full design brief
```

## Workflow

- Push commits to GitHub frequently to maintain visibility of progress. Don't let work accumulate locally.

## Code Conventions

- TypeScript, strict mode, ESM modules
- Node stdlib imports use `node:` prefix
- Imports: node stdlib -> third-party -> local, alpha within groups
- File extensions in imports: `.js` (NodeNext module resolution)
- Custom errors extend Error with descriptive messages including skill name context
- No `any`, no unnecessary type assertions

## Config Structure

Three top-level sections: `skills`, `state`, `team`.

- **skills.atomic**: Path references to atomic skill directories
- **skills.composed**: Composition declarations combining atomic skills into agents
- **state**: Typed state schema (top-level, importable independently)
- **team.orchestrator**: Optional skill name to append generated plan to
- **team.flow**: Directed execution graph with conditional routing, loops, and parallel map

Imports pull in `skills` and `state`, ignore `team`.

## Design Brief Summary

Read BRIEF.md for full context. Key points:

- **Skill composition**: Atomic skills define reusable fragments. Composed skills concatenate atomic skill bodies in declared order. Composition is recursive.
- **Team flow**: Agents wired into typed execution graphs with conditional routing, loops, and parallel map. Parsed and validated.
- **State schema**: Typed state schema with custom types, primitives, lists, and external locations. Reads/writes validated against team flow.
- **Orchestrator generation**: Generated from the team flow definition. Produces structured execution plan with step numbering, state table, and conditional/map rendering.

## Shared Skills Library

The `library/` directory contains 11 generic, reusable atomic skills and 3 example pipeline configs. It exists as an import target - other configs can pull in library skills via the `imports` field.

### Skills

- **planning** - Break problems into steps, identify dependencies, estimate scope
- **research** - Gather information, evaluate sources, synthesize findings
- **decision-making** - Evaluate trade-offs, document options, justify recommendations
- **code-writing** - Write clean, correct, production-quality code (language-agnostic)
- **code-review** - Review code for correctness, clarity, and security
- **testing** - Write and reason about tests, behavior testing, edge cases
- **writing** - Produce clear, structured prose and documentation
- **summarization** - Condense information with audience-appropriate detail levels
- **github-workflow** - Work with GitHub branches, PRs, issues, reviews via `gh` CLI
- **file-management** - Read, create, edit, and organize files and directories
- **skillfold-cli** - Use the skillfold compiler to manage pipeline configs

### Import Syntax

```yaml
imports:
  - node_modules/skillfold/library/skillfold.yaml
```

This makes all 10 library skills available as atomic skills in the importing config. Composed skills and team flows reference them by name.

### Example Configs

Located in `library/examples/`:

- **dev-team** - Linear pipeline with review loop (planner, engineer, reviewer)
- **content-pipeline** - Map/parallel pattern over topics (researcher, writer, editor)
- **code-review-bot** - Minimal two-agent flow (analyzer, reporter)

## What's Implemented

- Config parsing with three top-level sections (skills, state, team), cycle detection, and reference validation
- Skills split into atomic and composed sub-sections
- Skill path resolution and SKILL.md reading (local paths + GitHub URLs)
- Recursive skill composition and compilation to build/
- State schema parsing and validation (custom types, primitive/list/custom type refs, location validation)
- Team flow parsing and validation (skill refs, transition targets, state paths, write conflicts, map validation, cycle exit conditions, reachability)
- Map subgraph state validation against custom type fields
- When-clause expression parsing and validation
- Orchestrator SKILL.md generation (execution plan with steps, state table, conditionals, map/parallel)
- Optional `team.orchestrator` config key to append generated plan to a composed skill
- Spec-compliant output per Agent Skills standard (directory structure + YAML frontmatter)
- `skillfold init` command to scaffold starter pipeline projects
- URL-based skill references (GitHub tree URLs fetched via raw.githubusercontent.com, private repos via GITHUB_TOKEN)
- Pipeline imports (import skills and state from other configs, team is local-only)
- End-to-end test with the brief's full example config
- CI via GitHub Actions (Node 20 + 22)
- Graph visualization with full composition lineage and state writes (`skillfold graph`)
- Shared skills library with 11 generic atomic skills and 3 example pipeline configs
- `skillfold init` shows library import hint in generated config and CLI output
- `skillfold validate` command for config validation without compiling output
- `skillfold list` command for pipeline introspection (skills, state, team flow)
- Getting-started tutorial (`docs/getting-started.md`) walking users from install to compiled pipeline
- JSON Schema (`skillfold.schema.json`) for IDE autocompletion and config validation
- `--check` flag for CI integration (verifies compiled output is up-to-date without writing)
- `skillfold watch` command for auto-recompile on config or skill changes
- Compiled output provenance headers include version and source config path
- `skillfold init --template` for scaffolding from library example configs
- Platform integration guide (`docs/integrations.md`) for Claude Code, Cursor, VS Code Copilot, Codex, Gemini CLI
- Automated npm publish via GitHub Actions (`.github/workflows/publish.yml`, triggered on release)
- Claude Code plugin with 11 library skills and `/skillfold` slash command (`plugin/`)
- `--target claude-code` output mode generating `.claude/agents/*.md`, `.claude/skills/{name}/SKILL.md`, and `.claude/commands/run-pipeline.md`
- `skillfold plugin` command for packaging pipelines as distributable Claude Code plugins
- `skillfold adopt` command for adopting existing Claude Code agents into a pipeline
- Test suite with 322 tests across 58 suites covering config, resolver, compiler, agent, plugin, state, graph, orchestrator, visualize, remote, init, adopt, library, validate, list, watch, and e2e modules
  - Run with `npm test` (uses `node:test`, no extra dependencies)

## What's Next

See BRIEF.md "Open Questions" section. Potential next work:
1. Package registry for shared skills
2. Sub-flow imports (flow nodes referencing imported flows as single nodes)
