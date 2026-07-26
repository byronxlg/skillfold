---
title: Your skills directory is undeclared state
description: A .claude/skills directory has every property we spent twenty years teaching people to avoid in dependency management. Here is the case for a manifest and a lockfile.
date: 2026-07-25
tags: [concepts]
---

<figure class="fig">
<svg viewBox="0 0 440 196" role="img" aria-labelledby="fig1-t fig1-d" xmlns="http://www.w3.org/2000/svg">
<title id="fig1-t">Undeclared versus declared skill state</title>
<desc id="fig1-d">Without a manifest, skills arrive by paste, copy, and in-place edit, and the directory is the only record. With skillfold, a manifest resolves into a lockfile which installs the directory, recording source, revision, and a sha256 for each skill.</desc>
<defs><marker id="fig1-a" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 z" fill="#57626f"/></marker></defs>
<text x="4" y="14" font-family="monospace" font-size="9.5" fill="#57626f">without a manifest</text>
<rect x="4" y="24" width="184" height="34" rx="4" fill="#0d1219" stroke="#29323f"/>
<text x="96" y="45" text-anchor="middle" font-family="monospace" font-size="10.5" fill="#828f9e">pasted / copied / edited</text>
<path d="M192 41 H222" stroke="#57626f" marker-end="url(#fig1-a)"/>
<rect x="228" y="24" width="150" height="34" rx="4" fill="#0d1219" stroke="#29323f"/>
<text x="303" y="45" text-anchor="middle" font-family="monospace" font-size="10.5" fill="#828f9e">.claude/skills</text>
<text x="4" y="80" font-family="monospace" font-size="9.5" fill="#d9a032">the directory is the only record: no origin, revision, or edit detection</text>
<path d="M4 100 H436" stroke="#29323f"/>
<text x="4" y="124" font-family="monospace" font-size="9.5" fill="#57626f">with skillfold</text>
<rect x="4" y="134" width="118" height="34" rx="4" fill="#0d1219" stroke="#4d8bf5"/>
<text x="63" y="155" text-anchor="middle" font-family="monospace" font-size="10.5" fill="#c9d3df">skillfold.yaml</text>
<path d="M126 151 H150" stroke="#57626f" marker-end="url(#fig1-a)"/>
<rect x="156" y="134" width="118" height="34" rx="4" fill="#0d1219" stroke="#4d8bf5"/>
<text x="215" y="155" text-anchor="middle" font-family="monospace" font-size="10.5" fill="#c9d3df">skillfold.lock</text>
<path d="M278 151 H302" stroke="#57626f" marker-end="url(#fig1-a)"/>
<rect x="308" y="134" width="128" height="34" rx="4" fill="#0d1219" stroke="#29323f"/>
<text x="372" y="155" text-anchor="middle" font-family="monospace" font-size="10.5" fill="#828f9e">.claude/skills</text>
<text x="4" y="190" font-family="monospace" font-size="9.5" fill="#4d8bf5">source, resolved revision, and a sha256 per skill, all written down</text>
</svg>
<figcaption>The manifest says what you want, the lockfile says what you got, and one command makes the filesystem match.</figcaption>
</figure>

Open `.claude/skills` on any machine that has been doing real work for a month. You will find a dozen directories. Some were written by hand. Some were pasted out of a blog post. Some were copied from a teammate over Slack, then edited in place because the original did not quite fit. At least one is a stale copy of something that has moved on three versions upstream.

Now answer these questions about that directory:

- Where did each skill come from?
- Which version is it?
- Has anyone edited it since it arrived?
- Is your teammate running the same bytes?

You cannot answer any of them from the filesystem, because none of that information is written down anywhere. The directory is the only record, and the directory records only its current contents.

This is the exact problem `node_modules` had before `package.json`, and that `node_modules` still has without `package-lock.json`. We solved it in 2010. The solution is not novel and it does not need to be: **a manifest says what you want, a lockfile says what you got, and one command makes the filesystem match.**

## The manifest

