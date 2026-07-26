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

The paper's core finding is a pattern it names skill metadata that is
"activation-ready but governance-poor". Frontmatter of some kind is
present in 99.55% of the corpus, and the two fields an agent needs to
*activate* a skill are almost as universal: a name in 99.49%, a
description in 99.52%. Fields that would let a tool reason about what a
skill *depends on* appear in only 1.40%. Name collisions compound the
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

<figure class="fig">
<svg viewBox="0 0 440 200" role="img" aria-labelledby="fig7-t fig7-d" xmlns="http://www.w3.org/2000/svg">
<title id="fig7-t">Activation-ready but governance-poor metadata</title>
<desc id="fig7-d">Across 1,434,046 skills: frontmatter present in 99.55 percent, a name in 99.49 percent, a description in 99.52 percent, but fields declaring dependencies in only 1.40 percent. Separately, 58.73 percent of skill names collide with at least one other skill.</desc>
<text x="4" y="12" font-family="monospace" font-size="9" fill="#57626f">share of 1,434,046 skills</text>
<text x="4" y="36" font-family="monospace" font-size="9.5" fill="#828f9e">frontmatter present</text>
<rect x="152" y="26" width="228" height="13" fill="#1b232e"/>
<rect x="152" y="26" width="226.9" height="13" fill="#4d8bf5"/>
<text x="436" y="36" text-anchor="end" font-family="monospace" font-size="9.5" fill="#c9d3df">99.55%</text>
<text x="4" y="60" font-family="monospace" font-size="9.5" fill="#828f9e">name</text>
<rect x="152" y="50" width="228" height="13" fill="#1b232e"/>
<rect x="152" y="50" width="226.8" height="13" fill="#4d8bf5"/>
<text x="436" y="60" text-anchor="end" font-family="monospace" font-size="9.5" fill="#c9d3df">99.49%</text>
<text x="4" y="84" font-family="monospace" font-size="9.5" fill="#828f9e">description</text>
<rect x="152" y="74" width="228" height="13" fill="#1b232e"/>
<rect x="152" y="74" width="226.9" height="13" fill="#4d8bf5"/>
<text x="436" y="84" text-anchor="end" font-family="monospace" font-size="9.5" fill="#c9d3df">99.52%</text>
<text x="4" y="108" font-family="monospace" font-size="9.5" fill="#c9d3df">declares dependencies</text>
<rect x="152" y="98" width="228" height="13" fill="#1b232e"/>
<rect x="152" y="98" width="3.2" height="13" fill="#e05a51"/>
<text x="436" y="108" text-anchor="end" font-family="monospace" font-size="9.5" fill="#e05a51">1.40%</text>
<path d="M4 128 H436" stroke="#29323f"/>
<text x="4" y="154" font-family="monospace" font-size="9.5" fill="#828f9e">names that collide</text>
<rect x="152" y="144" width="228" height="13" fill="#1b232e"/>
<rect x="152" y="144" width="133.9" height="13" fill="#d9a032"/>
<text x="436" y="154" text-anchor="end" font-family="monospace" font-size="9.5" fill="#d9a032">58.73%</text>
<text x="4" y="184" font-family="monospace" font-size="9" fill="#57626f">enough metadata to load a skill, almost none to reason about what it pulls in</text>
</svg>
<figcaption>The corpus is 1,434,046 skills downloaded from the SkillsMP registry on 6 June 2026, 87.4% of the 1,640,440 the registry listed. The paper calls the pattern "activation-ready but governance-poor".</figcaption>
</figure>

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
