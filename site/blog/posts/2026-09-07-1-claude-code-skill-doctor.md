---
title: Claude Code will tell you which skills are dead weight. It won't tell you if they drifted.
description: Claude Code's new /skill-doctor flags unused skills and their context cost per session - a usage read, not a check on what's actually declared or installed.
date: 2026-09-07
tags: [ecosystem]
---

Every skill you load adds its description to context on every turn, whether
or not the agent ever reaches for it. As a `.claude/skills` directory grows -
one skill per workflow, one per integration, ones inherited from a team
manifest you didn't write - that cost is invisible. Nothing in a normal
session tells you that a skill has fired zero times in a week and is still
sitting in every prompt.

Claude Code now answers that question directly. Version 2.1.261, shipped
[September 4, 2026 per the official changelog](https://code.claude.com/docs/en/changelog),
added a new command:

> Added `/skill-doctor` to show which loaded skills go unused and what they
> cost in context, so you can prune them

## What it actually reports

The [Claude Code skills documentation](https://code.claude.com/docs/en/skills)
describes it under a section titled "Find unused skills":

> Every skill in the skill listing adds to your context on every turn,
> whether or not Claude ever uses it. Run `/skill-doctor` to see what each of
> your skills costs and how often it gets used, so you can decide which ones
> to turn off.

Running it interactively opens the report in the `/plugin` manager's Stats
tab; in headless mode with `-p`, Claude Code prints it as plain text. The
report is scoped to the current session - it "covers the skills in your
session other than bundled skills and enterprise skills," flags any skill in
the listing that has never been invoked, says where to turn it off, and
separately lists plugins you haven't used recently.

There are real constraints on when it works. It requires Claude Code
v2.1.252 or later, isn't available in sessions that skip feature-flag
fetching, and doesn't work at all over Remote Control - running it from a
phone or browser gets back "Skill usage reports are not available on this
connection," per the same docs page. You have to be at the terminal on the
machine actually running the session.

## The problem this targets is real

This is a direct answer to skill bloat, which is a genuine and growing
failure mode as teams accumulate skills faster than they retire them.
Anthropic's own framing names the cost precisely: context consumed on every
turn, independent of whether the skill contributes anything that turn. A
report that says "this skill has never fired and costs N tokens per prompt"
is exactly the missing signal for deciding what to cut, and building it into
the tool itself - rather than leaving it to a third-party audit skill - means
every Claude Code user gets it without installing anything.

## What it doesn't tell you

`/skill-doctor` measures one thing: usage and cost, observed in one running
session, on one machine. It has no opinion on where a skill came from, what
version it's supposed to be, or whether the copy on disk matches what your
team declared.

Concretely: say the report tells you `code-review` hasn't fired all week and
costs 800 tokens a turn, so you delete `.claude/skills/code-review` by hand.
That decision lives nowhere. It isn't recorded in a manifest, it doesn't
propagate to a teammate's machine, and if anything - a setup script, a
colleague's `git pull` of a shared dotfiles repo, a fresh `skillfold install`
- re-materializes that directory from its declared source, your pruning
silently reverts with no diff to explain why. The report also can't catch
the opposite failure: a skill that *is* getting invoked but is running
different content than what's declared, because someone hand-edited the
installed copy after the fact. Usage and cost say nothing about integrity.

skillfold's own `check` and `list` commands sit on the exact other side of
that line and don't overlap with `/skill-doctor` at all. They're offline:
`skillfold list` computes each skill's status by comparing the manifest
entry, the lockfile pin, and a sha256 hash of what's on disk
(`src/list.ts`), and `skillfold check` fails nonzero on any mismatch. Neither
command runs a session, invokes an agent, or has any way to know whether a
given skill was used once or a thousand times, or how many tokens its
frontmatter cost on any particular turn - that information doesn't exist
outside a live session, and skillfold never starts one. A skill can show
`ok` in `skillfold list` - content matches exactly what the team pinned -
while `/skill-doctor` reports it dead weight in every session for a month.
Both reports would be correct, because they're answering different
questions: one is "does what's installed match what's declared," the other
is "is what's installed worth its keep."

Deciding to prune a skill needs both. `/skill-doctor` tells you it's safe to
consider removing; a manifest change and `skillfold remove` (or the
equivalent hand-edit plus reinstall) is what makes that removal durable and
visible to everyone else running the same config. Neither tool does the
other's job, and nothing currently connects the two - a session-scoped usage
report and a declarative manifest are, for now, two separate places to look.
