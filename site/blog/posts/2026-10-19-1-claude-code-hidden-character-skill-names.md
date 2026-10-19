---
title: Claude Code now refuses skills whose names hide characters
description: Claude Code 2.1.299 stops offering skills with hidden or direction-changing characters in their names. What changed, what it covers, and what it leaves open.
date: 2026-10-19
tags: [ecosystem]
---

Claude Code 2.1.299, released on October 14, 2026 according to the
[official changelog](https://code.claude.com/docs/en/changelog), changed how
skills and custom commands are loaded. The entry reads:

> Changed skill and command loading: one whose file or folder name has hidden, direction-changing or blank-like characters, `<` or `>` is no longer offered until renamed; such a `name:` is ignored

That is one bullet in a long release, and it is easy to skim past. It is
worth a closer look because it puts a name check in the tool that runs the
skill.

## What the change does

A skill is a folder containing a `SKILL.md`. Its name shows up in three
places: the folder name, the `name:` field in the frontmatter, and the list
of skills the model is shown. All three are text, and text can contain
characters a reader cannot see.

The changelog names the classes of character it now rejects: hidden ones,
direction-changing ones (the Unicode controls that reorder how text is
displayed), blank-like ones, and the angle brackets `<` and `>`. If a skill
or command's file or folder name contains any of them, Claude Code stops
offering it until it is renamed. If only the `name:` field is affected, that
field is ignored.

The changelog does not say why, and this post will not guess at a motive. The
practical effect is clear from the text: a name that renders as one thing and
contains another no longer gets into the list the model sees.

The same release, per the same changelog, also changed
`UserPromptSubmit` hooks to run before a skill or custom slash command
expands, "so a hook that blocks the prompt now also stops its embedded shell
commands". That is a separate change, but it sits on the same path: what
happens between a skill being named and its text reaching the model.

An earlier release in this series made a related move on prompts. See
[Claude Code now labels what a subagent tells you](/blog/claude-code-subagent-injection-hardening/)
for 2.1.277, which stripped invisible Unicode tag and formatting characters
from prompts.

## Why this is a distribution question

Skills are copied between machines, cloned from registries, and installed
from packages. Wherever a name crosses a boundary, someone has to decide what
a valid name is. A name with an invisible character in it is, as far as I know, a
legal file name on common filesystems, so the filesystem will not make that
decision for you.

Moving the check into the loader means the rule holds regardless of how the
skill arrived: by hand, by `git clone`, by a package manager, or by a sync
from claude.ai. That is the right place for it, because the loader is the only
component every path goes through.

## What skillfold does here

skillfold has its own, stricter check. The
name you give a skill in `skillfold.yaml` is the name of the directory it
installs into, and `validateSkillName` in `src/manifest.ts` accepts only
lowercase letters, digits, and hyphens, up to 64 characters. I ran it against
a manifest whose skill name contained a right-to-left override character
(U+202E):

```console
$ skillfold install
error: Invalid skill name "evil<U+202E>name": use lowercase letters, digits, and hyphens (e.g. "code-review")
```

The real output contains the raw control character where I have written
`<U+202E>`, which is itself a small demonstration of the problem. A name with
a space and a capital letter fails the same way.

Two more behaviors are relevant, both from `src/skill.ts`:

- The installed directory name always comes from the manifest, never from the
  upstream folder name, so an upstream skill cannot choose its own install
  path.
- On install, the frontmatter `name:` is rewritten to the manifest name when
  the frontmatter parses as YAML, so an odd upstream `name:` value is replaced
  rather than carried through. Frontmatter that does not parse is left as it
  is.

## What skillfold does not solve

- **It does not look inside the skill.** The check covers names you write in
  the manifest. I found no check in `src/` for hidden or direction-changing
  characters in the names of supporting files inside a skill, nor in the text
  of `SKILL.md` itself. A skill from a registry can carry such characters in a
  file name and skillfold will pin and install it faithfully, because pinning
  records what the content is, not whether it is safe.
- **The sha256 in `skillfold.lock` proves sameness, not goodness.** A skill
  that was bad when you first installed it stays bad, reproducibly.
- **It cannot tell you what Claude Code will show.** The loader's rules are
  defined by the changelog entry above, which lists classes of character but
  not exact code points. skillfold's allowlist is narrower than that, so
  anything skillfold accepts for a manifest name is also outside the rejected
  classes. The reverse is not a guarantee about the contents of an installed
  skill.
- **Only Claude Code is covered.** The changelog entry describes Claude
  Code's loader. If you install for the `codex` or `cursor` targets, whatever
  those tools do with unusual names is their business, and I did not verify
  it.

## What to do with this

If you manage skills by hand, the new behavior can look like a skill that
silently disappeared. The changelog says the skill is "no longer offered until
renamed", so the fix is to rename the folder to plain ASCII. A quick way to
find candidates is to list names that contain anything outside printable
ASCII:

```sh
ls -1 .claude/skills ~/.claude/skills | LC_ALL=C grep -n '[^ -~]'
```

If something prints, rename it. If you install through a manifest, the manifest names
were already constrained. `skillfold list` shows whether each declared skill
is installed and unmodified; see the
[CLI reference](https://github.com/byronxlg/skillfold/blob/main/docs/cli.md).

The changelog entry is short, and the details beyond it are not public in
the source I read. If a skill of yours vanishes after upgrading, a
non-ASCII name is the first thing to check.
