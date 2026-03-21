# Running Pipelines

Skillfold can execute your pipeline directly, spawning agents in sequence and managing state between steps.

## Basic Usage

```bash
npx skillfold run --target claude-code
```

This compiles the pipeline and executes it step by step. Each agent in the flow is spawned via the Claude CLI, receives the current state, and returns state updates.

The `--target` flag is required. Currently `claude-code` is the only supported execution target.

## How It Works

1. The runner reads your `skillfold.yaml` and compiles agent skills
2. It walks the flow graph node by node
3. For each step node, it spawns the agent with its compiled skill and current state
4. The agent returns state updates, which are applied before the next step
5. State is persisted to `state.json` after each step

## Dry Run

Preview the execution plan without spawning agents:

```bash
npx skillfold run --target claude-code --dry-run
```

Output shows each step with its reads and writes:

```
Step 1: planner reads=[direction] writes=[plan, tasks]
Step 2: engineer reads=[plan, tasks] writes=[implementation]
Step 3: reviewer reads=[implementation] writes=[review]
```

## Error Handling

Control what happens when an agent fails with `--on-error`:

```bash
# Stop the pipeline on first error (default)
npx skillfold run --target claude-code --on-error abort

# Skip the failed step and continue
npx skillfold run --target claude-code --on-error skip

# Retry the failed step up to N times
npx skillfold run --target claude-code --on-error retry --max-retries 3
```

In `retry` mode, the runner will attempt the step up to `--max-retries` times (default: 3) before falling through to abort behavior.

Errors are recorded in `state.json` under the `_errors` array for debugging.

## Loop Guards

Pipelines with conditional routing can create loops (e.g., engineer -> reviewer -> engineer). The `--max-iterations` flag prevents infinite loops:

```bash
npx skillfold run --target claude-code --max-iterations 5
```

The default is 10 iterations per node. If a node is visited more than this limit, the runner throws an error.

## Resume from Checkpoint

If a pipeline is interrupted, resume from the last completed step:

```bash
npx skillfold run --target claude-code --resume
```

The runner saves a checkpoint after each step to `.skillfold/run/checkpoint.json`. On resume, it:

1. Loads the checkpoint and validates the config hash matches
2. Restores the state from the checkpoint
3. Skips already-completed steps
4. Continues execution from where it left off

If the config has changed since the interrupted run, the runner rejects the resume and asks you to start fresh.

To start a fresh run (clearing any previous checkpoint):

```bash
npx skillfold run --target claude-code
```

## Parallel Map Execution

When the flow includes a `map` node, the runner executes the subgraph for each item in the list concurrently:

```yaml
team:
  flow:
    - planner:
        writes: [state.tasks]
      then: map

    - map:
        over: state.tasks
        as: task
        flow:
          - engineer:
              reads: [task.description]
              writes: [task.output]
            then: reviewer
          - reviewer:
              reads: [task.output]
              writes: [task.approved]
      then: end
```

Each item runs its own subgraph independently with isolated state. The `task` variable is bound to the current item. Error handling (`--on-error`) applies per item.

The execution summary shows map item counts:

```
  pass         planner (2s)
  pass         map (3 items: 3 ok, 0 failed) (8s)
```

## Async Nodes

Async nodes (representing external agents like humans or CI) are automatically skipped during execution. The runner continues past them to the next step.

## Execution Summary

After execution, the runner prints a summary:

```
  pass         planner (1s)
  pass         engineer [2 attempts] (5s)
  skip (async) human-review
  pass         reviewer (2s)

skillfold: 3 passed, 1 skipped in 8s
```

Each step shows its status, agent name, retry count (if applicable), and duration.

## Agent Spawners

The runner supports two agent spawners, selected with `--spawner`:

### CLI spawner (default)

```bash
npx skillfold run --target claude-code --spawner cli
```

Uses `claude --print` to invoke agents. Each agent receives its compiled skill as a prompt and returns state updates as JSON. No additional dependencies required.

Best for: quick iteration, environments without the Agent SDK installed.

### SDK spawner

```bash
npx skillfold run --target claude-code --spawner sdk
```

Uses `@anthropic-ai/claude-agent-sdk` to spawn agents programmatically. Agents get full tool access (Read, Write, Bash, Grep, Glob, etc.), the Claude Code system prompt, and project settings loading.

Install the SDK as a peer dependency:

```bash
npm install @anthropic-ai/claude-agent-sdk
```

Best for: production pipelines where agents need to read files, run commands, and interact with the codebase. The SDK spawner gives agents the same capabilities they have in an interactive Claude Code session.

If the SDK is not installed and `--spawner sdk` is specified, the runner exits with an error.

## State Backends

When state fields declare integration locations, the runner connects to external backends automatically:

```yaml
state:
  tasks:
    type: list<Task>
    location:
      github-issues: { repo: org/repo, label: task }
  direction:
    type: string
    location:
      github-discussions: { repo: org/repo, category: strategy }
```

**Before execution**: the runner reads initial state from all configured backends (GitHub issues, discussions, pull requests). This populates the state with real data from external systems.

**After each step**: state changes are written back to the corresponding backends. For example, new tasks created by an agent become GitHub issues.

**On resume**: the runner reads from backends rather than relying solely on the local checkpoint, ensuring it has the latest data.

If a backend is unreachable, the runner falls back to `state.json` and logs a warning. Backends never block pipeline execution.

Supported backends:

| Integration | Read | Write |
|------------|------|-------|
| `github-issues` | Lists open issues by label/assignee | Creates new issues, updates existing |
| `github-discussions` | Fetches latest discussion in category | Creates discussions or replies |
| `github-pull-requests` | Lists open PRs and reviews | Read-only (agents create PRs) |

Requires the `gh` CLI authenticated with access to the target repository.

## State Persistence

State is managed in two locations:

| File | Purpose |
|------|---------|
| `state.json` | Local cache, updated after each step |
| `.skillfold/run/checkpoint.json` | Execution checkpoint for resume |

When backends are configured, `state.json` acts as a working cache. External backends are the source of truth.

Both files are written to the current working directory. Add `.skillfold/` to your `.gitignore`.

## Custom Config Path

Run a pipeline from a non-default config:

```bash
npx skillfold run --target claude-code --config path/to/pipeline.yaml
```

## All Flags

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
