---
title: Install, update, and --frozen - which one moves your skills?
description: A branch name is not a version. Here is exactly when skillfold install, update, and install --frozen change what lands in .claude/skills, and when they refuse.
date: 2026-10-12
tags: [concepts]
---

A skill source like `github:owner/repo/skills/review@main` names a branch, and a branch moves. If your manifest only stored that string, two people running the same command a week apart could install different instructions into their agents, and neither would see a diff.

The lockfile exists to remove that ambiguity. What is less obvious is which command is allowed to touch it. There are three that matter: `install`, `update`, and `install --frozen`. They differ in one thing, which is how much they are allowed to change.

## What the lockfile records

For each remote skill or rule, `skillfold.lock` stores the source string as written in the manifest, the exact pin it resolved to (a commit SHA for GitHub, an exact version for npm), and a sha256 content hash. Local sources are recorded with only their source string: they are your files, and they change freely. The shape is defined in `src/lock.ts` and described in [the manifest reference](https://github.com/byronxlg/skillfold/blob/main/docs/manifest.md).

## install: reuse the pin, resolve only what is new

`install` reads the lockfile first. For each remote entry, if the lockfile has a pin and its recorded source string equals the one in the manifest, that pin is reused and no ref is re-resolved. The logic is a few lines in `shouldReusePin` in `src/resolve.ts`: a pin is reused only when the entry exists, the source string matches, and a pin is present.

Two things follow:

- A branch moving upstream changes nothing on your machine. You keep the pinned commit until you ask otherwise.
- Editing the source string in the manifest, say from `@main` to `@v2`, makes the entry stop matching, so it is resolved fresh and re-pinned. New entries are resolved and pinned the same way.

`install` also writes the lockfile, so after adding or changing a source you commit the new lock alongside the manifest.

## update: the one command that moves pins

`update` re-resolves refs past their pins: branches move to their new head, and `latest` moves to the newest version. With names, it moves only those skills; with none, it moves all of them. It then reinstalls and rewrites the lockfile ([CLI reference](https://github.com/byronxlg/skillfold/blob/main/docs/cli.md)).

The practical effect is that upgrading becomes a reviewable event. The lockfile diff shows old and new SHAs, and the commit that contains it is the place to look at what changed upstream before it reaches an agent.

Sources pinned with `@installed` are the exception: they follow whatever version of an npm package your project has installed, so `install` re-pins them on its own and `update` has nothing to do for them.

## install --frozen: fail instead of fix

`--frozen` is for CI and for fresh machines. The CLI docs compare it to `npm ci`. Where `install` repairs a mismatch by resolving and rewriting, `--frozen` treats the mismatch as an error and never rewrites the lockfile. Concretely, in `src/resolve.ts` it:

- fails if the manifest and lockfile disagree on which skills exist or what their source strings are;
- fails if a remote skill has no pin;
- reinstalls the pinned revision rather than resolving the ref again;
- recomputes the sha256 of the fetched content and fails if it differs from the recorded hash;
- fails if a composed skill would generate different content than the lock records.

Here is a real run. A project has one local skill, installed once, then a remote skill is added to the manifest by hand without running `install`:

```console
$ skillfold install
  + hello                    ./skills/hello

1 installed, 0 unchanged -> .claude/skills
lockfile: skillfold.lock

$ skillfold install --frozen
  = hello                    ./skills/hello

0 installed, 1 unchanged -> .claude/skills

$ # add "review: github:anthropics/skills/skills/frontend-design@main"
$ skillfold install --frozen
error: --frozen: lockfile is out of sync with the manifest:
  - "review" is in the manifest but not the lockfile
```

The last command exits nonzero before any network request. That is the point: a pull request that edits the manifest but forgets the lockfile stops in CI, and nobody gets a surprise resolution of `@main` at install time.

## Where check fits

`skillfold check` is the offline cousin. It does not fetch anything. It verifies that the lockfile covers exactly the manifest, that every skill is installed, and that what is on disk matches the lockfile hash. On the same drifted project it reports both problems:

```console
$ skillfold check
skillfold check failed:
  - "review" is in the manifest but not the lockfile
  - "review" is not installed (run "skillfold install")
```

Use `--frozen` where you are about to install, and `check` where you only want to know whether the working tree is honest.

## A short rule of thumb

| Situation | Command |
|---|---|
| Added or edited a source | `install`, then commit manifest and lock |
| Want newer upstream revisions | `update`, then review the lock diff |
| CI, or a new machine | `install --frozen` |
| Quick "is anything drifted" | `check` |

## What this does not solve

A pin makes a revision stable. It does not make it good. The first `install` of a new source trusts whatever the ref pointed to at that moment, and the content hash only proves that later installs match that first fetch. If a skill was already malicious when you pinned it, `--frozen` will reproduce it faithfully on every machine.

Likewise, `update` shows you that the SHA changed, not whether the new instructions are safe. Reading the upstream diff is still your job, and local skills have no pin at all: `--frozen` does not hash them into the lockfile, and `check` can only tell you whether the installed copy still matches the source file next to the manifest.

Reproducibility and trust are separate properties. The lockfile gives you the first, and the second still needs a human or a scanner looking at the content.