`skillfold.yaml` is a mapping of names to sources. That is nearly all of it.

```yaml
skills:
  commit-helper: ./skills/commit-helper
  frontend-design: github:anthropics/skills/skills/frontend-design@v1.2.0
  planning: npm:skillfold/planning@2.0.0
```

Three source kinds cover where skills actually live today. A local directory, for the skill you are actively writing. A directory in a GitHub repo, for the ninety percent of skills that are published as "here is a folder in my repo". An npm package, for skills that want versioning and discovery.

The name on the left is the installed directory name, not a property of the skill. If upstream calls it `frontend-design` and you want it at `design`, you rename the key. Skillfold rewrites the frontmatter `name` in the installed copy to match, changing that one line and nothing else. Renaming a skill stops being a file operation and becomes a diff.

## The lockfile

`skillfold install` resolves every source and writes `skillfold.lock` next to the manifest:

```yaml
lockfileVersion: 1
skills:
  frontend-design:
    source: github:anthropics/skills/skills/frontend-design@v1.2.0
    resolved: github:anthropics/skills/skills/frontend-design@8f3a9c1e...
    integrity: sha256-...
```

Two things are recorded that the manifest cannot express. `resolved` is the full commit SHA that `v1.2.0` pointed at when you installed. `integrity` is a sha256 over every file in the skill directory.

The `resolved` field is what makes installs repeatable. Tags move. Branches move. `latest` moves by definition. Once a skill is in the lockfile, `install` reuses the pin and never re-resolves it, even for a moving ref. The only things that move a pin are `skillfold update`, or you editing the source string in the manifest. This is the same contract npm has, and it matters more here than it does for libraries: a skill is a prompt, and a prompt that silently changes underneath you changes your agent's behavior with no stack trace to show for it.

The `integrity` field is what makes drift visible. It hashes the content, not the metadata, so it catches the case the SHA cannot: someone edited the installed copy.

## Making the filesystem match

```console
$ skillfold install
  + commit-helper            ./skills/commit-helper
  + frontend-design          github:anthropics/skills/skills/frontend-design@v1.2.0 -> 8f3a9c1
  + planning                 npm:skillfold/planning -> 2.0.0

3 installed, 0 unchanged -> .claude/skills
lockfile: skillfold.lock
```

On a fresh clone, `skillfold install --frozen` is the CI mode: it refuses to run if the manifest and lockfile disagree, and it verifies every content hash before writing anything. It is `npm ci`, for the same reasons.

The offline half of that is `skillfold check`, which verifies that the manifest, the lockfile, and the files actually on disk all agree. No network, nonzero exit on drift, so it works as a build step:

```yaml
- uses: byronxlg/skillfold@main
```

Now "which version of that skill is the agent running" has an answer that a build can enforce.

## The part that stops people

The objection I hear most is that this is a lot of ceremony for some markdown files. It is worth being precise about what the ceremony buys, because the answer is not "correctness" in the usual sense. Nothing crashes if a skill drifts.

What it buys is the ability to reason about a change. When an agent starts behaving differently than it did last week, the search space is your code, your prompt, the model, and your skills. Three of those four are already under version control. Making the fourth one a build product from a committed manifest removes it from the search space entirely, or points straight at it.

## What skillfold refuses to do

One design constraint is worth stating because it is what makes adoption cheap: **skillfold only touches directories named in its lockfile.**

Hand-authored skills sitting next to managed ones are never overwritten and never pruned. You can adopt skillfold for two skills in a directory of fifteen, and the other thirteen are exactly as untouched as they were before. There is no all-or-nothing migration, and no moment where a tool you just installed deletes work you did not back up.

Nothing executes skill content, either. Skillfold copies files and hashes them. It is a fetch-and-place tool, not a runtime.

## Start small

```sh
npx skillfold init
npx skillfold add github:anthropics/skills/skills/frontend-design
npx skillfold install
```

Commit `skillfold.yaml` and `skillfold.lock`. That is the whole workflow. Everything else in the tool is a consequence of those two files existing.
