# Skillfold

Declarative skill manager for Claude config. Declare skills and rules in `skillfold.yaml`, pin exact revisions in `skillfold.lock`, install them into `.claude/skills` and `.claude/rules`.

## GitHub

- **Repo**: https://github.com/byronxlg/skillfold
- Issues, PRs, releases, actions, and all other GitHub features are available for use

## Operations

- `runbook/` - how the package, site and blog cron ship, what healthy means, and how to roll back (fleet standard, tier 3)

## Quick Reference

- **Run the CLI**: `npx tsx src/cli.ts <command>`
- **Install skills**: `npx tsx src/cli.ts install` (`--frozen` for CI-exact installs)
- **Add a skill**: `npx tsx src/cli.ts add <source>`
- **Verify sync**: `npx tsx src/cli.ts check`
- **List status**: `npx tsx src/cli.ts list`
- **Tests**: `npm test` (node:test via tsx, no extra deps)
- **Type check**: `npm run typecheck` (src + scripts)
- **Build**: `npm run build`
- **Build the blog**: `npm run build:blog` (regenerates site/blog/, output is gitignored,
  except the marker-fenced block in site/index.html which is committed)
- **Write a blog post**: follow `skills/blog-post/SKILL.md`. The blog is
  current-events-first (news in the agent config / skill distribution / supply chain
  space), with an evergreen queue in `docs/blog-todo.md` as the quiet-week fallback.
  It is not a product blog.

## Project Structure

```
src/
  cli.ts      - CLI entry point: arg parsing, command dispatch, output formatting
  manifest.ts - skillfold.yaml parsing, validation, comment-preserving add/remove edits
  source.ts   - source string parsing (local paths, github:, npm:) and @ref extraction
  skill.ts    - SKILL.md frontmatter parsing, skill directory reading, sha256 integrity hashing
  lock.ts     - skillfold.lock read/write and manifest-vs-lock diffing
  resolve.ts  - central resolver: manifest + lock -> concrete files, pin reuse, frozen mode
  github.ts   - GitHub ref -> SHA resolution and skill fetching (contents API, injectable fetch)
  npm.ts      - npm skill resolution: node_modules first, then registry via npm pack into cache
  cache.ts    - shared content cache (~/.cache/skillfold), keyed by SHA / exact version
  compose.ts  - composed skill generation (body concatenation, topological ordering)
  targets.ts  - install-target layouts (claude, codex, cursor) mapping targets to locations
  agentsmd.ts - managed rules block in AGENTS.md for the codex target
  install.ts  - sync into skillsDir (managed-dir safety, pruning) and offline check
  init.ts     - skillfold init scaffolding
  list.ts     - status table (ok / modified / not installed / not locked)
  search.ts   - npm registry search for skillfold-skill packages
  index.ts    - public API exports
  testutil.ts - test helpers (tmp dirs, fixture skills, fetch stub); excluded from build
library/      - 11 general-purpose skills published with the package (agentskills map)
site/         - static docs site deployed to GitHub Pages
  index.html    - landing page (page-specific CSS inline)
  assets/       - vendored fonts, base.css (shared chrome), blog.css
  blog/posts/   - blog sources: markdown + YAML frontmatter (the only committed blog files)
scripts/
  build-blog.ts - renders site/blog/posts/*.md into site/blog/, feed.xml,
                  sitemap.xml, robots.txt, and the marker-fenced block in index.html
skills/blog-post/ - repo-specific skill driving the weekly blog automation
docs/blog-todo.md - blog editorial state: news beats, fallback queue, rollouts, shipped log
docs/         - markdown docs (getting started, manifest, CLI, publishing)
skillfold.yaml         - this repo's own manifest (dogfood: blog-post skill and the conventions rule)
skillfold.schema.json  - JSON Schema for manifest validation and IDE autocompletion
action.yml             - GitHub Action wrapper for skillfold check
```

## Core Concepts

- **Manifest** (`skillfold.yaml`): `skills` (name -> source), `compose` (generated skills concatenating others), `rules` (name -> single markdown file), optional `targets` (`[claude, codex, cursor]`; Cursor installs to `.cursor/skills` and `.cursor/rules`), optional `skillsDir` / `rulesDir`.
- **Sources**: local paths, `github:owner/repo/path@ref`, `npm:package/skill@version`. Trailing `@ref` after the last `/` pins a version.
- **Lockfile** (`skillfold.lock`): exact commit SHA / version plus sha256 content hash per remote skill. Local sources are recorded unpinned. Committed to the repo.
- **Pin reuse**: `install` never moves an existing pin; only `update` (or a changed manifest source string) re-resolves. `--frozen` additionally fails on any manifest/lock drift and verifies content hashes.
- **Managed directories**: skillfold only overwrites or prunes directories (and rule files) whose names appear in the lockfile. Hand-authored files are never touched without `--force`.
- **Compose fidelity**: composed skills carry the used skills' supporting files and union their `allowed-tools`; installs rewrite the frontmatter `name` to the manifest name.
- **Cache**: `~/.cache/skillfold` (override with `SKILLFOLD_CACHE`), keyed by commit SHA / exact version, so repeat installs are offline.

## Code Conventions

- TypeScript, strict mode, ESM modules
- Node stdlib imports use `node:` prefix
- Imports: node stdlib -> third-party -> local, alpha within groups
- File extensions in imports: `.js` (NodeNext module resolution)
- Custom errors extend SkillfoldError with messages safe to print directly
- No `any`, no unnecessary type assertions
- Network access is injectable (`fetcher` options) so tests run fully offline

## Workflow

- Push commits to GitHub frequently to maintain visibility of progress. Don't let work accumulate locally.

## What's Implemented

- Manifest parsing with validation (names, sources, compose refs, cycles) and comment-preserving edits
- Source parsing for local, GitHub (shorthand + tree URLs), and npm (scoped + agentskills map)
- Lockfile with exact pins and sha256 integrity hashes
- Resolver with lockfile pin reuse, per-skill update, and frozen mode
- GitHub fetching via the contents API with a shared SHA-keyed cache
- npm resolution via node_modules or registry download into a version-keyed cache
- Composition (recursive, cycle-checked) generating provenance-stamped SKILL.md files
- Install sync with managed-directory safety, drift repair, and pruning
- Offline `check` covering manifest/lock/installed agreement (used by CI and action.yml)
- `--global` mode managing `~/.claude/skills`
- `init`, `add`, `remove`, `install`, `update`, `check`, `list`, `info`, `search` commands
- Full offline test suite (node:test) with injectable fetch/pack stubs

## What's Next

Driven by user demand. Candidate areas: semver range support for npm pins, `skillfold outdated`, richer search output (per-skill listing from agentskills maps).
