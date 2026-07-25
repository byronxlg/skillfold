---
title: Microsoft ships stable Agent Skills for .NET and Python
description: Microsoft's Agent Framework made SKILL.md a stable, two-language API this month, and what that does and does not mean for anyone managing skills.
date: 2026-07-25
tags: [ecosystem]
---

Eight days apart, Microsoft moved Agent Skills support in its Agent
Framework from experimental to stable, first for .NET on July 7, 2026, then
for Python on July 15, 2026. Both posts explicitly point at
[agentskills.io](https://agentskills.io) as the spec they're implementing.
That's worth pausing on, because it's a data point about who now treats
`SKILL.md` as infrastructure worth a stable API, not just a convention
Claude clients happen to read.

## What actually shipped

The [.NET announcement](https://devblogs.microsoft.com/agent-framework/agent-skills-for-net-is-now-released/)
describes removing the `[Experimental]` attribute from the Agent Skills
API, promoting it to production-ready. The
[Python announcement](https://devblogs.microsoft.com/agent-framework/agent-skills-for-python-is-now-released/)
is more direct about it: "Agent Skills for Python in Microsoft Agent
Framework is stable and shipping: the core skills API has no experimental
gate."

Both languages support three ways to author a skill:

- **File-based skills** - a directory with a `SKILL.md` file, optionally
  bundling scripts and reference docs. This is the same shape
  `agentskills.io` specifies and the same shape skillfold installs.
- **Class-based skills** - a C# class or Python class, distributed as a
  NuGet or PyPI package.
- **Code-defined skills** - skills constructed dynamically at runtime
  inside application code.

Both posts describe the same progressive-disclosure loading pattern the
spec itself uses: advertise a skill's name and description first, load the
full instructions only when a task matches, then pull in bundled scripts or
reference files as needed. The Python post frames it as four steps
("advertise skill names → load instructions → read resources → run
scripts"), the spec's own overview frames it as three (discovery,
activation, execution) - same mechanism, different granularity of
description, not a disagreement.

## Why this is more than another integration

`agentskills.io`'s client showcase - fetched July 25, 2026 - lists 44
adopting tools: terminal agents (Claude Code, OpenAI Codex, Gemini CLI,
OpenCode, Goose), editors (VS Code, Cursor, JetBrains' Junie), and
platforms (Snowflake Cortex Code, Databricks Genie Code). Most of those are
end-user products reading `SKILL.md` directories that someone else wrote.

Microsoft's Agent Framework is a different kind of adopter: it's an SDK
people use to *build* agents, and it just gave `SKILL.md` a stable,
non-experimental API alongside two other authoring paths that aren't
file-based at all. That's a vendor betting that file-based skills are worth
committing to as a public contract, not an experimental flag they might
pull next quarter.

It's also not the first SDK to add `SKILL.md` support - Spring AI shipped
a generic Agent Skills implementation back on
[January 13, 2026](https://spring.io/blog/2026/01/13/spring-ai-generic-agent-skills/),
built specifically to work "across many LLM providers." But that
implementation ships under the `spring-ai-community` group ID at version
0.4.2 against a Spring AI milestone build, and its own "Current
Limitations" section flags unsandboxed script execution and no
human-in-the-loop controls. Microsoft's release, by contrast, leads with
production concerns: the .NET and Python posts both describe
human-in-the-loop approval, controlled script execution, filtering,
caching, and an extensible source pipeline for custom skill discovery. The
gap between those two isn't the file format - both read the same
`SKILL.md` - it's how much a vendor is willing to say "you can run this in
production, unattended, against untrusted skill content."

## What this doesn't solve

A stable API in one more SDK doesn't make the ecosystem interoperable. Each
of those 44 clients, and now the Agent Framework, still has its own
discovery convention - where it looks for skills, what it expects
alongside `SKILL.md`, how it resolves updates. `agentskills.io` standardizes
the file format inside the directory; it doesn't standardize where the
directory lives or how it gets there.

That's the gap skillfold works in, and this release doesn't close it either
- it makes it slightly bigger. Skillfold today installs into two targets,
`claude` and `codex`, mapping to fixed locations (`.claude/skills` /
`.agents/skills`, and a managed block in `AGENTS.md` for Codex; see
[`src/targets.ts`](https://github.com/byronxlg/skillfold/blob/main/src/targets.ts)).
It has no idea where the Agent Framework expects a file-based skill
directory to sit, so a manifest-managed skill doesn't reach it without a
new target being taught to skillfold deliberately. And the class-based and
code-defined authoring paths aren't directories at all - they're code,
shipped through NuGet or PyPI, with their own versioning and audit story.
A lockfile built for pinning and hashing file trees has nothing to say
about a C# class compiled into a package.

So the honest read is narrower than "the standard won": one more vendor
now has a stable reason to keep `SKILL.md` working, which is good news for
anyone betting on the format's durability. It is not evidence that
installing a skill into any given tool got easier this month.

## Sources

- [Agent Skills for .NET Is Now Released](https://devblogs.microsoft.com/agent-framework/agent-skills-for-net-is-now-released/), Microsoft Agent Framework blog, July 7, 2026
- [Agent Skills for Python Is Now Released](https://devblogs.microsoft.com/agent-framework/agent-skills-for-python-is-now-released/), Microsoft Agent Framework blog, July 15, 2026
- [agentskills.io](https://agentskills.io), specification overview and client showcase, accessed July 25, 2026
- [Spring AI generic Agent Skills](https://spring.io/blog/2026/01/13/spring-ai-generic-agent-skills/), Spring blog, January 13, 2026
