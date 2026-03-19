# Skillfold

Compiler for multi-agent AI pipelines. Define skills, compose them into agents, wire agents into execution graphs, and compile everything to standard `SKILL.md` files.

Skillfold is agent-first. Agents author the config, agents consume the output, humans provide direction.

## Install

```bash
npm install -g skillfold
```

Or run directly:

```bash
npx skillfold
```

## Usage

```bash
skillfold                                    # uses ./skillfold.yaml
skillfold --config pipeline.yaml --out-dir build/
```

## What it does

You write a YAML config. The compiler produces one `SKILL.md` per agent.

```yaml
name: dev-pipeline

skills:
  strategic-thinking: ./skills/strategic-thinking
  code-review: ./skills/code-review
  slack: ./skills/slack

  strategy:
    compose: [strategic-thinking, slack]

  reviewer:
    compose: [code-review]

  orchestrator:
    compose: [slack]

orchestrator: orchestrator

state:
  Task:
    description: string
    output: string
    approved: bool

  goal:
    type: string
    location:
      skill: slack
      path: dev-pipeline-channel

  tasks:
    type: "list<Task>"
    location:
      skill: jira
      path: DEV/dev-board

graph:
  - strategy:
      writes: [state.goal]
    then: reviewer

  - reviewer:
      reads: [state.goal]
      writes: [state.tasks]
    then: end
```

The compiler:

1. **Composes skills** - `strategy.md` gets the concatenated bodies of `strategic-thinking` and `slack`
2. **Validates state** - every `reads`/`writes` path must exist in the schema, write conflicts are caught
3. **Validates the graph** - transition targets resolve, cycles have exit conditions, all nodes are reachable
4. **Generates the orchestrator** - a structured execution plan appended to the orchestrator's composed skill

## Config reference

### skills

Atomic skills reference a directory containing a `SKILL.md`:

```yaml
skills:
  code-review: ./skills/code-review
```

Composed skills concatenate atomic skill bodies in declared order:

```yaml
skills:
  tech-lead:
    compose: [strategic-thinking, task-decomposition, slack, jira]
```

Composition is recursive - a composed skill can compose other composed skills.

### state

A typed schema for pipeline state. Supports `string`, `bool`, `number`, custom types, and `list<Type>`.

```yaml
state:
  Task:                    # custom type definition
    description: string
    approved: bool

  tasks:                   # state field
    type: "list<Task>"
    location:              # optional external backend
      skill: jira
      path: DEV/dev-board
```

### graph

A directed execution graph. Each node is a skill with reads, writes, and transitions.

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

Parallel map over a list:

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

### orchestrator

Names a composed skill that receives the generated execution plan:

```yaml
orchestrator: orchestrator
```

The orchestrator skill gets its composed bodies plus a generated section describing the full pipeline topology, state table, and step-by-step execution plan.

## Output

```
build/
  strategy/
    SKILL.md         # strategic-thinking + slack bodies
  tech-lead/
    SKILL.md         # strategic-thinking + task-decomposition + slack + jira bodies
  senior-engineer/
    SKILL.md         # task-decomposition + code-generation bodies
  reviewer/
    SKILL.md         # code-review body
  orchestrator/
    SKILL.md         # slack + confluence + jira bodies + generated execution plan
```

All output files are valid `SKILL.md` files per the Agent Skills open standard.

## Tests

```bash
npm test          # 142 tests, node:test, no extra dependencies
npx tsc --noEmit  # type check
```

## License

MIT
