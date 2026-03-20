# awesome-claude-code Submission Draft

IMPORTANT: This submission MUST be done via the GitHub web UI by a human.
Do NOT attempt to submit programmatically.

Submit at:
https://github.com/hesreallyhim/awesome-claude-code/issues/new?template=recommend-resource.yml

Earliest submission date: ~April 3, 2026 (cooldown expiration from previous submission).

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

Configuration language and compiler for multi-agent AI pipelines. Compiles YAML config into standard SKILL.md files - define skills once, compose them into agents, wire agents into typed execution flows with conditional routing and parallel map. Ships with a Claude Code plugin and `--target claude-code` for native `.claude/agents/` output.

**Validate Claims:**

```bash
npx skillfold init demo --template dev-team
cd demo
npx skillfold --target claude-code
cat .claude/agents/engineer.md
```

The engineer agent file contains composed instructions from planning + code-writing + testing skills, with YAML frontmatter for Claude Code.

**Specific Task(s):**

Run `npx skillfold init demo --template dev-team && cd demo && npx skillfold --target claude-code` to scaffold a 3-agent pipeline and compile it to Claude Code layout. Inspect `.claude/agents/engineer.md` to see composed skill instructions.

**Specific Prompt(s):**

After installing the plugin (`npm install skillfold`), use the `/skillfold` slash command in Claude Code to compile your pipeline config.

**Additional Comments:**

Unlike the other orchestrators in this section (Claude Squad, Crystal, sudocode, TSK, etc.), Skillfold is not a runtime framework - it has no daemon, no SDK, no process manager. It is a compiler that runs once and produces plain Markdown files. The compiled output works with Claude Code natively. This makes it complementary to runtime orchestrators rather than competitive with them.
