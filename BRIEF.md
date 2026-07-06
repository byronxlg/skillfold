# Skillfold - Concept & Design Brief

## What is Skillfold?

Skillfold is a declarative skill manager for Claude config. The name captures the core move: **skills**, **folded** into a project - declared once, pinned exactly, unfolded into `.claude/skills` on any machine.

Think "nix for skills, without the learning curve": a single YAML manifest declares what skills a project uses, a lockfile pins exactly which bytes those skills resolve to, and one command makes the filesystem match.

## The problem

Skills are how Claude Code (and the wider agent ecosystem) packages reusable capability: a directory with a `SKILL.md` plus supporting files. They are also, today, completely unmanaged:

- Skills get pasted in from blog posts and gists, with no record of where they came from.
- `.claude/skills` differs silently between teammates and machines.
- Upstream skills improve, but nothing tells you your copy is stale - or changed.
- There is no install story for a repo: "clone, then copy these five directories from somewhere" is the state of the art.

This is exactly the problem package managers solved for code dependencies. Skills deserve the same treatment: a manifest, a lockfile, reproducible installs, and drift detection.

## The design

Three artifacts:

1. **`skillfold.yaml`** - the manifest. Human-written, small, commented.
2. **`skillfold.lock`** - the lockfile. Machine-written, committed, exact.
3. **`.claude/skills/`** - the install target. Disposable, reproducible.

### Manifest

```yaml
skills:
  commit-helper: ./skills/commit-helper                     # local
  frontend-design: github:anthropics/skills/frontend-design # GitHub
  planning: npm:skillfold/planning@2.0.0                    # npm

compose:
  reviewer:
    description: Review code changes together with their tests.
    use: [code-review, testing]

skillsDir: .claude/skills   # optional, this is the default
```

Design choices:

- **Names are the keys.** The manifest maps installed names to sources, so renaming a skill locally is trivial and collisions are impossible by construction.
- **Sources are strings.** One-line, greppable, and pasteable. A trailing `@ref` after the last `/` pins a version - the same syntax across GitHub (tag/branch/SHA) and npm (version/dist-tag).
- **Compose is the one generative feature.** A composed skill concatenates the bodies of other skills into a single generated SKILL.md. It is skill-shaped (installs like any other skill) and recursive (composed skills can use composed skills; cycles rejected at parse time). Everything else from the pipeline era - team flows, typed state, orchestrators, runners - is out of scope.

### Lockfile

```yaml
lockfileVersion: 1
skills:
  frontend-design:
    source: github:anthropics/skills/frontend-design
    resolved: github:anthropics/skills/frontend-design@<full sha>
    integrity: sha256-...
```

- Remote sources are pinned to immutable identifiers (commit SHA, exact version) plus a sha256 content hash over every file.
- Local sources are recorded but never pinned - they are the things you are editing.
- `install` reuses pins; only `update` (or editing the source string) moves them. `install --frozen` is the CI mode: any drift is a hard failure, hashes are verified.

### Install semantics

- Skillfold owns exactly the directories named in the lockfile. It will overwrite and prune those freely, and will never touch anything else without `--force`. Hand-authored skills coexist safely next to managed ones.
- Fetches go through a shared content-addressed cache (`~/.cache/skillfold`) keyed by SHA/version, so repeat installs are offline and fast.
- `check` is fully offline: manifest vs lock vs installed bytes, including regenerating composed skills from their installed inputs.

### Distribution

- npm packages publish skills via an `agentskills` map in package.json (`skill-name -> directory`), discoverable through the `skillfold-skill` keyword and `skillfold search`.
- GitHub repos publish skills by simply containing skill directories - any `owner/repo/path` with a SKILL.md is addressable.
- Skillfold ships a starter library of 11 general-purpose skills under `npm:skillfold/<name>`.

### Scope boundaries

Deliberately not in scope:

- **No runtime.** Skillfold arranges files; it never spawns agents or executes anything.
- **No multi-target compilation.** Claude config is the target. Other tools that read SKILL.md directories can point `skillsDir` wherever they like.
- **No semver resolution (yet).** npm pins are exact versions or dist-tags; GitHub pins are refs. Ranges add a resolver and a failure mode; demand can justify them later.

## Open questions

- `skillfold outdated` - report pins that lag their upstream ref without touching anything.
- Semver ranges for npm sources.
- Search that lists individual skills (from agentskills maps) rather than packages.
- A "vendor" mode that copies skills into the repo for air-gapped installs.
