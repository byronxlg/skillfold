---
title: A CLI's skill can now follow the version of the CLI you installed
description: Skillfold's @installed ref pins a skill shipped inside an npm package to the version your project has installed, and fails the check when they drift.
date: 2026-09-26
tags: [release]
---

More command-line tools now ship an agent skill inside their own npm
package. `@playwright/cli` carries one at `skills/playwright-cli`.
`hyperframes` carries three under `dist/skills`. skillfold ships
`skillfold-cli` in its `agentskills` map. The idea is sound: the people who
write the tool write the instructions for driving it, and the instructions
travel with the code.

It also creates a quiet version problem. A skill bundled with a tool
describes that exact release of the tool. Your project pins the tool in
`package-lock.json` and the skill in `skillfold.lock`, and nothing ties the
two numbers together. When Dependabot bumps the dependency, the tool moves
and the skill stays behind.

How far behind matters. `@playwright/cli` 0.1.18 was published to npm on
August 6, 2026 and 0.1.21 on September 18, per the registry's own
timestamps. Between those versions the bundled `SKILL.md` gained an
emulation section (`set-color-scheme`, `set-reduced-motion`, and friends),
`recording-start` and `recording-stop`, a WebMCP section with
`webmcp-call`, and a new `references/pr-attachments.md` file. An agent
reading the 0.1.18 skill against a 0.1.21 binary never learns those
commands exist. Nothing errors; the agent knows less than the tool can
do.

The reverse is worse. Roll the dependency back and the agent is now
reading documentation for flags the installed binary does not have.

## One ref: `@installed`

Skillfold, which manages agent skills from a manifest and a lockfile, now
accepts `@installed` as the version of an npm source:

```yaml
skills:
  playwright-cli: npm:@playwright/cli/skills/playwright-cli@installed
  hyperframes-cli: npm:hyperframes/dist/skills/hyperframes-cli@installed
  skillfold: npm:skillfold/skillfold-cli@installed
```

`@installed` means "whatever version of this package the project has
installed". Skillfold reads that version offline, without the registry:

- the nearest `npm-shrinkwrap.json`, `package-lock.json`, or
  `pnpm-lock.yaml`, walking up to the repository root so workspace packages
  find the root lockfile;
- then `node_modules`, through Node's own resolution, which covers yarn and
  bun installs.

The lockfile is read before `node_modules`, so a fresh clone resolves
before anyone has run `npm ci`, and a stale `node_modules` does not win
over what the lockfile says.

## What it looks like

This is a scratch project with `@playwright/cli@0.1.18` and
`skillfold@2.6.0` installed as dev dependencies, run with a build of
skillfold's `main` branch:

```console
$ skillfold install
  + playwright-cli           npm:@playwright/cli/skills/playwright-cli@installed -> 0.1.18
  + skillfold                npm:skillfold/skillfold-cli@installed -> 2.6.0

2 installed, 0 unchanged -> .claude/skills
lockfile: skillfold.lock
```

The lockfile format does not change. The source keeps `@installed`, and
the resolved pin is still an exact version with a content hash:

```yaml
  playwright-cli:
    source: npm:@playwright/cli/skills/playwright-cli@installed
    resolved: npm:@playwright/cli/skills/playwright-cli@0.1.18
```

Now bump both dependencies the way Dependabot would, and touch nothing
else:

```console
$ npm install -D @playwright/cli@0.1.21 skillfold@2.7.0
$ skillfold list
  name            source                                               pinned  status
  playwright-cli  npm:@playwright/cli/skills/playwright-cli@installed  0.1.18  stale
  skillfold       npm:skillfold/skillfold-cli@installed                2.6.0   stale
```

`skillfold check`, the offline command CI runs, fails and says why:

```console
$ skillfold check
skillfold check failed:
  - "playwright-cli" follows @playwright/cli@installed: 0.1.21 is installed (package-lock.json) but the lockfile pins 0.1.18 (run "skillfold install")
  - "skillfold" follows skillfold@installed: 2.7.0 is installed (package-lock.json) but the lockfile pins 2.6.0 (run "skillfold install")
```

