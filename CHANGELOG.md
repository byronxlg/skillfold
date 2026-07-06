# Changelog

For the full release history with detailed notes, see [GitHub Releases](https://github.com/byronxlg/skillfold/releases).

## v2.2.0

- `targets` manifest key: `[claude, codex]` installs the same skills into `.claude/skills` and `.agents/skills` (where Codex discovers them) from one manifest and lockfile
- The codex target syncs rules into a marker-fenced managed block in `AGENTS.md` (Codex's instructions file); content outside the markers is never touched, and `check` verifies the block offline
- Global mode maps the codex target to `~/.agents/skills` and `~/.codex/AGENTS.md` (honoring `CODEX_HOME`)
- `check`/`list` verify every target layout and label problems with the drifted target
- The lockfile records installed targets; a newly added target treats pre-existing files as hand-authored (no silent overwrites without `--force`)
- API: `checkProject` and `skillRows` now take target layouts (from `targetLayouts()`) instead of skillsDir/rulesDir paths

## v2.1.0

- `rules` manifest section: single markdown files installed as `<rulesDir>/<name>.md` (default `.claude/rules`), from local, GitHub, or npm sources, pinned in the lockfile like skills
- Composed skills carry the supporting files (`references/`, `scripts/`, ...) of the skills they use; identical duplicates collapse, conflicting paths error
- Composed skill frontmatter gains `allowed-tools`: the union of the used skills' tools when every one declares a list (an unrestricted input leaves the composite unrestricted), or an explicit `allowed-tools` on the compose entry
- Installs rewrite the SKILL.md frontmatter `name` to the manifest name, so the installed directory and frontmatter always agree
- GitHub and npm cache writes are atomic; an interrupted fetch can no longer leave a partial cache entry
- Note for existing lockfiles: renamed skills and composed skills hash differently after this release; run `skillfold install` once (not `--frozen`) to refresh `skillfold.lock`

## v2.0.0

Complete overhaul. Skillfold is now a declarative skill manager for Claude config: declare skills in `skillfold.yaml`, pin them in `skillfold.lock`, install them into `.claude/skills`.

- New manifest format: `skills` (name -> source), `compose`, optional `skillsDir`
- Sources: local paths, `github:owner/repo/path@ref`, `npm:package/skill@version`
- `skillfold.lock` lockfile with exact pins (commit SHA / version) and sha256 content hashes
- Commands: `init`, `add`, `remove`, `install` (`--frozen` for CI), `update`, `check`, `list`, `info`, `search`
- `--global` mode for managing `~/.claude/skills`
- Shared content cache (`~/.cache/skillfold`) keyed by SHA/version; repeat installs are offline
- Managed-directory safety: skillfold only overwrites/prunes directories named in the lockfile
- Composition retained: composed skills concatenate other skills into a generated SKILL.md
- Removed: team flows, typed state schema, orchestrator generation, `skillfold run` and spawners, state backends/integrations, graph visualization, plugin packaging, adopt, watch, and all non-Claude compilation targets
- New single-page docs site; VitePress removed

## v1.23.0

- `--target goose` compilation output for Block's Goose (`.goosehints`)
- `--target roo-code` compilation output for Roo Code (`.roo/skills/`, `.roo/rules-{slug}/`, `.roomodes`)
- `--target kiro` compilation output for Amazon's Kiro (`.kiro/skills/`, `.kiro/steering/`)
- `--target junie` compilation output for JetBrains Junie (`.junie/skills/`, `.junie/AGENTS.md`)
- Expanded SECURITY.md to cover `skillfold run`, backends, and search commands

## v1.22.0

- `--target agent-teams` compilation output for Claude Code Agent Teams - generates team bootstrap prompt with team structure, shared state, task sequence, and coordination instructions
- End-to-end Agent Teams tutorial and bridge guide
- Agent Teams comparison updated with latest features

## v1.21.0

- `--target agent-teams` compilation output for Claude Code Agent Teams
- Updated Agent Teams comparison with latest features and complementary workflow documentation

## v1.20.0

- CLI reference updated with all implemented flags and targets
- Agent SDK spawner documented in running-pipelines guide
- VitePress landing page enriched with YAML config example
- Changelog page added to docs
- Blog section added to docs sidebar

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
