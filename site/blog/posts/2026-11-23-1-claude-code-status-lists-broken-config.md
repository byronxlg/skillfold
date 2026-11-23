---
title: Claude Code now tells you which config files are broken. It cannot tell you which are stale.
description: Claude Code 2.1.327 and 2.1.329 add a /status list of broken skill files and a trust warning about where hooks are declared. What that covers and misses.
date: 2026-11-23
tags: [ecosystem]
---

Two recent Claude Code releases make the client more forthcoming about the
state of the configuration it loaded. The entries are in the
[official changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md),
which does not date them, so this post identifies them by version number.

## What the changelog says

**2.1.327 added a health list to `/status`.** The entry reads: "Added a list
in `/status` of broken agent, skill, command and output style files,
keybinding errors, an unavailable sandbox, ignored permission settings and
hook matchers that never match". Before this, a skill with unparseable
frontmatter could simply fail to show up, and finding out why meant opening
files by hand.

**2.1.329 added a hooks warning to the trust dialog.** The entry reads:
"Added a trust dialog warning that says where a folder's hooks are
declared". Hooks run commands, so a folder you have just cloned can ask to
run code. Saying where the declaration lives gives you something concrete to
read before you accept.

**2.1.327 also tightened one path check.** The entry reads: "Changed path
checks to refuse some symbolic links". The changelog does not say which
links, so this post does not guess.

None of these change where skills come from. They change how visible a
problem is once the files are on disk.

## What this fixes

The common failure for hand-managed config is silent. A skill file with a
typo in its frontmatter does not raise an error in the conversation; the
skill just never triggers. A list of broken files in `/status` turns that
into something you can find in one place. That is a real improvement for
anyone debugging their own setup.

The hooks warning addresses a different problem: trust at the moment you
open an unfamiliar folder. It is a prompt for a human, and its value
depends on the human reading it.

## What it cannot see

Both features answer the question "does this file load?". Neither answers
"is this the file I meant to have?". A skill that parses cleanly, has a
good description, and was quietly edited since you last reviewed it
looks healthy to `/status`. So does a skill that was copied from an
upstream repository months ago and has since moved on. Broken and stale are
different failure modes, and the new list only covers the first.

The same gap exists on the trust side. The hooks warning tells you where
hooks are declared at the time you open the folder. It does not tell you
whether the hooks differ from the ones you approved last week.

## Where a lockfile fits

A manifest and lockfile answer the second question. skillfold records the
exact revision and a sha256 content hash for each remote skill, and
`skillfold check` compares what is installed against that record without
touching the network. Here is a real run from a scratch directory with one
local skill. First a clean check, then a check after appending a line to
the installed `SKILL.md`:

```console
$ skillfold check
ok: 1 skill in sync
$ echo edited >> .claude/skills/demo/SKILL.md
$ skillfold check
skillfold check failed:
  - "demo" is out of date with ./skills/demo (run "skillfold install")
```

The second command exits nonzero, so it can gate CI. The
[CLI reference](https://github.com/byronxlg/skillfold/blob/main/docs/cli.md)
lists everything `check` verifies: lockfile coverage, installed
presence, content hashes for remote sources, and agreement with the source
for local and composed skills.

The two tools are complementary. `/status` tells you a file is malformed.
`check` tells you a file is not the one the manifest says it should be. A
file can fail either test independently.

## What skillfold does not solve here

Several things stay out of reach.

- **It does not validate that a skill works.** `check` prints a non-fatal
  `warning:` when an installed `SKILL.md` has no `description` or has
  unparseable frontmatter, but it does not fail on it, and it does not
  know about hook matchers, sandbox availability, or permission settings.
  Claude Code's `/status` list covers ground skillfold does not.
- **It does not manage hooks.** Skillfold installs skills and rules.
  Hooks declared in a folder's settings are outside the manifest, so
  the new trust warning is not something a lockfile replaces.
- **It does not review content.** A hash proves a skill is unchanged since
  you pinned it. It says nothing about whether the pinned content was safe
  to begin with. That judgment stays with you.
- **It only sees what it manages.** Files in `.claude/skills` that are not
  in the lockfile are left alone, so a hand-added file can be broken,
  stale, or hostile without `check` noticing.

## Takeaway

Use `/status` to find config that is broken and `skillfold check` or an
equivalent to find config that drifted. Treat the trust dialog as a prompt
to read, not a verdict. Each tool covers one of these questions, and none of
them covers all three.
