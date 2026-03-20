# Skillfold

[![npm](https://img.shields.io/npm/v/skillfold)](https://www.npmjs.com/package/skillfold)
[![CI](https://github.com/byronxlg/skillfold/actions/workflows/ci.yml/badge.svg)](https://github.com/byronxlg/skillfold/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Compiler for multi-agent AI pipelines. Define skills, compose them into agents, wire agents into execution flows, and compile to standard `SKILL.md` files.

**Before and after** - without skillfold, each agent's SKILL.md is hand-maintained and kept in sync manually:

```
# Without skillfold                  # With skillfold
architect/SKILL.md  (manual)         skillfold.yaml (single source of truth)
engineer/SKILL.md   (manual)           -> skillfold
reviewer/SKILL.md   (manual)         build/
orchestrator/SKILL.md (manual)          architect/SKILL.md
                                        engineer/SKILL.md
4 files to maintain, kept             reviewer/SKILL.md
in sync by hand                         orchestrator/SKILL.md
                                      4 files generated, always consistent
```

## Quick Start

```bash
npx skillfold init   # scaffold a starter pipeline
npx skillfold        # compile it
```

Output: `build/planner/SKILL.md`, `build/worker/SKILL.md`, `build/orchestrator/SKILL.md`

---

## How Skillfold Works

Write one YAML config. The compiler produces one `SKILL.md` per agent.

### Define, Compose, Compile

```yaml
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
  code:
    type: string
  review:
    type: Review

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

Run `npx skillfold` and you get:

```
build/
  engineer/SKILL.md    # planning + coding bodies, frontmatter
  reviewer/SKILL.md    # review body, frontmatter
```

The `engineer` agent's `SKILL.md` contains the concatenated bodies of `planning` and `coding`, plus YAML frontmatter with its name and description.

Every output file is a valid `SKILL.md` per the [Agent Skills standard](https://agentskills.io/specification).

### Orchestrator Generation

Add `team.orchestrator` to generate an execution plan automatically:

```yaml
team:
  orchestrator: orchestrator
```

The orchestrator's compiled `SKILL.md` will include a generated plan like this:

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

### Features

**Composition** --
Atomic skills are reusable instruction fragments. Composed skills concatenate them in order, recursively. Reference remote skills by GitHub URL.

**Validation** --
Typed state schema with custom types, primitives, and `list<Type>`. State reads and writes validated at compile time. Write conflict detection. Cycle exit condition enforcement.

**Team Flows** --
Conditional routing with `when` expressions. Loops with required exit conditions. Parallel `map` over typed lists. Reachability analysis for all flow nodes.

**Tooling** --
`skillfold init` scaffolds a starter pipeline. `skillfold graph` outputs a Mermaid flowchart. Pipeline imports share skills and state across configs. Spec-compliant output with YAML frontmatter.

### Shared Library

Skillfold ships with 10 generic skills you can import into any pipeline:

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

Import them with one line:

```yaml
imports:
  - node_modules/skillfold/library/skillfold.yaml
```

Then reference them by name in your composed skills. Three ready-made example configs are included in [`library/examples/`](library/examples/):

- **dev-team** - Linear pipeline with review loop (planner, engineer, reviewer)
- **content-pipeline** - Map/parallel pattern over topics (researcher, writer, editor)
- **code-review-bot** - Minimal two-agent flow (analyzer, reporter)

### Self-Hosting

Skillfold builds its own dev team. The [`skillfold.yaml`](skillfold.yaml) in this repo defines five agents:

| Agent | Role |
|-------|------|
| strategist | Assesses project needs and sets direction |
| architect | Designs systems and decomposes work into GitHub issues |
| engineer | Writes production TypeScript code and tests, opens PRs |
| reviewer | Reviews pull requests for correctness and clarity |
| orchestrator | Coordinates pipeline execution and merges approved PRs |

The reviewer feeds back to the engineer when `review.approved == false`, creating a review loop that runs until code is approved. The compiled orchestrator receives a generated execution plan with numbered steps, state tables, and conditional branches.

State is mapped to real infrastructure - plans live in GitHub Discussions, tasks become GitHub Issues, implementations are pull requests, and reviews are PR reviews. See [`skillfold.yaml`](skillfold.yaml) for the full config.

---

## Reference

### Install

```bash
npm install -g skillfold
```

Or run directly with `npx skillfold`. Requires Node.js 20+.

### CLI

```
skillfold [command] [options]

Commands:
  init              Scaffold a new pipeline project
  graph             Output Mermaid flowchart of the team flow
  (default)         Compile the pipeline config

Options:
  --config <path>   Config file (default: skillfold.yaml)
  --out-dir <path>  Output directory (default: build)
  --dir <path>      Target directory for init (default: .)
  --help            Show this help
  --version         Show version
```

### Config

Full specification in [BRIEF.md](BRIEF.md).

#### skills

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

#### state

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

#### team

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

### Tests

```bash
npm test          # 238 tests, node:test, no extra dependencies
npx tsc --noEmit  # type check
```

## License

MIT
