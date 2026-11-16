---
title: Claude Code now pins marketplaces to a commit and fences off its own skills folder
description: Claude Code 2.1.323 and 2.1.325 add commit-ID marketplace pins, a submodule check and sandbox write protection for .claude. What each covers and misses.
date: 2026-11-16
tags: [ecosystem]
---

Two recent Claude Code releases changed how the client treats the folders and
sources that hold agent configuration. Read together, the entries in the
[official changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
for 2.1.323 and 2.1.325 describe a client that is getting stricter about
where config comes from and who is allowed to write to it. The changelog
does not date its entries, so this post identifies them by version number.

## What the changelog says

Three entries matter for anyone who distributes or consumes skills.

**Marketplace pins can be a commit.** In 2.1.325 the changelog says:
"Changed marketplace `ref` to accept the full ID of any commit on a branch
or tag; clients before this version can't clone such a pin, so a marketplace
pinned this way stops loading there". A marketplace is a git repository that
lists plugins, and `ref` is how you say which revision of it to use. Until
now a branch or tag name was the natural value, and both can move. A full
commit ID cannot.

The second half of that entry is a compatibility warning worth reading
twice. A team that pins by commit and has one teammate on an older client
gets a marketplace that "stops loading" for that teammate. A pin is only as
good as the oldest client that has to honor it.

**Installs fail on a mismatched submodule.** In 2.1.323: "Changed
marketplace and plugin installs to fail when a git submodule isn't on the
commit its repository records". A repository records, for each submodule,
the exact commit it expects. Before this, an install could proceed with a
submodule sitting on something else. Now the mismatch is an error.

**The sandbox protects `.claude`.** In 2.1.325: "Changed the sandbox to
refuse sandboxed writes to `.claude` settings, skills, agents, commands and
hooks in added directories, as it does in the launch folder". So a command
running inside Claude Code's sandbox cannot rewrite your skills or hooks,
and as of this release that holds for directories added to a session, not
only the one you launched from.

All three are the same idea at different layers: a reference to config
should name exactly one thing, and a running agent should not be able to
change that thing behind your back.

## What each one covers

| Change | Protects against | Layer |
|---|---|---|
| Commit-ID `ref` on marketplaces | a branch or tag moving after you vetted it | which revision of a marketplace you load |
| Submodule commit check | an install that quietly pulls unrecorded content | what a repository's own pins resolve to |
| Sandbox write protection | a sandboxed command editing skills, hooks, settings | the files on disk during a session |

Each is a real control, and each is scoped. The first two apply to
plugins and marketplaces. The third applies to sandboxed commands, which is
a narrower set than everything an agent can do.

## Where a skills manifest fits

Plugins and marketplaces are one distribution path. Many skills reach a
project another way: copied from a GitHub directory, or published as an
npm package. Those never touch the marketplace `ref`.

For that path, skillfold resolves a source to an
exact revision and records it in `skillfold.lock`. A GitHub source takes a
tag, branch, or commit SHA after `@`, per the
[manifest reference](https://github.com/byronxlg/skillfold/blob/main/docs/manifest.md),
and the lockfile stores the resolved commit and a sha256 of the content.
`install --frozen` fails on any drift and verifies the hashes.

It also covers the on-disk side in a limited way. I ran this in a scratch
directory: install one local skill, append a line to the installed
`SKILL.md`, then run `check`.

```console
$ skillfold install
  + demo                     ./sk

1 installed, 0 unchanged -> .claude/skills
lockfile: skillfold.lock
$ echo x >> .claude/skills/demo/SKILL.md
$ skillfold check
skillfold check failed:
  - "demo" is out of date with ./sk (run "skillfold install")
```

`check` exits non-zero, so a CI step catches an installed skill that no
longer matches what the manifest and lock say it should be.

## What skillfold does not solve

Be careful not to read the two sides as equivalent.

- **It does not prevent writes.** The sandbox change stops a sandboxed
  command from editing `.claude/skills` as it happens. skillfold only
  notices afterward, when `check` or `list` runs, and only if something
  runs them. A skill modified between two checks is modified until then.
- **It does not touch plugins or marketplaces.** The commit-ID `ref` and
  the submodule check are Claude Code features for its own plugin system.
  skillfold has no say in how a marketplace is loaded, and nothing in
  `skillfold.yaml` sets a marketplace pin.
- **A pin is not a review.** Pinning to a commit, in either system, means
  you get the same bytes tomorrow. It does not mean those bytes were safe
  today. Someone still has to read the skill before pinning it.
- **Local sources are not pinned.** A `./skills/...` entry is recorded
  without a revision because you are the one editing it, so drift in your
  own skills is a diff in your repository, not a lockfile failure.

## What to take from it

The direction of travel is consistent: name a revision, not a moving
label; fail loudly when what is installed is not what was recorded; keep
the running agent away from the files that define it. If you load config
through Claude Code's marketplaces, the commit-ID `ref` is now available,
with the compatibility caveat from the changelog. If you load skills some
other way, the same discipline applies and is your job to set up.
