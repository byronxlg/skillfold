---
title: How to share one set of agent skills across a team without copying directories
description: Copying .claude/skills between repos and laptops drifts silently. A manifest and lockfile setup lets a teammate clone, install, and get the same skills.
date: 2026-11-02
tags: [workflow]
---

The usual way a team shares agent skills is to copy a directory. Someone zips up `.claude/skills`, pastes it into a wiki, or commits it into three repos by hand. It works on day one. By week four each copy has been edited a little, nobody knows which one is current, and two people on the same project are running different instructions.

The underlying problem is that the skills directory is installed output with no record of where it came from. The fix is the one package managers settled on long ago: commit a small declaration of what you want, commit a lockfile of what it resolved to, and let each machine regenerate the output. This post walks through that setup end to end with [skillfold](https://github.com/byronxlg/skillfold), including the parts it does not solve.

## Step 1: declare the shared set once

In the repo that should own the team's setup, a `skillfold.yaml` lists each skill and where it comes from. Sources can be local paths, GitHub directories, or npm packages ([manifest reference](https://github.com/byronxlg/skillfold/blob/main/docs/manifest.md)):

```yaml
skills:
  review: ./skills/review
  frontend-design: github:anthropics/skills/skills/frontend-design@main
```

Skills the team writes live in `./skills/` and are reviewed like any other code. Skills from elsewhere are named by source, not copied in. The `@main` there is a branch, which moves, so the next step matters.

## Step 2: install and commit the manifest and the lockfile

```sh
skillfold install
```

This materializes each skill into `.claude/skills/` and writes `skillfold.lock`. For remote skills the lockfile records the exact commit SHA or npm version plus a sha256 content hash. Local skills are recorded by source string only, since they are your own files and change freely. Commit `skillfold.yaml` and `skillfold.lock`.

Because `install` reuses an existing pin instead of re-resolving the branch, a teammate who runs it next month gets the same commit you pinned, not whatever `main` points at that day. The details of which command is allowed to move pins are in [the earlier post on install, update, and --frozen](/blog/install-update-frozen/).

## Step 3: teammates clone and install

A new teammate, or a fresh CI container, runs:

```sh
skillfold install --frozen
```

`--frozen` is the `npm ci` analogue ([CLI reference](https://github.com/byronxlg/skillfold/blob/main/docs/cli.md)). It installs precisely the pinned revisions, verifies the content hashes, fails if the manifest and lockfile disagree, and never rewrites the lockfile. The skills they get are the ones in the commit they checked out.

Changing the shared set is then an ordinary pull request. Someone runs `skillfold update` or edits a source string, and the diff shows the old and new SHA in `skillfold.lock`. Reviewers see which upstream revision is about to reach every agent on the team.

## Step 4: fail the build when someone edits the output

The remaining way to drift is hand-editing the installed files. I reproduced this in a scratch project with one local skill:

```console
$ skillfold install
  + review                   ./skills/review

1 installed, 0 unchanged -> .claude/skills
lockfile: skillfold.lock
$ skillfold check
ok: 1 skill in sync
$ echo "tweak" >> .claude/skills/review/SKILL.md
$ skillfold check
skillfold check failed:
  - "review" is out of date with ./skills/review (run "skillfold install")
$ skillfold list
  name    source           pinned  status
  review  ./skills/review  -       modified
```

`check` is offline and exits nonzero on any problem: a lockfile that does not cover the manifest, a missing install, a remote skill whose files no longer match the locked hash, or a local skill that differs from its source. Add it to CI, either with the repo's [GitHub Action](https://github.com/byronxlg/skillfold/blob/main/action.yml) or as a plain step running `npx skillfold check`.

One safety property is worth knowing before you point this at a directory that already exists. skillfold only overwrites or prunes directories whose names appear in the lockfile. A hand-authored skill in `.claude/skills` that is not in the manifest is left alone unless you pass `--force`.

## Sharing across several repos

If the team wants the same set in many repos, there are two workable shapes:

- Publish the shared skills as an npm package and reference them as `npm:your-package/skill-name@1.2.0` from each repo's manifest. Each repo then pins the version it has adopted. Publishing is covered in [the publishing doc](https://github.com/byronxlg/skillfold/blob/main/docs/publishing.md).
- Keep them in one Git repository and reference directories with `github:org/repo/path@ref`.

In both cases each consuming repo carries its own lockfile, so each upgrades on its own schedule.

## What this does not solve

- **It does not decide which skills are good.** The lockfile guarantees everyone runs the same bytes. It says nothing about whether those bytes are safe or useful. A pinned skill with a bad instruction is reproducibly bad. Review the content when a pin moves; the lockfile diff only tells you that it moved.
- **It does not stop someone bypassing it.** A person can still drop a file into `.claude/skills` by hand. `check` catches managed skills that were modified or missing, but a skill that is not in the manifest is simply not managed, so the check has no opinion about it.
- **Private sources need credentials on every machine and in CI.** Each teammate and each runner must be able to reach the repo or registry the manifest names.
- **Nothing here enforces policy on the agent side.** The agent still reads whatever is in its skills directory at runtime. This setup makes that directory reproducible; it does not restrict what the agent does with it.
- **Local skills are not content-pinned.** They are recorded by source string, so the guarantee for them is that `check` compares the installed copy against the file in the repo, not that the content is frozen.

If your team is small and has one repo, committing `.claude/skills` directly is a defensible choice, and the manifest adds little. The setup above pays for itself when the same skills must live in more than one place, or when you want an upstream change to arrive as a reviewable diff instead of a silent overwrite.
