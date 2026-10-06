---
title: Where should this skill live?
description: Skills end up on one machine, copied between repos, or stuck in dotfiles. Giving each skill a source, a selection, and a generated copy fixes all three.
date: 2026-10-06
tags: [workflow]
---

<figure class="fig">
<svg viewBox="0 0 640 336" role="img" aria-labelledby="fig1-t fig1-d" xmlns="http://www.w3.org/2000/svg">
<title id="fig1-t">Three columns: source, selection, installed copy</title>
<desc id="fig1-d">Two lanes run left to right. The personal lane goes from a skills repo on GitHub, through the global manifest kept in dotfiles, to the user-level directories of each agent. The project lane goes from skills and rules directories inside the repo, through the committed project manifest, to the gitignored .claude directories. An upstream row of third-party GitHub and npm sources sits between the lanes and feeds both manifests.</desc>
<text x="136" y="18" text-anchor="middle" font-family="monospace" font-size="11" fill="#c9d3df">source</text>
<text x="136" y="32" text-anchor="middle" font-family="monospace" font-size="9.5" fill="#57626f">where it is edited</text>
<text x="320" y="18" text-anchor="middle" font-family="monospace" font-size="11" fill="#c9d3df">selection</text>
<text x="320" y="32" text-anchor="middle" font-family="monospace" font-size="9.5" fill="#57626f">manifest + lock</text>
<text x="530" y="18" text-anchor="middle" font-family="monospace" font-size="11" fill="#c9d3df">installed copy</text>
<text x="530" y="32" text-anchor="middle" font-family="monospace" font-size="9.5" fill="#57626f">generated, never edited</text>
<path d="M4 42 H636" stroke="#29323f"/>
<text x="4" y="86" font-family="monospace" font-size="11" fill="#4d8bf5">you</text>
<rect x="56" y="64" width="160" height="56" rx="4" fill="#0d1219" stroke="#4d8bf5"/>
<text x="136" y="84" text-anchor="middle" font-family="monospace" font-size="10.5" fill="#c9d3df">github:you/skills</text>
<text x="136" y="99" text-anchor="middle" font-family="monospace" font-size="9.5" fill="#57626f">skills/  rules/</text>
<text x="136" y="113" text-anchor="middle" font-family="monospace" font-size="9.5" fill="#57626f">one repo, pushed</text>
<path d="M216 92 H236" stroke="#57626f"/>
<path d="M232 88 L238 92 L232 96" fill="none" stroke="#57626f"/>
<rect x="240" y="64" width="160" height="56" rx="4" fill="#0d1219" stroke="#4d8bf5"/>
<text x="320" y="84" text-anchor="middle" font-family="monospace" font-size="10.5" fill="#c9d3df">~/.config/skillfold/</text>
<text x="320" y="99" text-anchor="middle" font-family="monospace" font-size="9.5" fill="#57626f">skillfold.yaml + .lock</text>
<text x="320" y="113" text-anchor="middle" font-family="monospace" font-size="9.5" fill="#57626f">kept in dotfiles</text>
<path d="M400 92 H438" stroke="#57626f"/>
<path d="M434 88 L440 92 L434 96" fill="none" stroke="#57626f"/>
<rect x="442" y="64" width="176" height="56" rx="4" fill="#0d1219" stroke="#29323f"/>
<text x="530" y="84" text-anchor="middle" font-family="monospace" font-size="10.5" fill="#828f9e">~/.claude/{skills,rules}</text>
<text x="530" y="99" text-anchor="middle" font-family="monospace" font-size="9" fill="#828f9e">~/.agents/skills, ~/.codex/AGENTS.md</text>
<text x="530" y="113" text-anchor="middle" font-family="monospace" font-size="9.5" fill="#57626f">install -g --frozen</text>
<text x="4" y="176" font-family="monospace" font-size="11" fill="#828f9e">others</text>
<rect x="56" y="154" width="160" height="44" rx="4" fill="#0d1219" stroke="#29323f" stroke-dasharray="3 3"/>
<text x="136" y="172" text-anchor="middle" font-family="monospace" font-size="10.5" fill="#828f9e">upstream, unchanged</text>
<text x="136" y="187" text-anchor="middle" font-family="monospace" font-size="9.5" fill="#57626f">github:org/repo  npm:pkg</text>
<path d="M216 176 H226 V126 M226 176 V226" fill="none" stroke="#57626f" stroke-dasharray="3 3"/>
<path d="M226 126 H236 M232 122 L238 126 L232 130" fill="none" stroke="#57626f" stroke-dasharray="3 3"/>
<path d="M226 226 H236 M232 222 L238 226 L232 230" fill="none" stroke="#57626f" stroke-dasharray="3 3"/>
<text x="4" y="266" font-family="monospace" font-size="11" fill="#d9a032">project</text>
<rect x="56" y="232" width="160" height="56" rx="4" fill="#0d1219" stroke="#d9a032"/>
<text x="136" y="252" text-anchor="middle" font-family="monospace" font-size="10.5" fill="#c9d3df">./skills/  ./rules/</text>
<text x="136" y="267" text-anchor="middle" font-family="monospace" font-size="9.5" fill="#57626f">inside the repo</text>
<text x="136" y="281" text-anchor="middle" font-family="monospace" font-size="9.5" fill="#57626f">reviewed like code</text>
<path d="M216 260 H236" stroke="#57626f"/>
<path d="M232 256 L238 260 L232 264" fill="none" stroke="#57626f"/>
<rect x="240" y="232" width="160" height="56" rx="4" fill="#0d1219" stroke="#d9a032"/>
<text x="320" y="252" text-anchor="middle" font-family="monospace" font-size="10.5" fill="#c9d3df">./skillfold.yaml</text>
<text x="320" y="267" text-anchor="middle" font-family="monospace" font-size="9.5" fill="#57626f">+ skillfold.lock</text>
<text x="320" y="281" text-anchor="middle" font-family="monospace" font-size="9.5" fill="#57626f">both committed</text>
<path d="M400 260 H438" stroke="#57626f"/>
<path d="M434 256 L440 260 L434 264" fill="none" stroke="#57626f"/>
<rect x="442" y="232" width="176" height="56" rx="4" fill="#0d1219" stroke="#29323f"/>
<text x="530" y="252" text-anchor="middle" font-family="monospace" font-size="10.5" fill="#828f9e">.claude/{skills,rules}</text>
<text x="530" y="267" text-anchor="middle" font-family="monospace" font-size="9.5" fill="#57626f">gitignored</text>
<text x="530" y="281" text-anchor="middle" font-family="monospace" font-size="9.5" fill="#57626f">install --frozen in CI</text>
<path d="M4 304 H636" stroke="#29323f"/>
<text x="320" y="326" text-anchor="middle" font-family="monospace" font-size="9.5" fill="#57626f">the agent reads both lanes together at runtime; nothing here merges them</text>
</svg>
<figcaption>Every skill and rule has three homes: where you edit it, the manifest that selects and pins it, and the generated copy the agent reads. Upstream skills are selected from the same manifests and never copied in.</figcaption>
</figure>

