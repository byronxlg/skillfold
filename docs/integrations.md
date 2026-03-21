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

The `--target cursor` flag generates `.mdc` rule files with Cursor-specific YAML frontmatter (`description`, `alwaysApply: true`).

```bash
npx skillfold --target cursor
```

This outputs to `.cursor/` by default:

```
.cursor/
  rules/
    engineer.mdc
    reviewer.mdc
    orchestrator.mdc
```

Alternatively, use `.agents/skills/` if your Cursor version supports it:

```bash
npx skillfold --out-dir .cursor/skills
```

## VS Code (GitHub Copilot)

The `--target copilot` flag generates a root `copilot-instructions.md` (with orchestrator plan when a team flow exists) and per-agent instruction files with Copilot-specific frontmatter (`applyTo`, `description`).

```bash
npx skillfold --target copilot
```

This outputs to `.github/` by default:

```
.github/
  copilot-instructions.md
  instructions/
    engineer.instructions.md
    reviewer.instructions.md
```

Alternatively, compile raw skills to a directory Copilot scans:

```bash
npx skillfold --out-dir .github/skills
```

## OpenAI Codex

The `--target codex` flag generates a single `AGENTS.md` file containing all agent sections and the orchestrator plan.

```bash
npx skillfold --target codex
```

This outputs to `build/` by default:

```
build/
  AGENTS.md
```

Alternatively, compile raw skills to `.agents/skills/`:

```bash
npx skillfold --out-dir .agents/skills
```

This directory structure works well for monorepos where different subdirectories have different agent configurations.

## Windsurf

The `--target windsurf` flag generates `.md` rule files with Windsurf-specific YAML frontmatter (`trigger: always_on`, `description`).

```bash
npx skillfold --target windsurf
```

This outputs to `.windsurf/` by default:

```
.windsurf/
  rules/
    engineer.md
    reviewer.md
    orchestrator.md
```

## Gemini CLI

Use `--target gemini` to generate Gemini CLI subagent files and skills:

```bash
npx skillfold --target gemini
```

This writes to `.gemini/` by default:

```
.gemini/
  agents/
    engineer.md          # Agent with Gemini frontmatter
    reviewer.md
  skills/
    engineer/SKILL.md    # Standard Agent Skills format
    reviewer/SKILL.md
```

Agent files include Gemini-specific YAML frontmatter (`name`, `description`, `model`, `tools`, `max_turns`, `timeout_mins`, `temperature`, `kind`). Use `agentConfig` in your `skillfold.yaml` to set `model`, `tools`, and `maxTurns` (mapped to `max_turns`).

Alternatively, use the cross-platform skill output without agents:

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

The [skills CLI](https://skills.sh) (`npx skills add`) installs and updates individual SKILL.md files. Skillfold sits one layer above it: composing multiple skills into agents, adding typed state schemas, and validating execution flows at compile time. They're complementary.

### Installing skillfold skills

Install all 11 library skills from the skillfold package:

```bash
npx skills add byronxlg/skillfold
```

Or install a specific skill:

```bash
npx skills add byronxlg/skillfold -s code-review
npx skills add byronxlg/skillfold -s planning
npx skills add byronxlg/skillfold -s testing
```

The skills CLI reads the `agentskills` field in skillfold's `package.json` to discover available skills and their paths. Each skill installs as a standard `SKILL.md` file under your skills directory.

See the [skills CLI leaderboard](https://skills.sh) for more installable skills from the ecosystem.

### Composing installed skills into pipelines

Once you have individual skills installed, use skillfold to compose them into a validated pipeline:

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
npx skillfold --target claude-code
npx skillfold --target cursor
npx skillfold --target windsurf
npx skillfold --target codex
npx skillfold --target copilot
```

Or use the cross-client `.agents/skills/` path, which most platforms scan alongside their native directory:

```bash
npx skillfold --out-dir .agents/skills
```