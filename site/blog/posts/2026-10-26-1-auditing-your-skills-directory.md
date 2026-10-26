---
title: How to audit what is actually in your .claude/skills directory
description: Listing a skills directory is easy. Knowing which entries you chose, which drifted, and which nobody declared is harder. A practical audit, and its limits.
date: 2026-10-26
tags: [workflow]
---

Open `.claude/skills` in a project you have worked in for a few months and try to answer three questions. Which of these skills did you choose on purpose? Does each one still match what you chose? Is anything here that nobody remembers adding?

A plain `ls` answers none of them. It shows names. This post walks through an audit that does answer them, using only what skillfold actually checks, and says clearly which of the three questions it cannot answer.

## Three different things can be wrong

A skills directory can disagree with your intent in three distinct ways, and they need different tools.

| Problem | Example | Visible to a manifest-based check? |
|---|---|---|
| Missing | A declared skill was never installed, or was deleted | Yes |
| Drifted | A declared skill's files were edited in place | Yes |
| Undeclared | A directory nobody listed in the manifest | No |

The first two are comparisons between a declaration and the disk. The third has no declaration to compare against, which is the interesting one.

## Step 1: declare what you intend to have

Auditing needs a statement of intent. In skillfold that is `skillfold.yaml`, with remote sources pinned in `skillfold.lock` (a commit SHA or exact version plus a sha256 content hash, per [the manifest reference](https://github.com/byronxlg/skillfold/blob/main/docs/manifest.md)). Local sources are recorded without a pin, since they are your own files.

I built a scratch project with one declared local skill and one directory that arrived some other way, a skill pasted from a gist straight into `.claude/skills/found-online`:

```console
$ skillfold install
  + commit-helper            ./skills/commit-helper

1 installed, 0 unchanged -> .claude/skills
lockfile: skillfold.lock
```

## Step 2: list and check

`skillfold list` prints a status for each declared skill and rule. `skillfold check` verifies the same agreement offline and exits nonzero on any problem, so it works in CI. The [CLI reference](https://github.com/byronxlg/skillfold/blob/main/docs/cli.md) lists what it covers: the lockfile matching the manifest, every entry installed, remote entries matching their content hash, local entries matching their source, and composed skills matching what their inputs would generate.

On the clean scratch project:

```console
$ skillfold list
  name           source                  pinned  status
  commit-helper  ./skills/commit-helper  -       ok

$ skillfold check
ok: 1 skill in sync
```

Now edit the installed copy in place, which is the drift case:

```console
$ echo "tampered" >> .claude/skills/commit-helper/SKILL.md
$ skillfold list
  name           source                  pinned  status
  commit-helper  ./skills/commit-helper  -       modified

$ skillfold check
skillfold check failed:
  - "commit-helper" is out of date with ./skills/commit-helper (run "skillfold install")
```

The statuses are `ok`, `not installed`, `modified`, `not locked`, and `stale` (for `@installed` npm sources), plus `not selected` for rules that do not apply to the current target. For an otherwise healthy skill, `list` also surfaces a frontmatter problem, such as a missing `description`, in place of `ok`. A skill without a description still installs, it just gives the agent nothing to match against.

## Step 3: the undeclared directory

Here is the part that surprised me when I ran it. With `found-online` still sitting in `.claude/skills`, the first `check` above reported `ok: 1 skill in sync` and exited 0:

```console
$ ls .claude/skills
commit-helper
found-online
```

Neither `list` nor `check` mentions it. That is by design, not an oversight: skillfold reasons about the names in the manifest and the lockfile. In `src/install.ts`, a directory is only ever overwritten or pruned if its name appears in the lockfile (the "managed" set), so a hand-authored directory is left alone. The consequence is that the same rule that keeps skillfold from destroying your files also keeps it from reporting them.

You find undeclared directories by comparing the directory listing against `skillfold list`. Anything in the first and not the second is something you did not declare. For each one, you decide: delete it, or declare it.

## Step 4: adopt or remove

To adopt `found-online`, I copied it to `./skills/found-online`, edited it, and declared it. A plain `install` refuses to replace the unmanaged copy:

```console
$ skillfold install
error: .claude/skills/found-online already exists and was not
installed by skillfold. Move it aside, pick another name, or rerun
with --force to overwrite it.
```

(The real message is one line; I wrapped it here.) That refusal is the audit doing its job: the directory on disk and the one you declared differ, and skillfold will not choose between them silently. After reviewing the difference, `install --force` replaces the directory, records it in the lockfile, and from then on it is managed:

```console
$ skillfold install --force
  = commit-helper            ./skills/commit-helper
  + found-online             ./skills/found-online

1 installed, 1 unchanged -> .claude/skills
lockfile: skillfold.lock
$ skillfold check
ok: 2 skills in sync
```

If you decide a directory should not exist, delete it. skillfold never will, because it never learned the name.

## Make it routine

Run `skillfold check` in CI so drift in declared skills fails a pull request. The repository ships [a GitHub Action](https://github.com/byronxlg/skillfold/blob/main/action.yml) that wraps it. Add the directory-versus-`list` comparison to whatever periodic review you already do for dependencies.

## What this does not solve

Be clear about the limits.

- **Undeclared directories are not detected.** As shown above, `check` passes while an unlisted skill sits in the directory. skillfold has no mode that flags unmanaged entries, so that half of the audit is a manual comparison or a script you write.
- **A status of `ok` is not a review.** It means the files match what you declared or pinned. It says nothing about whether the instructions in them are safe or good. Reading the skill is still your job.
- **Local skills are checked against your working tree, not against history.** Because local sources carry no pin, `ok` means the installed copy matches the file you currently have, including any change you made yourself.
- **It sees the directories it manages.** Skills a tool loads from other places, such as a user-level directory, a plugin, or another agent's location, are outside one project manifest. Project-mode `list` and `check` do warn when a project skill name is also installed at the user level, but that is a name collision warning, not an inventory.

The useful habit is small: decide what you intend to have, let a command compare the disk against it, and treat anything the command cannot see as your own to inspect.