You wrote a skill and it works. Now it needs a home, and the obvious
answers are all wrong in a few months. Drop it in `~/.claude/skills` and
it exists on one machine with no history. Commit it to the project's
`.claude/skills` and a second project copies it, and the copies drift.
Keep it in dotfiles as a local path and nobody else can install it, and
neither can your CI.

Short answer: skills you use everywhere live in one GitHub repo of your
own; skills for one project live in that project's `skills/` directory.
In both cases a manifest selects them and skillfold generates the copy
the agent reads. So every skill has three homes: the source you edit,
the manifest that selects and pins it, and the generated copy. Keep
those three apart and the layout follows. The table gives the answer per
case.

## Where does this go?

| You have | Source | Selected by |
| --- | --- | --- |
| A skill for every machine | `github:you/skills/skills/<name>` | global manifest |
| A skill only this repo needs | `./skills/<name>` | project manifest |
| A skill for a tool this repo depends on | `npm:<pkg>/<skill>@installed` | project manifest |
| A skill shared by several of your repos | `github:you/skills/skills/<name>@v1` (pinned to a tag) | each repo's manifest |
| Someone else's skill | its own home, unchanged | whichever level needs it |
| A standing instruction, personal | `github:you/skills/rules/<name>.md` | global manifest (optionally limited to one agent or host) |
| A standing instruction, this repo | `./rules/<name>.md` | project manifest |

