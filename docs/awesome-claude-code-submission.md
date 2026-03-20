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

YAML pipeline compiler for multi-agent teams. Define atomic skills once, compose them into agents, wire agents into typed team flows with conditional routing and parallel map, and compile to standard SKILL.md files. Includes `skillfold adopt` to convert existing Claude Code agent setups into a pipeline config.

**Validate Claims:**

Install and run against an existing Claude Code project that has agents in `.claude/agents/`:

```bash
npx skillfold adopt
```

This reads the existing agent files, creates a skill directory for each one, and generates a `skillfold.yaml` config. Then compile:

```bash
npx skillfold
```

The output in `build/` contains one SKILL.md per agent with YAML frontmatter, matching the original agent instructions. The round-trip proves the compiler works with real agent setups.

For a fresh start without existing agents:

```bash
npx skillfold init my-team --template dev-team
cd my-team
npx skillfold
```

This scaffolds a three-agent pipeline (planner, engineer, reviewer) with a review loop, compiles it, and produces SKILL.md files in `build/`.

**Specific Task(s):**

1. Run `npx skillfold init demo --template dev-team && cd demo && npx skillfold` to scaffold and compile a pipeline.
2. Inspect `build/orchestrator/SKILL.md` to see the generated execution plan with numbered steps, state table, and conditional branches.
3. Run `npx skillfold graph` to see the Mermaid flowchart of the team flow.

**Specific Prompt(s):**

Not applicable - skillfold is a CLI compiler, not a Claude Code skill. It compiles config into SKILL.md files that Claude Code (and other platforms) consume. The value is in the compilation step, not in a Claude Code prompt.

To see it in action: `npx skillfold init demo --template dev-team && cd demo && npx skillfold && cat build/orchestrator/SKILL.md`

**Additional Comments:**

Skillfold is the only YAML-to-SKILL.md compiler with typed skill composition, team flows, and orchestrator generation. It ships with 11 reusable atomic skills (planning, research, code-writing, testing, etc.) and 3 example pipeline configs. The project self-hosts its own dev team via its own config. Also supports `--target claude-code` to compile directly to `.claude/agents/*.md` layout, and `skillfold plugin` to package pipelines as distributable Claude Code plugins.
