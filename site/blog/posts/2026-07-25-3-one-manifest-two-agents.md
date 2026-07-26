---
title: One manifest, two agents
description: Claude Code and Codex read the same SKILL.md format but look for it in different places, and handle rules completely differently. The targets key makes one manifest install for both.
date: 2026-07-25
tags: [feature]
---

Skills are portable. The [agent skills standard](https://agentskills.io) is a directory with a `SKILL.md` in it, and the tools that consume it agree on that much. What they do not agree on is where to look.

Claude Code reads skills from `.claude/skills` and loads rules from `.claude/rules`. Codex reads skills from `.agents/skills` and has no rules directory at all: its instructions live in `AGENTS.md`, a single file you also write by hand.

If you use both, you currently maintain the same skill in two places and the same standing instructions in two formats. That is a synchronization problem, and synchronization problems are what a manifest is for.

```yaml
targets: [claude, codex]
```

That is the whole feature from the user's side. One line, and `skillfold install` materializes every declared skill into both locations from the same pins.

<figure class="fig">
<svg viewBox="0 0 440 236" role="img" aria-labelledby="fig3-t fig3-d" xmlns="http://www.w3.org/2000/svg">
<title id="fig3-t">One manifest installing to two agents</title>
<desc id="fig3-d">skillfold.yaml fans out to a claude target and a codex target. Skills land in .claude/skills and .agents/skills in the same format. Rules diverge: one file per rule under .claude/rules, versus a managed block inside AGENTS.md.</desc>
<rect x="163" y="6" width="160" height="30" rx="4" fill="#0d1219" stroke="#4d8bf5"/>
<text x="243" y="26" text-anchor="middle" font-family="monospace" font-size="12" fill="#c9d3df">skillfold.yaml</text>
<path d="M243 36 V54 M149 54 H337 M149 54 V78 M337 54 V78" fill="none" stroke="#57626f"/>
<text x="149" y="88" text-anchor="middle" font-family="monospace" font-size="11" fill="#4d8bf5">target: claude</text>
<text x="337" y="88" text-anchor="middle" font-family="monospace" font-size="11" fill="#4d8bf5">target: codex</text>
<path d="M4 102 H436" stroke="#29323f"/>
<text x="4" y="132" font-family="monospace" font-size="11" fill="#c9d3df">skills</text>
<text x="4" y="147" font-family="monospace" font-size="9.5" fill="#57626f">identical</text>
<rect x="66" y="116" width="166" height="30" rx="4" fill="#0d1219" stroke="#29323f"/>
<text x="149" y="136" text-anchor="middle" font-family="monospace" font-size="11" fill="#828f9e">.claude/skills</text>
<rect x="254" y="116" width="166" height="30" rx="4" fill="#0d1219" stroke="#29323f"/>
<text x="337" y="136" text-anchor="middle" font-family="monospace" font-size="11" fill="#828f9e">.agents/skills</text>
<text x="4" y="194" font-family="monospace" font-size="11" fill="#c9d3df">rules</text>
<text x="4" y="209" font-family="monospace" font-size="9.5" fill="#d9a032">diverges</text>
<rect x="66" y="174" width="166" height="46" rx="4" fill="#0d1219" stroke="#d9a032"/>
<text x="149" y="194" text-anchor="middle" font-family="monospace" font-size="11" fill="#828f9e">.claude/rules/</text>
<text x="149" y="210" text-anchor="middle" font-family="monospace" font-size="9.5" fill="#57626f">one file per rule</text>
<rect x="254" y="174" width="166" height="46" rx="4" fill="#0d1219" stroke="#d9a032"/>
<text x="337" y="194" text-anchor="middle" font-family="monospace" font-size="11" fill="#828f9e">AGENTS.md</text>
<text x="337" y="210" text-anchor="middle" font-family="monospace" font-size="9.5" fill="#57626f">managed block</text>
</svg>
<figcaption>Skills copy cleanly to both targets. Rules do not: Codex has no rules directory, so they sync into a fenced block inside a file you also own.</figcaption>
</figure>

| Target | Skills | Rules |
| --- | --- | --- |
| `claude` | `.claude/skills` (or `skillsDir`) | `.claude/rules`, one file per rule |
| `codex` | `.agents/skills` | a managed block in `AGENTS.md` |

## Rules are the hard part

Skills were easy: same format, different directory, copy twice. Rules were not, because Codex does not have a rules directory. It has one markdown file that the user also owns.

So the codex target syncs rules into a marker-fenced block:

```md
<!-- skillfold:rules:start -->
...your rules, one section per rule...
<!-- skillfold:rules:end -->
```

Everything outside those markers is yours and is never read, rewritten, or reformatted. The block is created on first install, updated when a rule changes, and removed entirely when you drop the last rule from the manifest. `skillfold check` verifies it offline like any other installed file, so a hand edit inside the block shows up as drift.

Two guards matter here, because this is a tool writing into a file a human is also editing:

- Rules must be UTF-8 text. Binary content in a file meant for an agent to read is a mistake, not a use case.
- A rule whose content contains skillfold marker lines is rejected with an explicit error rather than installed. Otherwise the markers nest and the next install cannot tell where its own block ends.

Both fail the install with a message instead of producing a subtly corrupted `AGENTS.md`.

## Adding a target to an existing project

The interesting case is not the greenfield one. It is the project that already has fifteen skills in `.agents/skills`, put there by hand, that now wants skillfold to manage them.

The lockfile records which targets it has installed for. A newly added target starts with **nothing** managed, which means every file already sitting in its locations is treated as hand-authored. From there:

- If the existing content is byte-identical to what skillfold would install, it is adopted silently. Nothing changes on disk, and the skill becomes managed.
- If it differs, the install stops and tells you. Taking ownership of a file whose contents you did not put there requires `--force`.

This is the same rule that applies everywhere else in the tool: skillfold overwrites and prunes exactly what its lockfile names, and nothing else. Adding a target does not hand it the directory.

In global mode (`-g`) the codex target manages `~/.agents/skills` and `~/.codex/AGENTS.md`, honoring `CODEX_HOME`.

## One thing that does not generalize

`skillsDir` and `rulesDir` override the claude locations only. Codex scans fixed conventional paths, so pointing `skillsDir` somewhere else does not move the Codex install, and it should not: a configurable path for a tool that does not read configurable paths is a footgun that looks like a feature.

If you need skills somewhere unusual for a third tool, that is a new target, not an override.

## Try it

```sh
npx skillfold init
# add targets: [claude, codex] to skillfold.yaml
npx skillfold install
npx skillfold check
```

This repository installs its own config for both targets in CI, which is how the sharp edges above got found in the first place.
