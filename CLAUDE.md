# Skillfold

Configuration language and compiler for multi-agent AI pipelines. Compiles YAML config into standard SKILL.md files.

## GitHub

- **Repo**: https://github.com/byronxlg/skillfold
- Issues, PRs, releases, actions, and all other GitHub features are available for use

## Quick Reference

- **Run compiler**: `npx tsx src/cli.ts`
- **Run pipeline**: `npx tsx src/cli.ts run --target claude-code`
- **Resume pipeline**: `npx tsx src/cli.ts run --target claude-code --resume`
- **Dry run**: `npx tsx src/cli.ts run --target claude-code --dry-run`
- **Compile to Claude Code agents**: `npx tsx src/cli.ts --target claude-code`
- **Package as plugin**: `npx tsx src/cli.ts plugin`
- **Watch mode**: `npx tsx src/cli.ts watch`
- **Validate config**: `npx tsx src/cli.ts validate`
- **Check output is current**: `npx tsx src/cli.ts --check`
- **List pipeline**: `npx tsx src/cli.ts list`
- **Interactive graph**: `npx tsx src/cli.ts graph --html > pipeline.html`
- **Search npm skills**: `npx tsx src/cli.ts search [query]`
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
  npm.ts          - npm package resolution (npm: prefix in skill refs and imports)
  search.ts       - npm registry search for skillfold-skill packages (skillfold search)
  run.ts          - Pipeline runner with conditionals, loops, and map (skillfold run)
  backends.ts     - State backend interface and GitHub integration implementations
  watch.ts        - File watching and auto-recompile (skillfold watch)
  init.ts         - skillfold init scaffolding
  integrations.ts - Built-in state integrations (GitHub issues, discussions, pull requests)
  errors.ts       - ConfigError, ResolveError, CompileError, GraphError
skills/           - Atomic skill definitions (each has a SKILL.md)
library/          - Shared skills library (11 generic skills + 3 example configs)
plugin/           - Claude Code plugin (library skills + /skillfold command)
docs/             - Getting-started tutorial and documentation
dist/             - tsc compiled JS (npm package, gitignored)
build/            - Compiled skill output (default --out-dir, gitignored)
skillfold.yaml         - Pipeline config for the dev team itself
skillfold.schema.json  - JSON Schema for config validation and IDE autocompletion
action.yml             - Reusable GitHub Action for CI integration (skillfold --check)
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

Four top-level sections: `resources`, `skills`, `state`, `team`.

- **resources**: Resource declarations mapping group names to namespace URLs for state location validation and orchestrator URL resolution
- **skills.atomic**: Path references to atomic skill directories
- **skills.composed**: Composition declarations combining atomic skills into agents
- **state**: Typed state schema (top-level, importable independently)
- **team.orchestrator**: Optional skill name to append generated plan to
- **team.flow**: Directed execution graph with conditional routing, loops, parallel map, and sub-flow imports

Imports pull in `skills`, `state`, and `resources`, ignore `team`.

## Design Brief Summary

Read BRIEF.md for full context. Key points:

- **Skill composition**: Atomic skills define reusable fragments. Composed skills concatenate atomic skill bodies in declared order. Composition is recursive.
- **Team flow**: Agents wired into typed execution graphs with conditional routing, loops, and parallel map. Parsed and validated.
- **State schema**: Typed state schema with custom types, primitives, lists, and external locations. Reads/writes validated against team flow. Location paths validated against skill resource declarations at compile time.
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
  - npm:skillfold/library/skillfold.yaml   # npm: prefix (preferred)
  - node_modules/skillfold/library/skillfold.yaml  # direct path (also works)
