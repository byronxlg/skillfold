---
title: How to publish an agent skill on npm so people can install it by name
description: A skill is a directory with a SKILL.md. Add an agentskills map to package.json, run npm publish, and consumers get a pinned, hash-checked install by name.
date: 2026-11-09
tags: [workflow]
---

If you wrote a skill that is useful to other people, the usual way to share it is a gist, a zip, or a link to a folder in a repo. Readers then copy the files by hand, and from that moment nobody can say which version they have. npm already solves versioned distribution, and a skill is just a directory, so a package is a reasonable container.

This post walks through publishing a skill as an npm package and installing it from a clean project. Every command output below comes from a run against skillfold 2.9.0. The consumer side uses [skillfold](https://github.com/byronxlg/skillfold), but the package itself is plain npm and does not depend on it.

## What a skill is

A skill is a directory containing a `SKILL.md` with YAML frontmatter (`name` and `description`) followed by the instructions, plus any supporting files. The `description` is what an agent reads to decide when to use the skill, so write it as "use when" guidance rather than a title. Everything inside the directory gets installed, so keep supporting files in there and nothing else.

## Step 1: lay out the package

```text
my-skills/
  package.json
  skills/
    tdd/
      SKILL.md
```

The `package.json` maps skill names to directories through an `agentskills` field. The map is a plain name to path object:

```json
{
  "name": "my-skills",
  "version": "1.0.0",
  "keywords": ["skillfold-skill"],
  "files": ["skills"],
  "agentskills": {
    "tdd": "./skills/tdd"
  }
}
```

Three details matter. `files` must include the skills directory, or the tarball ships without them. The `skillfold-skill` keyword is what makes the package show up in `skillfold search`. Names in the map should be lowercase-kebab, because installed directories are named after them. See [publishing docs](https://github.com/byronxlg/skillfold/blob/main/docs/publishing.md) for the full checklist.

If the package holds a single skill, you can skip the map and put `SKILL.md` at the package root. Consumers then use `npm:my-skill` with no subpath.

## Step 2: check what you are about to ship

Before `npm publish`, run `npm pack` and read the file list. Installed files land in other people's repositories, so this is the moment to catch a stray `.env` or a notes file. In my scratch package the tarball held exactly two files, `package.json` and `skills/tdd/SKILL.md`, which is what I wanted.

Then publish with `npm publish`. If you can, use trusted publishing from CI rather than a long-lived token.

## Step 3: install it by name

I did not publish my scratch package to the registry. Instead I installed the packed tarball into a fresh project with `npm i`, which puts it in `node_modules` the same way a registry install would, and then added the skill:

```sh
skillfold add npm:my-skills/tdd
```

```console
added tdd: npm:my-skills/tdd

  + skillfold-cli            npm:skillfold/skillfold-cli -> 2.9.0
  + hello-skillfold          ./skills/hello-skillfold
  + tdd                      npm:my-skills/tdd -> 1.0.0

3 installed, 0 unchanged -> .claude/skills
```

(The first two entries are the starter skills that `skillfold init` scaffolded in the scratch project.) The source string is `npm:<package>/<skill name>`. Skillfold looks the name up in the `agentskills` map, and falls back to treating it as a literal subpath if there is no map entry. A wrong name fails with a message listing what the package provides:

```console
error: Cannot resolve skill "nope": "nope" not found in package my-skills (package provides: tdd)
```

Resolution order is documented in `src/npm.ts`. The project's `node_modules` is used first when the installed version satisfies the request. Otherwise the exact version is downloaded from the registry with `npm pack` into a shared cache keyed by version, so repeat installs are offline.

## What the consumer gets

The install writes an entry to `skillfold.lock`:

```yaml
tdd:
  source: npm:my-skills/tdd
  resolved: npm:my-skills/tdd@1.0.0
  integrity: sha256-h3XFKo9l43w23ZqP0Hj4y8M1u0+FKjNN5toiAivvWD0=
```

The exact version and a sha256 hash of the skill's content are pinned. A later `skillfold install` reuses the pin, and `install --frozen` fails if the manifest and lockfile disagree or the content hash no longer matches. Consumers can also pin explicitly with `npm:my-skills/tdd@1.0.0`.

## When the skill documents a CLI

If your package is a CLI or library and the skill explains how to use it, consumers want the skill to match the version they run. They can write `npm:my-cli/my-cli@installed`, and skillfold follows the version found in their lockfiles or `node_modules`. I covered that in [an earlier post on installed skills](/blog/installed-skills/).

## What this does not solve

Publishing to npm gives your users versioning and a content hash. It does not give them any reason to trust you. The hash proves the files they got are the files that were resolved, not that the instructions in them are safe. A skill is text an agent will follow, and nothing in this flow reviews it, scans it, or signs it. Consumers still have to read the `SKILL.md` before adding it, and read the diff when they update.

It also does not make discovery good. The `skillfold-skill` keyword feeds `skillfold search`, which searches the npm registry; it is not a curated registry, and it says nothing about quality. Other agent tools that do not use skillfold can still read the package, but only by copying the directory themselves.

Finally, semver ranges are not supported for npm pins today, so consumers pin an exact version or follow the one they have installed. Tell users which version they should be on when you release a breaking change to a skill, because the lockfile will not do it for you.
