---
title: Five vendors agreed on a plugin folder. Distribution is still your problem.
description: Agent Plugins 1.0 gives skills and MCP servers one folder shape across six clients, then leaves versioning, pinning, and installation to someone else.
date: 2026-08-24
tags: [ecosystem]
---

<figure class="fig">
<svg viewBox="0 0 440 200" role="img" aria-labelledby="fig-t fig-d" xmlns="http://www.w3.org/2000/svg">
<title id="fig-t">What Agent Plugins standardizes, and what it leaves out</title>
<desc id="fig-d">A plugin folder with plugin.json, skills, and mcp.json feeds into six clients. Version pinning, a registry, and installation sit outside the spec, unfilled.</desc>
<rect x="4" y="6" width="180" height="120" rx="4" fill="#0d1219" stroke="#41b866"/>
<text x="94" y="24" text-anchor="middle" font-family="monospace" font-size="10" fill="#41b866">plugin/</text>
<text x="16" y="44" font-family="monospace" font-size="9" fill="#c9d3df">plugin.json</text>
<text x="16" y="64" font-family="monospace" font-size="9" fill="#c9d3df">skills/greet/</text>
<text x="26" y="80" font-family="monospace" font-size="9" fill="#828f9e">SKILL.md</text>
<text x="16" y="100" font-family="monospace" font-size="9" fill="#c9d3df">mcp.json</text>
<text x="200" y="70" font-family="monospace" font-size="16" fill="#41b866">→</text>
<rect x="224" y="6" width="212" height="120" rx="4" fill="#0d1219" stroke="#29323f"/>
<text x="330" y="24" text-anchor="middle" font-family="monospace" font-size="9.5" fill="#c9d3df">ChatGPT · Codex · Cursor</text>
<text x="330" y="40" text-anchor="middle" font-family="monospace" font-size="9.5" fill="#c9d3df">Copilot · Kiro · VS Code</text>
<text x="330" y="66" text-anchor="middle" font-family="monospace" font-size="9" fill="#d9a032">Claude Code: own format,</text>
<text x="330" y="80" text-anchor="middle" font-family="monospace" font-size="9" fill="#d9a032">.claude-plugin/plugin.json</text>
<rect x="4" y="146" width="432" height="46" rx="4" fill="#0d1219" stroke="#d9a032" stroke-dasharray="4 3"/>
<text x="220" y="164" text-anchor="middle" font-family="monospace" font-size="10" fill="#d9a032">out of scope: dependencies, version pinning,</text>
<text x="220" y="180" text-anchor="middle" font-family="monospace" font-size="10" fill="#d9a032">registries, installation, checksums</text>
</svg>
<figcaption>The spec fixes the shape of the folder. What fills it, pins it, and installs it is left to whoever consumes it - and Claude Code reads a differently-shaped folder entirely.</figcaption>
</figure>

On August 6, 2026, five companies that normally compete for the same
developer attention published a joint specification instead. [Agent Plugins
1.0.0](https://github.com/agentplugins/agent-plugins-spec), announced on
[Vercel's blog](https://vercel.com/blog/introducing-agent-plugins), defines a
single folder format for packaging Agent Skills and MCP servers so one
plugin can be built once and read by more than one AI coding tool. It is a
narrow spec, and the gap it leaves on purpose is exactly the ground
skillfold's lockfile already covers - which makes it worth reading closely
rather than taking on faith.

## What the spec actually standardizes

A plugin is a directory with a `plugin.json` manifest at its root. Per the
[specification](https://agent-plugins.org/specification), only two fields
are required:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "hello-plugin"
}
```

Everything else - `version`, `description`, `author`, `homepage`,
`repository`, `license`, `keywords` - is optional. Two component types sit
alongside the manifest: a `skills/` directory, where each immediate
subdirectory containing a `SKILL.md` file is treated as one skill built to
the separate [agentskills.io](https://agentskills.io/specification) format,
and an `mcp.json` file declaring `stdio` or HTTP-based MCP servers under a
`mcpServers` key. Client-specific behavior can be layered on through
reverse-domain namespaces under an `extensions` field, so a given client can
add its own metadata without breaking the portable core.

The project's [MAINTAINERS file](https://github.com/agentplugins/agent-plugins-spec)
names five Core Maintainers on the Technical Steering Committee: Clare
Liguori (Amazon), Roshan Sadanani (Cursor), Harald Kirschner (Microsoft),
Gav Verma (OpenAI), and Jonathan Hefner (Vercel, who holds the Lead Core
Maintainer role). Vercel's launch post states the format has support at
launch from ChatGPT, Codex, Cursor, GitHub Copilot, Kiro, and VS Code.

## What it deliberately does not standardize

The specification is explicit about its own boundary. It says nothing about
how a plugin declares a dependency on another plugin or skill, how a
version gets pinned once a client has fetched one, where a plugin comes
from (a registry, a git URL, a local path are all left to the client), or
how a client verifies that what it downloaded is what the author published.
There's no lockfile-equivalent anywhere in the spec, and no checksum field
on a plugin as a whole.

That's a defensible scope decision, not an oversight - a portable folder
shape is a real, useful thing to agree on across five companies, and
bundling a full package-manager story into the same effort would have made
consensus much harder to reach. But it means "Agent Plugins 1.0 ships" does
not mean the distribution problem is solved. It means the folder that gets
distributed now has an agreed shape, and every question of how it moves
from a publisher's repository to your machine - and whether the copy you
have is still the copy they published - is still open.

## Where Claude Code sits

Claude Code is conspicuously absent from the Technical Steering Committee,
and its own plugin format predates and diverges from the new spec. Per
[Claude Code's plugin
docs](https://code.claude.com/docs/en/plugins), a Claude Code plugin's
manifest lives at `.claude-plugin/plugin.json` - nested inside a dot-prefixed
directory - not at the plugin root the way Agent Plugins specifies. The
Claude Code docs make no mention of Agent Plugins or `agent-plugins.org`.
Both formats independently converge on a `skills/<name>/SKILL.md` layout,
because both build on the same underlying Agent Skills spec, but a
`plugin.json` written for one does not sit in the place the other expects
it, and nothing in either spec bridges that gap automatically today. A
plugin author targeting both ecosystems is packaging twice, or maintaining
a translation step, not shipping one folder everywhere.

## What this means for a manifest that already pins skills

skillfold's manifest currently resolves three kinds of sources - local
paths, `github:` refs, and `npm:` packages - into `SKILL.md`-based skill
directories, and its lockfile records a resolved commit SHA plus a sha256
integrity hash per skill (see `docs/manifest.md`). None of that reads or
writes `plugin.json`, and skillfold has no concept of an MCP server
declaration at all: `mcp.json` isn't a file type it looks for, parses, or
installs. A skill packaged inside an Agent Plugins folder that skillfold
happens to point at would only work if `skills/<name>/SKILL.md` inside it
still resolves as a plain skill directory - the surrounding `plugin.json`
and `mcp.json` would simply be ignored.

That's the honest limitation to state plainly: skillfold does not consume
the Agent Plugins format, does not resolve `mcp.json` servers, and has no
migration path for either as of this writing. If Agent Plugins gains real
adoption and clients start expecting MCP servers to travel inside the same
folder as skills, that's new surface skillfold's resolver doesn't cover yet.
What the spec does confirm is the shape of the problem the ecosystem still
hasn't agreed on: a portable *package* is not the same thing as a pinned,
verifiable *install*, and five companies agreeing on the former just made
that distinction easier to see.