```

This makes all 11 library skills available as atomic skills in the importing config. Composed skills and team flows reference them by name.

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
- URL-based skill references (GitHub tree URLs fetched via raw.githubusercontent.com, private repos via GITHUB_TOKEN) with `@ref` version pinning (tags and commit SHAs)
- Pipeline imports (import skills and state from other configs, team is local-only)
- End-to-end test with the brief's full example config
- CI via GitHub Actions (Node 20 + 22)
- Graph visualization with full composition lineage and state writes (`skillfold graph`), with `--html` flag for interactive HTML output (clickable nodes, composition details sidebar, SVG export)
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
- `--target cursor` output mode generating `.cursor/rules/*.mdc` with Cursor-specific frontmatter
- `--target windsurf` output mode generating `.windsurf/rules/*.md` with Windsurf-specific frontmatter
- `--target codex` output mode generating a single `AGENTS.md` for OpenAI Codex CLI
- `--target copilot` output mode generating `.github/copilot-instructions.md` and `.github/instructions/*.instructions.md`
- `--target agent-teams` output mode generating Claude Code Agent Teams bootstrap artifacts (skills, agents, and `.claude/commands/start-team.md` with team structure, shared state, task sequence, and coordination)
- `--target gemini` output mode generating `.gemini/agents/*.md` and `.gemini/skills/{name}/SKILL.md` with Gemini-specific frontmatter
- `agentConfig` supports `mcpServers` (object map) and `skills` (string array) for full Claude Code agent frontmatter parity
- `skillfold plugin` command for packaging pipelines as distributable Claude Code plugins
- `skillfold adopt` command for adopting existing Claude Code agents into a pipeline
- Async flow nodes for external agents (humans, CI, other teams) with `async: true` and policy options (block, skip, use-latest)
- Top-level `resources` section for resource namespace declarations with compile-time state location path validation (skill-level resources deprecated but backward compatible)
- Resolved location URLs in orchestrator state table output (base URL templates from top-level resources)
- Compiler warnings for implicit state locations (skills without resource declarations)
- Sub-flow imports: flow nodes can reference external pipeline configs via `flow:` field, with recursive resolution, skill/state merging, circular reference detection, orchestrator rendering with hierarchical steps, and Mermaid visualization as subgraphs
- Async nodes inside map subgraphs for modeling human/external tasks alongside agent tasks in parallel maps
- Map subgraph `flow` key (with `graph` backward compat) for consistency with top-level `team.flow`
- `skillfold search [query]` command for discovering pipeline configs on npm (searches for `skillfold-pipeline` keyword)
- npm skill discovery: `agentskills` field in package.json uses flat key-value format for ecosystem compatibility
- `npm:` prefix support for skill references and imports (resolves to node_modules paths)
- `skills:` prefix support for Vercel skills CLI interop (resolves to .skills/ directory)
- Publishing guide (`docs/publishing.md`) for sharing skills via npm
- `skillfold.local.yaml` support for local config overrides (gitignored), with merge semantics for skills/state/team
- Built-in state integrations for GitHub services (github-issues, github-discussions, github-pull-requests) with auto-generated URLs, filter options, and orchestrator instructions
- `skillfold run` command for pipeline execution with `ClaudeSpawner` and `SdkSpawner` (`--spawner cli|sdk`), state management via `state.json`, dry-run mode, async node skipping, conditional routing (when-clauses), loops with `--max-iterations` guard (default: 10), graph-based node traversal, parallel map execution (concurrent subgraph execution per list item with scoped state), error handling with `--on-error` (retry/skip/abort), `--max-retries`, step timing, execution summary, and `--resume` for checkpoint-based pipeline resumption (state persisted to `.skillfold/run/`, config hash validation)
- `SdkSpawner` uses `@anthropic-ai/claude-agent-sdk` (optional peer dependency) to spawn agents with full tool access (Read, Write, Bash, etc.), Claude Code system prompt, and project settings loading
- State backend integration: `skillfold run` reads initial state from and writes changes to configured external backends (github-issues, github-discussions, github-pull-requests) via `gh` CLI, with graceful fallback to `state.json` when backends are unreachable
- VitePress documentation site (`docs/`) with GitHub Pages deployment, config reference, CLI reference, live demo with interactive pipeline visualizer, interactive pipeline builder (YAML editor with live Mermaid graph), examples gallery, skill authoring guide, comparison table, detailed comparisons page (vs Agent Teams, CrewAI, manual SKILL.md), changelog page, blog section, and existing guides
- Test suite with 846 tests across 164 suites covering config, resolver, compiler, agent, plugin, state, graph, orchestrator, integrations, visualize, remote, init, adopt, library, validate, list, search, npm, skills-prefix, watch, errors, subflow, api, run, backends, cli, and e2e modules
  - Run with `npm test` (uses `node:test`, no extra dependencies)

## What's Next

See BRIEF.md "Open Questions" section. Potential next work:
1. Features driven by user demand
