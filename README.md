# Skillfold

Compiler for multi-agent AI pipelines. Define skills, compose them into agents, wire agents into execution graphs, and compile to standard `SKILL.md` files.

## Quick start

```bash
npx skillfold init && npx skillfold
```

That scaffolds a starter pipeline and compiles it. You get spec-compliant agent skills in `build/`.

## How it works

Write a YAML config. The compiler produces one `SKILL.md` per agent.

```yaml
name: dev-team

skills:
  planning: ./skills/planning
  coding: ./skills/coding
  review: ./skills/review

  architect:
    compose: [planning]
    description: "Designs systems and produces technical plans."

  engineer:
    compose: [planning, coding]
    description: "Implements the plan and writes tests."

  reviewer:
    compose: [review]
    description: "Reviews code for correctness and clarity."

  orchestrator:
    compose: [planning]
    description: "Coordinates pipeline execution."

orchestrator: orchestrator

state:
  Review:
    approved: bool
    feedback: string

  plan:
    type: string

  code:
    type: string

  review:
    type: Review

graph:
  - architect:
      writes: [state.plan]
    then: engineer

  - engineer:
      reads: [state.plan]
      writes: [state.code]
    then: reviewer

  - reviewer:
      reads: [state.code]
      writes: [state.review]
    then:
      - when: review.approved == false
        to: engineer
      - when: review.approved == true
        to: end
```

Run `npx skillfold` and you get:

```
build/
  architect/SKILL.md      # planning body + frontmatter
  engineer/SKILL.md       # planning + coding bodies + frontmatter
  reviewer/SKILL.md       # review body + frontmatter
  orchestrator/SKILL.md   # planning body + generated execution plan
```

The orchestrator's generated plan looks like this:

```markdown
## Execution Plan

### Step 1: architect
Invoke **architect**.
Writes: `state.plan`
Then: proceed to step 2.

### Step 2: engineer
Invoke **engineer**.
Reads: `state.plan`
Writes: `state.code`
Then: proceed to step 3.

### Step 3: reviewer
Invoke **reviewer**.
Reads: `state.code`
Writes: `state.review`
Then:
- If `review.approved == false`: go to step 2
- If `review.approved == true`: end
```

Every output file is a valid `SKILL.md` per the [Agent Skills standard](https://agentskills.io/specification).

## Install

```bash
npm install -g skillfold
```

Or run directly with `npx skillfold`.

## Features

**Skill composition** - Atomic skills define reusable fragments. Composed skills concatenate bodies in declared order. Composition is recursive.

**Typed state** - Custom types, primitives, `list<Type>`, and external locations. Reads/writes validated at compile time.

**Execution graphs** - Conditional routing, loops with exit conditions, parallel map over lists. All validated: skill refs, state paths, write conflicts, reachability.

**Orchestrator generation** - Structured execution plan generated from the graph. Numbered steps, state table, conditional branches, map sub-steps.

**Remote skills** - Reference skills on GitHub by URL:
```yaml
skills:
  shared-review: https://github.com/org/skills/tree/main/code-review
```

**Pipeline imports** - Import skills and state from other configs:
```yaml
imports:
  - ./shared/skillfold.yaml
  - https://github.com/org/shared/tree/main/pipeline
```

**Spec-compliant output** - Directory structure with YAML frontmatter per the Agent Skills standard. `name` and `description` on every compiled skill.

## Self-hosting

Skillfold builds its own dev team. The `skillfold.yaml` in this repo defines a strategist, architect, engineer, and reviewer wired into an execution graph with a review loop. The compiled orchestrator manages the pipeline.

## Config reference

### skills

```yaml
skills:
  # Atomic: reference a directory with a SKILL.md
  code-review: ./skills/code-review

  # Remote: reference a GitHub directory
  shared: https://github.com/org/repo/tree/main/skills/shared

  # Composed: concatenate atomic skill bodies
  tech-lead:
    compose: [strategic-thinking, task-decomposition, slack]
    description: "Produces technical plans and breaks them into tasks."
```

### state

```yaml
state:
  Task:                    # custom type
    description: string
    approved: bool

  tasks:                   # state field
    type: "list<Task>"
    location:              # optional external backend
      skill: jira
      path: DEV/dev-board
```

### graph

```yaml
graph:
  - planner:
      writes: [state.plan]
    then: worker

  - worker:
      reads: [state.plan]
      writes: [state.output]
    then: end
```

Conditional transitions:
```yaml
    then:
      - when: review.approved == false
        to: worker
      - when: review.approved == true
        to: end
```

Parallel map:
```yaml
  - map:
      over: state.tasks
      as: task
      graph:
        - engineer:
            reads: [task.description]
            writes: [task.output]
          then: end
```

### imports

```yaml
imports:
  - ./shared/skillfold.yaml
  - https://github.com/org/shared/tree/main/pipeline
```

Imports bring in skills and state. Local config overrides imports on conflicts.

### orchestrator

```yaml
orchestrator: orchestrator
```

Names a composed skill that receives the generated execution plan.

## CLI

```
skillfold [command] [options]

Commands:
  init              Scaffold a new pipeline project
  (default)         Compile the pipeline config

Options:
  --config <path>   Config file (default: skillfold.yaml)
  --out-dir <path>  Output directory (default: build)
  --dir <path>      Target directory for init (default: .)
  --help            Show this help
  --version         Show version
```

## Tests

```bash
npm test          # 185 tests, node:test, no extra dependencies
npx tsc --noEmit  # type check
```

## License

MIT
