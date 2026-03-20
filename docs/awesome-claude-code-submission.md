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

YAML pipeline compiler with native Claude Code integration. Install the plugin for `/skillfold` slash command access, or use `--target claude-code` to compile directly to `.claude/agents/*.md` layout. Define atomic skills once, compose them into agents, wire agents into typed team flows with conditional routing and parallel map, and compile to standard SKILL.md files. Works across Claude Code, Cursor, Codex, and Gemini CLI.

**Validate Claims:**

Scaffold and compile a pipeline directly to Claude Code agent layout:

```bash
npx skillfold init demo --template dev-team
cd demo
npx skillfold --target claude-code
```

Inspect the output - you'll see `.claude/agents/planner.md`, `.claude/agents/engineer.md`, `.claude/agents/reviewer.md` with composed skill instructions and YAML frontmatter.

To see the generated orchestrator execution plan:

```bash
cat .claude/agents/planner.md
```

To adopt an existing Claude Code project that already has agents in `.claude/agents/`:

```bash
npx skillfold adopt
npx skillfold --target claude-code
```

This round-trips existing agent files through the compiler and back to `.claude/agents/` layout.

**Specific Task(s):**

1. Run `npx skillfold init demo --template dev-team && cd demo && npx skillfold --target claude-code` to scaffold and compile a pipeline to Claude Code layout.
2. Inspect `.claude/agents/engineer.md` to see composed skill instructions with YAML frontmatter.
3. Run `npx skillfold graph` to see the Mermaid flowchart of the team flow.

**Specific Prompt(s):**

Install the skillfold plugin for Claude Code:

```bash
npm install skillfold
```

Add the plugin to `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "node_modules/skillfold/plugin"
    ]
  }
}
```

Then use the `/skillfold` slash command in Claude Code to compile your pipeline.

Alternatively, compile directly to Claude Code agent layout without the plugin:

```bash
npx skillfold init my-team --template dev-team
cd my-team
npx skillfold --target claude-code
```

This generates `.claude/agents/*.md` files ready for Claude Code to use immediately.

**Additional Comments:**

Skillfold is a compile-time orchestrator - no runtime agent framework, no SDK, no daemon. The compiler validates skill references, state types, write conflicts, and cycle exit conditions before any agent runs. Atomic skills compose recursively into agents, and team flows define the execution graph with typed state. The output is plain Markdown files that Claude Code reads natively. Ships with 11 reusable library skills and 3 example pipeline configs.
