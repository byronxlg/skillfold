# awesome-claude-code Submission Draft

Submit this via the GitHub web UI at:
https://github.com/hesreallyhim/awesome-claude-code/issues/new?template=recommend-resource.yml

Earliest submission date: March 26, 2026 (repo must be at least one week old).

---

## Form Fields

**Display Name:** Skillfold

**Category:** Tooling

**Sub-Category:** Tooling: Orchestrators

**Primary Link:** https://github.com/byronxlg/skillfold

**Author Name:** byronxlg

**Author Link:** https://github.com/byronxlg

**License:** MIT

**Description:**

YAML pipeline compiler that ships as a Claude Code plugin. Define skills once, compose them into agents, wire agents into typed team flows, and compile directly to `.claude/agents/*.md` and `.claude/skills/*/SKILL.md` with `--target claude-code`. Includes a `/skillfold` slash command via the built-in plugin, and `skillfold adopt` to convert existing Claude Code agent setups into a managed pipeline. Also compiles to the portable SKILL.md format for Cursor, VS Code Copilot, Codex, Gemini CLI, and 26 other platforms.

**Validate Claims:**

Install and scaffold a pipeline, then compile to Claude Code's native layout:

```bash
npm install skillfold
npx skillfold init demo --template dev-team
cd demo
npx skillfold --target claude-code
```

Inspect the generated output:

```bash
ls .claude/agents/
# engineer.md  orchestrator.md  planner.md  reviewer.md

cat .claude/agents/engineer.md | head -30

ls .claude/skills/
# engineer/  orchestrator/  planner/  reviewer/

cat .claude/skills/engineer/SKILL.md | head -20
```

You should see `.claude/agents/*.md` files with agent instructions and `.claude/skills/*/SKILL.md` files with YAML frontmatter and composed skill bodies.

For existing Claude Code projects with agents in `.claude/agents/`:

```bash
npx skillfold adopt
npx skillfold --target claude-code
```

This round-trips your existing agents through the compiler, producing identical output from a managed config.

**Specific Task(s):**

1. Run `npx skillfold init demo --template dev-team && cd demo && npx skillfold --target claude-code` to scaffold and compile a pipeline to Claude Code format.
2. Inspect `.claude/agents/engineer.md` to see the composed agent instructions.
3. Inspect `.claude/skills/engineer/SKILL.md` to see the YAML frontmatter and skill body.
4. Run `npx skillfold graph` to see the Mermaid flowchart of the team flow.

**Specific Prompt(s):**

Try this workflow in a test project to see skillfold in action with Claude Code:

```bash
# 1. Install and scaffold a demo pipeline
npm install skillfold
npx skillfold init demo --template dev-team
cd demo

# 2. Compile to Claude Code's native agent layout
npx skillfold --target claude-code

# 3. Inspect the generated Claude Code agents
cat .claude/agents/engineer.md
cat .claude/agents/reviewer.md

# 4. Inspect the compiled skills with YAML frontmatter
cat .claude/skills/engineer/SKILL.md
cat .claude/skills/orchestrator/SKILL.md

# 5. See the team flow as a Mermaid diagram
npx skillfold graph
```

The `/skillfold` slash command is available when using the built-in plugin at `node_modules/skillfold/plugin/`. Add it to your Claude Code project settings to get the slash command and all 11 library skills.

**Additional Comments:**

Skillfold is the only compile-time tool in the Orchestrators category. Every other orchestrator listed runs at execution time - a daemon, server, or SDK that sits between the agent and the platform. Skillfold runs once at build time, produces static files, and gets out of the way. No runtime dependency, no process to manage, no SDK to learn.

The project self-hosts its own dev team through its own config (`skillfold.yaml` in the repo root defines 7 agents that build and maintain the project). This is the strongest validation of the tool: it compiles the pipeline that builds itself.
