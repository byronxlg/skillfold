# CLI Reference

```
skillfold <command> [options]
```

## Commands

### `skillfold init`

Scaffold a starter `skillfold.yaml` and an example skill at `skills/hello-skillfold/`. Refuses to overwrite an existing manifest.

### `skillfold add <source> [--name <name>]`

Fetch a skill, append it to the manifest, install it, and update the lockfile. The name defaults to the skill's frontmatter `name` (sanitized), falling back to the last path segment. Fails if the name is already taken.

```sh
skillfold add github:anthropics/skills/skills/frontend-design
skillfold add npm:skillfold/code-review --name reviewer
skillfold add ./skills/commit-helper
```

### `skillfold remove <name>` (alias: `rm`)

Remove a skill, composed skill, or rule from the manifest, uninstall it, and update the lockfile.

### `skillfold install` (aliases: `i`, `sync`)

Resolve every manifest entry, honoring existing lockfile pins; materialize all skills (including composed ones) into the skills directory and all rules into the rules directory; prune entries that left the manifest; write the lockfile.

- `--frozen` - CI mode. Requires manifest and lockfile to agree exactly, installs precisely the pinned revisions, verifies content hashes, and never rewrites the lockfile. Like `npm ci`.
- `--force` - allow overwriting a skill directory that skillfold does not manage (i.e. not named in the lockfile).

### `skillfold update [name...]` (alias: `up`)

Re-resolve refs past their lockfile pins - branches move to their new head, `latest` moves to the newest version - then reinstall and rewrite the lockfile. With no names, updates every skill.

### `skillfold check`

Offline verification with a nonzero exit on any problem:

- lockfile exists and covers exactly the manifest (sources unchanged)
- every skill and rule is installed
- remote skills and rules on disk match the lockfile's content hash
- local skills and rules on disk match their source
- composed skills match what their installed inputs would generate

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

Statuses: `ok`, `not installed`, `modified` (installed files drifted), `not locked` (no lockfile pin yet). An otherwise-`ok` skill whose `SKILL.md` is missing a `description` or has unparseable frontmatter shows `warn: <issue>` instead.

### `skillfold info <name>`

Source, resolved pin, integrity hash, status, and install path for one skill.

### `skillfold search [query]`

Search the npm registry for packages tagged `skillfold-skill`.

## Global vs project

Skillfold manages two independent levels, mirroring how the tools themselves work:

| | Project (default) | Global (`-g`) |
| --- | --- | --- |
| Manifest + lockfile | `./skillfold.yaml`, `./skillfold.lock` | `~/.claude/skillfold.yaml`, `~/.claude/skillfold.lock` |
| claude target | `.claude/skills`, `.claude/rules` | `~/.claude/skills`, `~/.claude/rules` |
| codex target | `.agents/skills`, `AGENTS.md` | `~/.agents/skills`, `~/.codex/AGENTS.md` |

- **One manifest manages one level.** The project manifest is committed and shared with the team; the global manifest is personal config that travels with your dotfiles (`skillfold install -g` materializes it on any machine).
- **Layering is the tool's job, not skillfold's.** Claude Code and Codex both read user-level and project-level skills and instructions together at runtime, so there is nothing for skillfold to merge - each level stays independently reproducible.
- **Same-named skills at both levels show up twice** in the tool (or shadow each other). Project-mode `check` and `list` print a warning when a project skill name is also installed at the user level. Warnings never fail `check`.

## Global options

| Option | Effect |
| --- | --- |
| `--dir <path>` | Operate on a project other than the current directory |
| `-g`, `--global` | Operate on `~/.claude` (manifest `~/.claude/skillfold.yaml`, skills in `~/.claude/skills`) |
| `--name <name>` | Skill name for `add` |
| `--frozen` | Lockfile-exact install (see `install`) |
| `--force` | Overwrite unmanaged skill directories |
| `-v`, `--version` | Print version |
| `-h`, `--help` | Show help |

## Environment

| Variable | Effect |
| --- | --- |
| `GITHUB_TOKEN` / `GH_TOKEN` | Auth for GitHub sources (private repos, higher rate limits) |
| `SKILLFOLD_CACHE` | Override the download cache location (default `~/.cache/skillfold`) |

## Exit codes

`0` on success; `1` on any error, including `check` finding drift.
