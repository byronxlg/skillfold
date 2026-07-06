<div align="center">

# Skillfold

**Declarative skill manager for Claude config**

[![npm](https://img.shields.io/npm/v/skillfold?style=flat-square)](https://www.npmjs.com/package/skillfold)
[![CI](https://img.shields.io/github/actions/workflow/status/byronxlg/skillfold/ci.yml?style=flat-square&label=CI)](https://github.com/byronxlg/skillfold/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

[Website](https://byronxlg.github.io/skillfold/) | [Getting Started](docs/getting-started.md) | [Manifest Reference](docs/manifest.md) | [CLI Reference](docs/cli.md)

</div>

Your `.claude/skills` directory is state with no source of truth. Skills get pasted in from blog posts, copied between machines, edited in place, and lost on the next laptop. Nobody knows which version of a skill a teammate is running, and "works on my machine" now applies to your agent.

Skillfold treats skills like dependencies. Declare them in one YAML file, pin exact revisions in a lockfile, and install them reproducibly - like nix for skills, without the learning curve.

```yaml
# skillfold.yaml
skills:
  commit-helper: ./skills/commit-helper
  frontend-design: github:anthropics/skills/frontend-design
  planning: npm:skillfold/planning
```

```console
$ skillfold install
  + commit-helper            ./skills/commit-helper
  + frontend-design          github:anthropics/skills/frontend-design -> 8f3a9c1
  + planning                 npm:skillfold/planning -> 2.0.0

3 installed, 0 unchanged -> .claude/skills
lockfile: skillfold.lock
```

Commit `skillfold.yaml` and `skillfold.lock`. Anyone who clones the repo runs `skillfold install` and gets byte-identical skills.

## Install

```sh
npm install -g skillfold      # or: npx skillfold
```

## Quickstart

```sh
skillfold init                # scaffold skillfold.yaml + an example skill
skillfold install             # install into .claude/skills, write skillfold.lock
skillfold add github:anthropics/skills/frontend-design
skillfold list
```

## How it works

**Manifest** - `skillfold.yaml` declares skills by name from three kinds of sources:

| Source | Example |
| --- | --- |
| Local directory | `./skills/commit-helper` |
| GitHub | `github:owner/repo/path/to/skill@v1.2.0` |
| npm | `npm:package/skill-name@1.0.0` |

A trailing `@ref` pins a version: a tag, branch, or commit SHA for GitHub; an exact version or dist-tag for npm. Unpinned sources resolve to the default branch / latest at install time and are then held by the lockfile.

**Lockfile** - `skillfold.lock` records the exact commit SHA or version every remote skill resolved to, plus a sha256 content hash. Installs are reproducible; tampering is detectable. `skillfold update` is the only thing that moves a pin.

**Install** - `skillfold install` materializes every skill into `.claude/skills/` (configurable with `skillsDir`). Skillfold only ever touches directories named in the lockfile - hand-authored skills sitting next to managed ones are never overwritten or pruned.

**Check** - `skillfold check` verifies offline that manifest, lockfile, and installed files all agree. Run it in CI:

```yaml
- uses: byronxlg/skillfold@main   # runs: npx skillfold check
```

or use `skillfold install --frozen` for npm-ci-style installs that fail on any drift.

## Composition

Composed skills concatenate other skills into one generated SKILL.md:

```yaml
skills:
  code-review: npm:skillfold/code-review
  testing: npm:skillfold/testing

compose:
  reviewer:
    description: Review code changes together with their tests.
    use: [code-review, testing]
```

`reviewer` is generated at install time and regenerated whenever its inputs change. Composed skills can use other composed skills; cycles are rejected at parse time.

## Commands

| Command | What it does |
| --- | --- |
| `skillfold init` | Scaffold a starter manifest and example skill |
| `skillfold add <source>` | Add a skill to the manifest and install it |
| `skillfold remove <name>` | Remove a skill and uninstall it |
| `skillfold install` | Install every declared skill, write the lockfile |
| `skillfold install --frozen` | Install exactly what the lockfile pins; fail on drift |
| `skillfold update [name...]` | Re-resolve moving refs and reinstall |
| `skillfold check` | Verify manifest, lockfile, and installed skills agree |
| `skillfold list` | Show declared skills and their status |
| `skillfold info <name>` | Show source, pin, hash, and install path for one skill |
| `skillfold search [query]` | Search npm for published skills |

Add `-g` / `--global` to any of these to manage `~/.claude/skills` (your user-level skills) with a manifest at `~/.claude/skillfold.yaml` instead of the current project.

## Sharing skills

Publish a skill collection as an npm package with an `agentskills` map in its package.json:

```json
{
  "name": "my-skills",
  "keywords": ["skillfold-skill"],
  "agentskills": {
    "tdd": "./skills/tdd",
    "docs": "./skills/docs"
  }
}
```

Anyone can then run `skillfold add npm:my-skills/tdd`. The `skillfold-skill` keyword makes the package discoverable via `skillfold search`. See [docs/publishing.md](docs/publishing.md).

Skillfold itself ships a small library of general-purpose skills: `planning`, `research`, `code-review`, `testing`, `writing`, and more - `skillfold add npm:skillfold/<name>`.

## Library

| Skill | Description |
| --- | --- |
| `planning` | Break problems into steps, identify dependencies, estimate scope |
| `research` | Gather information, evaluate sources, synthesize findings |
| `decision-making` | Evaluate trade-offs, document options, justify recommendations |
| `code-writing` | Write clean, correct, production-quality code |
| `code-review` | Review code for correctness, clarity, and security |
| `testing` | Write and reason about tests, behavior testing, edge cases |
| `writing` | Produce clear, structured prose and documentation |
| `summarization` | Condense information with audience-appropriate detail |
| `github-workflow` | Work with branches, PRs, issues, and reviews via `gh` |
| `file-management` | Read, create, edit, and organize files and directories |
| `skillfold-cli` | Use skillfold itself to manage a project's skills |

## Programmatic API

Everything the CLI does is available as a library:

```ts
import { loadManifest, resolveManifest, syncSkillsDir } from "skillfold";
```

## License

MIT
