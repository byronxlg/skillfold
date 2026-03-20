# Getting Started with Skillfold

This tutorial walks you from zero to a compiled multi-agent pipeline. By the end, you will have a working pipeline with skill composition, typed state, conditional routing, and a review loop.

## 1. Install

Install skillfold from GitHub (the npm registry may be behind the latest version):

```bash
npm install github:byronxlg/skillfold
```

Requires Node.js 20+. Verify with `npx skillfold --version`.

## 2. Scaffold a starter pipeline

```bash
mkdir my-project && cd my-project
npx skillfold init
```

This creates `skillfold.yaml`, `skills/plan/SKILL.md`, and `skills/execute/SKILL.md`.

## 3. Understand the generated config

Open `skillfold.yaml`. It defines a two-agent pipeline:

```yaml
# yaml-language-server: $schema=node_modules/skillfold/skillfold.schema.json
name: my-pipeline

# To import shared skills from the skillfold library, uncomment:
# imports:
#   - node_modules/skillfold/library/skillfold.yaml

skills:
  atomic:
    plan: ./skills/plan
    execute: ./skills/execute

  composed:
    planner:
      compose: [plan]
      description: "Analyzes the goal and produces a plan."

    worker:
      compose: [plan, execute]
      description: "Executes tasks from the plan."

    orchestrator:
      compose: [plan]
      description: "Coordinates pipeline execution."

state:
  goal:
    type: string

  result:
    type: string

team:
  orchestrator: orchestrator

  flow:
    - planner:
        writes: [state.goal]
      then: worker

    - worker:
        reads: [state.goal]
        writes: [state.result]
      then: end
```

There are three layers:

- **skills** - Two atomic skills (`plan`, `execute`) and three composed agents. The `worker` agent composes both `plan` and `execute`, so its compiled SKILL.md contains both skill bodies concatenated in order.
- **state** - Two typed fields: `goal` and `result`, both strings.
- **team** - A linear flow where `planner` writes the goal, then `worker` reads it and writes the result. The `orchestrator` gets a generated execution plan appended to its SKILL.md.

## 4. Compile and examine output

Compile the pipeline:

```bash
npx skillfold
```

This produces compiled SKILL.md files in `build/`:

```
build/
  planner/SKILL.md
  worker/SKILL.md
  orchestrator/SKILL.md
```

Each file is a valid SKILL.md per the [Agent Skills standard](https://agentskills.io/specification), with YAML frontmatter and concatenated skill bodies. The `worker/SKILL.md` contains both the `plan` and `execute` skill content.

You can also inspect the pipeline without compiling:

```bash
npx skillfold validate   # check config for errors
npx skillfold list       # display a structured summary
npx skillfold graph      # output a Mermaid flowchart
```

## 5. Enhance the pipeline

Now extend the pipeline by adding a reviewer with a conditional review loop. This demonstrates conditional routing and cycle exit conditions.

First, create a new atomic skill:

```bash
mkdir -p skills/review
```

Write `skills/review/SKILL.md`:

```markdown
---
name: review
description: Review work and provide feedback.
---

# Review

You review the worker's output for correctness and completeness. Approve if the work meets requirements, or provide feedback for revision.
```

Next, update `skillfold.yaml` with the following changes:

Add `review` to the atomic skills and a new `reviewer` composed skill:

```yaml
skills:
  atomic:
    plan: ./skills/plan
    execute: ./skills/execute
    review: ./skills/review          # new

  composed:
    # ... keep planner, worker, orchestrator ...
    reviewer:                        # new
      compose: [review]
      description: "Reviews work for correctness."
```

Add a `Review` custom type and a `review` field to state:

```yaml
state:
  Review:              # custom type definition
    approved: bool
    feedback: string
  goal: { type: string }
  result: { type: string }
  review: { type: Review }
```

Update the team flow so `worker` transitions to `reviewer`, with conditional routing back:

```yaml
team:
  orchestrator: orchestrator
  flow:
    - planner:
        writes: [state.goal]
      then: worker
    - worker:
        reads: [state.goal]
        writes: [state.result]
      then: reviewer             # was: end
    - reviewer:
        reads: [state.result]
        writes: [state.review]
      then:
        - when: review.approved == true
          to: end
        - when: review.approved == false
          to: worker
```

Key changes:

- **New skill**: `review` atomic skill with its own SKILL.md.
- **Custom type**: `Review` has `approved` (bool) and `feedback` (string).
- **Conditional routing**: The reviewer transitions to `end` when approved, or loops back to `worker` when not. Skillfold validates that every cycle has an exit condition.

Compile again to verify:

```bash
npx skillfold
```

The `build/` directory now includes `reviewer/SKILL.md`, and the orchestrator's SKILL.md contains a generated execution plan reflecting the review loop.

## 6. Validate your config

Use `skillfold validate` to check for errors without producing output:

```bash
npx skillfold validate
```

Validation catches:
- Missing skill references in compositions
- Undefined state paths in reads/writes
- Write conflicts (two agents writing the same state field)
- Cycles without exit conditions
- Unreachable flow nodes
- Invalid when-clause expressions

## 7. Use the shared library

Skillfold ships with 11 generic skills you can import instead of writing from scratch: `planning`, `research`, `decision-making`, `code-writing`, `code-review`, `testing`, `writing`, `summarization`, `github-workflow`, `file-management`, and `skillfold-cli`.

To use them, uncomment the imports line in your config:

```yaml
imports:
  - node_modules/skillfold/library/skillfold.yaml
```

Then reference library skills directly in your compositions:

```yaml
skills:
  composed:
    engineer:
      compose: [planning, code-writing, testing]
      description: "Implements the plan by writing production code and tests."
```

Three example configs in `library/examples/` show common patterns:

- **dev-team** - Linear pipeline with a review loop
- **content-pipeline** - Parallel map over a list of topics
- **code-review-bot** - Minimal two-agent flow

## 8. Next steps

- Read the full config specification in [BRIEF.md](../BRIEF.md)
- Explore the [shared library examples](../library/examples/) for real pipeline patterns
- Use `skillfold graph` to visualize your team flow as a Mermaid diagram
- Add `team.orchestrator` to generate execution plans automatically
- Try parallel `map` to process lists of items concurrently
- Set `GITHUB_TOKEN` to reference skills from private GitHub repositories
