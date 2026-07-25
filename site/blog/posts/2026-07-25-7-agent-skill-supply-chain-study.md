---
title: A study mapped 1.4 million agent skills. Most declare no dependencies at all.
description: A July 2026 paper built the first dependency graph across 1.4 million agent skills, and found most carry no declared dependency metadata at all.
date: 2026-07-25
tags: [ecosystem]
---

Agent skills have quietly become software artifacts with dependencies:
a `SKILL.md` can tell an agent to invoke another skill, shell out to an
npm package, or call an external service. Almost none of them say so.
That is the finding of ["Skills Are Not Islands: Measuring Dependency
and Risk in Agent Skill Supply Chains"](https://arxiv.org/abs/2607.01136),
a paper submitted July 1, 2026 by Changguo Jia, Tianqi Zhao, Runzhi He,
and Minghui Zhou, which is the first attempt to treat agent skills as a
dependency graph at ecosystem scale and measure what is actually inside
it.

## What they built and ran

The paper introduces "Agent Skill Supply Chains" (ASSCs) as a formal
model - skills, packages, and services as nodes, with edges for
skill-to-skill, skill-to-package, and skill-to-service dependencies -
and a tool called SkillDepAnalyzer (SDA) that extracts those edges from
a skill's frontmatter and prose using natural-language evidence, the
same way an SBOM tool would extract edges from a manifest file, except
here there usually is no manifest file to read.

They ran SDA against 1,434,046 skills downloaded from the SkillsMP
registry on June 6, 2026 - 87.4% of the 1,640,440 skills the registry
listed at the time. That is the largest dependency analysis of the
agent skill ecosystem published so far.

## Present, but not declared

The paper's core finding is a pattern it names "activation-ready but
governance-poor." Frontmatter with a name and description - the
minimum an agent needs to *activate* a skill - is present in 99.55% of
the corpus. Fields that would let a tool reason about what a skill
*depends on* appear in only 1.40%. Name collisions compound the
problem: 58.73% of skill names collide with at least one other skill in
the corpus, which the paper notes makes identity resolution fragile
even before dependencies enter the picture.

Where SDA did find dependency evidence - mostly in the prose telling an
agent what to run or call, not in structured fields - the breakdown
across the full corpus was:

| Dependency type | Skills | Share |
|---|---|---|
| Skill-to-skill | 127,891 | 8.92% |
| Skill-to-package | 221,925 | 15.48% |
| Skill-to-service | 319,013 | 22.25% |
| Any of the above | 524,802 | 36.60% |
| All three types | 11,041 | 0.77% |

So more than a third of skills pull in something beyond their own
files, and almost none of that is declared anywhere a tool could check
without running an LLM-assisted extractor over the skill's prose first.

## The security signal

The paper also traced known-risky packages, services, and skills
through the graph to see how far they reach via transitive dependency,
not just direct use. It found 194 root skills reaching a known
malicious skill, 13.40% of that exposure arriving only transitively;
3,342 skills touching a dangerous code pattern, 78.43% transitively;
3,413 skills reaching the axios package specifically, 98.01%
transitively; and 29 root skills reaching a vulnerable MCP service,
93.10% transitively. The consistent shape across all four numbers is
that most of the exposure is inherited from something the skill
depends on, not something the skill's own author wrote - which is
exactly why an undeclared dependency graph is a worse problem than an
undeclared dependency count.

## What the paper recommends

Section VII of the paper splits its recommendations by who is
responsible. For registries: require a typed dependency manifest that
separates skill, package, and service dependencies; treat clusters of
interdependent skills as a first-class object to manage rather than
inspecting skills one at a time; and expose an audit command "analogous
to `npm audit`." For skill developers: maintain a lockfile-like record
of exact versions, source repositories, paths, and dependency status.

That is, structurally, the two-file shape most package ecosystems
converged on after their own supply-chain incidents: a manifest a human
edits, and a lockfile a tool writes and nobody hand-edits. It is also,
not coincidentally, the shape skillfold already uses for the slice of
this problem it covers: `skillfold.yaml` is a typed manifest across
`skills`, `compose`, and `rules`, and `skillfold install` writes
`skillfold.lock` with the exact resolved commit SHA or version and a
sha256 content hash per entry (see the
[manifest reference](https://github.com/byronxlg/skillfold/blob/main/docs/manifest.md)).
`compose` entries record their `use` list in the
lock too, so a skill built from other skills has that skill-to-skill
edge pinned and checkable - `skillfold check` fails the build if an
installed composed skill no longer matches what its locked inputs would
generate.

## What this does not solve

That overlap is narrower than it sounds, and worth being precise about.
skillfold's manifest only captures skill-to-skill dependency, and only
the explicit kind: an entry in `compose.use`. It has no equivalent of
SDA's skill-to-package or skill-to-service edges - if a skill's body
tells an agent to `npm install` something or call an external API,
skillfold has no visibility into that dependency at all, and neither
does anything else in the current tooling landscape; that is precisely
the gap this paper is pointing at. A sha256 integrity hash also is not
a vulnerability scan: it proves a pinned skill's content has not
changed since the day it was pinned, which is a different guarantee
than "this skill's content is safe." Nothing about the manifest or
lockfile would have caught the axios exposure or the malicious-skill
reachability the paper measured, because both require walking
dependencies *inside* a skill's own instructions, and skillfold's
lockfile only reasons about the skills a project explicitly declares in
its own manifest, not the graph underneath them.
