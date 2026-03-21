# Changelog

For the full release history with detailed notes, see [GitHub Releases](https://github.com/byronxlg/skillfold/releases).

<div class="changelog-timeline">

## v1.23.0

**New compilation targets** - Four more platforms:

- `--target goose` for Block's Goose (`.goosehints`)
- `--target roo-code` for Roo Code (`.roo/skills/`, `.roo/rules-{slug}/`, `.roomodes`)
- `--target kiro` for Amazon's Kiro (`.kiro/skills/`, `.kiro/steering/`)
- `--target junie` for JetBrains Junie (`.junie/skills/`, `.junie/AGENTS.md`)
- Expanded SECURITY.md to cover `skillfold run`, backends, and search commands

## v1.22.0

**Agent Teams target** - Full Claude Code Agent Teams support:

- `--target agent-teams` generates team bootstrap prompt with structure, shared state, task sequence, and coordination
- End-to-end Agent Teams tutorial and bridge guide
- Agent Teams comparison updated

## v1.21.0

- Initial `--target agent-teams` compilation output
- Updated Agent Teams comparison with latest features

## v1.20.0

**Docs overhaul** - VitePress site launch:

- CLI reference updated with all flags and targets
- Agent SDK spawner documented in running-pipelines guide
- VitePress landing page with YAML config example
- Changelog and blog sections added

## v1.19.0

**Pipeline execution** - Agent SDK and state backends:

- Agent SDK spawner for `skillfold run` (`--spawner sdk`) with full tool access via `@anthropic-ai/claude-agent-sdk`
- State backend integration reads/writes from GitHub issues, discussions, and pull requests

## v1.18.0

- `skillfold run` guide and CLI reference documentation

## v1.17.0

- Pipeline execution state persistence and checkpoint-based resume (`--resume`)

## v1.16.0

- Error handling and recovery modes (`--on-error abort|skip|retry`)
- Step timing and execution summary

## v1.15.0

- `--target gemini` for Gemini CLI
- `mcpServers` and `skills` fields in `agentConfig` for Claude Code agent frontmatter

## v1.14.0

- `skillfold init --template` for scaffolding from library example configs
- `skillfold run` with conditional routing, loops, and `--max-iterations` guard

## v1.13.0

- Parallel map execution for `skillfold run` (concurrent subgraph per list item)

## v1.12.0

- `skillfold run` command with dry-run mode

## v1.11.0

- `@ref` version pinning for GitHub URL skill references (tags and commit SHAs)
- `skills:` prefix support for Vercel skills CLI interop

## v1.10.0

- `skillfold search` for discovering pipeline configs on npm
- `npm:` prefix support for skill references and imports

## v1.9.0

- Sub-flow imports: flow nodes can reference external pipeline configs
- Async flow nodes for external agents with `async: true`

## v1.8.0

- Top-level `resources` section for namespace declarations
- Built-in state integrations (github-issues, github-discussions, github-pull-requests)

## v1.7.0

- `skillfold adopt` for importing existing Claude Code agents
- `--target copilot` compilation output

## v1.6.0

- `--target codex` compilation output (single `AGENTS.md`)
- `--target windsurf` compilation output

## v1.5.0

- `--target cursor` compilation output (`.cursor/rules/*.mdc`)

## v1.4.0

- `skillfold plugin` for Claude Code plugin packaging
- `--target claude-code` compilation output

## v1.3.0

- Shared skills library with 11 generic atomic skills
- `skillfold.local.yaml` support for local config overrides

## v1.2.0

- `skillfold watch` for auto-recompile on changes
- `--check` flag for CI integration

## v1.1.0

- `skillfold validate` and `skillfold list` commands
- JSON Schema for IDE autocompletion

## v1.0.0

**Initial stable release:**

- YAML config with skills (atomic/composed), state, and team sections
- Recursive skill composition and compilation
- Team flow graphs with conditional routing and parallel map
- Typed state schema with validation
- Orchestrator generation

</div>
