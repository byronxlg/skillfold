# Skillfold — Concept & Design Brief

## What is Skillfold?

Skillfold is a configuration language and compiler for building multi-agent AI pipelines. The name captures three things at once — **skill** composition, **fold** as the functional operation of combining many things into one, and **scaffold** as the temporary structure that enables the real thing to be built. You write Skillfold config, the compiler builds the structure, and then it gets out of the way.

Skillfold sits above the Agent Skills open standard as a build tool. It lets developers define reusable skills, compose them into agents, and wire agents into typed execution graphs. The compiler outputs standard `SKILL.md` files fully compatible with the existing Agent Skills ecosystem. No custom runtime required.

---

## The Problem

The Agent Skills spec defines what a single skill is and how it loads. It does not define:

- How skills relate to each other
- How skills share or pass state
- How execution flows between skills
- How reusable behaviour is shared across skills

Today these concerns are either ignored or handled by manually duplicating content across skill files. Changing a pipeline means editing many files. There is no single source of truth for team topology. As agent teams grow, this becomes the primary source of complexity.

---

## The Two Core Ideas

### 1. Skill Composition

Skills should be composable. Atomic skills define reusable fragments of behaviour. Composed skills are built by combining atomic skills. Composition is recursive — a composed skill can itself be composed into another.

The key insight is that a composed skill's context is the concatenation of its constituent skills' bodies. This is the primary mechanism for sharing behaviour across agents — write it once, compose it in wherever needed.

### 2. Skill Graphing

Agents are skills wired into a typed execution graph. The graph defines how state flows between agents, in what order they run, and how execution branches or loops. The graph compiles into an orchestrator skill that manages execution — individual agents remain unaware of the topology.

State is typed and declared centrally. Each agent declares which state fields it reads and writes. The compiler validates that the graph is internally consistent.

---

## Key Design Principles

**Single source of truth.** The pipeline config owns skill composition, state schema, and execution topology. Changes to any of these happen in one place.

**Compile to the standard.** Output is plain `SKILL.md` files per the Agent Skills open standard. Compatible with any compliant agent platform.

**Skills all the way down.** There is no special agent type. An agent is just a skill that appears in a graph. A composed skill that isn't in a graph is still a valid, reusable skill.

**Separation of concerns.** Capability lives in skills. Topology lives in the graph. State lives in the schema. None of these should bleed into each other.

**Validated at compile time.** Type mismatches, missing state fields, write conflicts, and broken graph references are compiler errors. Runtime surprises should be rare.

---

## What the Language Needs to Express

At minimum the language needs to express:

- References to skill folders by path or URL
- Composition of skills into agents
- A typed state schema with optional external backends
- A directed execution graph with conditional routing and loops
- Parallel execution over lists
- An orchestrator compiled from the graph

Beyond that, the build team should feel free to evolve the design. The example config below is an illustration of one possible syntax, not a specification.

---

## Example Config

The following example defines a software development pipeline with four agents: a strategy agent that sets the goal, a tech lead that produces a plan and breaks it into tasks, a senior engineer that works on each task, and a reviewer that approves or rejects the engineer's output. The engineer and reviewer loop per task until the reviewer approves. Tasks run in parallel.

State is backed by external systems — the goal and plan live in Slack, tasks live in Jira. The orchestrator is composed with the relevant integration skills so it knows how to read and write those systems.

```yaml
name: dev-pipeline

skills:
  # Atomic skills - referenced by folder path or URL
  atomic:
    strategic-thinking: ./skills/strategic-thinking
    task-decomposition: ./skills/task-decomposition
    code-generation: ./skills/code-generation
    code-review: ./skills/code-review
    slack: ./skills/slack
    confluence: ./skills/confluence
    jira: ./skills/jira

  # Composed skills - recursive combinations of atomic skills
  # An agent is any skill referenced in the team flow
  composed:
    strategy:
      compose: [strategic-thinking, slack]

    tech-lead:
      compose: [strategic-thinking, task-decomposition, slack, jira]

    senior-engineer:
      compose: [task-decomposition, code-generation]

    reviewer:
      compose: [code-review]

    orchestrator:
      compose: [slack, confluence, jira]

# State - typed schema, defaults to local file unless location declared
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

  plan:
    type: string
    location:
      skill: slack
      path: dev-pipeline-channel
      kind: reply

  tasks:
    type: list<Task>
    location:
      skill: jira
      path: DEV/dev-board

# Team - orchestrator and execution flow
team:
  orchestrator: orchestrator

  # Flow - directed graph with typed state transitions
  # Cycles are valid when every cycle has an explicit exit condition
  # map always parallelizes - sequential iteration is a flow loop
  flow:
    - strategy:
        writes: [state.goal]
      then: tech-lead

    - tech-lead:
        reads: [state.goal]
        writes: [state.plan, state.tasks]
      then: map

    - map:
        over: state.tasks
        as: task
        graph:
          - senior-engineer:
              reads: [task.description]
              writes: [task.output]
            then: reviewer

          - reviewer:
              reads: [task.output]
              writes: [task.approved]
            then:
              - when: task.approved == false
                to: senior-engineer
              - when: task.approved == true
                to: end
```

---

## What the Compiler Produces

```
dist/
├── strategy.md        # strategic-thinking + slack bodies concatenated
├── tech-lead.md       # strategic-thinking + task-decomposition + slack + jira bodies concatenated
├── senior-engineer.md # task-decomposition + code-generation bodies concatenated
├── reviewer.md        # code-review body
└── orchestrator.md    # generated from the graph definition
```

All output files are valid `SKILL.md` files per the Agent Skills spec.

---

## Compiler Responsibilities

**Skill compilation**

- Resolve skill folder paths and URLs, read each `SKILL.md` body
- Concatenate composed skill bodies in declared order
- Output one compiled `SKILL.md` per agent

**State validation**

- Every `reads` and `writes` field must exist in the state schema
- Write conflicts — two nodes writing the same field — are compile errors
- Every state field with a `location` must reference a declared skill

**Graph validation**

- Every `to:` reference must be a declared skill or `end`
- Every cycle must have an explicit exit condition
- Topological sort of acyclic edges as a consistency check

**Orchestrator generation**

- Generate an orchestrator `SKILL.md` from the graph definition
- The orchestrator is the only agent with full pipeline visibility
- Individual agents have no topology awareness

**Map**

- `map` always parallelizes — each item runs its subgraph concurrently
- The orchestrator manages spawning and joining parallel subgraphs
- Loop conditions inside `map` are evaluated per item

---

## What Skillfold is Not

- A runtime — execution is handled by whatever agent platform consumes the compiled skills
- A replacement for the Agent Skills spec — it compiles to that spec
- A programming language — logic lives in the skills themselves, not in this config

---

## Open Questions for the Build Team

These are intentionally left open — the right answers depend on implementation experience:

- What is the right file format for the config? YAML, TOML, a custom DSL?
- How should the state type system work? How strict should it be?
- How are external state backends handled at runtime?
- How does the orchestrator communicate with individual agents in practice?
- How are errors and failures handled mid-pipeline?
- Should the language support importing or extending other pipeline configs?
- How does versioning work for skills referenced by URL?
- Should there be a package registry for shared skills?
