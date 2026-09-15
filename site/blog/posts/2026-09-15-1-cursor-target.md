---
title: One manifest can now install skills and rules for Cursor
description: Skillfold's new Cursor target installs project skills and always-on rules in Cursor's native paths, with the same lockfile and drift checks.
date: 2026-09-15
tags: [release]
---

Cursor recognizes the same `SKILL.md` packages as other coding agents, but
its native project paths are its own. Skills live under `.cursor/skills`.
Project rules live under `.cursor/rules`, where a `.mdc` extension and YAML
frontmatter determine whether Cursor loads them.

Skillfold now has a first-class `cursor` target for both:

```yaml
targets: [claude, codex, cursor]
```

The target landed on `main` in
[pull request 574](https://github.com/byronxlg/skillfold/pull/574). It lets one
manifest and lockfile materialize the same declared configuration into each
tool's native layout, then check every copy for drift.

## What gets installed

Cursor's
[Agent Skills documentation](https://cursor.com/docs/skills)
lists `.cursor/skills` and `.agents/skills` as project discovery roots, with
matching user-level roots under the home directory. Skillfold deliberately
uses Cursor's named path for the Cursor target:

| Scope | Skills | Rules |
| --- | --- | --- |
| Project | `.cursor/skills/<name>/` | `.cursor/rules/<name>.mdc` |
| User | `~/.cursor/skills/<name>/` | Managed in Cursor's UI |

Project skills keep the standard directory shape. Supporting files such as
scripts, references, and assets travel with `SKILL.md`, and composed skills
are generated the same way they are for the Claude and Codex targets.

The lockfile records `cursor` among its targets. Remote sources still resolve
to an exact Git commit or npm version, with a content hash stored beside the
pin. Local sources remain local. `skillfold check` walks `.cursor/skills` and
reports a missing or modified copy even when the copies installed for other
agents are intact.

## Plain Markdown in, valid Cursor rules out

Skillfold rule sources are plain Markdown files. Cursor project rules are not:
the
[Cursor Rules documentation](https://cursor.com/docs/rules)
says project rules must use `.mdc` and frontmatter. A plain `.md` file inside
`.cursor/rules` is ignored.

For the Cursor target, skillfold wraps each rule source with generated
metadata:

```md
---
description: "Managed by skillfold: code-style"
alwaysApply: true
---

...the declared rule source, unchanged...
```

That conversion preserves the meaning rules already have in a skillfold
manifest. A declared rule is standing guidance, so the generated Cursor rule
uses `alwaysApply: true`. The original Markdown body remains the content whose
integrity is pinned and checked. If someone edits the body or generated
frontmatter in place, `skillfold check` reports drift and `skillfold install`
repairs it.

This design also keeps one source usable across targets. The same
`rules/code-style.md` can become a plain file under `.claude/rules`, a managed
section in Codex's `AGENTS.md`, and an always-on `.mdc` file for Cursor.

## Adding Cursor to an existing manifest

Add the target, run a normal install, and commit the lockfile change:

```sh
# edit skillfold.yaml: targets: [claude, codex, cursor]
skillfold install
skillfold check
git add skillfold.yaml skillfold.lock
```

Do not use `install --frozen` for the first run after changing `targets`.
Frozen mode correctly rejects manifest and lockfile disagreement. Once the
normal install records the new target, frozen installs become valid again.

Existing files in `.cursor/skills` and `.cursor/rules` do not silently become
skillfold's property. When the target is new, the previous lockfile names
nothing there as managed. Byte-identical content can be adopted. A
same-named file with different content stops the install unless you explicitly
pass `--force`. Unrelated hand-authored files remain untouched.

Per-skill and per-rule target selectors continue to work. A project can enable
Cursor globally while keeping one tool-specific item out of its paths:

```yaml
targets: [claude, codex, cursor]

skills:
  shared-reviewer: npm:skillfold/code-review
  claude-only:
    source: ./skills/claude-only
    targets: [claude]

rules:
  shared-style: ./rules/style.md
```

The full path and selector contract is in the
[manifest reference](https://github.com/byronxlg/skillfold/blob/main/docs/manifest.md#targets).

## Where the target stops

Cursor's global User Rules are configured in **Customize > Rules**. They are
not ordinary files under `~/.cursor`, so skillfold does not pretend it can
manage them. Global mode installs Cursor skills to `~/.cursor/skills`, but
rejects a rule selected for the Cursor target with an explanation instead of
writing a file Cursor would ignore.

The target also does not expose Cursor's rule activation modes. Skillfold rules
become always-on project guidance. It does not currently map globs, manual
activation, or "Apply Intelligently" descriptions from the manifest. If a rule
needs those Cursor-specific semantics, keep that `.mdc` file hand-authored
outside skillfold's managed names. That boundary is intentional in this first
version.

There is one more practical overlap: Cursor discovers `.agents/skills` as well
as `.cursor/skills`. If a manifest enables both `codex` and `cursor`, the same
skill is installed in both roots because each target serves its named tool.
Cursor's documentation does not define a precedence rule for same-named copies
across those roots. Do not enable the Codex target solely to serve Cursor; use
`cursor` for Cursor and `codex` when the project also needs Codex.

Finally, this code is merged but not yet in the npm package. The current npm
release remains 2.6.0. The Cursor target will become available to npm users in
the next skillfold release; until then, the post documents the behavior on
`main`, not a capability in 2.6.0.
