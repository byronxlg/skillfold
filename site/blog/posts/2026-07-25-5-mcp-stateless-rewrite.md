---
title: "MCP's stateless rewrite ships July 28: what actually changes"
description: The Model Context Protocol drops server sessions for a stateless core and writes down a deprecation policy for the first time. Here is what changes.
date: 2026-07-25
tags: [ecosystem]
---

The Model Context Protocol - the wire format most agent tools now use to
reach external tools and data sources - ships its largest revision since
launch on July 28, 2026. The release candidate has been locked since May 21,
giving SDK maintainers a ten-week window to catch up, according to the
[official MCP specification blog](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/).
The headline change is not a new feature. It is the removal of the one thing
every MCP deployment has depended on since the protocol's first release:
the session.

## What a stateless core actually removes

Every MCP connection used to start with an `initialize` handshake that
returned an `Mcp-Session-Id` header, and every request after that had to
reach the same server instance that issued it. That is gone. Protocol
version, client identity, and capabilities now travel in a `_meta` field on
every request instead of being negotiated once and pinned to a session. Any
server instance can now answer any request, per the specification blog,
which means a remote MCP deployment that needed sticky routing, a shared
session store, or packet inspection at the load balancer to keep requests on
the right instance no longer needs any of that.

Server-initiated requests - a confirmation prompt mid-task, for example -
had to assume a persistent connection back to the client. They are
restructured too: a server can only issue one while actively handling a
client request, and the client can resume the exchange from any instance
using a `requestState` payload it echoes back on retry.

Three things are removed outright: the `initialize`/`initialized` handshake,
the `Mcp-Session-Id` header, and the `tasks/list` method, which the spec blog
says "can't be scoped safely without sessions". A non-standard `-32002` error
code for missing resources is replaced with the JSON-RPC standard `-32602`.

Three features that were part of the core are marked deprecated rather than
removed: Roots, Sampling, and Logging. They still work.

<figure class="fig">
<svg viewBox="0 0 440 226" role="img" aria-labelledby="fig5-t fig5-d" xmlns="http://www.w3.org/2000/svg">
<title id="fig5-t">Session-pinned routing versus a stateless core</title>
<desc id="fig5-d">Previously an initialize handshake returned an Mcp-Session-Id and every later request had to reach the instance that issued it, requiring sticky routing. Now protocol version, client identity, and capabilities travel in a _meta field on every request, so any instance can answer any request.</desc>
<defs><marker id="fig5-a" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 z" fill="#57626f"/></marker></defs>
<text x="4" y="14" font-family="monospace" font-size="9.5" fill="#d9a032">before: session pinned</text>
<rect x="4" y="24" width="96" height="30" rx="4" fill="#0d1219" stroke="#29323f"/>
<text x="52" y="43" text-anchor="middle" font-family="monospace" font-size="10" fill="#828f9e">client</text>
<path d="M104 39 H150" stroke="#57626f" marker-end="url(#fig5-a)"/>
<text x="127" y="33" text-anchor="middle" font-family="monospace" font-size="8.5" fill="#d9a032">session id</text>
<rect x="156" y="24" width="110" height="30" rx="4" fill="#0d1219" stroke="#d9a032"/>
<text x="211" y="43" text-anchor="middle" font-family="monospace" font-size="10" fill="#c9d3df">instance A</text>
<rect x="156" y="62" width="110" height="24" rx="4" fill="#0d1219" stroke="#1b232e"/>
<text x="211" y="78" text-anchor="middle" font-family="monospace" font-size="9.5" fill="#57626f">instance B</text>
<text x="278" y="45" font-family="monospace" font-size="9" fill="#57626f">every later request</text>
<text x="278" y="58" font-family="monospace" font-size="9" fill="#57626f">must reach A</text>
<text x="278" y="78" font-family="monospace" font-size="9" fill="#d9a032">sticky routing</text>
<path d="M4 108 H436" stroke="#29323f"/>
<text x="4" y="132" font-family="monospace" font-size="9.5" fill="#41b866">after: stateless core</text>
<rect x="4" y="142" width="96" height="30" rx="4" fill="#0d1219" stroke="#29323f"/>
<text x="52" y="161" text-anchor="middle" font-family="monospace" font-size="10" fill="#828f9e">client</text>
<path d="M104 157 H140" fill="none" stroke="#57626f"/>
<path d="M140 157 V149 H150" fill="none" stroke="#57626f" marker-end="url(#fig5-a)"/>
<path d="M140 157 V181 H150" fill="none" stroke="#57626f" marker-end="url(#fig5-a)"/>
<text x="127" y="145" text-anchor="middle" font-family="monospace" font-size="8.5" fill="#41b866">_meta</text>
<rect x="156" y="136" width="110" height="26" rx="4" fill="#0d1219" stroke="#41b866"/>
<text x="211" y="153" text-anchor="middle" font-family="monospace" font-size="9.5" fill="#828f9e">instance A</text>
<rect x="156" y="168" width="110" height="26" rx="4" fill="#0d1219" stroke="#41b866"/>
<text x="211" y="185" text-anchor="middle" font-family="monospace" font-size="9.5" fill="#828f9e">instance B</text>
<text x="278" y="155" font-family="monospace" font-size="9" fill="#57626f">any instance can</text>
<text x="278" y="168" font-family="monospace" font-size="9" fill="#57626f">answer any request</text>
<text x="4" y="216" font-family="monospace" font-size="9.5" fill="#828f9e">version, identity, and capabilities ride on every request, not a handshake</text>
</svg>
<figcaption>The removal is the feature: without a session to pin, a deployment that needed sticky routing or shared session state stops needing either.</figcaption>
</figure>

