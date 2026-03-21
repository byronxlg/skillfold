# Comparisons

Skillfold is a compile-time coordination tool for multi-agent pipelines. This page compares it against the alternatives you are most likely evaluating: Claude Code Agent Teams, CrewAI, and hand-written SKILL.md files.

Each tool makes different trade-offs. The right choice depends on your pipeline's complexity, your need for portability, and how much structure you want around agent coordination.

## vs Claude Code Agent Teams

[Agent Teams](https://code.claude.com/docs/en/agent-teams) is Claude Code's built-in multi-agent feature (experimental, v2.1.32+). It coordinates multiple Claude Code instances through a team lead, shared task list, and direct inter-agent messaging.

### How they differ

Agent Teams is conversational. You describe the team structure in natural language, and Claude creates teammates, assigns tasks, and coordinates work at runtime. The team lead decides how to split work, route results, and handle failures. There is no config file that defines the pipeline topology ahead of time.

Skillfold is declarative. You define agents, typed state, and execution flow in `skillfold.yaml`. The compiler validates the entire pipeline before anything runs - checking state types, transition targets, write conflicts, and cycle exit conditions - then emits output for the target platform.

| | Skillfold | Agent Teams |
| --- | --- | --- |
| **Definition** | Declarative YAML config, compiled ahead of time | Conversational, defined at runtime |
| **Pipeline config** | `skillfold.yaml` with typed state schema and flow graph | No config file - team structure lives in prompts |
| **Validation** | Compile-time type checking, cycle detection, conflict analysis | No static validation - errors surface at runtime |
| **Routing** | Conditional transitions, parallel map, loops, sub-flows | Agent-to-agent delegation via conversation |
| **State** | Typed schema with read/write tracking per agent | Shared task list with dependency tracking, untyped |
| **Communication** | Orchestrator manages handoffs | Teammates message each other directly via mailbox |
| **Reproducibility** | Deterministic - same config always produces same pipeline | Each run creates a unique team based on prompt interpretation |
| **Display** | Platform-dependent | In-process cycling or tmux/iTerm2 split panes |
| **Task management** | Compiler-generated execution plan | Shared task list with self-claiming and file-locked coordination |
| **Quality gates** | Compile-time validation | Runtime hooks (`TeammateIdle`, `TaskCompleted`) |
| **Delegation** | Orchestrator agent delegates via subagent tool | Delegate mode (Shift+Tab) restricts lead to coordination only |
| **Plan review** | Compile-time flow validation | Runtime plan approval - teammates plan before implementing |
| **Permissions** | Per-agent config via `agentConfig` | Teammates inherit lead's permissions at spawn time |
| **Model selection** | Per-agent via `agentConfig.model` | Per-teammate via natural language request |
| **Nesting** | Sub-flow imports for nested pipelines | No nested teams - teammates cannot spawn their own teams |
| **Skill reuse** | Composition from atomic skills, npm sharing | Copy-paste between agent files |
| **Platform support** | 12 compilation targets | Claude Code only |
| **Team size** | Unlimited (constrained by flow definition) | 3-5 recommended, practical max around 10-16 |
| **Maturity** | Stable | Experimental with known limitations |

### How they complement each other

Skillfold and Agent Teams are not competing tools - they solve different parts of the same problem. Skillfold handles the **definition and validation** layer (what agents exist, what state they share, how they connect). Agent Teams handles the **execution** layer (spawning teammates, routing messages, managing the task list).

The `--target agent-teams` compilation mode bridges both: define your pipeline in `skillfold.yaml`, compile to a team bootstrap prompt, and launch an Agent Team with the correct structure.

```bash
npx skillfold --target agent-teams    # generates .claude/commands/start-team.md
```

Then in Claude Code, run `/start-team` to launch the Agent Team with the roles, state handoffs, and task sequence defined in your config. Each teammate automatically loads its compiled skills and agent markdown.

### Known limitations of Agent Teams

Agent Teams is experimental (requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) and has several constraints:

- **No session resumption** - `/resume` and `/rewind` do not restore teammates
- **No nested teams** - teammates cannot spawn their own teams
- **One team per session** - clean up before starting a new one
- **Lead is fixed** - cannot promote a teammate or transfer leadership
- **Split panes require tmux or iTerm2** - not supported in VS Code terminal, Windows Terminal, or Ghostty
- **Higher token costs** - each teammate has its own context window (a 3-teammate team uses roughly 3-4x tokens)

### When to use Agent Teams alone

Agent Teams without skillfold works well for:
- **Ad-hoc exploration** where the team structure emerges from the task
- **Small teams (2-3 agents)** with simple coordination needs
- **Interactive work** where you want to message teammates directly and steer in real time
- **One-off tasks** that don't need to be repeated with the same structure

### When to add Skillfold

Skillfold adds value when:
- **Reproducibility matters** - the same config should produce the same team structure every time
- **The pipeline has structured flow** - conditional routing, review loops, parallel map, or sub-flows
- **State needs validation** - typed schemas catch mismatches before agents run
- **Multiple platforms** - the same config compiles to Claude Code, Cursor, Codex, Copilot, Gemini, and Windsurf
- **Skill reuse** - shared instructions are composed from atomic fragments, not copy-pasted
- **Version control** - a single YAML file diffs cleanly and documents the pipeline topology

### Migration paths

**From Agent Teams to Skillfold:**

If you already have Agent Teams set up, `skillfold adopt` can import your existing `.claude/agents/*.md` files into a `skillfold.yaml` config:

```bash
npx skillfold adopt
npx skillfold --target agent-teams
```

This creates a 1:1 mapping from agents to composed skills. From there you can extract shared instructions into reusable atomic skills, add typed state, and wire agents into a team flow.

**From Skillfold subagents to Agent Teams:**

If you have a `skillfold.yaml` with a team flow and want to switch from subagent-based execution to Agent Teams:

```bash
# Before: subagent execution
npx skillfold --target claude-code

# After: Agent Teams execution
npx skillfold --target agent-teams
```

Both targets generate the same skills and agent markdown. The difference is the orchestration command: `run-pipeline.md` spawns subagents sequentially, while `start-team.md` bootstraps an Agent Team where teammates coordinate through the shared task list.

---

## vs CrewAI

[CrewAI](https://www.crewai.com/) is a Python framework for orchestrating multi-agent workflows. It uses YAML config files (`agents.yaml` and `tasks.yaml`) alongside Python code that defines the runtime execution.

### How they differ

CrewAI is a runtime framework. It defines agents and tasks in YAML, but orchestration happens through a Python process that runs alongside your agents - routing messages, managing state, and coordinating execution.

Skillfold is a compiler. It reads your `skillfold.yaml`, validates everything at compile time, and emits plain files. There is no runtime process. Agents read the compiled output directly.

| | Skillfold | CrewAI |
| --- | --- | --- |
| **Architecture** | Compile-time, emits plain files | Runtime Python process |
| **Config files** | Single `skillfold.yaml` | `agents.yaml` + `tasks.yaml` + Python code |
| **Language** | Language-agnostic (YAML in, files out) | Python SDK required |
| **Runtime dependency** | None - compiled output is self-contained | CrewAI framework must be running |
| **Flow patterns** | Conditional routing, parallel map, loops, sub-flows | Sequential and hierarchical processes |
| **State** | Typed schema with compile-time validation | Python objects at runtime |
| **Output format** | Agent Skills standard (SKILL.md) | Proprietary CrewAI objects |
| **Platform support** | 12 compilation targets | CrewAI runtime only |
| **Validation** | Compile-time (types, references, conflicts, cycles) | Runtime errors |
| **LLM support** | Any platform that reads Agent Skills | Multiple LLM providers via CrewAI SDK |
| **Dynamic workflows** | Static topology, validated ahead of time | Can adapt structure at runtime |

### Config format comparison

A three-agent pipeline in CrewAI requires separate files for agents, tasks, and a Python crew definition:

**CrewAI** (`agents.yaml` + `tasks.yaml` + Python):

```yaml
# agents.yaml
planner:
  role: "Project Planner"
  goal: "Create detailed project plans"
  backstory: "Experienced project manager..."

engineer:
  role: "Software Engineer"
  goal: "Implement the plan"
  backstory: "Senior developer..."
```

```yaml
# tasks.yaml
planning_task:
  description: "Analyze the goal and produce a plan"
  agent: planner
  expected_output: "A structured plan"

implementation_task:
  description: "Implement the plan"
  agent: engineer
  expected_output: "Working code"
```

```python
# crew.py
from crewai import Agent, Task, Crew, Process

crew = Crew(
    agents=[planner, engineer],
    tasks=[planning_task, implementation_task],
    process=Process.sequential
)
```

**Skillfold** (single `skillfold.yaml`):

```yaml
skills:
  composed:
    planner:
      compose: [planning, decision-making]
      description: "Analyzes the goal and produces a structured plan."
    engineer:
      compose: [planning, code-writing, testing]
      description: "Implements the plan by writing code and tests."

state:
  plan:
    type: string
  implementation:
    type: string

team:
  flow:
    - planner:
        writes: [state.plan]
      then: engineer
    - engineer:
        reads: [state.plan]
        writes: [state.implementation]
```

The skillfold version declares everything in one file. Skills are composed from reusable atomic fragments rather than defined inline. State is typed and validated against the flow - if an agent reads a state path that no upstream agent writes, the compiler catches it.

### When to use CrewAI

CrewAI is a good fit when you need dynamic runtime orchestration in Python - workflows where agents spawn sub-tasks, the execution graph changes based on intermediate results, or you need deep integration with Python libraries and tooling.

### When to use Skillfold

Skillfold is a better fit when you want a portable pipeline definition that compiles to files any agent platform can read, without requiring a specific runtime or language. The compile-time validation catches configuration errors before execution, and the single YAML config is easier to review and version-control than multi-file setups.

---

## vs Manual SKILL.md

You can always write `SKILL.md` files by hand. For simple setups, this is the fastest path.

### How they differ

Manual authoring gives you full control over every line of every skill file. Skillfold generates those same files from a higher-level config, adding composition, validation, and orchestration on top.

| | Skillfold | Manual SKILL.md |
| --- | --- | --- |
| **Skill reuse** | Compose atomic skills into agents, share via npm | Copy-paste between files |
| **Validation** | Compile-time checks for types, references, and conflicts | Manual review only |
| **Orchestration** | Generated from team flow definition | Write by hand or omit |
| **Maintenance** | Change a shared skill once, recompile | Update every file that uses it |
| **Learning curve** | Need to learn skillfold.yaml format | Just write markdown |
| **Overhead** | Config file + compile step | None |

### When to write by hand

Manual SKILL.md files work well when you have one or two agents with distinct, non-overlapping instructions. There is nothing to compose, no state to validate, and no execution flow to coordinate. The overhead of a config file and compile step is not justified.

### When to use Skillfold

The break-even point is roughly when you have shared instructions across agents or a team flow that needs coordination. Common signs:

- **Duplicated sections** across multiple SKILL.md files (coding standards, tool usage, review criteria)
- **Three or more agents** that need to pass state between them
- **Conditional routing** or **review loops** that are hard to express in prose
- **Multiple platforms** that need the same pipeline in different output formats

At that point, skillfold's composition and validation pay for themselves. The `skillfold adopt` command can import your existing hand-written files as a starting point.
