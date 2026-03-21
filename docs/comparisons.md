# Comparisons

Skillfold is a compile-time coordination tool for multi-agent pipelines. This page compares it against the alternatives you are most likely evaluating: Claude Code Agent Teams, CrewAI, and hand-written SKILL.md files.

Each tool makes different trade-offs. The right choice depends on your pipeline's complexity, your need for portability, and how much structure you want around agent coordination.

## vs Claude Code Agent Teams

[Agent Teams](https://docs.anthropic.com/en/docs/claude-code/agent-teams) is Anthropic's built-in multi-agent feature for Claude Code. It lets you define agents in `.claude/agents/*.md` files and coordinate them through natural language in a shared task list.

### How they differ

Agent Teams is prompt-driven. You describe agents in markdown, then orchestrate them conversationally - telling one agent to delegate to another or check a shared task list. There is no config file that defines the pipeline topology ahead of time.

Skillfold is config-driven. You declare agents, state, and execution flow in `skillfold.yaml`. The compiler validates the entire pipeline before anything runs - checking state types, transition targets, write conflicts, and cycle exit conditions.

| | Skillfold | Agent Teams |
| --- | --- | --- |
| **Coordination model** | Declarative YAML config, compiled ahead of time | Natural language orchestration at runtime |
| **Pipeline definition** | `skillfold.yaml` with typed state schema and flow graph | `.claude/agents/*.md` files with prose instructions |
| **Validation** | Compile-time type checking, cycle detection, conflict analysis | No static validation - errors surface at runtime |
| **Routing** | Conditional transitions, parallel map, loops, sub-flows | Agent-to-agent delegation via conversation |
| **State management** | Typed schema with read/write tracking per agent | Shared task list, untyped |
| **Reproducibility** | Deterministic - same config always produces same pipeline | Depends on prompt interpretation |
| **Version control** | Single YAML file diffs cleanly | Agent markdown files version well, but orchestration logic lives in prompts |
| **Skill reuse** | Composition from atomic skills, npm sharing | Copy-paste between agent files |
| **Platform support** | 38+ platforms via Agent Skills standard | Claude Code only |

### When to use Agent Teams

Agent Teams is a good fit when you want to get a multi-agent pipeline running quickly inside Claude Code without learning a config language. It works well for ad-hoc coordination where the execution order is flexible and agents can decide among themselves who does what.

### When to use Skillfold

Skillfold is a better fit when you need reproducible pipelines that are version-controlled and validated before they run. It is also the right choice when your pipeline has structured execution flow - conditional routing, parallel processing over collections, review loops with typed feedback, or sub-flow imports. If you need to target platforms beyond Claude Code, skillfold's compiled output works across any tool that reads the Agent Skills standard.

### Migration path

If you already have Agent Teams set up, `skillfold adopt` can import your existing `.claude/agents/*.md` files into a `skillfold.yaml` config:

```bash
npx skillfold adopt
npx skillfold --target claude-code
```

This creates a 1:1 mapping from agents to skills. From there you can extract shared instructions into reusable atomic skills, add typed state, and wire agents into a team flow.

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
| **Platform support** | 38+ platforms | CrewAI runtime only |
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
