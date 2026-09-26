# CLI Reference

```
skillfold <command> [options]
```

## Commands

### `skillfold init`

Scaffold a starter `skillfold.yaml` and an example skill at `skills/hello-skillfold/`. Refuses to overwrite an existing manifest.

The manifest declares two skills: `skillfold`, pulled from
`npm:skillfold/skillfold-cli` so the agent in the project knows how to drive
this CLI, and the local `hello-skillfold` example. The first `install`
therefore needs the registry; drop the `skillfold` line to stay offline.

When skillfold is a dependency of the project (or with `-g`), the usage skill is
declared as `npm:skillfold/skillfold-cli@installed` instead, so it follows the
installed CLI version (see [`@installed`](manifest.md#following-an-installed-package-installed)).
With `-g` and a global npm install, nothing needs the registry.

It then prints the active install targets with the directories they write to,
how to change them, and the immediate next commands:

```console
$ skillfold init
created skillfold.yaml
created skills/hello-skillfold/SKILL.md

targets: claude
  skills -> .claude/skills
  rules  -> .claude/rules
  edit the "targets:" line in skillfold.yaml to add codex or cursor

next
  skillfold install                     install every declared skill, write skillfold.lock
  skillfold add npm:skillfold/planning  add a skill from the skillfold library
  skillfold search <query>              find more published skills on npm

skillfold.yaml lists every command, source format, and starter skill in its header.
```

With `-g` the same listing names the user-level directories (`~/.claude/skills`)
and every suggested command carries `-g`.

The scaffolded manifest is the durable copy of that reference: its header
comments list every command, the three source formats, and a few library skills
worth adding. `targets` is written out explicitly rather than left to the
default, so the agents in play are visible in the file:

```yaml
targets: [claude]  # codex, cursor
```

### `skillfold add <source> [--name <name>]`

Fetch a skill, append it to the manifest, install it, and update the lockfile. The name defaults to the skill's frontmatter `name` (sanitized), falling back to the last path segment. Fails if the name is already taken.

```sh
skillfold add github:anthropics/skills/skills/frontend-design
skillfold add npm:skillfold/code-review --name reviewer
skillfold add ./skills/commit-helper
```

To limit a skill to one agent, use the mapping form with `targets` in
`skillfold.yaml`, then run `skillfold install`. See
[per-skill targets](manifest.md#per-skill-targets).

### `skillfold remove <name>` (alias: `rm`)

Remove a skill, composed skill, or rule from the manifest, uninstall it, and update the lockfile.

### `skillfold install` (aliases: `i`, `sync`)

Resolve every manifest entry, honoring existing lockfile pins; materialize all skills (including composed ones) into the skills directory and matching rules into each selected target; prune entries that left the manifest; write the lockfile.

- `--frozen` - CI mode. Requires manifest and lockfile to agree exactly, installs precisely the pinned revisions, verifies content hashes, and never rewrites the lockfile. Like `npm ci`.
- `--force` - allow overwriting a skill directory that skillfold does not manage (i.e. not named in the lockfile).

### `skillfold update [name...]` (alias: `up`)

Re-resolve refs past their lockfile pins - branches move to their new head, `latest` moves to the newest version - then reinstall and rewrite the lockfile. With no names, updates every skill. Sources pinned with `@installed` need no update: `install` already re-pins them to the installed package version.

### `skillfold check`

Offline verification with a nonzero exit on any problem:

- lockfile exists and covers exactly the manifest (sources unchanged)
- every skill and rule is installed
- remote skills and rules on disk match the lockfile's content hash
- local skills and rules on disk match their source
- composed skills match what their installed inputs would generate
- `@installed` npm sources are pinned to the version of the package that is installed

It also prints a non-fatal `warning:` when an installed skill's `SKILL.md` is missing a `description` or has unparseable frontmatter - these do not fail the check (a description-less skill still installs, it just never triggers for the agent). Run `skillfold list` to see which skills.

This is what [the GitHub Action](../action.yml) runs.

### `skillfold list` (alias: `ls`)

Status table for every declared skill and rule:

```
  name             source                                     pinned   status
  commit-helper    ./skills/commit-helper                     -        ok
  frontend-design  github:anthropics/skills/skills/frontend-design   8f3a9c1  ok
  reviewer         compose(code-review, testing)              -        modified
```

Statuses: `ok`, `not installed`, `modified` (installed files drifted), `not locked` (no lockfile pin yet), `stale` (an `@installed` source pinned to a version other than the installed one; run `skillfold install`). An otherwise-`ok` skill whose `SKILL.md` is missing a `description` or has unparseable frontmatter shows `warn: <issue>` instead.

### `skillfold info <name>`

Source, resolved pin, integrity hash, status, and install path for one skill.

### `skillfold search [query]`

Search the npm registry for packages tagged `skillfold-skill`.

## Global vs project

Skillfold manages two independent levels, mirroring how the tools themselves work:

| | Project (default) | Global (`-g`) |
| --- | --- | --- |
| Manifest + lockfile | `./skillfold.yaml`, `./skillfold.lock` | `~/.config/skillfold/skillfold.yaml`, `~/.config/skillfold/skillfold.lock` |
| claude target | `.claude/skills`, `.claude/rules` | `~/.claude/skills`, `~/.claude/rules` |
| codex target | `.agents/skills`, `AGENTS.md` | `~/.agents/skills`, `~/.codex/AGENTS.md` |
| cursor target | `.cursor/skills`, `.cursor/rules/*.mdc` | `~/.cursor/skills` (user rules are UI-managed) |

- **One manifest manages one level.** The project manifest is committed and shared with the team; the global manifest is personal config that travels with your dotfiles (`skillfold install -g` materializes it on any machine).
- **Layering is the tool's job, not skillfold's.** The supported tools read user-level and project-level configuration together at runtime, so there is nothing for skillfold to merge - each level stays independently reproducible.
- **Same-named skills at both levels show up twice** in the tool (or shadow each other). Project-mode `check` and `list` print a warning when a project skill name is also installed at the user level. Warnings never fail `check`.

### Migrate an existing global config

Global manifests and lockfiles live in `~/.config/skillfold/`, or
`$XDG_CONFIG_HOME/skillfold/` when `XDG_CONFIG_HOME` is an absolute path.
Relative or empty values are ignored. Agent install locations are independent
of this directory: `~/.claude/skills`, `~/.claude/rules`, `~/.agents/skills`,
`~/.codex/AGENTS.md` (or `CODEX_HOME`), and `~/.cursor/skills`. Cursor user
rules are configured in the app and cannot be installed from a global
manifest. Explicit `skillsDir` and `rulesDir` remain relative to the manifest.

Existing `~/.claude/skillfold.yaml` configurations continue to work with a
migration notice when there is no config in the new directory. The new location
has precedence; the two configs are never merged.

```sh
skillfold migrate -g
skillfold check -g
skillfold install -g --frozen
```

Migration copies the manifest and optional lockfile, preserves remote pins,
rebases local sources and explicit install paths, and leaves the original files
as a backup. It refuses to overwrite either destination file. It does not fetch
sources or move installed skills. After verification, dotfiles users should move
the new files into their dotfiles repository, restow them at the new location,
and remove the old manifest and lockfile links.

## Global options

| Option | Effect |
| --- | --- |
| `--dir <path>` | Operate on a project other than the current directory |
| `-g`, `--global` | Operate on the global config (manifest `~/.config/skillfold/skillfold.yaml`, skills in `~/.claude/skills`) |
| `--name <name>` | Skill name for `add` |
| `--frozen` | Lockfile-exact install (see `install`) |
| `--force` | Overwrite unmanaged skill directories |
| `-v`, `--version` | Print version |
| `-h`, `--help` | Show help |

## Environment

| Variable | Effect |
| --- | --- |
| `XDG_CONFIG_HOME` | Absolute config base; global config lives in its `skillfold/` subdirectory (default `~/.config`) |
| `GITHUB_TOKEN` / `GH_TOKEN` | Auth for GitHub sources (private repos, higher rate limits) |
| `SKILLFOLD_HOST` | Override the exact hostname used by rule `hosts` selectors (default Node `os.hostname()`) |
| `SKILLFOLD_CACHE` | Override the download cache location (default `~/.cache/skillfold`) |

## Exit codes

`0` on success; `1` on any error, including `check` finding drift.
