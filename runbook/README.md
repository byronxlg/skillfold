---
project: skillfold
tier: 3
owner: byron
lifecycle: production
reviewed: 2026-09-01
---

# skillfold runbook

Skillfold is a declarative skill manager for Claude Code and Codex: `skillfold.yaml` declares
skills and rules, `skillfold.lock` pins them, `skillfold install` puts them in place. It ships
as the npm package `skillfold`, a docs site with a weekly blog, and a composite GitHub Action
(`byronxlg/skillfold@main`) that other repos run in CI. Tier 3: there is nothing to keep alive.
"Live" means `npm view skillfold version` matches the latest `v*` tag and
https://byronxlg.github.io/skillfold/ answers 200. If both hold, the project is healthy.

## Where it runs

Nowhere of ours. The package is served by the npm registry, the site by GitHub Pages (built
from `site/` by `docs.yml`, `build_type: workflow`), and every job runs on GitHub Actions in
`byronxlg/skillfold`. No host on this Mac, no containers, no Doppler secrets. The one secret is
`CLAUDE_CODE_OAUTH_TOKEN`, a GitHub Actions secret in the repo used by `blog-post.yml`; npm
publishing uses OIDC trusted publishing, so there is no npm token anywhere.

## Objectives

| Indicator | Target | Window | Measured by |
| --- | --- | --- | --- |
| A published GitHub release is on npm within 1 h | every release | per release | `npm view skillfold version` equals `git describe --tags --abbrev=0`; `publish.yml` run green |
| https://byronxlg.github.io/skillfold/ returns 200 | 99% of checks | 30 days | `curl -s -o /dev/null -w '%{http_code}' https://byronxlg.github.io/skillfold/` |
| The weekly blog post ran within 2x its cadence (14 days) | every fortnight | rolling | newest `blog-post.yml` run under 14 days old and not `failure` |

Recovery targets: RTO 14 days (the `restore` SLA in `projects.yaml`). RPO not applicable: the
repo is the source of truth and every published version stays on npm.

## Who is watching

| Watcher | Where it runs | Cadence | Checks | Alerts to | Run history |
| --- | --- | --- | --- | --- | --- |
| CI only (`ci.yml`, `publish.yml`, `docs.yml`, `blog-post.yml`) | GitHub Actions | on push, release, or the blog cron | the run itself | GitHub's scheduled-workflow failure email for `blog-post.yml`; nothing else pages | [actions](https://github.com/byronxlg/skillfold/actions) |

No off-host monitor and none is required at tier 3. Two things CI cannot tell you:

- GitHub disables a scheduled workflow after 60 days without repository activity. The blog
  cron commits to `main` weekly, so it keeps itself alive, but if it fails for 60 days in a
  row it is silently switched off. `gh workflow view blog-post.yml` shows the state; re-enable
  with `gh workflow enable blog-post.yml`.
- Commits and PRs created with `GITHUB_TOKEN` (the blog run's merges) do not trigger `ci.yml`
  or `docs.yml`. The blog run tests before merging and dispatches `docs.yml` itself, so a green
  `docs.yml` run shortly after each blog run is the evidence the site was rebuilt.

The weekly fleet review (`bin/fleet check` in the management repo) runs the objective checks
above by hand.

## Files

| Question | File |
| --- | --- |
| How do changes reach npm and the site, how do I roll back? | [updates.md](updates.md) |

Tier 3 does not carry `health.md`, `recovery.md`, `dependencies.md` or `incidents/`; the
objectives table above is the whole health check, and rollback lives in `updates.md`.

## Schedules

| What | Where it runs | When | Notes |
| --- | --- | --- | --- |
| Weekly blog post (`blog-post.yml`) | github-actions | `17 7 * * 1` (Mon 07:17 UTC) | writes a post, opens and merges its own PR, dispatches `docs.yml`; fails on purpose if nothing shipped |
| CI (`ci.yml`) | github-actions | push to `main`, PRs to `main` | Node 20 and 22 matrix: typecheck, tests, blog build, `install --frozen`, `check`, build |
| Publish to npm (`publish.yml`) | github-actions | GitHub release published, or manual dispatch | OIDC trusted publishing with provenance |
| Deploy Docs (`docs.yml`) | github-actions | push to `main` touching `site/**`, `scripts/build-blog.ts`, `package*.json`, or the workflow; manual dispatch | builds `site/blog/` then deploys the `site/` artifact to Pages |

## Dashboards and logs

- Actions runs: https://github.com/byronxlg/skillfold/actions ; per workflow,
  `gh run list --workflow blog-post.yml --limit 5`.
- npm: https://www.npmjs.com/package/skillfold ; `npm view skillfold version time`.
- Pages: `gh api repos/byronxlg/skillfold/pages -q .status` and the environment page at
  https://github.com/byronxlg/skillfold/deployments/github-pages .
- Blog editorial state: `docs/blog-todo.md` (what shipped, what is queued).
