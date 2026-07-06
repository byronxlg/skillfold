---
name: skillfold-cli
description: Use skillfold to manage a project's Claude skills. Declare skills in skillfold.yaml, pin them in skillfold.lock, and install them into .claude/skills.
---

# Skillfold CLI

You use skillfold, a declarative skill manager for Claude config. Projects declare the skills they use in `skillfold.yaml`; skillfold installs them into `.claude/skills` and pins exact revisions in `skillfold.lock`.

## Manifest

`skillfold.yaml` at the project root:

```yaml
skills:
  commit-helper: ./skills/commit-helper                     # local directory
  frontend-design: github:owner/repo/path/to/skill@v1.2.0   # GitHub (tag, branch, or SHA)
  planning: npm:skillfold/planning@2.0.0                    # npm package

compose:
  reviewer:
    description: Review code changes together with their tests.
    use: [code-review, testing]
```

A trailing `@ref` after the last `/` pins a version. Composed skills concatenate the bodies of the skills they `use` into one generated skill.

## Commands

```bash
skillfold init                # scaffold a starter manifest + example skill
skillfold add <source>        # add a skill and install it (--name to rename)
skillfold remove <name>       # remove a skill and uninstall it
skillfold install             # install everything, write skillfold.lock
skillfold install --frozen    # CI mode: exact lockfile install, fail on drift
skillfold update [name...]    # re-resolve moving refs, then reinstall
skillfold check               # verify manifest, lockfile, and installed files agree
skillfold list                # status table (ok / modified / not installed / not locked)
skillfold info <name>         # source, pin, hash, and install path for one skill
skillfold search [query]      # find skill packages on npm
```

Add `-g` / `--global` to manage `~/.claude/skills` instead of the project.

## Rules

- Commit both `skillfold.yaml` and `skillfold.lock`. Never edit the lockfile by hand.
- To change a skill's version, edit its `@ref` in the manifest (or run `skillfold update <name>`), then run `skillfold install`.
- Never edit files under `.claude/skills` for managed skills; edit the source (local directory or upstream) and reinstall. `skillfold list` shows `modified` when installed files drifted.
- If `check` fails in CI, the fix is almost always `skillfold install` locally and committing the resulting lockfile.
- Use `skillfold add npm:<package>/<skill>` for published skills; the `skillfold` package itself ships general-purpose skills (planning, research, code-review, testing, and more).
