---
title: Composed skills, or how to stop copy-pasting prompts
description: Composition concatenates skills into one generated SKILL.md, carries their supporting files along, and regenerates whenever an input changes. Here is what it does and where the edges are.
date: 2026-07-25
tags: [feature]
---

You have a `code-review` skill and a `testing` skill. You want a third one that does both, because in review you always want the tests considered alongside the diff.

Without tooling there are two options and both are bad. Write a `reviewer` skill that duplicates the bodies of the other two, and accept that it will drift from them within a month. Or write a `reviewer` skill that says "also follow the code-review and testing skills", and hope the agent goes and reads them.

Composition is the third option: declare the combination and let the tool generate the file.

```yaml
skills:
  code-review: npm:skillfold/code-review
  testing: npm:skillfold/testing

compose:
  reviewer:
    description: Review code changes together with their tests.
    use: [code-review, testing]
```

After `skillfold install`, `.claude/skills/reviewer/SKILL.md` contains both bodies in order, with frontmatter stripped from the inputs and a fresh header on top. It installs like any other skill, it is hashed in the lockfile like any other skill, and it is regenerated whenever either input changes.

## What "concatenate" actually has to handle

The word makes it sound trivial. It is not, and the interesting parts are the ones that are not string joining.

**Supporting files come along.** A skill is a directory, not a file. If `code-review` ships a `references/checklist.md` and its body says "see references/checklist.md", that relative path has to keep resolving after composition. So the used skills' supporting files are copied into the composed directory. Identical duplicates collapse silently. Two skills providing the same path with *different* contents is an error rather than a coin flip, because there is no correct answer and silently picking one produces a skill that is subtly wrong.

**allowed-tools is a union, but only sometimes.** The default is the union of the used skills' `allowed-tools`. There is one rule that is easy to get backwards: a skill with no `allowed-tools` is unrestricted, so if *any* input is unrestricted, the union is unrestricted too. Taking the union of only the skills that declared a list would quietly narrow permissions the composed skill is supposed to have. You can always override explicitly:

```yaml
compose:
  reviewer:
    use: [code-review, testing]
    allowed-tools: [Read, Grep]
```

**Nesting works, cycles do not.** A `compose` entry can `use` another `compose` entry, resolved recursively. Cycles are rejected when the manifest is parsed, not when it is installed, so you get the error at the point where you made the mistake.

## It is a build product

The generated `SKILL.md` carries provenance comments marking it as generated, and it gets its own `integrity` hash in the lockfile:

```yaml
compose:
  reviewer:
    use: [code-review, testing]
    integrity: sha256-...
```

That hash is what makes `skillfold check` useful for composed skills. Bump `code-review` with `skillfold update`, and the composed output changes, and the hash changes, and CI tells you the lockfile needs refreshing. The composition is not a one-time scaffold you generate and then own forever. It is derived state, and the tool knows it.

This repository dogfoods that, which is how we found the sharp edge: a composed skill's hash depends on its inputs, so any change to an upstream skill means a lockfile refresh even though nothing in the manifest changed. That is correct behavior, and it is also the kind of thing you only notice by running your own tool against your own config in CI.

## When not to compose

Composition concatenates instructions. It does not summarize them, resolve contradictions between them, or shorten them. Two 3000-word skills compose into a 6000-word skill, and a 6000-word skill is a real cost in every request that loads it.

The cases where it earns its keep are the ones where the combination is genuinely how you work: review-plus-testing, research-plus-writing, a house style rule appended to several task skills. The cases where it does not are the ones where you are composing to avoid deciding which skill you actually want.

If you find yourself composing four skills to cover a workflow, the honest fix is usually to write one skill for that workflow. Composition is for combinations that are real but not worth maintaining by hand.

## Reference

The full set of options is in the [manifest reference](https://github.com/byronxlg/skillfold/blob/main/docs/manifest.md#compose): `use`, `description`, and `allowed-tools`, and that is all of them. It is a small feature on purpose.
