# You do not need a runtime orchestrator to coordinate your agents

You have five agents sharing three skills. You change one skill and now you have to update five files manually. Copy-paste the new instructions into each agent's SKILL.md. Miss one and get inconsistent behavior. This is the reality for any Claude Code project that grows past two agents.

## The problem: manual SKILL.md management does not scale

Each agent in Claude Code gets a SKILL.md (or an agent markdown file). When agents share capabilities - code review instructions, testing standards, planning frameworks - those instructions get duplicated. Update your testing approach? Touch every file that mentions it. Add a new shared convention? Same thing. The number of files you maintain grows with the product of agents and shared skills.

This is not a tooling gap that runtime orchestrators solve. Adding a daemon or SDK between your agents and Claude Code introduces a new dependency that runs during execution, intercepts agent communication, and needs its own configuration. The coordination problem is simpler than that.

## The insight: orchestration at compile time

The shared-skill problem is a composition problem. You want to define a skill once and have it appear in every agent that needs it. You want to change it in one place. You want the computer to do the concatenation.

This is what compilers do. Skillfold is a compiler for agent pipelines. You write a YAML config that declares your skills, composes them into agents, and optionally wires agents into a team flow. The compiler reads your config and produces the output files your platform expects.

No process running during execution. No SDK wrapping your agents. Just a build step that produces static files.

## Walkthrough

Install and scaffold a pipeline from a template:

```bash
npm install skillfold
npx skillfold init my-team --template dev-team
cd my-team
```

This creates a `skillfold.yaml` with three agents (planner, engineer, reviewer) wired into a flow with a review loop. The config looks like this:

```yaml
skills:
  atomic:
    planning: ./skills/planning
    coding: ./skills/coding
    review: ./skills/review
  composed:
    engineer:
      compose: [planning, coding]
      description: "Implements the plan and writes tests."
```

The `engineer` agent composes two atomic skills. Change the planning skill and every agent that uses it gets the update on next compile.

Compile to Claude Code's native layout:

```bash
npx skillfold --target claude-code
```

Output:

```
.claude/
  agents/
    engineer.md
    planner.md
    reviewer.md
    orchestrator.md
  skills/
    engineer/SKILL.md
    planner/SKILL.md
    reviewer/SKILL.md
    orchestrator/SKILL.md
```

Each agent markdown file contains the composed instructions. Each SKILL.md has YAML frontmatter and the concatenated skill bodies. These are standard files that Claude Code reads natively - no plugin or runtime required.

## What this is not

Skillfold is not a daemon. It does not run alongside your agents. It does not intercept messages. It does not require an API key or a server. It does not wrap Claude Code in an SDK.

It is a compiler. It runs once, produces files, and exits. The output is plain text that any Agent Skills-compatible platform can read - Claude Code, Cursor, VS Code Copilot, Codex, Gemini CLI, and others.

## The difference for your workflow

With manual management, adding a sixth agent that shares existing skills means copying instructions from other agent files and keeping them in sync going forward. With skillfold, you add one entry to the `composed` section of your config and run the compiler.

Changing a shared skill means editing one file instead of N files. The compiler handles the rest. If you have a team flow, it validates state reads and writes at compile time, catches unreachable nodes, and generates an orchestrator plan.

## Try it

If you have existing Claude Code agents:

```bash
npx skillfold adopt
```

This reads your `.claude/agents/` directory, creates a skill for each agent, and generates a `skillfold.yaml`. Your agents keep working exactly as before, but now you can start extracting shared instructions into reusable skills.

Starting fresh:

```bash
npx skillfold init my-team
```

The compiler is open source, MIT licensed, and has a single dependency (`yaml`). It runs on Node.js 20+ and works anywhere npm does.

https://github.com/byronxlg/skillfold
