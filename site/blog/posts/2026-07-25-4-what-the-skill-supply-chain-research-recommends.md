---
title: What the skill supply-chain research actually recommends
description: Six months of disclosures converged on the same mitigations for agent skills. Here is what pinning and content hashes buy, and what they plainly do not.
date: 2026-07-25
tags: [ecosystem]
---

<figure class="fig">
<svg viewBox="0 0 440 214" role="img" aria-labelledby="fig4-t fig4-d" xmlns="http://www.w3.org/2000/svg">
<title id="fig4-t">What pinning and hashing cover, and what they do not</title>
<desc id="fig4-d">A resolved revision and a content hash cover substitution, silent upstream changes, and local edits. They do not cover whether the pinned instructions were safe in the first place. A lockfile makes a compromise reproducible, not harmless.</desc>
<rect x="4" y="6" width="212" height="132" rx="4" fill="#0d1219" stroke="#41b866"/>
<text x="16" y="28" font-family="monospace" font-size="10.5" fill="#41b866">covered</text>
<text x="16" y="52" font-family="monospace" font-size="9.5" fill="#828f9e">a moving tag silently</text>
<text x="16" y="65" font-family="monospace" font-size="9.5" fill="#828f9e">becoming something else</text>
<text x="16" y="86" font-family="monospace" font-size="9.5" fill="#828f9e">upstream changing the</text>
<text x="16" y="99" font-family="monospace" font-size="9.5" fill="#828f9e">content after review</text>
<text x="16" y="120" font-family="monospace" font-size="9.5" fill="#828f9e">an edit in your checkout</text>
<rect x="224" y="6" width="212" height="132" rx="4" fill="#0d1219" stroke="#e05a51"/>
<text x="236" y="28" font-family="monospace" font-size="10.5" fill="#e05a51">not covered</text>
<text x="236" y="52" font-family="monospace" font-size="9.5" fill="#828f9e">whether the pinned bytes</text>
<text x="236" y="65" font-family="monospace" font-size="9.5" fill="#828f9e">were safe to begin with</text>
<text x="236" y="86" font-family="monospace" font-size="9.5" fill="#828f9e">hidden or obfuscated</text>
<text x="236" y="99" font-family="monospace" font-size="9.5" fill="#828f9e">instructions</text>
<text x="236" y="120" font-family="monospace" font-size="9.5" fill="#828f9e">publisher identity</text>
<rect x="4" y="152" width="432" height="52" rx="4" fill="#0d1219" stroke="#29323f"/>
<text x="220" y="174" text-anchor="middle" font-family="monospace" font-size="10.5" fill="#c9d3df">a lockfile makes a compromise reproducible</text>
<text x="220" y="191" text-anchor="middle" font-family="monospace" font-size="10.5" fill="#d9a032">which is not the same thing as making it safe</text>
</svg>
<figcaption>Pinning turns a one-time read of a SKILL.md into a durable statement about what the agent runs. It is not a scanner, and treating it as a security control is a mistake worth naming.</figcaption>
</figure>

Agent skills got their own security literature in the first half of 2026. Not
think pieces: vendor disclosures with sample counts, a CVE trail, and papers
on arXiv. If you install skills from anywhere other than your own repository,
the findings are worth reading, and the recommended mitigations are worth
reading more carefully than the findings.

The numbers, with their attributions:

