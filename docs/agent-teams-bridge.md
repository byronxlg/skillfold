# Agent Teams Bridge

Claude Code Agent Teams lets you spawn a team of AI agents that coordinate through a shared task list. It is powerful - but ephemeral. You define the team in natural language, and the definition disappears when the session ends.

Skillfold fixes this. Write your team as a `skillfold.yaml` file, compile with `--target agent-teams`, and get a reproducible team definition you can check into git, share with your team, and run again tomorrow.

## The problem

Agent Teams has no config file. Every time you start a session, you describe your team from scratch:

> "Create a team with a planner who reads the backlog, an engineer who implements, and a reviewer who checks the work. If the reviewer rejects, send it back to the engineer."

This works once. It breaks down when:

- You need the same team across branches, repos, or machines
- A teammate joins and needs the same setup
- You want CI to validate the team definition
- You need to see what changed between two versions of the team

## The solution

Define the team in YAML. Compile it. Run it.

```yaml
# skillfold.yaml
name: dev-pipeline

skills:
  atomic:
    planning: npm:skillfold/library/skills/planning
    code-writing: npm:skillfold/library/skills/code-writing
    testing: npm:skillfold/library/skills/testing
    code-review: npm:skillfold/library/skills/code-review

  composed:
    planner:
      compose: [planning]
      description: "Reads the backlog and produces an implementation plan."

    engineer:
      compose: [planning, code-writing, testing]
      description: "Implements features and writes tests."

    reviewer:
      compose: [code-review]
      description: "Reviews code for correctness and quality."

state:
  plan:
    type: string
  implementation:
    type: string
  Review:
    approved: bool
    feedback: string
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

Compile:

```bash
npx skillfold --target agent-teams
```

Output:

```
.claude/
  skills/
    planner/SKILL.md
    engineer/SKILL.md
    reviewer/SKILL.md
  agents/
    planner.md
    engineer.md
    reviewer.md
  commands/
    start-team.md
```

Run `/start-team` in Claude Code to launch the team. The generated command tells Agent Teams exactly what to do: which teammates to spawn, what state each reads and writes, the task sequence, and the conditional routing logic.

## What gets generated

### Skills (`skills/{name}/SKILL.md`)

Each composed skill's body is the concatenation of its atomic skills. The engineer gets the full text of `planning`, `code-writing`, and `testing` - all the context it needs to do its job.

### Agents (`agents/{name}.md`)

Agent markdown files with frontmatter (name, description, model, color) and structured sections:

- **Reads** - which state fields this agent consumes
- **Writes** - which state fields this agent produces
- **Instructions** - the full composed skill body

Colors are assigned heuristically: green for implementation, red for review, yellow for planning.

### Team bootstrap (`commands/start-team.md`)

The start command contains:

1. **Team structure** - which teammates to spawn and what each does
2. **Shared state** - a table of state fields with types and locations
3. **Task sequence** - numbered steps derived from the flow graph, with reads, writes, and routing
4. **Coordination rules** - how the team lead manages handoffs and evaluates conditions

## Version control

The YAML file is your source of truth. The compiled output is derived. Add a CI check to make sure they stay in sync:

```yaml
# .github/workflows/check.yml
- run: npx skillfold --target agent-teams --check
```

This fails if someone edits the compiled output without updating the config, or updates the config without recompiling.

## Iterating

Change the YAML, recompile, see the diff. Want to add a designer to the team?

```yaml
  composed:
    designer:
      compose: [planning, code-writing]
      description: "Designs UI components and layouts."
```

Add a flow step. Recompile. The start-team.md updates automatically. The git diff shows exactly what changed in the team definition.

## When to use Agent Teams directly

Agent Teams without skillfold is fine for:

- One-off sessions where you won't need the same team again
- Exploratory work where the team shape is still forming
- Simple teams with 2-3 agents and no conditional routing

Skillfold adds value when:

- The team definition needs to survive across sessions
- Multiple people need the same team setup
- The flow has conditional routing, loops, or parallel work
- You want compile-time validation of state reads/writes
- You need the same pipeline to target multiple platforms

## Prerequisites

Agent Teams is experimental. Enable it:

```json
// .claude/settings.json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

Requires Claude Code v2.1.32+.

## Next steps

- [Getting Started](/getting-started) - install skillfold and compile your first pipeline
- [Platform Integration](/integrations) - all 7 supported compilation targets
- [Running Pipelines](/running-pipelines) - execute pipelines with `skillfold run`
- [Comparison with Agent Teams](/comparisons#agent-teams) - feature-by-feature comparison
