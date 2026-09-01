---
project: skillfold
reviewed: 2026-09-01
deploy_path: tag
rollback_minutes: 15
---

# Updates

Two things ship and they ship differently. The npm package ships only when a GitHub release is
published: merging to `main` never publishes, so `main` can run ahead of npm for weeks (it did
between 2.0.0 and 2.3.0). The docs site ships on every merge that touches `site/`, plus a
manual dispatch after each blog run. The GitHub Action (`action.yml`) is consumed by other
repos at `@main`, so it is live the moment it merges, with no release step at all.

## How a change reaches production

| Change to | Pipeline | Trigger | Lands in prod when | Evidence |
| --- | --- | --- | --- | --- |
| `src/**`, `library/**`, `skillfold.schema.json` (the package) | `publish.yml`: `npm ci`, typecheck, tests, build, `npm publish --provenance` | GitHub release published (`gh release create vX.Y.Z --generate-notes`) | the publish step finishes, usually under 5 min | `npm view skillfold version`; provenance badge on npmjs.com; the run log |
| `site/**`, `scripts/build-blog.ts` | `docs.yml`: `npm run build:blog`, upload `site/`, `deploy-pages` | push to `main` on those paths; `workflow_dispatch` | Pages deployment finishes, 1 to 2 min | `docs.yml` run green; `curl -sI https://byronxlg.github.io/skillfold/` |
| `site/blog/posts/*.md` written by the bot | `blog-post.yml` merges its own PR, then `gh workflow run docs.yml` | Monday cron | the dispatched `docs.yml` run finishes | new post at `/blog/`; `docs/blog-todo.md` shipped log |
| `action.yml` | none | merge to `main` | immediately, for every repo using `byronxlg/skillfold@main` | consumer repos' next CI run |
| `docs/*.md`, `README.md` | none | merge to `main` | on GitHub immediately; on npm only after the next release | n/a |

Release procedure, in order:

1. Bump `version` in `package.json` (and `package-lock.json` via `npm install`), add a
   `CHANGELOG.md` section, open a PR titled `Release X.Y.Z`, merge when CI is green.
2. `gh release create vX.Y.Z --generate-notes` on the merge commit. Publishing the release is
   the deploy; a draft release does nothing.
3. Watch `gh run watch` for `publish.yml`. Semver rules are in `CONTRIBUTING.md`: a manifest,
   lockfile or CLI break is a major.

## Post-deploy smoke test

Not a merge gate; run it after `publish.yml` goes green. It proves the registry serves the new
version and that a clean machine can install and run it. `npx skillfold@X.Y.Z` bypasses any
local install.

```sh
V=$(git describe --tags --abbrev=0 | sed 's/^v//')
test "$(npm view skillfold version)" = "$V" && echo "npm serves $V"
npx --yes "skillfold@$V" --version
cd "$(mktemp -d)" && npx --yes "skillfold@$V" init && npx --yes "skillfold@$V" install && npx --yes "skillfold@$V" check
```

Pass: all three commands exit 0 and the printed version matches the tag. For the site:
`curl -s -o /dev/null -w '%{http_code}\n' https://byronxlg.github.io/skillfold/blog/` is 200
and the newest post is listed.

## Rollback

There is no `recovery.md` at tier 3; this is the whole rollback story.

- npm: a published version cannot be unpublished after 72 h and should not be before. Mark it
  `npm deprecate skillfold@X.Y.Z "reason, use X.Y.Z+1"` (needs an npm login with publish rights;
  the OIDC flow in CI cannot deprecate), then revert the offending commit on `main`, bump a
  patch, and release again. Users on `latest` move to the patch on their next install. About
  15 min end to end.
- Site: revert the commit and let `docs.yml` redeploy, or `gh workflow run docs.yml` from a
  known-good `main`. Pages keeps no history, so a revert is the only path back.
- Action: revert the commit; consumers on `@main` pick it up on their next run.
- Blog post: every post PR is merged with `--squash`, so `git revert <merge sha>` removes the
  post, the `index.html` block and the `blog-todo.md` line together; then dispatch `docs.yml`.

## Scheduled maintenance

| What | Cadence | How | Validated by |
| --- | --- | --- | --- |
| npm deps (`npm update`, review `npm audit`) | monthly, or on advisory | PR; CI runs typecheck and tests on Node 20 and 22 | CI; `npx tsx src/cli.ts check` still green |
| Node version (`engines.node >=20`; workflows pin 22, CI matrix 20 and 22) | Node 20 reached EOL on 2026-04-30; drop it from the matrix and bump `engines` in the next major. Recheck yearly | PR | CI |
| GitHub Actions versions (`checkout@v4`, `setup-node@v4`, `upload-pages-artifact@v3`, `deploy-pages@v4`, `claude-code-action@v1`) | quarterly, or when a run warns of deprecation | PR | CI and the next `docs.yml` / `blog-post.yml` run |
| `CLAUDE_CODE_OAUTH_TOKEN` (GitHub Actions secret for `blog-post.yml`) | when a blog run fails at auth | `claude setup-token` then `gh secret set CLAUDE_CODE_OAUTH_TOKEN` | next `blog-post.yml` run green |
| `docs/blog-todo.md` evergreen queue | when the bot reports the queue is empty | edit the queue by hand | a quiet-week run still ships a post |

None of this is automated today (no dependabot config); the fleet review is the reminder.

## Flags, arming and other runtime switches

No runtime switches. The only behavioural knobs are in the repo: the blog cron line and
`--max-turns 150` in `blog-post.yml`, and `targets` in `skillfold.yaml`. Changing any of them
is a normal PR.

## Things that are risky to change

- `action.yml`. Every consumer references `byronxlg/skillfold@main`, so a broken composite
  action fails other repos' CI within the hour and there is no version to pin them back to.
  Test it from a scratch repo (`uses: byronxlg/skillfold@<branch>`) before merging, and keep
  its inputs backwards compatible.
- The manifest and lockfile formats (`src/manifest.ts`, `src/lock.ts`, `skillfold.schema.json`).
  Every user's committed `skillfold.yaml` and `skillfold.lock` must keep parsing, and
  `install --frozen` in their CI must keep passing. A hash or pin format change is a major
  release with a migration note in `CHANGELOG.md` (v2.1.0 is the precedent: renamed and
  composed skills re-hashed, and users had to run a non-frozen install once).
- `library/` skills and the `agentskills` map in `package.json`. Renaming or removing an entry
  breaks `npm:skillfold/<name>` sources in other people's manifests at their next `update`.
- `blog-post.yml`. It merges its own PRs with `contents: write`; widen the "post-only diff"
  guard in the prompt with care, and keep the ship check so a silent no-op run still fails.
