---
title: NVIDIA is signing its agent skills. Here is what a signature buys you
description: NVIDIA now ships CUDA-X agent skills with a scan, a signature, and a machine-readable card. It is a real trust stack, and it stops well short of "safe."
date: 2026-08-03
tags: [ecosystem]
---

<figure class="fig">
<svg viewBox="0 0 440 190" role="img" aria-labelledby="fig-t fig-d" xmlns="http://www.w3.org/2000/svg">
<title id="fig-t">NVIDIA's verified-skill pipeline</title>
<desc id="fig-d">A skill goes through cataloging, a SkillSpector scan, OMS signing, and a skill card, in that order, before publication.</desc>
<rect x="4" y="6" width="432" height="40" rx="4" fill="#0d1219" stroke="#29323f"/>
<text x="220" y="31" text-anchor="middle" font-family="monospace" font-size="10.5" fill="#c9d3df">skill source (CUDA-X library, blueprint, tool)</text>
<text x="60" y="66" font-family="monospace" font-size="18" fill="#41b866">↓</text>
<rect x="4" y="76" width="100" height="46" rx="4" fill="#0d1219" stroke="#41b866"/>
<text x="54" y="96" text-anchor="middle" font-family="monospace" font-size="9" fill="#41b866">catalog</text>
<text x="54" y="110" text-anchor="middle" font-family="monospace" font-size="8" fill="#828f9e">indexed</text>
<rect x="114" y="76" width="100" height="46" rx="4" fill="#0d1219" stroke="#41b866"/>
<text x="164" y="96" text-anchor="middle" font-family="monospace" font-size="9" fill="#41b866">SkillSpector</text>
<text x="164" y="110" text-anchor="middle" font-family="monospace" font-size="8" fill="#828f9e">scan for risk</text>
<rect x="224" y="76" width="100" height="46" rx="4" fill="#0d1219" stroke="#41b866"/>
<text x="274" y="96" text-anchor="middle" font-family="monospace" font-size="9" fill="#41b866">OMS sign</text>
<text x="274" y="110" text-anchor="middle" font-family="monospace" font-size="8" fill="#828f9e">skill.oms.sig</text>
<rect x="334" y="76" width="100" height="46" rx="4" fill="#0d1219" stroke="#41b866"/>
<text x="384" y="96" text-anchor="middle" font-family="monospace" font-size="9" fill="#41b866">skill card</text>
<text x="384" y="110" text-anchor="middle" font-family="monospace" font-size="8" fill="#828f9e">who, license, risks</text>
<rect x="4" y="140" width="432" height="44" rx="4" fill="#0d1219" stroke="#d9a032"/>
<text x="220" y="158" text-anchor="middle" font-family="monospace" font-size="10" fill="#d9a032">proves: this exact file came from NVIDIA and was reviewed once</text>
<text x="220" y="174" text-anchor="middle" font-family="monospace" font-size="10" fill="#828f9e">does not prove: the reviewed instructions are safe for your agent</text>
</svg>
<figcaption>Cataloging, scanning, signing, and a skill card are four separate claims. Only the first two are new; the pipeline still ends at a review, not a proof.</figcaption>
</figure>

