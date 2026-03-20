<div align="center">

# Skillfold

**One config, every agent gets the right skills**

[![npm](https://img.shields.io/npm/v/skillfold?style=flat-square)](https://www.npmjs.com/package/skillfold)
[![CI](https://img.shields.io/github/actions/workflow/status/byronxlg/skillfold/ci.yml?style=flat-square&label=CI)](https://github.com/byronxlg/skillfold/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

Stop copy-pasting between [SKILL.md](https://agentskills.io/specification) files.

Works with [Claude Code](https://claude.ai/code), [Cursor](https://cursor.com), [VS Code](https://code.visualstudio.com), [GitHub Copilot](https://github.com), [OpenAI Codex](https://developers.openai.com/codex), [Gemini CLI](https://geminicli.com), and [26 more](https://agentskills.io).

[Quick Start](#quick-start) | [How It Works](#how-it-works) | [How Is This Different?](#how-is-this-different) | [Features](#features) | [Library](#shared-library) | [Reference](#reference)

</div>

---

You have agents using SKILL.md files. When you have multiple agents that need different combinations of skills, you end up copy-pasting skill content between them. When your team flow changes, you update files manually.

Skillfold compiles a single YAML config into the right SKILL.md for each agent. Define your skills once, declare which agents get which combination, and let the compiler build every file.

## Quick Start

Get a working pipeline in under 60 seconds:

```bash
npx skillfold init --dir my-team
cd my-team
npx skillfold
```

```
skillfold: compiled my-pipeline
  -> build/planner/SKILL.md
  -> build/engineer/SKILL.md
  -> build/reviewer/SKILL.md
  -> build/orchestrator/SKILL.md
```

That's it. Four agents, each with the right skills, compiled from one config. The orchestrator gets a generated execution plan with numbered steps and conditional branches.

For a detailed walkthrough, see the [Getting Started](docs/getting-started.md) guide.

<details>
<summary><strong>What's inside the generated config?</strong></summary>

```yaml
# skillfold.yaml
name: my-pipeline

skills:
  atomic:
    planning: ./skills/planning
    coding: ./skills/coding
    reviewing: ./skills/reviewing
  composed:
    engineer:
      compose: [planning, coding]
      description: "Implements the plan, writes code and tests."
    reviewer:
      compose: [reviewing]
      description: "Reviews code for correctness."

state:
  Review:
    approved: bool
    feedback: string
  code: { type: string }
  review: { type: Review }

team:
  orchestrator: orchestrator
  flow:
    - planner:
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

The `engineer` agent's SKILL.md contains the concatenated bodies of `planning` and `coding`. Every output file is a valid SKILL.md per the [Agent Skills standard](https://agentskills.io/specification).

</details>

---

## How It Works

Skillfold has three layers, each building on the last:

| Layer | What you define | What the compiler does |
|-------|----------------|----------------------|
| **Skills** | Atomic skill directories + composition rules | Concatenates skill bodies in order, recursively |
| **State** | Typed schema with custom types and external locations | Validates reads/writes at compile time |
| **Team** | Execution flow with conditionals, loops, and parallel map | Generates orchestrator plan, checks reachability |

Compiled output is portable across [32 platforms](https://agentskills.io) that support the Agent Skills standard.

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

## How Is This Different?

Skillfold is a **build tool for multi-agent pipelines**. It composes skills into agents and wires agents into execution flows.

| Tool | What it does | How Skillfold differs |
|------|-------------|---------------------|
| **[TanStack Intent](https://tanstack.com/intent)** | Helps library authors ship skills with npm packages (skill authoring layer) | Skillfold operates at the pipeline layer - it composes existing skills into agents and orchestrates them |
| **Skill installers** (`npx skills`, etc.) | Install one skill at a time into a project | Skillfold composes multiple skills per agent, so each agent gets exactly the combination it needs |

If you author skills, use Intent. If you install individual skills, use a skill manager. If you need multiple agents that each get a different mix of skills and run in a coordinated flow, use Skillfold.

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

> [!TIP]
> Set `GITHUB_TOKEN` in your environment to fetch skills from private repositories.

**Pipeline Imports** --
Share skills and state across configs. Team flows stay local.

```yaml
imports:
  - node_modules/skillfold/library/skillfold.yaml
```

---

## Shared Library

Skillfold ships with **11 generic skills** you can import into any pipeline:

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
| skillfold-cli | Use the skillfold compiler to manage pipeline configs |

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
  validate          Validate config without compiling
  list              Display a structured summary of the pipeline
  graph             Output Mermaid flowchart of the team flow

Options:
  --config <path>   Config file (default: skillfold.yaml)
  --out-dir <path>  Output directory (default: build)
  --dir <path>      Target directory for init (default: .)
  --check           Verify compiled output is up-to-date (exit 1 if stale)
  --help            Show this help
  --version         Show version
```

### Config

Three top-level sections. Full specification in [BRIEF.md](BRIEF.md). A [JSON Schema](skillfold.schema.json) is available for IDE autocompletion.

Add this line to the top of your `skillfold.yaml` for editor support:

```yaml
# yaml-language-server: $schema=node_modules/skillfold/skillfold.schema.json
```

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
npm test          # 260 tests, node:test, no extra dependencies
npx tsc --noEmit  # type check
```

## License

MIT
