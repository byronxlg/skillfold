# Getting Started

Skillfold manages the skills in your Claude config the way a package manager manages dependencies: a manifest declares them, a lockfile pins them, one command installs them.

## Install

```sh
npm install -g skillfold
```

or run it ad hoc with `npx skillfold`.

## 1. Initialize a project

From your project root:

```sh
skillfold init
```

This creates:

- `skillfold.yaml` - the manifest, with one example skill declared
- `skills/hello-skillfold/SKILL.md` - the example skill's source

## 2. Install

```sh
skillfold install
```

Every declared skill is materialized into `.claude/skills/`, and `skillfold.lock` is written next to the manifest. Commit both files.

```console
$ skillfold install
  + hello-skillfold          ./skills/hello-skillfold

1 installed, 0 unchanged -> .claude/skills
lockfile: skillfold.lock
```

## 3. Add skills from anywhere

```sh
# a skill directory on GitHub (pin optional: tag, branch, or commit SHA)
skillfold add github:anthropics/skills/skills/frontend-design

# a skill from an npm package
skillfold add npm:skillfold/code-review

# a local directory
skillfold add ./skills/commit-helper
```

`add` fetches the skill, names it from its SKILL.md frontmatter (override with `--name`), appends it to the manifest, installs it, and updates the lockfile.

## 4. Stay in sync

```sh
skillfold list     # status of every skill: ok / modified / not installed / not locked
skillfold check    # offline verification; nonzero exit on drift (use in CI)
skillfold update   # deliberately move pins to the latest ref / version
```

The lockfile pins exact revisions: `install` will keep giving you the same bytes until you run `update` or change the source in the manifest.

## 5. Reproduce anywhere

On a fresh clone (or in CI):

```sh
skillfold install --frozen
```

This installs exactly what the lockfile pins and fails loudly if the manifest and lockfile disagree, like `npm ci`.

## Composing skills

Composed skills concatenate other skills into a single generated SKILL.md:

```yaml
skills:
  code-review: npm:skillfold/code-review
  testing: npm:skillfold/testing

compose:
  reviewer:
    description: Review code changes together with their tests.
    use: [code-review, testing]
```

After `skillfold install`, `.claude/skills/reviewer/SKILL.md` contains both bodies in order, with provenance comments marking it as generated.

## User-level skills

The same workflow works for your personal `~/.claude/skills`:

```sh
skillfold add -g github:anthropics/skills/skills/frontend-design
skillfold list -g
```

The global manifest lives at `~/.claude/skillfold.yaml`. Keep your dotfiles repo pointing at it and your skills follow you to every machine.

## Next

- [Manifest reference](manifest.md)
- [CLI reference](cli.md)
- [Publishing skills](publishing.md)