## The part that is actually new: a deprecation clock

Protocol revisions have shipped breaking changes before. What has not existed
until this one is a written commitment about how much notice the next
breaking change gets. The spec blog now defines a formal lifecycle -
*Active*, *Deprecated*, *Removed* - and guarantees, in its own words,
"at least twelve months between deprecation and the earliest possible
removal." A conformance suite gates new Standards Track proposals from
reaching Final status without going through that lifecycle.

That is the detail worth sitting with if you build against MCP rather than
just consume it through a client. A protocol that reserves the right to
change anything at any time is a protocol you can only track by reading
every release. A protocol that commits to twelve months' notice is one you
can plan a migration against - which is a different, better problem to have,
even though this particular revision predates the policy that would have
given it more runway.

Extensions get the same kind of structure applied going forward: reverse-DNS
identifiers, independent versioning, and their own repositories under the SEP
process, rather than accreting into the core spec. Tasks - previously an
experimental core feature for long-running operations - moves into one of
the first such extensions, redesigned so a server returns a task handle and
the client drives progress with `tasks/get`, `tasks/update`, and
`tasks/cancel` instead of relying on a live connection.

## Who this actually disrupts

Coverage from [The Register](https://www.theregister.com/devops/2026/07/23/model-context-protocol-prepares-to-break-with-its-stateful-past/5276722)
quotes Anthropic's David Soria Parra putting the disruption where it
actually lands: "If you built your own implementation, it's going to be a
lot of uplift to make this correct." Anyone on an official SDK is expected
to absorb the change within the ten-week validation window Tier 1 SDKs get
before the July 28 ship date. Anyone who hand-rolled a client or server
against the wire format directly inherits the session-removal work
themselves, and backward compatibility between the old and new protocol
revisions is not guaranteed - a server speaking 2026-07-28 and a client
still expecting a session id will not silently interoperate.

Six SEPs also tighten authorization against current OAuth 2.0 and OpenID
Connect practice: `iss` parameter validation per RFC 9207, an
`application_type` declaration during dynamic client registration, and
credentials bound to the server that issued them. None of that is optional
hardening bolted on top - it is part of the same revision.

## What this has nothing to do with

MCP governs how an agent talks to a tool or data source over the wire. It
says nothing about how the *instructions* an agent loads - a `SKILL.md`, a
project's `AGENTS.md`, a rules file - got onto the machine running that
agent, and it has no equivalent yet of pinning a specific server to a
specific protocol revision the way a lockfile pins a package to a commit.
skillfold's manifest and lockfile resolve and hash skill sources; they say
nothing about MCP servers and do not touch protocol versions at all. If your
agent setup depends on MCP servers, this migration is a client and server
compatibility problem you handle independently of anything a skill manifest
covers, and as of this specification there still isn't a standard way to
declare and reproduce "which MCP protocol revision does this agent's setup
expect" the way you can declare which skill revision it expects. That gap is
worth naming, not papering over with an unrelated tool.

If you maintain an MCP server or client directly rather than through an
official SDK, the ten-week window closes soon. If you consume MCP only
through a client that tracks the spec, the practical action item this week
is confirming which SDK version you are on and whether it has picked up the
2026-07-28 revision yet.