Most agent skills ship the way most npm packages shipped in 2015: a directory
of text and scripts, fetched from wherever the manifest points, trusted
because nothing forced anyone to check. NVIDIA's [Technical Blog post on
NVIDIA-Verified Agent
Skills](https://developer.nvidia.com/blog/nvidia-verified-agent-skills-provide-capability-governance-for-ai-agents/),
published May 19, 2026, describes what that ecosystem looks like once a
vendor decides to stop trusting it by default.

## The problem the pipeline answers

The motivating number comes from academic work, not NVIDIA's own research.
["Agent Skills in the Wild: An Empirical Study of Security Vulnerabilities at
Scale"](https://arxiv.org/abs/2601.10338) (Liu, Wang, Feng, Zhang, Xu, Deng,
Li, and Zhang; submitted to arXiv January 15, 2026) collected 42,447 skills
from two major marketplaces and ran 31,132 of them through SkillScan, a
static-plus-LLM detection pipeline the authors built for the study. Their
finding: "26.1% of skills contain at least one vulnerability, spanning 14
distinct patterns across four categories: prompt injection, data
exfiltration, privilege escalation, and supply chain risks." NVIDIA's own
scanner, described below, cites the same paper for a narrower number: skills
that bundle an executable script are 2.12x more likely to be vulnerable than
instruction-only ones.

That is the same shape of finding the security beat has produced all year -
see the [February-to-May roundup](/blog/what-the-skill-supply-chain-research-recommends/)
covering Snyk, Koi Security, Bitdefender, and Unit 42's marketplace audits.
What is new here is a large vendor building a standing pipeline in response,
rather than a one-time disclosure.

## What NVIDIA actually publishes

NVIDIA-Verified Agent Skills are, per the post, "portable instruction sets
that teach AI agents how to use NVIDIA CUDA-X libraries, AI Blueprints, and
platform tools correctly." Before publication, each one is cataloged,
scanned, cryptographically signed, and documented with a skill card. The
skills themselves are built on the open `agentskills.io` SKILL.md
specification, so the format is the same one skillfold, Claude Code, and
roughly forty other tools already read.

**The skill card** is a machine-readable record shipped alongside the skill.
The post lists its required fields plainly: what the skill does, who built
it, how it is licensed, what its dependencies are, and "what are the known
technical limitations, risks, and mitigations of the skill." That last field
is the interesting one - it is asking a publisher to write down the ways
their own skill can go wrong, in the same document a user reads before
installing it.

**The signature** is a detached `skill.oms.sig` file that "can be verified
post-download" and covers every file and subdirectory in the skill's
directory, not `SKILL.md` alone. Verification uses OpenSSF Model Signing (OMS)
tooling checked against NVIDIA's published root certificate - the same
signing scheme OpenSSF built for model artifacts, repurposed here for skill
directories.

**The scan** is [SkillSpector](https://github.com/NVIDIA/SkillSpector),
which NVIDIA open-sourced under Apache 2.0 and which anyone can run
independently of NVIDIA's own catalog: `skillspector scan ./my-skill/`
against a local directory, a zip, a single `SKILL.md`, or a Git URL. Per its
README, the current release detects "68 vulnerability patterns across 17
categories" - prompt injection, data exfiltration, privilege escalation,
supply chain, excessive agency, tool poisoning, and more - using AST
analysis, taint tracking, YARA signatures, and an optional LLM pass, then
rolls the findings into a 0-100 risk score. Above 50 the tool's own verdict
is "DO NOT INSTALL." (Some syndicated coverage of SkillSpector cites 64
patterns across 16 categories; that reflects an earlier release. The README
in the repository as of this writing says 68 and 17, and a scanner's own
repo is the source that matters here.)

## What each piece actually proves

Cut through the pipeline and there are exactly two new claims being made,
and one old one dressed up:

- **The signature proves provenance and integrity**: this file, byte for
  byte, is what NVIDIA published under this name, and it has not been
  altered since. That is a real, checkable fact, and it is the piece a bare
  hash cannot give you - a hash tells you the bytes did not change since
  *you* recorded it, a signature tells you who published them in the first
  place.
- **The scan proves a heuristic pass found nothing above a threshold.** A
  static analyzer plus an LLM classifier looking for 68 known patterns is
  real work, and it is also, definitionally, bounded by the patterns it
  knows to look for. A scan result is evidence, not a certificate of
  safety, and NVIDIA's own SkillSpector output format reports a score and
  findings rather than a pass/fail attestation.
- **The skill card is a disclosure, not a guarantee.** It asks the publisher
  to state their own skill's risks. That is valuable precisely because it
  is auditable and attributable - if the card is wrong, there is a specific
  document and a specific publisher to point at - but it is only as honest
  as whoever filled it in.

None of that is a criticism specific to NVIDIA. It is the same ceiling every
scanner and every signature scheme in software supply-chain security runs
into: they answer "is this the thing that was reviewed," not "was the
review sufficient." NVIDIA's own post is explicit that this pipeline covers
skills NVIDIA itself publishes for its own libraries and blueprints - it is
not a general certification you can apply to an arbitrary skill from GitHub
or an open marketplace.

## Where this leaves a lockfile

skillfold's lockfile records a resolved commit SHA and a sha256 over every
file in a skill, matching a shape close to NVIDIA's card fields for
provenance and integrity:

```yaml
frontend-design:
  source: github:anthropics/skills/skills/frontend-design@v1.2.0
  resolved: github:anthropics/skills/skills/frontend-design@8f3a9c1e...
  integrity: sha256-...
```

That hash answers "did this change since I pinned it," which is most of
what a signature answers too, minus one thing: a hash has no notion of
*who* published the bytes, only that they match what you recorded. skillfold
has no signing step, no publisher identity check, and - unlike
SkillSpector - no scanner at all. It does not read skill content for
prompt-injection patterns, does not run static or LLM analysis, and does not
produce a risk score. Nothing stops a manifest from pinning a skill that
would score 90 on SkillSpector; skillfold will hash it, install it, and
report it in sync regardless.

The two tools solve adjacent, non-overlapping problems: SkillSpector (or any
scanner) answers whether a skill's content looks dangerous at a point in
time; skillfold answers whether the skill your agent loads today is the
exact same one that was reviewed. Running a scan once and never pinning the
result is exactly as fragile as pinning without ever having scanned - each
half needs the other, and right now nothing ships them together for the
open, multi-source skill ecosystem most people actually pull from.
