# Platform Integration

Skillfold compiles your pipeline config into `build/<agent>/SKILL.md` files. To use them with your platform, compile to the directory your platform reads from.

## Cross-Platform

The `.agents/skills/` directory is scanned by VS Code Copilot, OpenAI Codex, and Gemini CLI alongside their native paths.

```bash
npx skillfold --out-dir .agents/skills
```

## Claude Code

Claude Code reads skills from `.claude/skills/` and agents from `.claude/agents/`.

### Option 1: Skills only (default output)

```bash
npx skillfold --out-dir .claude/skills
```

### Option 2: Skills + agents (claude-code target)

The `--target claude-code` flag generates both skill files and agent markdown files with frontmatter (name, description, model, color) and role-based metadata.

```bash
npx skillfold --target claude-code
```

This outputs to `.claude/` by default:

```
.claude/
  skills/
    engineer/SKILL.md
    reviewer/SKILL.md
    orchestrator/SKILL.md
  agents/
    engineer.md
    reviewer.md
    orchestrator.md
```

Agent files include reads/writes from the team flow, composed skill instructions, and color-coded role assignments.

### Option 3: Plugin installation

The `skillfold plugin` command packages your pipeline as a distributable Claude Code plugin:

```bash
npx skillfold plugin
```

This produces a `plugin/` directory with `.claude-plugin/plugin.json`, agents, skills, and an optional slash command for the orchestrator. Install by copying the plugin directory or referencing it from your project.

Skillfold also ships a built-in plugin at `node_modules/skillfold/plugin/` with 11 generic skills and a `/skillfold` slash command.

### Option 4: Marketplace installation

Install the skillfold plugin directly from the Claude Code plugin marketplace:

```
/plugin marketplace add byronxlg/skillfold
/plugin install skillfold@skillfold
```

This installs the same 11 skills and `/skillfold` slash command from the npm package. No local config or compilation needed.

Skills and agents are auto-discovered at session start. No additional configuration needed.

## Cursor

Cursor reads rules from `.cursor/rules/` as `.mdc` files with YAML frontmatter. It does not natively scan `SKILL.md` files. Use `.agents/skills/` if your Cursor version supports it, or copy compiled output manually.

```bash
npx skillfold --out-dir .cursor/skills
```

## VS Code (GitHub Copilot)

VS Code Copilot reads skills from `.github/skills/`, `.claude/skills/`, and `.agents/skills/`.

```bash
npx skillfold --out-dir .github/skills
```

## OpenAI Codex

Codex reads skills from `.agents/skills/`, scanning every directory between the project root and cwd.

```bash
npx skillfold --out-dir .agents/skills
```

This directory structure works well for monorepos where different subdirectories have different agent configurations.

## Gemini CLI

Gemini CLI reads skills from `.gemini/skills/` and `.agents/skills/`.

```bash
npx skillfold --out-dir .gemini/skills
```

Verify loaded skills with `gemini skills list`.

## CI Integration

Add `skillfold --check` to your CI pipeline to verify compiled output stays in sync with your config:

```yaml
- run: npx skillfold --check --out-dir .agents/skills
```

This exits with code 1 if the compiled output is stale, catching cases where someone edits the config but forgets to recompile.

## Working with the Skills CLI

If you already manage individual skills with the [skills CLI](https://skills.sh) (`npx skills add`), skillfold sits one layer above it. The skills CLI installs and updates individual SKILL.md files. Skillfold composes multiple skills into agents, adds typed state schemas, and validates execution flows at compile time. They're complementary.

### Before: individual skills, managed separately

```
~/.agents/skills/
  code-review/SKILL.md
  planning/SKILL.md
  testing/SKILL.md
  code-writing/SKILL.md
```

Each agent references skills independently. No shared schema, no flow validation.

### After: composed agents with typed coordination

```yaml
# skillfold.yaml
skills:
  atomic:
    code-review: https://github.com/your-org/agent-skills/tree/main/skills/code-review
    planning: ./skills/planning
    testing: ./skills/testing
    code-writing: ./skills/code-writing
  composed:
    engineer:
      compose: [planning, code-writing, testing]
    reviewer:
      compose: [code-review, testing]

state:
  code: { type: string }
  review: { type: Review }
  Review: { approved: bool, feedback: string }

team:
  flow:
    - engineer:
        writes: [state.code]
      then: reviewer
    - reviewer:
        reads: [state.code]
        writes: [state.review]
      then:
        - when: review.approved == true
          to: end
        - when: review.approved == false
          to: engineer
```

Compile to your existing skills directory:

```bash
npx skillfold --out-dir ~/.agents/skills
```

The compiled output is standard SKILL.md files, so it slots directly into your `~/.agents/` structure. Existing skills you reference by GitHub URL are fetched and composed at build time.

## Multiple Platforms

If your team uses different platforms, compile to each target:

```bash
npx skillfold --out-dir .claude/skills
npx skillfold --out-dir .agents/skills
```

Or use the cross-client `.agents/skills/` path, which most platforms scan alongside their native directory.