- Snyk's February 2026 audit of 3,984 skills from the ClawHub registry found
  36.82% contained at least one security flaw and 76 carried confirmed
  malicious payloads, per the
  [Cloud Security Alliance's briefing](https://labs.cloudsecurityalliance.org/research/briefing-csa-research-note-skill-md-agent-context-poisoning/).
- Koi Security disclosed 341 malicious skills in its ClawHavoc report, a
  typosquatting campaign against the registry's users.
- Bitdefender Labs reported that roughly 17% of the skills it analyzed in the
  platform's first weeks carried malicious payloads, cited in
  [Unit 42's writeup](https://unit42.paloaltonetworks.com/openclaw-ai-supply-chain-risk/).
- Unit 42's own February to May 2026 analysis walked through five skills that
  were live and unblocked at the time of writing, spanning macOS
  infostealers, scanner evasion, and runtime affiliate injection.

There is also academic work: see
[Towards Secure Agent Skills](https://arxiv.org/html/2604.02837v1) for a
threat taxonomy, and
[Formal Analysis and Supply Chain Security for Agentic AI Skills](https://arxiv.org/html/2603.00195v1).

## What those numbers do and do not measure

Start with the caveat, because it is the part most coverage drops. The large
datasets above come from ClawHub, the marketplace for the OpenClaw agent
framework. They are not measurements of Anthropic's skill directory, of
`skills.sh`, or of whatever you have in `.claude/skills` right now. Anyone
telling you "a third of Claude skills are malicious" is misreading a ClawHub
audit.

What does carry across is the mechanism. `SKILL.md` is the same format across
roughly forty tools now, and the attacks in these reports target the format
and the trust model rather than any one client. A finding about how a markdown
instruction file can smuggle behavior is a finding about every tool that loads
markdown instruction files.

The client side has not been clean either. The CSA briefing traces two patched
Claude Code CVEs, CVE-2025-59536 (CVSS 8.7, October 2025) and CVE-2026-21852
(CVSS 5.3, January 2026), and its list of immediate actions starts with
patching the client before anything else.

## The attack surface is the instructions

The interesting part of this research is how little of it involves code
execution in the traditional sense.

Some attacks are ordinary supply-chain fare: Unit 42 documents base64-encoded
curl-pipe-bash droppers, paste sites like rentry.co used as redirect
intermediaries, and one skill padded with 22 MB of filler characters to push
it past scanners' size limits.

The rest are attacks on meaning. Unit 42 calls it semantic instruction
hijacking: text that reads as documentation to a human and as a directive to a
model. The CSA briefing documents the same class, including instructions
hidden in Unicode tag characters (U+E0000 to U+E007F), which are invisible in
most editors and processed normally by a language model. Their worked example
is a skill that appends API keys as query parameters before fetching an
external URL, which is not malware by any classical definition. It is a
sentence.

This is why "the skill has no scripts in it" is not a safety property. The
prose is the payload.

## The mitigations converge

Read enough of these reports and the recommendations start to rhyme. The CSA
briefing's short-term controls are the clearest statement of the pattern:
restrict which registries skills may be sourced from, and require content hash
verification before loading skills into production. It also points at internal
registries with content signing. Unit 42 asks for line-by-line source audits
and outbound traffic monitoring against a documented spec.

Strip the vendor-specific parts and three ideas remain:

1. **Know where a skill came from.** Not "the marketplace", a specific source
   at a specific revision.
2. **Know it has not changed since.** A hash, checked before load, not a
   version string you trust the publisher to bump.
3. **Review it once, deliberately, and make that review durable.** A review is
   worthless if the reviewed thing can be swapped out afterwards.

None of that is novel. It is what package ecosystems concluded years ago,
arriving late to a format that spread faster than its tooling.

## Where a lockfile fits

This is the part skillfold is built for, so read it with appropriate
suspicion.

A manifest names each skill's source, and the lockfile records the full commit
SHA it resolved to plus a sha256 over every file in the directory:

```yaml
skills:
  frontend-design:
    source: github:anthropics/skills/skills/frontend-design@v1.2.0
    resolved: github:anthropics/skills/skills/frontend-design@8f3a9c1e...
    integrity: sha256-...
```

That maps onto the first two ideas directly. `resolved` pins the revision, so
a moving tag or a `latest` dist-tag cannot quietly become something else;
`install` reuses the pin until you deliberately run `update`. `integrity`
covers the content, so a modified file is detectable whether it was changed
upstream or in your working copy. `skillfold install --frozen` verifies every
hash before writing anything and is the mode meant for CI, and
`skillfold check` does the same verification offline.

It also means nothing gets fetched at agent runtime. Skills are materialized
into place at install time from pinned sources, so the set of instructions an
agent can load is a build product you can diff, not a live lookup.

## What a lockfile does not do

A content hash proves that the bytes did not change since you pinned them. It
says nothing whatsoever about whether those bytes were safe.

If you install a skill carrying a hidden instruction to exfiltrate your
repository, skillfold will pin it, hash it, verify it on every subsequent
install, and reproduce it faithfully on every machine your team owns. It will
report `ok: 4 skills in sync`. The lockfile makes the compromise
*reproducible*, which is genuinely better than making it random, and is not
remotely the same thing as making it safe.

skillfold has no scanner. It does not read skill content for suspicious
instructions, does not strip invisible Unicode, does not check publisher
identity or signatures, and does not sandbox anything. It is a fetch-and-place
tool, and treating it as a security control is a mistake worth naming plainly.

What it can do is make the review the CSA briefing asks for actually worth
performing. Auditing a skill you cannot pin is theatre, because the thing you
audited is not necessarily the thing that loads tomorrow. Pinning is what
turns a one-time read of a `SKILL.md` into a durable statement about what your
agent runs.

## What to do this week

Independent of any tool: patch your client. Then list every skill you have
installed and ask, for each one, where it came from and whether you have read
it. For most people the honest answer to the second question is no for at
least half the list, which is the actual finding here.

Read them. Pay attention to prose that instructs rather than describes,
especially anything constructing a URL. Then pin whatever survives, so you
only have to do this once.