`skillfold install --frozen` refuses for the same reason. A dependency PR
that forgot to refresh the skills therefore fails its own checks, instead
of merging a skill that no longer matches the tool.

The fix is the ordinary command:

```console
$ skillfold install
  + playwright-cli           npm:@playwright/cli/skills/playwright-cli@installed -> 0.1.21
  + skillfold                npm:skillfold/skillfold-cli@installed -> 2.7.0

2 installed, 0 unchanged -> .claude/skills
lockfile: skillfold.lock
$ skillfold check
ok: 2 skills in sync
```

This is a deliberate exception to one of skillfold's rules. Normally
`install` never moves an existing pin and only `skillfold update` does. A
skill pinned with `@installed` has already said what it wants to track,
so `install` re-pins it whenever the dependency moved, in either
direction. Every other source keeps the old behavior.

## Global mode and `init`

User-level skills (`skillfold install -g`) have no project and no
lockfile, so there `@installed` follows the globally installed package,
the directory `npm root -g` reports, and reads the skill from that
directory without downloading anything. For skillfold's own skill it
falls back to the running CLI when skillfold is not installed globally.
`install -g` and `check -g` also warn when any skill from the skillfold
package is pinned to a different version than the CLI running the
command.

`skillfold init` uses the new ref where it can. When skillfold is a
dependency of the project, or with `-g`, the scaffolded manifest declares
`skillfold: npm:skillfold/skillfold-cli@installed` rather than an
unpinned source that resolves to whatever was latest on the day you ran
`init`.

## Migrating

Nothing breaks. Existing manifests, lockfiles, and pins keep working
unchanged. To opt a skill in, change its version to `@installed` and run
`skillfold install` once:

```yaml
# before
playwright-cli: npm:@playwright/cli/skills/playwright-cli@0.1.18
# after
playwright-cli: npm:@playwright/cli/skills/playwright-cli@installed
```

The object form works too: `version: installed`. The package has to be a
dependency of the project (or installed globally, in `-g` mode). If it is
not, resolution fails and says to install it or pin a version.

Playwright and HyperFrames also publish these skills in their GitHub
repositories, and a `github:` source is a common way to install them. If
the tool itself comes from npm, switching the skill to the npm source is
what lets it follow your installed version. A GitHub source tracks the
repository, not your install.

## What it does not do

`@installed` works only for npm sources, and only for packages that put
their skill inside the published tarball. Of the CLIs checked for this
post, `@playwright/cli` 0.1.21, `hyperframes` 0.8.77, and `skillfold`
2.7.0 do. `vercel` 60.1.3, `wrangler` 4.141.0, and `@remotion/cli`
4.0.529 do not ship a `SKILL.md` in their npm packages, so there is
nothing for this ref to follow.

It does not reach tools installed some other way. A binary from Homebrew,
pip, a release tarball, or a pnpm global install has no npm lockfile entry
and is not under `npm root -g`, and skillfold does not guess by running
`tool --version`. `@installed` is rejected on GitHub
sources outright, because a Git ref has no installed version to follow.

yarn and bun lockfiles are not parsed. Those projects are covered by the
`node_modules` fallback, which means their fresh clones need an install
before `skillfold check` can see the version.

It keeps the two numbers in step; it cannot make the skill correct. If a
maintainer ships a release whose bundled skill still describes last
month's flags, `@installed` will faithfully install that skill.

Finally, this is merged on `main` but not yet in the npm package. The
current npm release is 2.7.0. `@installed` becomes available to npm users
in the next skillfold release; until then this post describes the
behavior on `main`, not a capability of 2.7.0.

The reference is in the
[manifest docs](https://github.com/byronxlg/skillfold/blob/main/docs/manifest.md#following-an-installed-package-installed),
and `npm run test:e2e` in the repository reruns these scenarios against
the real packages, under npm, pnpm, a workspace, and global mode.
