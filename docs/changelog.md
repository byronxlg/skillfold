# Changelog

For the full release history with detailed notes, see [GitHub Releases](https://github.com/byronxlg/skillfold/releases).

## v1.21.0

- `--target agent-teams` compilation output for Claude Code Agent Teams - generates team bootstrap prompt with team structure, shared state, task sequence, and coordination instructions
- Updated Agent Teams comparison with latest features and complementary workflow documentation

## v1.20.0

- CLI reference updated with all implemented flags and targets
- Agent SDK spawner documented in running-pipelines guide
- VitePress landing page enriched with YAML config example
- Changelog page added to docs
- Blog section added to docs sidebar
- Repo homepage URL fixed to docs site

## v1.19.0

- Agent SDK spawner for `skillfold run` (`--spawner sdk`) - agents get full tool access via `@anthropic-ai/claude-agent-sdk`
- State backend integration - `skillfold run` reads/writes state from GitHub issues, discussions, and pull requests

## v1.18.0

- `skillfold run` guide and CLI reference documentation

## v1.17.0

- Pipeline execution state persistence and checkpoint-based resume (`--resume`)

## v1.16.0

- Error handling and recovery modes (`--on-error abort|skip|retry`)
- Step timing and execution summary

## v1.15.0

- `--target gemini` compilation output for Gemini CLI
- `mcpServers` and `skills` fields in `agentConfig` for Claude Code agent frontmatter

## v1.14.0

- `skillfold init --template` for scaffolding from library example configs
- `skillfold run` with conditional routing, loops, and `--max-iterations` guard

## v1.13.0

- Parallel map execution for `skillfold run` (concurrent subgraph execution per list item)

## v1.12.0

- `skillfold run` command for pipeline execution with dry-run mode

## v1.11.0

- `@ref` version pinning for GitHub URL skill references (tags and commit SHAs)
- `skills:` prefix support for Vercel skills CLI interop

## v1.10.0

- `skillfold search` command for discovering pipeline configs on npm
- `npm:` prefix support for skill references and imports

## v1.9.0

- Sub-flow imports: flow nodes can reference external pipeline configs
- Async flow nodes for external agents with `async: true`

## v1.8.0

- Top-level `resources` section for resource namespace declarations
- Built-in state integrations (github-issues, github-discussions, github-pull-requests)

## v1.7.0

- `skillfold adopt` command for importing existing Claude Code agents
- `--target copilot` compilation output

## v1.6.0

- `--target codex` compilation output (single `AGENTS.md`)
- `--target windsurf` compilation output

## v1.5.0

- `--target cursor` compilation output (`.cursor/rules/*.mdc`)

## v1.4.0

- `skillfold plugin` command for Claude Code plugin packaging
- `--target claude-code` compilation output

## v1.3.0

- Shared skills library with 11 generic atomic skills
- `skillfold.local.yaml` support for local config overrides

## v1.2.0

- `skillfold watch` command for auto-recompile on changes
- `--check` flag for CI integration

## v1.1.0

- `skillfold validate` and `skillfold list` commands
- JSON Schema for IDE autocompletion

## v1.0.0

- Initial stable release
- YAML config with skills (atomic/composed), state, and team sections
- Recursive skill composition and compilation
- Team flow graphs with conditional routing and parallel map
- Typed state schema with validation
- Orchestrator generation
