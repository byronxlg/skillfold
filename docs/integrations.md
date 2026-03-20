# Platform Integration

Skillfold compiles your pipeline config into `build/<agent>/SKILL.md` files. To use them with your platform, compile to the directory your platform reads from.

## Cross-Platform

The `.agents/skills/` directory is the cross-client standard, scanned by Cursor, VS Code Copilot, OpenAI Codex, and Gemini CLI.

```bash
npx skillfold --out-dir .agents/skills
```

## Claude Code

Claude Code reads skills from `.claude/skills/`.

```bash
npx skillfold --out-dir .claude/skills
```

Result:

```
.claude/skills/
  engineer/SKILL.md
  reviewer/SKILL.md
  orchestrator/SKILL.md
```

Claude Code auto-discovers skills in this directory. No additional configuration needed.

## Cursor

Cursor reads skills from `.cursor/skills/` and `.agents/skills/`.

```bash
npx skillfold --out-dir .cursor/skills
```

## VS Code (GitHub Copilot)

VS Code Copilot reads skills from `.github/skills/`, `.agents/skills/`, and `.claude/skills/`.

```bash
npx skillfold --out-dir .github/skills
```

Enable skills in VS Code settings:

```json
{
  "chat.useAgentSkills": true
}
```

## OpenAI Codex

Codex reads skills from `.codex/skills/` and `.agents/skills/`.

```bash
npx skillfold --out-dir .agents/skills
```

Codex scans `.agents/skills/` in every directory between the project root and cwd, which works well for monorepos.

## Gemini CLI

Gemini CLI reads skills from `.gemini/skills/` and `.agents/skills/`.

```bash
npx skillfold --out-dir .gemini/skills
```

You can verify skills are loaded with `gemini skills list`.

## CI Integration

Add `skillfold --check` to your CI pipeline to verify compiled output stays in sync with your config:

```yaml
- run: npx skillfold --check --out-dir .agents/skills
```

This exits with code 1 if the compiled output is stale, catching cases where someone edits the config but forgets to recompile.

## Multiple Platforms

If your team uses different platforms, compile to each target:

```bash
npx skillfold --out-dir .claude/skills
npx skillfold --out-dir .agents/skills
```

Or use the cross-client `.agents/skills/` path, which most platforms scan alongside their native directory.