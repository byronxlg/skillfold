---
title: My Dev Team Is a YAML File
description: How skillfold manages its own development with a multi-agent pipeline defined in 128 lines of YAML.
---

# My Dev Team Is a YAML File

The tool that compiles multi-agent pipelines is itself built by a multi-agent pipeline. Seven AI agents - strategist, architect, engineer, reviewer, marketer, designer, and orchestrator - coordinate through a YAML config that the compiler reads, validates, and compiles into the skill files those same agents use. The pipeline builds the tool that builds the pipeline.

This is the story of how that works, and why self-hosting turned out to be the best way to develop a compiler for agent coordination.

## The Problem Nobody Talks About

Individual AI agents are easy. Give an agent a system prompt, point it at some files, and it works. The hard part starts when you have three agents and need them to coordinate. Then five. Then seven.

Who writes the code? Who reviews it? What happens when the review fails - does it go back to the engineer, or to the architect? Where does the state live? If you rename a field, which agents break?

Most teams solve this by writing long orchestration prompts by hand, copy-pasting state descriptions between agents, and hoping everything stays in sync. It works until it doesn't. A reviewer reads a state field that no one writes. A loop has no exit condition. Two agents write the same field in parallel and one overwrites the other.

These are coordination problems, and they get worse as the pipeline grows. You need something that catches them before runtime.

## Skill Composition: The Building Block

Skillfold's answer starts with skill composition. An atomic skill is a reusable instruction fragment - a SKILL.md file that teaches an agent one thing. A composed skill concatenates multiple atomic skills into a single agent definition.

Here is how the skillfold team defines its engineer agent:

```yaml
composed:
  engineer:
    compose: [skillfold-context, coding-guidelines, testing, conventional-commit, github]
    description: "Writes production-quality TypeScript code and tests, works on feature branches and opens PRs."
```

Five atomic skills, combined in order. `skillfold-context` gives the agent project knowledge. `coding-guidelines` and `testing` come from public GitHub repos. `conventional-commit` teaches commit message conventions. `github` teaches GitHub workflows.

The compiler resolves each skill (local path or GitHub URL), reads its SKILL.md, and concatenates the bodies. The output is a single compiled SKILL.md that the agent reads as its instructions. No manual copy-paste, no drift between agents that share skills.

Composition is recursive, too. If `coding-guidelines` were itself a composed skill, the compiler would flatten it automatically.

## The Actual Config

Here is the full `skillfold.yaml` that defines the dev team. This is not a simplified example - it is the real config checked into the repo:

```yaml
name: skillfold-team

skills:
  atomic:
    # Remote public skills
    coding-guidelines: https://github.com/tech-leads-club/agent-skills/tree/main/packages/skills-catalog/skills/(development)/coding-guidelines
    conventional-commit: https://github.com/github/awesome-copilot/tree/main/skills/conventional-commit
    create-implementation-plan: https://github.com/github/awesome-copilot/tree/main/skills/create-implementation-plan
    create-readme: https://github.com/github/awesome-copilot/tree/main/skills/create-readme
    docs-writer: https://github.com/tech-leads-club/agent-skills/tree/main/packages/skills-catalog/skills/(development)/docs-writer
    pr-review-expert: https://github.com/alirezarezvani/claude-skills/tree/main/engineering/pr-review-expert
    security-best-practices: https://github.com/openai/skills/tree/main/skills/.curated/security-best-practices

    # Project-specific skills
    github: ./skills/github
    moltbook: ./skills/moltbook
    product-strategy: ./skills/product-strategy
    skillfold-context: ./skills/skillfold-context
    testing: ./skills/testing

  composed:
    strategist:
      compose: [skillfold-context, product-strategy, github]
      description: "Reads the project board and open issues, assesses priorities, and posts direction to Strategy discussions."
    architect:
      compose: [skillfold-context, create-implementation-plan, github]
      description: "Designs implementation plans, decomposes work into issues, and manages the project board."
    engineer:
      compose: [skillfold-context, coding-guidelines, testing, conventional-commit, github]
      description: "Writes production-quality TypeScript code and tests, works on feature branches and opens PRs."
    reviewer:
      compose: [skillfold-context, pr-review-expert, security-best-practices, github]
      description: "Reviews pull requests for correctness, security, and design quality."
    marketer:
      compose: [skillfold-context, product-strategy, moltbook, github]
      description: "Engages with the agent community on Moltbook and positions the project for adoption."
    designer:
      compose: [skillfold-context, create-readme, docs-writer, github]
      description: "Designs project-facing content like READMEs, docs, and landing pages."
    orchestrator:
      compose: [skillfold-context, github]
      description: "Coordinates the pipeline execution, manages the project board, and merges approved PRs."
```

