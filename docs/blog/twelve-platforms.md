---
title: "One Config, Twelve Platforms"
description: How skillfold compiles the same YAML config to Claude Code, Cursor, Windsurf, Copilot, Codex, Gemini, Goose, Roo Code, Kiro, Junie, Agent Teams, and standard SKILL.md files.
date: 2026-03-21
---

# One Config, Twelve Platforms

When we started building skillfold, the only output target was standard `SKILL.md` files. One config, one format, one output. Then Cursor happened.

A user asked: "Can I compile to `.cursor/rules/*.mdc` instead?" The format was different - frontmatter with `description`, `globs`, and `alwaysApply` fields instead of YAML frontmatter - but the content was the same composed skill body. We added `--target cursor` in v1.5.0. The compiler already had the skill composition and validation pipeline; adding a new output format was a thin layer on top.

Then Windsurf, Codex, Copilot, Gemini. Each platform has its own file layout and frontmatter conventions, but the underlying skill content is identical. The compiler handles the translation.

## The format fragmentation problem

Every AI coding tool invented its own way to store agent instructions:

| Platform | Location | Format |
|----------|----------|--------|
| Claude Code | `.claude/agents/*.md` | YAML frontmatter + markdown |
| Cursor | `.cursor/rules/*.mdc` | Custom frontmatter + markdown |
| Windsurf | `.windsurf/rules/*.md` | Markdown with metadata |
| Copilot | `.github/instructions/*.instructions.md` | Markdown |
| Codex | `AGENTS.md` | Single markdown file |
| Gemini | `.gemini/agents/*.md` | YAML frontmatter + markdown |
| Goose | `.goosehints` | Single hints file |
| Roo Code | `.roo/skills/` + `.roomodes` | JSON + markdown |
| Kiro | `.kiro/skills/` + `.kiro/steering/` | Markdown |
| Junie | `.junie/skills/` + `.junie/AGENTS.md` | Markdown |

If you have five agents sharing three skills across three platforms, that is 45+ files to keep in sync. Change one shared instruction and you need to update every copy in every format.

This is the problem skillfold solves. Define skills once, compose them into agents, and let the compiler handle the format translation.

## How the target system works

Each compilation target is a function that takes the compiled skill tree and emits files in the target platform's format. The interface is simple: receive agent names, their composed skill bodies, optional config (model, MCP servers, tools), and the orchestrator plan. Emit files.

```bash
# Same config, different outputs
npx skillfold --target claude-code   # .claude/agents/ + .claude/skills/
npx skillfold --target cursor        # .cursor/rules/
npx skillfold --target agent-teams   # .claude/commands/start-team.md
npx skillfold --target codex         # AGENTS.md
```

The compile step runs in under a second. The output is deterministic - same config always produces the same files. Delete skillfold and the compiled files still work. There is no lock-in.

## Agent Teams: the exception

Most targets emit static files that agents read on their own. Agent Teams is different. Instead of individual agent files, it generates a team bootstrap prompt that describes the team structure, shared state, task sequence, and coordination rules. When you run `/start-team` in Claude Code, it spawns teammates that coordinate through a shared task list.

This means the same `skillfold.yaml` can drive both approaches: `--target claude-code` for subagent-based execution where agents run sequentially, or `--target agent-teams` for conversational coordination where teammates message each other.

## What made this possible

Two design decisions made multi-target compilation practical:

1. **Composition happens before emission.** The compiler resolves all skill references, concatenates bodies, validates state types, and checks flow integrity. By the time a target function runs, the input is fully resolved. Each target only needs to format and write files.

2. **The output is disposable.** Compiled files are generated artifacts, like compiled binaries. Delete them, recompile, and they come back. This means adding a new target has zero risk to existing targets. The worst case is that the new target's output is wrong, and you delete it.

Adding a new target typically takes 100-200 lines of TypeScript. The Goose target is the simplest - it emits a single `.goosehints` file. The Roo Code target is the most complex - it generates `.roo/skills/` directories, `.roo/rules-{slug}/` directories, and a `.roomodes` JSON file.

## What's next

Twelve is enough for now. The Agent Skills ecosystem is converging on similar patterns, and most major platforms are covered. When the next tool appears with its own file format, adding it will be a small PR.

The harder problem is not more targets - it is making the existing targets richer. Per-agent model selection, MCP server configuration, and tool permissions vary across platforms. The `agentConfig` section already supports these for Claude Code; extending them to other targets is the next step.

If your platform is not on the list, [open an issue](https://github.com/byronxlg/skillfold/issues). The pattern is established and we are happy to add more.
