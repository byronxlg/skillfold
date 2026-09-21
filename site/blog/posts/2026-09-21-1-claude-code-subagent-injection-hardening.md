---
title: Claude Code now labels what a subagent tells you as subagent output
description: Claude Code 2.1.277 marks subagent results and cleans invisible Unicode from prompts. What that closes, and what pinning skill content still doesn't.
date: 2026-09-21
tags: [ecosystem]
---

Claude Code shipped version 2.1.277 on September 18, 2026. Buried in a long
changelog entry are three related changes that all target the same problem:
text that arrives from somewhere other than the user, but that the model
could previously mistake for the user's own instructions. Per the
[official changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md),
under version 2.1.277:

> Changed subagent results to reach the main agent under a header marking
> them as subagent output, with the result indented, so text in a
> subagent's result cannot pass as the session's own instructions

> Changed workflow scripts' computed `agent()` prompts on Bedrock, Vertex
> and Foundry to reach the subagent framed as script-authored text, so the
> safety classifier does not read them as the user

> Improved prompt handling: invisible Unicode formatting and tag
> characters in a prompt are removed and the cleaned prompt is shown for
> review before it is sent

Three different code paths, one shared failure mode: something other than
the person at the keyboard puts text in front of the model, and without a
clear boundary, the model has no way to tell that text apart from an
instruction it should obey.

## What each change actually closes

The first two are about agent-to-agent trust inside a single Claude Code
session. When a main agent dispatches a subagent - which is exactly what
happens when a workflow script or a `Task`-style delegation runs - the
subagent's result used to come back as plain text alongside everything
else in the transcript. If that result happened to contain something that
read like an instruction ("ignore the above and instead..."), there was no
structural signal telling the main agent that the text originated from a
delegated worker rather than from the user. Marking the result under an
explicit "subagent output" header, indented, gives the model a boundary to
reason about instead of asking it to infer provenance from phrasing alone.
The workflow-script change does the same thing one layer up: a script can
compute a prompt string and hand it to `agent()`, and on Bedrock, Vertex,
and Foundry that computed text now reaches the safety classifier framed as
script-authored rather than user-authored, so script output doesn't
inherit user-level trust it never earned.

The third change is different in kind. Unicode has a range of invisible
"tag" characters (`U+E0000`-`U+E007F`) and formatting characters designed
for legitimate uses like language tagging, but they've also been
demonstrated as a way to smuggle text a human reviewer can't see into
content a model still reads and acts on - the same principle as
zero-width-character steganography, applied to prompts. Claude Code now
strips those before a prompt is sent and shows the cleaned version for
review, so what you approve is what the model actually receives.

## Why this belongs in the skill supply chain conversation

None of these three changes are about skills specifically - they're about
prompt provenance in general. But the failure mode they close is exactly
the one that shows up when a security researcher goes looking for
problems in agent skill content: a `SKILL.md`, a tool's output, or text
returned from an MCP server is something the agent reads and can act on,
and until there's a structural boundary, "it's only text in the context
window" is the whole attack surface. A malicious or compromised skill
doesn't need code execution if it can get its output read as an
instruction. Marking subagent output and stripping invisible Unicode
are runtime-level defenses against that category, independent of where
the text came from - a compromised MCP server, a poisoned web page pulled
in by WebFetch, or a skill's own body.

## What skillfold does and doesn't do about it

Skillfold's job sits one layer earlier: making sure the skill content
that ends up on disk is the content you actually reviewed, and that it
doesn't drift silently between installs. Every remote skill in
`skillfold.lock` carries a `sha256` content hash computed over its files
(`src/resolve.ts`), and `skillfold install --frozen` fails the moment
installed content diverges from that hash - see the `--frozen: "<name>"
content hash does not match the lockfile` check in `resolveSkill`. That
answers "is this the exact skill I pinned," the same question `npm ci`
answers for packages, and it's real protection: a skill can't be swapped
out from under you between CI runs without the hash catching it.

It does not answer "is there anything hidden inside the skill I pinned."
A `SKILL.md` can carry invisible Unicode tag characters or an instruction
phrased to look like innocuous context, and if you approve that file once,
its hash then pins the malicious content as faithfully as it would
pin honest content. Skillfold verifies integrity, not intent - it has no
opinion on what a byte-identical file says. That gap is exactly what
2.1.277's prompt-cleaning step is for, and it's why the two are
complementary rather than redundant: a lockfile stops a skill from
changing without your knowledge, a runtime-level defense like this one
stops what's already in the file from being read as an instruction it was
never entitled to give. Neither one does the other's job. If you maintain
a skill registry or install skills from third parties, both checks belong
in the pipeline, not only one.
