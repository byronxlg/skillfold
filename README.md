<div align="center">

# Skillfold

**Compiler for multi-agent AI pipelines**

[![npm v0.5.0](https://img.shields.io/npm/v/skillfold?style=flat-square)](https://www.npmjs.com/package/skillfold)
[![CI](https://img.shields.io/github/actions/workflow/status/byronxlg/skillfold/ci.yml?style=flat-square&label=CI)](https://github.com/byronxlg/skillfold/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

One YAML config. One command. Every agent gets a compiled [SKILL.md](https://agentskills.io/specification).

[Quick Start](#quick-start) | [How It Works](#how-it-works) | [Features](#features) | [Library](#shared-library) | [Reference](#reference)

</div>

---

```bash
npx skillfold init   # scaffold a starter pipeline
npx skillfold        # compile it
```

## Quick Start

Define skills, compose them into agents, wire agents into a team flow, and compile:

```yaml
# skillfold.yaml
name: dev-team

skills:
  atomic:
    planning: ./skills/planning
    coding: ./skills/coding
    review: ./skills/review
  composed:
    engineer:
      compose: [planning, coding]
      description: "Implements the plan and writes tests."
    reviewer:
      compose: [review]
      description: "Reviews code for correctness."

state:
  Review:
    approved: bool
    feedback: string
  code: { type: string }
  review: { type: Review }

team:
  flow:
    - engineer:
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

```bash
npx skillfold
```

```
build/
  engineer/SKILL.md    # planning + coding bodies, YAML frontmatter
  reviewer/SKILL.md    # review body, YAML frontmatter
```

The `engineer` agent's SKILL.md contains the concatenated bodies of `planning` and `coding`. Every output file is a valid SKILL.md per the [Agent Skills standard](https://agentskills.io/specification).

> [!TIP]
> Add `team.orchestrator: orchestrator` and the orchestrator's compiled SKILL.md gets a generated execution plan with numbered steps, state tables, and conditional branches.

---

## How It Works

Skillfold has three layers, each building on the last:

| Layer | What you define | What the compiler does |
|-------|----------------|----------------------|
| **Skills** | Atomic skill directories + composition rules | Concatenates skill bodies in order, recursively |
| **State** | Typed schema with custom types and external locations | Validates reads/writes at compile time |
| **Team** | Execution flow with conditionals, loops, and parallel map | Generates orchestrator plan, checks reachability |

<details>
<summary><strong>Generated orchestrator output</strong></summary>

```markdown
## Execution Plan

### Step 1: engineer
Invoke **engineer**.
Writes: `state.code`
Then: proceed to step 2.

### Step 2: reviewer
Invoke **reviewer**.
Reads: `state.code`
Writes: `state.review`
Then:
- If `review.approved == false`: go to step 1
- If `review.approved == true`: end
```

</details>

---

## Features

**Composition** --
Atomic skills are reusable instruction fragments. Composed skills concatenate them in order, recursively. Reference remote skills by GitHub URL.

**Validation** --
Typed state schema with custom types, primitives, and `list<Type>`. State reads and writes validated at compile time. Write conflict detection. Cycle exit condition enforcement.

**Team Flows** --
Conditional routing with `when` expressions. Loops with required exit conditions. Parallel `map` over typed lists. Reachability analysis for all flow nodes.

**Graph Visualization** --
`skillfold graph` outputs a Mermaid flowchart showing full composition lineage and state writes.

**Remote Skills** --
Reference skills by GitHub URL. Skillfold fetches them at compile time.

```yaml
skills:
  atomic:
    shared: https://github.com/org/repo/tree/main/skills/shared
```

**Pipeline Imports** --
Share skills and state across configs. Team flows stay local.

```yaml
imports:
  - node_modules/skillfold/library/skillfold.yaml
```

---

## Shared Library

Skillfold ships with **10 generic skills** you can import into any pipeline:

| Skill | Purpose |
|-------|---------|
| planning | Break problems into steps, identify dependencies |
| research | Gather information, evaluate sources |
| decision-making | Evaluate trade-offs, justify recommendations |
| code-writing | Write clean, production-quality code |
| code-review | Review for correctness, clarity, security |
| testing | Write and reason about tests, edge cases |
| writing | Produce clear, structured prose |
| summarization | Condense information for target audiences |
| github-workflow | Work with branches, PRs, issues via `gh` CLI |
| file-management | Read, create, edit, and organize files |

Three ready-made example configs are included in [`library/examples/`](library/examples/):

| Example | Pattern |
|---------|---------|
| **dev-team** | Linear pipeline with review loop (planner, engineer, reviewer) |
| **content-pipeline** | Map/parallel pattern over topics (researcher, writer, editor) |
| **code-review-bot** | Minimal two-agent flow (analyzer, reporter) |

---

## Self-Hosting

Skillfold builds its own dev team. The [`skillfold.yaml`](skillfold.yaml) in this repo defines 7 agents:

| Agent | Role |
|-------|------|
| strategist | Assesses project needs and sets direction |
| architect | Designs systems and decomposes work into GitHub issues |
| designer | Designs project-facing content like READMEs and docs |
| marketer | Positions the project for adoption through messaging and outreach |
| engineer | Writes production TypeScript code and tests, opens PRs |
| reviewer | Reviews pull requests for correctness and clarity |
| orchestrator | Coordinates pipeline execution and merges approved PRs |

The reviewer feeds back to the engineer when `review.approved == false`, creating a review loop that runs until code is approved.

> [!NOTE]
> State is mapped to real infrastructure: plans live in GitHub Discussions, tasks become GitHub Issues, implementations are pull requests, and reviews are PR reviews.

---

## Reference

### Install

```bash
npm install -g skillfold    # global install
npx skillfold               # or run directly
```

Requires Node.js 20+. Single dependency: `yaml`.

### CLI

```
skillfold [command] [options]

Commands:
  (default)         Compile the pipeline config
  init              Scaffold a new pipeline project
  graph             Output Mermaid flowchart of the team flow

Options:
  --config <path>   Config file (default: skillfold.yaml)
  --out-dir <path>  Output directory (default: build)
  --dir <path>      Target directory for init (default: .)
  --help            Show this help
  --version         Show version
```

### Config

Three top-level sections. Full specification in [BRIEF.md](BRIEF.md).

<details>
<summary><strong>skills</strong> - atomic paths and composition rules</summary>

```yaml
skills:
  atomic:
    code-review: ./skills/code-review                              # local path
    shared: https://github.com/org/repo/tree/main/skills/shared   # GitHub URL
  composed:
    tech-lead:
      compose: [planning, code-review]
      description: "Produces plans and reviews code."
```

</details>

<details>
<summary><strong>state</strong> - typed schema with custom types and locations</summary>

```yaml
state:
  Task:                    # custom type
    description: string
    approved: bool
  tasks:                   # typed field with external location
    type: "list<Task>"
    location:
      skill: jira
      path: DEV/dev-board
```

</details>

<details>
<summary><strong>team</strong> - orchestrator and execution flow</summary>

```yaml
team:
  orchestrator: orchestrator   # receives generated execution plan
  flow:
    - planner:
        writes: [state.plan]
      then: worker
    - worker:
        reads: [state.plan]
        writes: [state.result]
      then: end
```

Conditional transitions, parallel map, and imports are documented in [BRIEF.md](BRIEF.md).

</details>

### Tests

```bash
npm test          # 238 tests, node:test, no extra dependencies
npx tsc --noEmit  # type check
```

## License

MIT
