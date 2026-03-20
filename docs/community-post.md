# You don't need a runtime orchestrator to coordinate your agents

If you're running multiple Claude Code agents with hand-written SKILL.md files, you've probably hit the point where copy-pasting instructions between agents stops working. One agent's context drifts from another's. You rename a step in the orchestrator but forget to update the reviewer. The testing instructions exist in three places and none of them agree.

This is the multi-agent coordination problem, and the default answer is a runtime orchestrator - a framework that sits between your agents, routing messages and managing state while they run. But there's a simpler option that most teams overlook: do the orchestration at compile time.

## The insight

Your agents don't need a runtime coordinator if their instructions are already consistent before they start. The orchestration problem is really a configuration management problem. You have shared context (what skills each agent needs), a dependency graph (who runs after whom), and typed state (what each agent reads and writes). All of this can be validated and assembled ahead of time.

## How it works with Skillfold

Skillfold is a YAML-to-Markdown compiler. You define skills once, compose them into agents, wire agents into a team flow, and compile. The output is plain `.md` files - nothing running in the background.

Start by scaffolding a pipeline:

```bash
npx skillfold init my-team --template dev-team
cd my-team
```

This gives you a `skillfold.yaml` with three agents (planner, engineer, reviewer) wired into a flow with a review loop. Open it - the config is ~50 lines of YAML.

Each agent is a composition of atomic skills:

```yaml
skills:
  composed:
    engineer:
      compose: [planning, code-writing, testing]
      description: "Implements the plan by writing production code and tests."
```

The team flow defines execution order, state reads/writes, and conditional routing:

```yaml
team:
  flow:
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

Compile directly to Claude Code layout:

```bash
npx skillfold --target claude-code
```

This generates `.claude/agents/planner.md`, `.claude/agents/engineer.md`, and `.claude/agents/reviewer.md` - each with the right composed skills and YAML frontmatter. The compiler validates that every skill reference resolves, every state path exists, no two agents write the same state, and every cycle has an exit condition. Errors surface at compile time, not when an agent is halfway through a task.

## What you get

- **Single source of truth**: Skills defined once, composed into as many agents as needed
- **Compile-time validation**: Broken references, type mismatches, and write conflicts caught before agents run
- **No runtime dependency**: Output is Markdown files that Claude Code reads natively
- **Portable**: Same config compiles to Claude Code, Cursor, Codex, or Gemini CLI targets

## Already have agents?

If you have existing `.claude/agents/` files, you don't need to start from scratch:

```bash
npx skillfold adopt
```

This reads your current agent files, extracts skills, and generates a `skillfold.yaml` config. From there you can refactor shared instructions into atomic skills and let the compiler keep everything in sync.

## Get started

```bash
npx skillfold init my-team --template dev-team
cd my-team
npx skillfold --target claude-code
```

Three commands, working pipeline. The repo is at [github.com/byronxlg/skillfold](https://github.com/byronxlg/skillfold) with a getting-started guide and example configs for common patterns (dev teams, content pipelines, code review bots).
