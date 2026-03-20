# awesome-claude-code Submission Draft

> **WARNING: This submission MUST be filed manually via the web UI by a human.**
> The `gh` CLI cannot submit issue forms. A human must open the link below,
> fill in each field, and submit.

Submit via the GitHub web UI at:
https://github.com/hesreallyhim/awesome-claude-code/issues/new?template=recommend-resource.yml

Earliest submission date: ~April 3, 2026 (cooldown expiry).

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

Compile-time pipeline compiler for Claude Code. Define atomic skills in YAML, compose them into agents, and compile directly to `.claude/agents/*.md` with `--target claude-code` - no runtime, no SDK, no daemon. Ships with a `/skillfold` slash command plugin and an `adopt` command that converts existing Claude Code agents into a managed pipeline.

**Validate Claims:**

```bash
npx skillfold init demo --template dev-team && cd demo && npx skillfold --target claude-code && ls .claude/agents/ && head -20 .claude/agents/engineer.md
```

This scaffolds a three-agent pipeline, compiles it to Claude Code agent layout, and shows that each agent file contains composed skill instructions with YAML frontmatter.

**Specific Task(s):**

Run the command above and inspect the compiled agent files in `.claude/agents/`. Each file contains composed skill instructions from multiple atomic skills, with YAML frontmatter.

**Specific Prompt(s):**

Install the skillfold plugin:

```bash
npm install skillfold
```

Then tell Claude Code: "Use /skillfold to compile the pipeline and show me the generated agents." After compiling with `--target claude-code`, a `/run-pipeline` slash command is generated that orchestrates the compiled agents.

**Additional Comments:**

Every other orchestrator in the awesome-claude-code list is a runtime tool - it launches agents, manages sessions, and coordinates execution while agents run. Skillfold is the only compile-time tool in the category. It validates skill references, state types, write conflicts, and cycle exit conditions at build time, then produces plain Markdown files that Claude Code reads natively. When a pipeline has a team flow, the compiler also generates an executable `/run-pipeline` command that orchestrates the agents with a step-by-step execution plan, state table, and Agent tool invocations. There is no process to run, no server to start, and no SDK to integrate. The compiler has 322 tests, a single dependency (yaml), and runs on Node 20+.
