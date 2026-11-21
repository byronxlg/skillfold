---
project: skillfold
reviewed: 2026-11-21
loops: [L-blog]
kill_switch: "gh workflow disable blog-post.yml -R byronxlg/skillfold (not yet exercised)"
---

# Agent loops

One loop: `.github/workflows/blog-post.yml` runs `anthropics/claude-code-action@v1` every Monday
(cron `17 7 * * 1`) and on manual dispatch. The model is not pinned in the workflow; the
2026-11-16 run reported `claude-sonnet-5-5`, billed to Byron's plan through the
`CLAUDE_CODE_OAUTH_TOKEN` secret. It follows `skills/blog-post/SKILL.md` (installed into
`.claude/skills/` by `npx tsx src/cli.ts install --frozen`), researches the week's story on the
open web, writes a post, opens a PR and merges it itself. The one thing that must never happen:
the loop changes what ships to users of the npm package or of the composite action
(`action.yml`, consumed as `byronxlg/skillfold@main`). Today nothing in code prevents that; see
Guards. Method and scales: management `docs/standard.md` "Agent loops".

## Loop cards

### L-blog weekly blog post

| Field | Value |
| --- | --- |
| Purpose | Write and ship one blog post a week to https://skillfold.botsmith.dev/blog/ |
| Trigger | cron `17 7 * * 1` (Mon 07:17 UTC) and `workflow_dispatch` (`blog-post.yml`) |
| Inputs | `skills/blog-post/SKILL.md`, the prompt in `blog-post.yml`, `docs/blog-todo.md`, `src/`, `docs/`, and any web page it chooses to fetch (WebSearch, WebFetch, `curl` through Bash): untrusted input |
| Outputs | branch `blog/<slug>`, a PR, a squash-merge to `main`, a `gh workflow run docs.yml` deploy to GitHub Pages |
| Done when | an open PR on a `blog/` branch exists, or `site/blog/posts/*.md` on `main` grew by one since the run's starting commit |
| Checked by | the workflow step "Verify the run shipped something" (shell, outside the model; fails the job otherwise); `npm run typecheck` and `npm test` are run by the model itself, since PRs made with `GITHUB_TOKEN` do not trigger `ci.yml` |
| Not done if | a pushed `blog/` branch with no PR (the verify step lists orphans); a merged diff outside `site/blog/posts/*`, `site/index.html`, `docs/blog-todo.md`; `docs.yml` not green after the merge |
| Caps | `--max-turns 150` (`claude_args`, enforced by the CLI); no `timeout-minutes` on the job, so GitHub's 360 min default applies; no spend cap (plan usage, `--max-budget-usd` not set); `concurrency: blog-post` keeps one run at a time |
| On cap | the action still reports success; the verify step turns the job red and prints recovery (`gh pr create --head <branch> --fill`); GitHub's scheduled-workflow failure email goes to Byron |
| Stop | `gh workflow disable blog-post.yml -R byronxlg/skillfold`; re-enable with `gh workflow enable`; cancel one run with `gh run cancel <id>` |
| Credentials | `CLAUDE_CODE_OAUTH_TOKEN` (Byron's Claude plan); `GITHUB_TOKEN` as `GH_TOKEN` and the checkout credential, with `contents: write`, `pull-requests: write`, `actions: write`, `id-token: write`. Not in its env but in the repo: `NPM_TOKEN` (the runbook README says publishing is OIDC only, so this looks unused) |
| Memory and log | git: `docs/blog-todo.md`, the PRs and merge commits; run logs and the result JSON (`num_turns`, `total_cost_usd`) in Actions for 90 days |
| Highest grade | G3 reachable (publish to npm, push the composite action to `main`), held only by the prompt (O1); see Actions |
| Known failure modes | turns exhausted after push, before PR (first real run, `blog/mcp-stateless-rewrite`); caught by the verify step |

## Actions

| Loop | Action | Grade | Oversight | Enforced by | Why this pairing |
| --- | --- | --- | --- | --- | --- |
| L-blog | read repo, WebSearch, WebFetch, `curl` | G0 | O1 | run log | reading changes nothing; the risk is what the pages tell it to do next |
| L-blog | write files, build, run tests in the runner | G1 | O1 | ephemeral runner | thrown away at job end |
| L-blog | push a `blog/` branch, open a PR | G1 | O2 | PR visible in the repo | closing the PR is the undo |
| L-blog | squash-merge a post-only PR to `main` | G2 | O2 | prompt only ("if and only if the diff is the post plus its sync files") | Byron's standing approval for post-only merges; revert commit is the undo. Departs from O3: no code checks the diff |
| L-blog | dispatch `docs.yml` (public site deploy) | G2 | O2 | prompt only | site is static, revert plus redeploy undoes it |
| L-blog | push any file straight to `main` (main is unprotected) | G3 | O1 | nothing; `GITHUB_TOKEN` cannot change `.github/workflows/*`, everything else is open | `action.yml` on `main` runs at once in every repo using `byronxlg/skillfold@main`; should be O6 |
| L-blog | bump `package.json` on `main`, then `gh workflow run publish.yml` (npm publish with provenance) | G3 | O1 | nothing; `actions: write` allows the dispatch and `publish.yml` publishes any version npm lacks | an npm release cannot be unpublished cleanly; should be O6 |
| L-blog | create releases, tags, issues, comments via `gh` | G2 | O1 | nothing beyond token scope | visible, undo by hand |
| L-blog | send data out (HTTP to any host, including repo contents) | G3 | O1 | nothing; Bash and network are unrestricted | the repo is public, so the loss is limited to the run's tokens; `GITHUB_TOKEN` expires with the job, the OAuth token does not |

## Guards

- [x] Done condition written before the run: in the prompt and checked by the verify step.
- [ ] Checker independent of the loop: partly. The verify step is independent, but it only
      checks that something shipped. Typecheck and tests are run by the model; `ci.yml` does
      not run on its PRs; nothing checks the merged diff stayed inside the post files.
- [ ] Tools are an allow-list: no in effect. `--allowedTools` lists `Bash` unscoped, which is
      every command, plus `WebFetch` and `WebSearch`.
- [ ] Keys scoped: no. `GITHUB_TOKEN` holds `contents: write` and `actions: write` on an
      unprotected `main`; the OAuth token is Byron's plan token, not a scoped key.
- [x] Works in an isolated place: an ephemeral Actions runner, a fresh checkout per run.
- [ ] Turn, time and spend caps outside the model: turns yes (150); no `timeout-minutes`; no
      spend cap.
- [ ] Breaker for no progress: no. A failing week is retried next Monday; only the failure
      email reaches Byron.
- [ ] Kill switch tested: `gh workflow disable` not exercised.
- [x] Undo for each G2 action: revert commit, close PR, redeploy.
- [ ] Every G2 and G3 action has a person or a hard block: no. The G3 rows above are held only
      by the prompt.
- [ ] Log of every run kept: partly. Actions keeps logs 90 days; memory (`docs/blog-todo.md`)
      is in git.

The real risk: the loop reads arbitrary web pages (vendor posts, security writeups, papers) with
`Bash` and `WebFetch`, while it holds a write token on an unprotected `main`, `actions: write`,
and an OAuth token. A prompt injection in a fetched page could push to `main`, change
`action.yml` for every downstream repo, or bump the version and dispatch `publish.yml`.

Recommended hardening (not done in this PR; the workflow is unchanged):

1. Protect `main` (require a PR and the `ci.yml` checks) so the loop cannot push to it directly.
2. Drop `actions: write`; dispatch `docs.yml` from a separate job that runs after the agent step,
   or trigger `docs.yml` on `workflow_run`.
3. Move the merge out of the model: a later shell step merges only if `git diff --name-only`
   is inside `site/blog/posts/*`, `site/index.html`, `docs/blog-todo.md`.
4. Scope `Bash` to the commands the skill uses (`Bash(npm run *)`, `Bash(git *)`,
   `Bash(gh pr *)`, ...) and keep the post-writing step without `gh workflow run`.
5. Add `timeout-minutes` (for instance 45) to the job.
6. Put `publish.yml` behind an `npm` environment with a required reviewer, or remove its
   `workflow_dispatch`.
7. Remove the `NPM_TOKEN` repo secret if it is unused (Byron's call: credentials are on the
   floor).

## Signals

| Signal | Recorded in | Acts when | health.md |
| --- | --- | --- | --- |
| Turns and wall time against cap | result JSON in the Actions log (`num_turns`; 19 on 2026-11-16), job duration | not acted on | none (tier 3) |
| Spend against cap, cost per finished item | result JSON `total_cost_usd` ($0.27 on 2026-11-16) | not acted on | none |
| Stop reason and outcome | result `subtype`; the verify step's exit code | job red: GitHub failure email | none |
| No-progress streak | not recorded | | none |
| Grade mix (G0 to G3 counts) | not recorded | | none |
| Gates hit and refusals | result `permission_denials_count` (1 on 2026-11-16) | not acted on | none |
