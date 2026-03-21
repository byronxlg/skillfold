# Agent Teams Tutorial

This tutorial walks you from zero to a running Agent Teams pipeline. By the end, you will have a team of AI agents coordinating through a shared task list in Claude Code - defined as a version-controlled YAML file.

## Prerequisites

Before you begin, make sure you have:

- **Node.js 20+** - verify with `node --version`
- **Claude Code** - the Anthropic CLI ([install guide](https://docs.anthropic.com/en/docs/claude-code))
- **Agent Teams enabled** - this feature is experimental. Add the following to `.claude/settings.json` in your project (or your global settings):

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

Agent Teams requires Claude Code v2.1.32 or later.

## 1. Create a pipeline

Install skillfold and scaffold a project from the `dev-team` template:

```bash
npm install skillfold
npx skillfold init my-team --template dev-team
cd my-team
```

This creates two files:

```
my-team/
  skillfold.yaml
  .gitignore
```

The template uses skillfold's shared library skills via imports, so no local skill directories are needed.

## 2. Understand the config

Open `skillfold.yaml`. The template produces a three-agent pipeline with a review loop:

```yaml
# yaml-language-server: $schema=node_modules/skillfold/skillfold.schema.json
name: dev-team

imports:
  - npm:skillfold/library/skillfold.yaml

skills:
  composed:
    planner:
      compose: [planning, decision-making]
      description: "Analyzes the goal and produces a structured plan with key decisions."

    engineer:
      compose: [planning, code-writing, testing]
      description: "Implements the plan by writing production code and tests."

    reviewer:
      compose: [code-review, testing]
      description: "Reviews code for correctness, clarity, and test coverage."

state:
  Review:
    approved: bool
    feedback: string

  plan:
    type: string

  implementation:
    type: string

  review:
    type: Review

team:
  flow:
    - planner:
        writes: [state.plan]
      then: engineer

    - engineer:
        reads: [state.plan]
        writes: [state.implementation]
      then: reviewer

    - reviewer:
        reads: [state.implementation]
        writes: [state.review]
      then:
        - when: review.approved == true
          to: end
        - when: review.approved == false
          to: engineer
```

The config has four sections:

### imports

The import pulls in 11 reusable atomic skills from the skillfold library (planning, code-writing, code-review, testing, decision-making, and more). These are the building blocks that get composed into agents.

### skills

There are no `atomic` skill definitions here because the import provides them. The `composed` section defines three agents, each built from a combination of atomic skills:

- **planner** - combines `planning` and `decision-making` to analyze goals and produce structured plans
- **engineer** - combines `planning`, `code-writing`, and `testing` to implement code with tests
- **reviewer** - combines `code-review` and `testing` to review code for correctness and coverage

When compiled, each agent's instructions are the concatenation of its atomic skill bodies. The engineer gets the full text of the `planning`, `code-writing`, and `testing` skills - all the context it needs.

### state

The state section defines the data that flows between agents:

- `Review` is a custom type with `approved` (bool) and `feedback` (string) fields
- `plan`, `implementation`, and `review` are the state fields agents read from and write to

The compiler validates that every `reads` and `writes` reference points to a real state field.

### team.flow

The flow defines the execution order and routing:

1. `planner` writes the plan, then hands off to `engineer`
2. `engineer` reads the plan and writes the implementation, then hands off to `reviewer`
3. `reviewer` reads the implementation, writes a review, then routes conditionally:
   - If `review.approved == true`, the pipeline ends
   - If `review.approved == false`, it loops back to `engineer`

The compiler validates that every cycle has an exit condition, preventing infinite loops.

## 3. Compile for Agent Teams

Compile the pipeline with the `agent-teams` target:

```bash
npx skillfold --target agent-teams
```

Output:

```
skillfold: compiled dev-team
  -> .claude/skills/planner/SKILL.md
  -> .claude/skills/engineer/SKILL.md
  -> .claude/skills/reviewer/SKILL.md
  -> .claude/agents/planner.md
  -> .claude/agents/engineer.md
  -> .claude/agents/reviewer.md
  -> .claude/commands/start-team.md
```

The `--target agent-teams` flag generates everything into the `.claude/` directory, which is where Claude Code reads its configuration.

## 4. Explore the output

The compiler generates three types of files:

### Skills (`.claude/skills/{name}/SKILL.md`)

Each composed skill's body is the concatenation of its atomic skills. For example, `engineer/SKILL.md` contains the full text of the `planning`, `code-writing`, and `testing` skills - merged into a single file with YAML frontmatter.

These files are the detailed instructions that tell each agent how to do its job.

### Agents (`.claude/agents/{name}.md`)

Agent markdown files with frontmatter and structured sections. Here is what a typical agent file looks like:

```markdown
---
name: engineer
description: Implements the plan by writing production code and tests.
model: inherit
color: green
---

# engineer

Implements the plan by writing production code and tests.

## Reads

- `state.plan`

## Writes

- `state.implementation`

## Instructions

(full composed skill body here)
```

Key fields in the frontmatter:

- **model** - set to `inherit` by default (uses the current model)
- **color** - assigned heuristically based on role (green for implementation, red for review, yellow for planning)

The Reads and Writes sections come from the team flow definition.

### Team bootstrap (`.claude/commands/start-team.md`)

The `start-team.md` command is the glue that ties everything together. It tells Agent Teams:

1. **Team Structure** - which teammates to spawn and what each one does
2. **Shared State** - a table of state fields with types
3. **Task Sequence** - numbered steps derived from the flow graph, with reads, writes, and conditional routing
4. **Coordination** - how the team lead manages handoffs and evaluates conditions

This file is what makes the difference between manually describing a team every session and having a reproducible, version-controlled definition.

## 5. Launch the team

Open Claude Code in your project directory and run the start command:

```
/start-team
```

Agent Teams reads the bootstrap prompt, creates the team, and begins executing the pipeline. The team lead (Claude) spawns the planner, engineer, and reviewer as teammates, assigns tasks in the defined order, and manages the review loop.

Each teammate automatically loads its agent definition from `.claude/agents/{name}.md`, which includes its composed skill instructions, reads, and writes.

## 6. Customize the pipeline

### Add an agent

Say you want a `designer` agent that creates UI mockups before the engineer builds. First, add it to the composed skills:

```yaml
skills:
  composed:
    designer:
      compose: [planning, code-writing]
      description: "Designs UI components and creates implementation specs."

    planner:
      compose: [planning, decision-making]
      description: "Analyzes the goal and produces a structured plan with key decisions."

    engineer:
      compose: [planning, code-writing, testing]
      description: "Implements the plan by writing production code and tests."

    reviewer:
      compose: [code-review, testing]
      description: "Reviews code for correctness, clarity, and test coverage."
```

Then add a state field and wire it into the flow:

```yaml
state:
  # ... existing fields ...
  design:
    type: string

team:
  flow:
    - planner:
        writes: [state.plan]
      then: designer

    - designer:
        reads: [state.plan]
        writes: [state.design]
      then: engineer

    - engineer:
        reads: [state.plan, state.design]
        writes: [state.implementation]
      then: reviewer

    - reviewer:
        reads: [state.implementation]
        writes: [state.review]
      then:
        - when: review.approved == true
          to: end
        - when: review.approved == false
          to: engineer
```

Recompile:

```bash
npx skillfold --target agent-teams
```

The compiler generates the new `designer` agent files and updates `start-team.md` with the new task sequence. The git diff shows exactly what changed.

### Use custom skills instead of library imports

If the library skills do not fit your needs, define your own atomic skills:

```yaml
skills:
  atomic:
    my-planning: ./skills/my-planning
    my-coding: ./skills/my-coding

  composed:
    engineer:
      compose: [my-planning, my-coding]
      description: "Implements features using our team's conventions."
```

Create `skills/my-planning/SKILL.md` with your custom instructions:

```markdown
---
name: my-planning
description: Plan features using our team's process.
---

# Planning

(your custom planning instructions here)
```

You can mix library skills and custom skills in the same composition.

### Change the model

Set a model per agent using `agentConfig`:

```yaml
skills:
  composed:
    planner:
      compose: [planning, decision-making]
      description: "Analyzes the goal and produces a structured plan."
      agentConfig:
        model: claude-sonnet-4-20250514
```

## 7. Validate before compiling

Use `validate` to check your config for errors without writing any files:

```bash
npx skillfold validate
```

This catches issues like missing skill references, invalid state paths, unreachable flow nodes, and cycles without exit conditions.

Use `list` to see a summary of the pipeline:

```bash
npx skillfold list
```

Use `graph` to visualize the flow:

```bash
npx skillfold graph
```

This outputs a Mermaid flowchart you can paste into GitHub, or use `--html` for an interactive view:

```bash
npx skillfold graph --html > pipeline.html
```

## 8. CI integration

Add a check to your CI pipeline to verify the compiled output stays in sync with the config:

```yaml
# .github/workflows/check.yml
name: Check pipeline

on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx skillfold --target agent-teams --check
```

The `--check` flag compares what the compiler would generate against what is on disk. It exits with code 1 if someone edited the compiled output without updating the config, or updated the config without recompiling.

You can also use the reusable GitHub Action:

```yaml
- uses: byronxlg/skillfold@main
  with:
    target: agent-teams
```

## Next steps

- [Agent Teams Bridge](/agent-teams-bridge) - deeper explanation of what skillfold solves for Agent Teams
- [Getting Started](/getting-started) - the full getting-started guide with all features
- [Platform Integration](/integrations) - all 7 supported compilation targets
- [Running Pipelines](/running-pipelines) - execute pipelines with `skillfold run`
- [Publishing Skills](/publishing) - share your skills via npm
