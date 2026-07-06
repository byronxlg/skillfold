# Manifest Reference

`skillfold.yaml` has three top-level keys: `skills`, `compose`, and `skillsDir`. All are optional. A JSON Schema is published at [`skillfold.schema.json`](../skillfold.schema.json) for IDE autocompletion:

```yaml
# yaml-language-server: $schema=https://github.com/byronxlg/skillfold/raw/main/skillfold.schema.json
```

## `skills`

A mapping of skill name to source. The name becomes the directory name under the skills directory, so it must be lowercase letters, digits, and hyphens (max 64 chars).

```yaml
skills:
  commit-helper: ./skills/commit-helper
  frontend-design: github:anthropics/skills/frontend-design@v1.2.0
  planning: npm:skillfold/planning@2.0.0
```

An entry can also be a mapping when you prefer the version on its own line:

```yaml
skills:
  frontend-design:
    source: github:anthropics/skills/frontend-design
    version: v1.2.0
```

### Sources

Every source points at a directory containing a `SKILL.md` (plus any supporting files - all files in the directory are installed).

| Kind | Syntax | Notes |
| --- | --- | --- |
| Local | `./skills/my-skill` | Relative to the manifest. Never pinned; you are editing it. |
| GitHub | `github:owner/repo[/path][@ref]` | `ref` is a tag, branch, or commit SHA. Omitted = default branch. |
| GitHub URL | `https://github.com/owner/repo/tree/ref/path` | Pasteable from the browser; canonicalized to the shorthand. |
| npm | `npm:package[/skill][@version]` | `version` is exact or a dist-tag. Omitted = latest. |

The `@ref` always goes after the last `/`, so scoped npm packages work: `npm:@scope/pkg/skill@1.0.0`.

For npm sources, the `skill` segment is looked up in the package's `agentskills` map first, then treated as a literal subpath. A bare `npm:package` expects `SKILL.md` at the package root. Packages already present in `node_modules` are used directly; otherwise the exact version is downloaded from the registry into the cache.

Private GitHub repos work with a `GITHUB_TOKEN` (or `GH_TOKEN`) environment variable.

## `compose`

Generated skills. Each entry concatenates the bodies (frontmatter stripped) of the skills it `use`s, in order, into one `SKILL.md`.

```yaml
compose:
  reviewer:
    description: Review code changes together with their tests.
    use: [code-review, testing]
```

- `use` entries reference names from `skills` or other `compose` entries.
- Nesting is allowed; cycles are rejected at parse time.
- `description` is optional; the default lists the used skills.
- Composed skills install like any other skill and are regenerated whenever their inputs change.

## `skillsDir`

Where skills are installed, relative to the manifest. Defaults to `.claude/skills` (or `skills` for the global `~/.claude` manifest).

```yaml
skillsDir: .claude/skills
```

Point it anywhere a tool expects SKILL.md directories.

## The lockfile

`skillfold install` writes `skillfold.lock` next to the manifest:

```yaml
lockfileVersion: 1
skills:
  frontend-design:
    source: github:anthropics/skills/frontend-design@v1.2.0
    resolved: github:anthropics/skills/frontend-design@8f3a9c1e...   # full commit SHA
    integrity: sha256-...                                            # hash of all files
  commit-helper:
    source: ./skills/commit-helper                                   # local: never pinned
compose:
  reviewer:
    use: [code-review, testing]
    integrity: sha256-...
```

Rules:

- Commit it. Never edit it by hand.
- `install` reuses existing pins even for moving refs (branches, `latest`). Only `update`, or changing the source string in the manifest, re-resolves.
- `install --frozen` refuses to run if manifest and lockfile disagree, and verifies every content hash - the CI mode.
- The names in the lockfile are exactly the directories skillfold considers its own: it will overwrite and prune those, and nothing else.
