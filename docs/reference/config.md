# Config Format

Skillfold pipelines are defined in a single YAML file (default: `skillfold.yaml`). Three top-level sections, each building on the last:

| Section | What you define | What the compiler does |
|---------|----------------|----------------------|
| **skills** | Atomic skill directories + composition rules | Concatenates skill bodies in order, recursively |
| **state** | Typed schema with custom types and external locations | Validates reads/writes against the flow |
| **team** | Execution flow with conditionals, loops, and parallel map | Generates orchestrator plan, checks reachability |

A [JSON Schema](https://github.com/byronxlg/skillfold/blob/main/skillfold.schema.json) is available for IDE autocompletion. Add this line to the top of your config:

```yaml
# yaml-language-server: $schema=node_modules/skillfold/skillfold.schema.json
```

Full specification is in [BRIEF.md](https://github.com/byronxlg/skillfold/blob/main/BRIEF.md).

## Skills

Skills split into `atomic` and `composed` sub-sections.

### Atomic Skills

Path references to skill directories containing a `SKILL.md` file. Can be local paths, GitHub URLs, or npm packages.

```yaml
skills:
  atomic:
    planning: ./skills/planning
    shared: https://github.com/org/repo/tree/main/skills/shared
    library-skill: npm:skillfold-skill-planning
```

### Composed Skills

Combine atomic skills by concatenating their SKILL.md bodies in declared order. Composition is recursive.

```yaml
skills:
  composed:
    tech-lead:
      compose: [planning, code-review]
      description: "Plans and reviews code."
    senior-eng:
      compose: [tech-lead, code-writing]  # recursive: planning + code-review + code-writing
      description: "Plans, reviews, and writes code."
```

Composed skills support Claude Code agent frontmatter fields:

| Field | Type | Description |
|-------|------|-------------|
| `tools` | string[] | Allowed tools |
| `disallowedTools` | string[] | Denied tools |
| `permissionMode` | string | `default`, `acceptEdits`, `bypassPermissions`, `plan` |
| `model` | string | Model override |
| `memory` | boolean | Enable memory |
| `isolation` | string | `worktree` or `none` |
| `effort` | string | `low`, `medium`, `high` |
| `maxTurns` | number | Max agent turns |
| `background` | boolean | Run in background |

## State

Typed state schema with custom types, primitives (`string`, `bool`, `number`), and `list<Type>`.

```yaml
state:
  # Custom type definition
  Task:
    description: string
    approved: bool

  # State fields
  tasks:
    type: "list<Task>"
    location:
      skill: jira
      path: DEV/dev-board

  review:
    type: Review
    location:
      skill: github
      path: pull-requests
      kind: review
```

### Built-in Integrations

State locations can use built-in integrations instead of the `skill` + `path` format:

```yaml
state:
  tasks:
    type: "list<Task>"
    location:
      github-issues:
        repo: myorg/myrepo
        label: task

  direction:
    type: string
    location:
      github-discussions:
        repo: myorg/myrepo
        category: strategy
```

Available integrations:

| Integration | Required | Optional |
|-------------|----------|----------|
| `github-issues` | `repo` | `label`, `assignee` |
| `github-discussions` | `repo` | `category` |
| `github-pull-requests` | `repo` | `state` |

### Top-level Resources

A `resources` section declares URL templates for compile-time validation of location paths:

```yaml
resources:
  github:
    discussions: "https://github.com/myorg/myrepo/discussions"
    issues: "https://github.com/myorg/myrepo/issues"
    pull-requests: "https://github.com/myorg/myrepo/pulls"
```

## Team

The `team` section defines the execution flow and optional orchestrator.

### Flow

A directed graph of agent invocations with conditional routing, loops, and parallel map.

```yaml
team:
  orchestrator: orchestrator  # append generated plan to this composed skill
  flow:
    - planner:
        writes: [state.tasks]
      then:
        map: state.tasks
        as: task
        agent: worker
        then: reviewer

    - reviewer:
        reads: [state.implementation]
        writes: [state.review]
      then:
        - when: review.approved == false
          to: worker
        - when: review.approved == true
          to: end
```

### Async Nodes

Mark flow nodes `async: true` for external agents (humans, CI, other teams):

```yaml
    - owner:
        async: true
        writes: [state.direction]
        policy: block  # block | skip | use-latest
      then: planner
```

### Sub-flow Imports

Flow nodes can reference external pipeline configs:

```yaml
    - testing:
        flow: ./testing-pipeline.yaml
      then: reviewer
```

## Imports

Pull in skills and state from other configs. Team flows stay local.

```yaml
imports:
  - npm:skillfold/library/skillfold.yaml
  - ./shared/common.yaml
```

## Local Overrides

Create a `skillfold.local.yaml` (gitignored) to override any section locally without modifying the shared config.
