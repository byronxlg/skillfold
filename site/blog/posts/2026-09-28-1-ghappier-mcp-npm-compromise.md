---
title: A stolen credential, not a broken pipeline, put malware in an MCP server package
description: CloudSEK's report on the GHAPPIER npm loader shows a 35-minute compromise of an AI agent's MCP server, and it did not need a tricked CI workflow to get there.
date: 2026-09-28
tags: [ecosystem]
---

On September 9, 2026, someone with a working maintainer credential for
`@dforge-core/dforge-mcp` - an MCP server that Claude Code, Cursor, and Zed
use to scaffold and validate dForge modules - held that access for 105
minutes. In that window they shipped a malicious release, restored a clean
one, and left behind a loader that [CloudSEK's September 20, 2026
writeup](https://www.cloudsek.com/blog/ghappier-malware-loader-npm-supply-chain-attack)
names GHAPPIER, tied to at least 65 GitHub repositories and 22 accounts
beyond this one package.

## What happened

The attacker's first move, 14 minutes into the compromise, was a three-line
change to the project's release workflow that turned on unattended
publishing. They then pushed version `0.2.20`, which broke installation
outright, followed by `0.2.21`, which shipped cleanly and carried the
loader. `0.2.21` sat as the package's latest published version for 35
minutes and 38 seconds before the maintainer regained control, reverted the
workflow, and published a clean `0.2.22`.

The loader itself is small by design: CloudSEK found it as a single line at
byte offset 3320 of a 99 KB file, opening a four-stage chain whose "final
implant deletes itself from disk the moment it runs." Each stage still
worked when CloudSEK re-tested it five days after the incident, but a
machine that was actually infected and later inspected would show nothing -
the last thing it does before it does anything else is remove itself. That
is a specific, practical reason this kind of compromise is hard to confirm
after the fact even when you know the exact package and version to look
for.

CloudSEK's wider investigation found a second payload, in a different
victim's repository, matching a distinct family it calls PolinRider - a
DPRK-linked operation tracked since March 2026. That variant reads its
command-and-control address off the Ethereum blockchain, encoded in the
recipient field of a transaction costing about twenty cents, rather than a
domain or IP anyone could seize or take down. CloudSEK's recommendation for
anyone who touched the package during the window is blunt: pin at `0.2.22`
and treat any lockfile still referencing `0.2.21` as an incident, not a
version bump.

## A different door than the last two times

This is the third npm trusted-publishing compromise this blog has covered
in three months, after [the July AsyncAPI
compromise](/blog/asyncapi-npm-provenance/) and [the August
`@7nohe/openapi-react-query-codegen`
incident](/blog/npm-staged-publishing/). Both of those got in through a
tricked CI trigger - a `pull_request_target` workflow and a
comment-triggered `npm publish`, respectively - that let an *unauthorized*
party ride a *legitimate* maintainer's identity without ever touching a
maintainer's own credentials. GHAPPIER is different: CloudSEK could not
determine exactly how, but the attacker appears to have had a real
developer's working credentials from the start, most likely from an
infected machine, extension, or package rather than a workflow flaw. They
did not need to trick anything into granting them access; they already had
it, and used it to edit the workflow themselves.

That distinction matters for what would have stopped it. npm's [staged
publishing](https://docs.npmjs.com/staged-publishing/) - the human
two-factor approval gate we covered in August - interrupts a compromised
*pipeline* by holding every release for review before it goes live,
regardless of how the release got triggered. It would still have applied
here: a stage-only configuration means even a maintainer with genuine
credentials pushes to a review queue, not straight to the registry. Nothing
in CloudSEK's report says `dforge-mcp` had it configured, and the report
doesn't speculate on the counterfactual either. What it does confirm, again,
is the same line from the earlier incidents: the malicious release "carried
valid npm provenance" because, in CloudSEK's words, "provenance attests
where an artefact was built, not whether its source was honest." The token
was real, the pipeline ran as built, and the commit at the start of it was
not one the actual maintainer meant to ship.

## What this doesn't touch in skillfold

`@dforge-core/dforge-mcp` is an MCP server, not an agent skill, and that
distinction is the honest boundary here rather than a technicality.
skillfold's lockfile pins and hashes `skills` and `rules` sources -
directories with a `SKILL.md`, or single markdown files - via
`skillfold.yaml` (see [the manifest
reference](https://github.com/byronxlg/skillfold/blob/main/docs/manifest.md)).
It has no
concept of an MCP server at all; grep the source and the docs and the
string doesn't appear. A project's MCP servers are ordinary dependencies,
declared in `package.json` and pinned by `package-lock.json` or
`pnpm-lock.yaml`, and configured separately in whatever `.mcp.json` or
client settings file each agent reads. None of that goes through
`skillfold.lock`, so a compromise like this one sits entirely in a supply
chain skillfold doesn't participate in, for or against.

Where skillfold *would* be involved - hypothetically, if some other npm
package bundled both an MCP server and a skill under one `agentskills` map,
and a manifest pinned the skill half with `npm:pkg/skill@installed` or an
exact version - the honest answer is the one we've given for the last two
incidents on this beat and won't restate at length again: a lockfile pin
and a sha256 hash prove a file hasn't changed since you pinned it, not that
it was safe the moment you did. If `skillfold install` had resolved that
skill during a poisoned release window, it would have hashed the malicious
contents just as faithfully as clean ones and reported `ok` on every check
since. That's not a gap specific to this incident; it's
the same gap every pinning tool has, described in more depth in our
[AsyncAPI post](/blog/asyncapi-npm-provenance/) and [staged publishing
post](/blog/npm-staged-publishing/).

The part worth sitting with this time is narrower: an MCP server sits in
the same trust position as a skill - an agent reads what it says and acts
on it - but it lives entirely outside the one place in this ecosystem that
currently makes that trust chain reviewable and reversible. That gap isn't
skillfold's to close. It's worth knowing it's there.
