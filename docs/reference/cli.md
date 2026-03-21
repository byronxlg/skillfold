# CLI Reference

## Install

```bash
npm install -g skillfold    # global install
npx skillfold               # or run directly
```

Requires Node.js 20+. Single dependency: `yaml`.

## Commands

```
skillfold [command] [options]

Commands:
  init [dir]        Scaffold a new pipeline project
  adopt             Adopt existing Claude Code agents into a pipeline
  validate          Validate config without compiling
  list              Display a structured summary of the pipeline
  graph             Output Mermaid flowchart of the team flow
  run               Execute a compiled pipeline (linear flows only)
  watch             Compile and watch for changes
  plugin            Package compiled output as a Claude Code plugin
  search [query]    Discover skill packages on npm
  (default)         Compile the pipeline config
```

## Options

```
  --config <path>      Config file (default: skillfold.yaml)
  --out-dir <path>     Output directory (default varies by target)
  --dir <path>         Target directory for init (default: .)
  --target <mode>      Output mode: skill, claude-code, agent-teams, cursor, windsurf, codex, copilot, gemini
  --template <name>    Start from a library template (init only)
  --html               Output interactive HTML instead of Mermaid (graph only)
  --check              Verify compiled output is up-to-date (exit 1 if stale)
  --dry-run            Show execution plan without running (run only)
  --spawner <type>     Agent spawner: cli (default) or sdk (run only)
  --on-error <mode>    Error mode: abort (default), skip, or retry (run only)
  --max-retries <n>    Max retry attempts, default 3 (run only)
  --max-iterations <n> Max visits per node, default 10 (run only)
  --resume             Resume from last checkpoint (run only)
  --help               Show this help
  --version            Show version
```

## Command Details

### Compile (default)

```bash
npx skillfold                              # compile skillfold.yaml -> build/
npx skillfold --config my-pipeline.yaml    # custom config file
npx skillfold --out-dir output/            # custom output directory
npx skillfold --target claude-code         # compile to .claude/ structure
npx skillfold --target agent-teams         # compile to .claude/ with Agent Teams bootstrap
npx skillfold --target cursor              # compile to .cursor/rules/*.mdc
npx skillfold --target windsurf            # compile to .windsurf/rules/*.md
npx skillfold --target codex               # compile to build/AGENTS.md
npx skillfold --target copilot             # compile to .github/ structure
npx skillfold --target gemini              # compile to .gemini/ structure
npx skillfold --check                      # verify output is current (CI mode)
```

### Init

Scaffold a new pipeline project with starter config and example skills.

```bash
npx skillfold init my-team                          # basic scaffold
npx skillfold init my-team --template dev-team      # from library template
npx skillfold init my-team --template content-pipeline
npx skillfold init my-team --template code-review-bot
```

Available templates:

| Template | Pattern |
|----------|---------|
| `dev-team` | Linear pipeline with review loop (planner, engineer, reviewer) |
| `content-pipeline` | Map/parallel pattern over topics (researcher, writer, editor) |
| `code-review-bot` | Minimal two-agent flow (analyzer, reporter) |

### Adopt

Import existing Claude Code agents from `.claude/agents/` into a skillfold config.

```bash
npx skillfold adopt    # reads .claude/agents/*.md, generates skillfold.yaml
```

### Validate

Check config for errors without producing output.

```bash
npx skillfold validate
npx skillfold validate --config my-pipeline.yaml
```

### List

Display a structured summary of the pipeline: skills, state, and team flow.

```bash
npx skillfold list
```

### Graph

Output a Mermaid flowchart of the team flow with full composition lineage and state writes.

```bash
npx skillfold graph                # Mermaid text output
npx skillfold graph --html         # interactive HTML page
npx skillfold graph --html > pipeline.html
```

The `--html` output includes clickable nodes, a composition details sidebar, and SVG export.

### Run

Execute a compiled pipeline by spawning agents through the flow graph. Supports linear flows, conditional routing, loops, and parallel map execution.

```bash
npx skillfold run --target claude-code                            # execute the pipeline
npx skillfold run --target claude-code --dry-run                  # preview without running
npx skillfold run --target claude-code --resume                   # resume from checkpoint
npx skillfold run --target claude-code --on-error retry           # retry failed steps
npx skillfold run --target claude-code --spawner sdk              # use Agent SDK spawner
npx skillfold run --target claude-code --config my-pipeline.yaml  # custom config
```

Requires a `--target` flag. See the [Running Pipelines](/running-pipelines) guide for full documentation.

| Flag | Default | Description |
|------|---------|-------------|
| `--target` | (required) | Compilation target (`claude-code`) |
| `--config` | `skillfold.yaml` | Path to pipeline config |
| `--dry-run` | `false` | Preview without executing |
| `--spawner` | `cli` | Agent spawner: `cli` or `sdk` |
| `--on-error` | `abort` | Error mode: `abort`, `skip`, or `retry` |
| `--max-retries` | `3` | Max retry attempts (with `--on-error retry`) |
| `--max-iterations` | `10` | Max visits per node (loop guard) |
| `--resume` | `false` | Resume from last checkpoint |

Example dry-run output:

```
skillfold: dry run for my-pipeline (3 steps)
Step 1: planner reads=[direction] writes=[plan]
Step 2: map over state.tasks (3 items)
  Step 2.1: engineer
  Step 2.2: reviewer
Step 3: reviewer reads=[code] writes=[review]
```

### Watch

Compile and auto-recompile when config or skill files change.

```bash
npx skillfold watch
```

### Plugin

Package compiled output as a Claude Code plugin.

```bash
npx skillfold plugin
```

### Search

Discover pipeline configs on npm (searches for `skillfold-pipeline` keyword).

```bash
npx skillfold search          # list all
npx skillfold search review   # filter by query
```

## CI Integration

Add the `--check` flag to CI so stale compiled output fails the build. The repo ships a reusable GitHub Action:

```yaml
name: Skillfold
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - uses: byronxlg/skillfold@v1
```

Or use the `--check` flag directly:

```bash
npx skillfold --check    # exits 1 if output is stale
```
