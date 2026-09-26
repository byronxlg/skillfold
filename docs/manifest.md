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

Every source points at a directory containing a `SKILL.md` (plus any supporting files - all files in the directory are installed). On POSIX systems, files beginning with a shebang (`#!`) are made executable so script helpers can be invoked directly. Reinstall repairs missing executable permissions, including with `--frozen`, without changing content hashes.

| Kind | Syntax | Notes |
| --- | --- | --- |
| Local | `./skills/my-skill` | Relative to the manifest. Never pinned; you are editing it. |
| GitHub | `github:owner/repo[/path][@ref]` | `ref` is a tag, branch, or commit SHA. Omitted = default branch. |
| GitHub URL | `https://github.com/owner/repo/tree/ref/path` | Pasteable from the browser; canonicalized to the shorthand. |
| npm | `npm:package[/skill][@version]` | `version` is exact, a dist-tag, or `installed`. Omitted = latest. |

The `@ref` always goes after the last `/`, so scoped npm packages work: `npm:@scope/pkg/skill@1.0.0`.

For npm sources, the `skill` segment is looked up in the package's `agentskills` map first, then treated as a literal subpath. A bare `npm:package` expects `SKILL.md` at the package root. Packages already present in `node_modules` are used directly; otherwise the exact version is downloaded from the registry into the cache.

### Following an installed package (`@installed`)

When a CLI or library ships its own skill in its npm package, the skill documents that exact version. Pin it with `@installed` and it follows the version your project has installed, instead of a second version number that drifts every time Dependabot bumps the dependency:

```yaml
skills:
  skillfold-cli: npm:skillfold/skillfold-cli@installed
  playwright-cli: npm:@playwright/cli/skills/playwright-cli@installed
  hyperframes-cli: npm:hyperframes/dist/skills/hyperframes-cli@installed
```

- The installed version comes from the nearest `package-lock.json`, `npm-shrinkwrap.json`, or `pnpm-lock.yaml` (walking up to the repository root, so workspaces use the root lockfile), then from `node_modules` (which covers yarn and bun). A fresh clone resolves before `npm ci`.
- The lockfile still pins the exact version and content hash, so installs stay reproducible; the committed package lockfile is the other half of the pin.
- `install` re-pins a following skill whenever the dependency moved, up or down. No `update` needed.
- `check` and `install --frozen` fail when the lockfile pins a different version than the one installed, so a dependency bump that forgot `skillfold install` fails CI.
- In global mode (`-g`) there is no project, so `@installed` follows the globally installed package (`npm root -g`), and for `skillfold` itself falls back to the running CLI.
- The package must be a dependency; otherwise resolution fails and asks you to install it or pin a version. `@installed` is npm-only.

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

Rules pin in the lockfile exactly like skills and participate in `install`, `check`, `list`, `info`, and `remove`. There is no compose for rules - each source remains a single file.


Rule mappings can restrict installation to enabled targets and exact hostnames:

```yaml
targets: [claude, codex, cursor]
rules:
  shared: github:acme/standards/rules/shared.md
  codex-compatibility:
    source: github:acme/standards/rules/codex.md
    targets: [codex]
  workstation:
    source: github:acme/standards/rules/workstation.md
    hosts: [my-workstation]
```

Omitted selectors inherit all enabled targets and all hosts. `targets` and `hosts`
must be nonempty lists; hostnames match exactly, including case. The hostname
comes from Node's `os.hostname()`; set `SKILLFOLD_HOST` to override it. A mapping
also accepts `version`, just like a skill source mapping.

All declared rules are resolved and pinned, including rules inactive on this
host, so one manifest and lockfile work across machines. `install` applies only
matching rules and removes previously managed rules that no longer match.
Rule names in the lockfile are reserved on their declared targets across hosts;
use different names for unmanaged rules. Handwritten content outside Codex's
managed block is preserved. `check` validates the current host's selection;
`list` marks inactive rules as `not selected`. Selector changes require a normal
`install`; `install --frozen` accepts a host switch with an unchanged manifest
and lockfile. Run installation after changing rules or switching host selection.

## `targets`

Which tools to install for. Default: `[claude]`.

```yaml
targets: [claude, codex, cursor]
```

Skills use the same SKILL.md format everywhere (the [agent skills standard](https://agentskills.io)), so a target is just a set of install locations:

| Target | Skills | Rules |
| --- | --- | --- |
| `claude` | `.claude/skills` (or `skillsDir`) | `.claude/rules` (or `rulesDir`) as one file per rule |
| `codex` | `.agents/skills` | a managed block in `AGENTS.md` |
| `cursor` | `.cursor/skills` | `.cursor/rules` as always-on `.mdc` files |

Codex reads instructions from `AGENTS.md` rather than a rules directory, so the codex target syncs rules into a marker-fenced block:

```md
<!-- skillfold:rules:start -->
...your rules, one section per rule...
<!-- skillfold:rules:end -->
```

Everything outside the markers is yours and is never touched. The block is added, updated, and removed by `skillfold install`; `skillfold check` verifies it offline like any other installed file. In global mode (`-g`) the codex target manages `~/.agents/skills` and `~/.codex/AGENTS.md` (honoring `CODEX_HOME`).

Cursor rule sources remain plain Markdown. Skillfold adds the `.mdc` frontmatter needed to make each installed project rule always apply. In global mode, Cursor skills install to `~/.cursor/skills`; Cursor user rules are configured in **Customize > Rules** and are not file-based, so a global manifest cannot select rules for the `cursor` target.

`skillsDir` / `rulesDir` override the claude locations only; Codex and Cursor scan fixed conventional paths.

### Per-skill targets

Use the mapping form to install a skill for a subset of the enabled targets:

```yaml
targets: [claude, codex, cursor]
skills:
  shared: npm:skillfold/planning
  claude-only:
    source: github:anthropics/skills/skills/docx
    targets: [claude]
```

Omitting a skill's `targets` installs it for all top-level targets. Overrides must
be non-empty subsets of the top-level list. Composed skills also accept `targets`;
every dependency must be available on each target selected for the composition.

The lockfile records overrides. Changing a selection requires `skillfold install`;
`--frozen` rejects the change. Install removes copies previously managed on a
deselected target, and treats existing copies on a newly selected target as
unmanaged unless their content is identical (otherwise use `--force`). `check`,
`list`, and `info` inspect only the selected locations for each skill.


The lockfile records which targets it has installed for. A newly added target starts with nothing managed: files already sitting in its locations are treated as hand-authored (identical content is adopted silently; different content needs `--force`). Rules synced into AGENTS.md must be UTF-8 text and must not contain skillfold marker lines; install rejects them with a clear error otherwise.

## `skillsDir`

Where skills are installed, relative to the manifest. Defaults to `.claude/skills` for projects and `~/.claude/skills` in global mode, independently of the global config location.

```yaml
skillsDir: .claude/skills
```

Point it anywhere a tool expects SKILL.md directories.

## `rulesDir`

Where rules are installed, relative to the manifest. Defaults to `.claude/rules` for projects and `~/.claude/rules` in global mode, independently of the global config location.

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