Seven agents, twelve atomic skills (seven from public GitHub repos, five project-specific). The `skillfold-context` skill appears in every agent - the compiler deduplicates it in the output.

## Typed State on Real Infrastructure

The config does not stop at skills. The `state` section declares a typed schema, and each field maps to real infrastructure:

```yaml
state:
  Task:
    title: string
    description: string

  Review:
    approved: bool
    feedback: string

  direction:
    type: string
    location:
      github-discussions: { repo: byronxlg/skillfold, category: strategy }

  plan:
    type: string
    location:
      github-discussions: { repo: byronxlg/skillfold, category: strategy }
      kind: reply

  tasks:
    type: list<Task>
    location:
      github-issues: { repo: byronxlg/skillfold, label: task }

  implementation:
    type: string
    location:
      github-pull-requests: { repo: byronxlg/skillfold }

  review:
    type: Review
    location:
      github-pull-requests: { repo: byronxlg/skillfold }
      kind: review
```

Direction posts go to GitHub Discussions under the "strategy" category. Tasks become GitHub Issues with the "task" label. Implementations are pull requests. Reviews are PR reviews. The compiler validates that every state read has a corresponding write and generates URLs for the orchestrator's state table.

This means the pipeline's work products are visible in the repo's standard GitHub tabs. You can browse the [Discussions](https://github.com/byronxlg/skillfold/discussions), [Issues](https://github.com/byronxlg/skillfold/issues?q=label%3Atask), and [Pull Requests](https://github.com/byronxlg/skillfold/pulls) to see the pipeline's actual output.

## The Team Flow

The `team` section wires agents into an execution graph with conditional routing:

```yaml
team:
  orchestrator: orchestrator

  flow:
    - strategist:
        reads: [state.human-discussion, state.tasks, state.announcement]
        writes: [state.direction]
      then: architect

    - architect:
        reads: [state.direction]
        writes: [state.plan, state.tasks]
      then: engineer

    - engineer:
        reads: [state.plan, state.tasks]
        writes: [state.implementation]
      then: reviewer

    - reviewer:
        reads: [state.implementation]
        writes: [state.review]
      then:
        - when: review.approved == false
          to: engineer
        - when: review.approved == true
          to: marketer

    - marketer:
        reads: [state.direction, state.implementation]
        writes: [state.announcement]
      then: end
```

Five flow nodes. The strategist sets direction, the architect breaks it into a plan and tasks, the engineer implements, the reviewer checks the work. If the review fails, it loops back to the engineer. If it passes, the marketer writes an announcement.

The compiler validates this graph at compile time: every transition target exists, every cycle has an exit condition, every state path resolves, no two agents write the same field in parallel. If I accidentally typed `state.implementaton` (with a typo), the compiler would catch it before any agent runs.

## What the Output Looks Like

Running `npx skillfold` produces seven compiled SKILL.md files in `build/`. The orchestrator's output includes a generated execution plan:

```markdown
## Execution Plan

### Step 1: strategist
Invoke **strategist**.
Reads: `state.human-discussion`, `state.tasks`, `state.announcement`
Writes: `state.direction`
Then: proceed to step 2.

### Step 2: architect
Invoke **architect**.
Reads: `state.direction`
Writes: `state.plan`, `state.tasks`
Then: proceed to step 3.

### Step 3: engineer
Invoke **engineer**.
Reads: `state.plan`, `state.tasks`
Writes: `state.implementation`
Then: proceed to step 4.

### Step 4: reviewer
Invoke **reviewer**.
Reads: `state.implementation`
Writes: `state.review`
Then:
- If `review.approved == false`: go to step 3
- If `review.approved == true`: go to step 5

### Step 5: marketer
Invoke **marketer**.
Reads: `state.direction`, `state.implementation`
Writes: `state.announcement`
Then: end
```

The orchestrator also gets a state table with resolved URLs pointing to the actual GitHub endpoints. It knows that `state.tasks` lives at `https://github.com/byronxlg/skillfold/issues` with the "task" label, and that `state.implementation` lives at `https://github.com/byronxlg/skillfold/pulls`.

The graph visualization (`skillfold graph`) renders the full flow with composition lineage - each agent subgraph shows the atomic skills it is composed from, and the edges show which state fields flow between nodes.

## The Self-Hosting Twist

Here is where it gets interesting. The engineer agent that writes code for skillfold is defined in `skillfold.yaml`. The compiler that reads `skillfold.yaml` is the TypeScript code that the engineer agent writes. When the engineer ships a change to the compiler, that change affects how the engineer's own skill file gets compiled next time.

This is not just a neat trick. It is a forcing function for quality:

- **The config must be valid.** If the compiler has a bug that rejects valid configs, we notice immediately because our own config stops compiling.
- **The output must be useful.** If the compiled SKILL.md files are missing context or badly structured, the agents using them perform worse on the next cycle.
- **The state schema must be accurate.** If the state locations drift from the actual GitHub setup, the orchestrator generates wrong URLs and the pipeline breaks.

Self-hosting also makes the test suite honest. The project's end-to-end tests compile `skillfold.yaml` as a real-world integration test. If a refactor breaks composition for configs with seven agents and twelve atomic skills, the test catches it.

## How to Try It

You do not need seven agents to get started. The simplest pipeline is two agents with a review loop:

```bash
npx skillfold init my-team --template dev-team
cd my-team
npx skillfold
```

This scaffolds a starter config with a planner, engineer, and reviewer. Run `npx skillfold` to compile it, or `npx skillfold --target claude-code` to output Claude Code native subagents.

For the full experience:

```bash
npm install -g skillfold    # or use npx
skillfold init my-pipeline
skillfold validate           # check the config
skillfold graph --html       # interactive flow visualization
skillfold                    # compile
```

The [documentation site](https://byronxlg.github.io/skillfold/) has a getting-started guide, a config reference, and a live interactive demo where you can edit YAML and see the Mermaid graph update in real time.

## Where It Fits

Skillfold is a compiler, not a runtime framework. It does not replace CrewAI, LangGraph, or AutoGen - those coordinate agents at execution time. Skillfold validates pipelines at compile time and emits plain files that agents read directly. No runtime, no daemon, no SDK.

It also does not replace individual skill management. The [skills CLI](https://skills.sh) handles installing and updating individual SKILL.md files. Skillfold handles what comes after: composing skills into agents, declaring state, wiring team flows, and validating the whole thing at compile time. You can use both together - install skills with `skills`, compose them with `skillfold`.

Think of it like TypeScript for agent pipelines. TypeScript does not replace JavaScript. It adds a type system that catches errors at compile time. Skillfold does not replace SKILL.md files. It adds typed state, flow validation, and orchestrator generation, then compiles down to the same Markdown your platform already reads.

The output is portable across [32 platforms](https://agentskills.io) that support the Agent Skills standard. If your tool reads SKILL.md files, it reads skillfold output.

---

128 lines of YAML. Seven agents. Conditional routing, typed state on GitHub infrastructure, compile-time validation, and a self-hosting loop that keeps the whole thing honest. That is the dev team.

The config is [open source](https://github.com/byronxlg/skillfold/blob/main/skillfold.yaml). The compiler is on [npm](https://www.npmjs.com/package/skillfold). The docs are at [byronxlg.github.io/skillfold](https://byronxlg.github.io/skillfold/). Try `npx skillfold init` and see what a typed pipeline looks like.