The global manifest installs into `~/.claude/skills` and `~/.claude/rules`;
the project manifest into `.claude/skills` and `.claude/rules` inside the
repo. Adding `codex` to the manifest's `targets` list also writes
`~/.agents/skills` and a generated block in `~/.codex/AGENTS.md` (or
`.agents/skills` and `AGENTS.md` for a project). The sections below
explain each row.

## Source, selection, installed copy

**Source is where the skill is edited.** It has a git history and a
review process, and it is the only copy anyone changes.

**Selection is the manifest and lockfile.** The manifest says which
skills and rules this level wants and from where; the lockfile pins each
remote one to a commit and a content hash (a local `./` source is read
as it is on disk, so it has no pin). Together they are the reproducible
part: `skillfold install --frozen` turns them back into files on any
machine.

**The installed copy is generated.** `~/.claude/skills`, `.claude/skills`,
`~/.agents/skills` and the managed block in `AGENTS.md` are build output.
Edit one and `skillfold check` reports the edit as drift; the next
`install` replaces it with the pinned content.

Skillfold applies the same three-part layout at two levels, global and
project, and keeps them independent. The
[global level](https://github.com/byronxlg/skillfold/blob/main/docs/cli.md#global-vs-project)
(`-g`) manages your user-level directories from a manifest in
`~/.config/skillfold/`; the project level manages one repository from a
manifest at its root. Nothing is merged between them, because the agents
already read both levels at runtime. Two levels because personal rules,
such as your communication style or notification channel, should not sit
in a project manifest, where everyone who clones the repo would receive
them.

## Personal skills: one repo, selected from dotfiles

Skills you use everywhere belong in a repository of their own, pushed to
GitHub, with the same shape a published skill set has:

```text
you/skills
  skills/
    obsidian/SKILL.md
    tts/SKILL.md
    tts/scripts/speak.sh
  rules/
    communication-style.md
    hosts/
      work-laptop/telegram.md
```

Then the global manifest, kept in your dotfiles so it travels with the
rest of your shell, points at that repo rather than at a path on disk.
Third-party skills sit in the same manifest, pinned to their own repos:

```yaml
# ~/.config/skillfold/skillfold.yaml
targets: [claude, codex]
skills:
  obsidian: github:you/skills/skills/obsidian
  tts:
    source: github:you/skills/skills/tts
    targets: [claude]
  frontend-design: github:anthropics/skills/skills/frontend-design
rules:
  communication-style: github:you/skills/rules/communication-style.md
  telegram:
    source: github:you/skills/rules/hosts/work-laptop/telegram.md
    hosts: [work-laptop]
```

Why a GitHub source rather than `./skills/obsidian` inside dotfiles? A
local source is never pinned, because you are editing it. A GitHub source
gets three things a local one cannot:

- A commit SHA and a content hash in the lockfile, so the lockfile is a
  statement of exactly which version every machine has.
- Drift detection: `skillfold check -g` on any machine says whether its
  installed copy matches that lockfile.
- A public address: a colleague can `skillfold add
  github:you/skills/skills/obsidian` without cloning your dotfiles (a
  private repo needs `GITHUB_TOKEN` set).

On a new machine the whole setup is the dotfiles checkout plus one
command:

```sh
skillfold install -g --frozen
```

Editing a skill becomes a loop with a push in the middle: change it in
the skills repo, push, then `skillfold update -g obsidian` to move the pin,
`skillfold check -g` to confirm, and commit the lockfile in dotfiles. The
other machine pulls dotfiles and runs `install -g --frozen`, and gets the
pinned commit rather than whatever is on `main` by then.

## Project skills: a directory in the repo

A skill that only makes sense inside one repository belongs in that
repository, next to the code it describes and reviewed with it. This is
the one case for a local source:

```text
your-app
  skillfold.yaml          # committed
  skillfold.lock          # committed
  skills/
    release-checklist/SKILL.md
  rules/
    conventions.md
  .claude/
    settings.json         # committed, yours
    skills/               # gitignored, generated by install
    rules/                # gitignored, generated by install
```

```yaml
# ./skillfold.yaml
targets: [claude]
skills:
  release-checklist: ./skills/release-checklist
  playwright-cli: npm:@playwright/cli/skills/playwright-cli@installed
rules:
  conventions: ./rules/conventions.md
```

Gitignoring the installed directories is a recommendation, not something
`skillfold init` does for you. It is the same choice as ignoring
`node_modules`: CI runs `skillfold install --frozen` to recreate them
from the lockfile before any agent starts, and a fresh clone does the
same. The rest of `.claude/` (settings,
hooks) stays yours and stays committed.

Two things do not belong in `./skills`. Third-party skills come from their
upstream repo or package and stay pinned there; copying one in means
nobody notices when upstream fixes it. And a skill that documents a tool
the project depends on should follow the installed version of that tool
with [`@installed`](https://github.com/byronxlg/skillfold/blob/main/docs/manifest.md#following-an-installed-package-installed),
so the next `skillfold install` after a dependency bump moves the skill
with it.

## Rules follow the same split

A rule is a single markdown file the agent loads on its own, with no
task to trigger it. A skill is a procedure it reaches for when a task
matches. The layout is the same as for skills. Personal rules live in
the skills repo under `rules/` and are selected from the global manifest;
project conventions live in the project and are selected from its
manifest.

Rules have one selector skills do not. `targets` works on both and
restricts an entry to one agent, which is how a Codex-only compatibility
note stays out of Claude Code. `hosts` is rules-only and restricts a rule
to exact hostnames, so a rule about a notification channel that exists
on one machine is still declared and pinned everywhere but installed
only where it applies. Every machine shares one manifest and one
lockfile; `skillfold list -g` marks the rules that are not selected on
the current host.

What goes in a rule and what goes in a skill is a judgement about
behaviour versus procedure. The test: if ignoring the instruction would
be wrong in any session, it is a rule; if it only matters once a
particular kind of task starts, it is a skill. "Never use em dashes" is a
rule. "How to publish a release" is a skill. Keep rules short, because
every rule is in every prompt and a long one is paid for on every turn.
Keep facts out of them, because a rule that explains how a system works
goes stale faster than a rule that says how to behave.

## Three mistakes to avoid

- **Editing the installed copy.** `check` flags it as drift and the next
  `install` replaces it. The edit belongs in the source.
- **The same name at both levels.** The agent sees both, and which one
  wins is up to the agent (see below). Pick distinct names.
- **A source nothing else can fetch from.** A local path in dotfiles is
  how one machine ends up with the only good version. A commit that was
  never pushed has a pin no other machine can resolve.

## What this does not solve

Which copy wins when a project skill and a user skill share a name is
the agent's behaviour, not skillfold's. Skillfold warns about skill
collisions in project-mode `check` and `list`, never about rule
collisions, and never resolves either. It does not know how each agent
orders the two levels.

Reproducing a selection is not choosing one. Skillfold cannot tell a
good skill from a bad one, and the rule-versus-skill judgement above is
yours. `check` compares one machine's files to its lockfile; agreement
between machines comes from both committing to the same lockfile, not
from skillfold comparing them.

If you add `cursor` to `targets`: its user-level rules live in the app,
not on disk, so a global manifest cannot install rules for it. Cursor
rules work at the project level only.

The reference for the manifest keys used here is in
[docs/manifest.md](https://github.com/byronxlg/skillfold/blob/main/docs/manifest.md);
the two-level model is in
[docs/cli.md](https://github.com/byronxlg/skillfold/blob/main/docs/cli.md#global-vs-project).
