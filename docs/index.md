---
layout: home

hero:
  name: Skillfold
  text: Typed coordination for multi-agent pipelines
  tagline: Compile YAML configs into agent skills, execution flows, and orchestrators - validated at compile time.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: Live Demo
      link: /demo
    - theme: alt
      text: GitHub
      link: https://github.com/byronxlg/skillfold

features:
  - title: Skill Composition
    details: Define atomic skills once, compose them into agents. No copy-paste, no drift. 11 library skills included, installable standalone via npx skills add.
  - title: Typed State and Flows
    details: Declare state schemas, wire agents into execution flows with conditional routing and parallel map. Validated at compile time.
  - title: Built-in Integrations
    details: GitHub Issues, Discussions, and PRs as first-class state locations. The compiler resolves URLs and validates paths.
  - title: Multi-Platform
    details: "Compile to 12 targets: Claude Code, Agent Teams, Cursor, Windsurf, VS Code Copilot, OpenAI Codex, Gemini CLI, Goose, Roo Code, Kiro, Junie, or standard SKILL.md files."
---

## What It Looks Like

Define your agent pipeline in YAML:

```yaml
skills:
  atomic:
    planning: npm:skillfold/library/skills/planning
    code-writing: npm:skillfold/library/skills/code-writing
    testing: npm:skillfold/library/skills/testing
  composed:
    engineer:
      compose: [planning, code-writing, testing]

state:
  tasks:
    type: list<Task>
    location:
      github-issues: { repo: my-org/my-repo, label: task }

team:
  flow:
    - planner:
        writes: [state.tasks]
      then: map
    - map:
        over: state.tasks
        as: task
        flow:
          - engineer:
              reads: [task.description]
              writes: [task.output]
      then: end
```

Compile to any platform:

```bash
npx skillfold --target claude-code   # .claude/agents/*.md
npx skillfold --target cursor        # .cursor/rules/*.mdc
npx skillfold --target codex         # AGENTS.md
npx skillfold --target gemini        # .gemini/agents/*.md
```

Or run the pipeline directly:

```bash
npx skillfold run --target claude-code --spawner sdk
```

## How Skillfold Compares to Runtime Orchestration

Skillfold is a compiler, not a runtime framework. It validates your pipeline at compile time and emits plain files that agents read directly. Runtime orchestration tools like CrewAI, AutoGen, and LangGraph take a different approach - they coordinate agents at execution time through a framework process. Both are valid; which one fits depends on your pipeline.

| | Skillfold (compile-time) | Runtime orchestration (CrewAI, AutoGen, LangGraph) |
| --- | --- | --- |
| **When coordination happens** | At compile time, before agents run | At runtime, while agents execute |
| **Output format** | Standard files (SKILL.md, .claude/agents/, Cursor rules) | Proprietary runtime objects and APIs |
| **Platform lock-in** | None - output is plain files any tool can read | Tied to the framework's runtime and SDK |
| **Validation** | Compile-time type checking for state, flows, and references | Runtime errors surface during execution |
| **Runtime overhead** | Zero - agents read files directly, no middleware | Framework process runs alongside agents |
| **Best for** | Known pipelines with static topology and typed state | Dynamic workflows where topology changes based on intermediate results |

Runtime tools are the better choice when your pipeline needs to make structural decisions mid-execution - spawning new agents, rewiring flows, or adapting the graph based on intermediate output. Skillfold is the better choice when you know the shape of your pipeline ahead of time and want the compiler to catch errors before anything runs.
