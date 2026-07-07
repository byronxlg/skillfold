# Manifest Reference

`skillfold.yaml` has six top-level keys: `skills`, `compose`, `rules`, `targets`, `skillsDir`, and `rulesDir`. All are optional. A JSON Schema is published at [`skillfold.schema.json`](../skillfold.schema.json) for IDE autocompletion:

```yaml
# yaml-language-server: $schema=https://github.com/byronxlg/skillfold/raw/main/skillfold.schema.json
```

## `skills`

A mapping of skill name to source. The name becomes the directory name under the skills directory, so it must be lowercase letters, digits, and hyphens (max 64 chars).

```yaml
skills:
  commit-helper: ./skills/commit-helper
  frontend-design: github:anthropics/skills/skills/frontend-design@v1.2.0
  planning: npm:skillfold/planning@2.0.0
```

An entry can also be a mapping when you prefer the version on its own line:

```yaml
skills:
  frontend-design:
    source: github:anthropics/skills/skills/frontend-design
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

The manifest name is the installed directory name. When it differs from the skill's frontmatter `name`, the installed `SKILL.md` gets its `name` rewritten to match (only that line changes; everything else is byte-identical).

## `compose`

Generated skills. Each entry concatenates the bodies (frontmatter stripped) of the skills it `use`s, in order, into one `SKILL.md`.

```yaml
compose:
  reviewer:
    description: Review code changes together with their tests.
    use: [code-review, testing]
    allowed-tools: [Read, Grep]   # optional
```

- `use` entries reference names from `skills` or other `compose` entries.
- Nesting is allowed; cycles are rejected at parse time.
- `description` is optional; the default lists the used skills.
- `allowed-tools` is optional (string or list). By default the composed skill gets the union of the used skills' `allowed-tools` - but only when every one of them declares a list. A skill without `allowed-tools` is unrestricted, so any unrestricted input leaves the composed skill unrestricted too.
- Supporting files of the used skills (`references/`, `scripts/`, ...) are carried into the composed skill, so relative paths in the bodies keep working. Identical duplicates collapse; two skills providing the same path with different contents is an error.
- Composed skills install like any other skill and are regenerated whenever their inputs change.

## `rules`

Rules are single markdown files installed as `<rulesDir>/<name>.md` - instructions Claude Code loads from `.claude/rules/`. Same source kinds as skills, except the source points at a file, not a directory:

```yaml
rules:
  code-style: ./rules/code-style.md
  security: github:acme/standards/rules/security.md@v3
  conventions: npm:acme-standards/rules/conventions.md@1.2.0
```

Rules pin in the lockfile exactly like skills and participate in `install`, `check`, `list`, `info`, and `remove`. There is no compose for rules - they stay a name -> file mapping.

## `targets`

Which tools to install for. Default: `[claude]`.

```yaml
targets: [claude, codex]
```

Skills use the same SKILL.md format everywhere (the [agent skills standard](https://agentskills.io)), so a target is just a set of install locations:

| Target | Skills | Rules |
| --- | --- | --- |
| `claude` | `.claude/skills` (or `skillsDir`) | `.claude/rules` (or `rulesDir`) as one file per rule |
| `codex` | `.agents/skills` | a managed block in `AGENTS.md` |

Codex reads instructions from `AGENTS.md` rather than a rules directory, so the codex target syncs rules into a marker-fenced block:

```md
<!-- skillfold:rules:start -->
...your rules, one section per rule...
<!-- skillfold:rules:end -->
```

Everything outside the markers is yours and is never touched. The block is added, updated, and removed by `skillfold install`; `skillfold check` verifies it offline like any other installed file. In global mode (`-g`) the codex target manages `~/.agents/skills` and `~/.codex/AGENTS.md` (honoring `CODEX_HOME`).

`skillsDir` / `rulesDir` override the claude locations only; Codex scans fixed conventional paths.

The lockfile records which targets it has installed for. A newly added target starts with nothing managed: files already sitting in its locations are treated as hand-authored (identical content is adopted silently; different content needs `--force`). Rules synced into AGENTS.md must be UTF-8 text and must not contain skillfold marker lines; install rejects them with a clear error otherwise.

## `skillsDir`

Where skills are installed, relative to the manifest. Defaults to `.claude/skills` (or `skills` for the global `~/.claude` manifest).

```yaml
skillsDir: .claude/skills
```

Point it anywhere a tool expects SKILL.md directories.

## `rulesDir`

Where rules are installed, relative to the manifest. Defaults to `.claude/rules` (or `rules` for the global `~/.claude` manifest).

## The lockfile

`skillfold install` writes `skillfold.lock` next to the manifest:

```yaml
lockfileVersion: 1
skills:
  frontend-design:
    source: github:anthropics/skills/skills/frontend-design@v1.2.0
    resolved: github:anthropics/skills/skills/frontend-design@8f3a9c1e...   # full commit SHA
    integrity: sha256-...                                            # hash of all files
  commit-helper:
    source: ./skills/commit-helper                                   # local: never pinned
compose:
  reviewer:
    use: [code-review, testing]
    integrity: sha256-...
rules:
  security:
    source: github:acme/standards/rules/security.md@v3
    resolved: github:acme/standards/rules/security.md@8f3a9c1e...
    integrity: sha256-...
```

Rules:

- Commit it. Never edit it by hand.
- `install` reuses existing pins even for moving refs (branches, `latest`). Only `update`, or changing the source string in the manifest, re-resolves.
- `install --frozen` refuses to run if manifest and lockfile disagree, and verifies every content hash - the CI mode.
- The names in the lockfile are exactly the directories (and rule files) skillfold considers its own: it will overwrite and prune those, and nothing else.
