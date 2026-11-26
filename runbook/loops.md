---
project: skillfold
reviewed: 2026-11-26
loops: [L-blog]
kill_switch: "gh workflow disable blog-post.yml -R byronxlg/skillfold (not yet exercised)"
---

# Agent loops

One loop: `.github/workflows/blog-post.yml` runs `anthropics/claude-code-action@v1` every Monday
(cron `17 7 * * 1`) and on manual dispatch. The model is not pinned in the workflow; the
2026-11-16 run reported `claude-sonnet-5-5`, billed to Byron's plan through the
`CLAUDE_CODE_OAUTH_TOKEN` secret. It follows `skills/blog-post/SKILL.md` (installed into
`.claude/skills/` by `npx tsx src/cli.ts install --frozen`), researches the week's story on the
open web, writes a post and opens a PR; a second job, `ship`, plain shell outside the model,
merges the PR if its diff is post-only and dispatches the site deploy. The one thing that must
never happen:
the loop changes what ships to users of the npm package or of the composite action
(`action.yml`, consumed as `byronxlg/skillfold@main`). The npm route is closed in code (the
model's job has no `actions: write`); a direct push to an unprotected `main` is not; see Guards.
The guards added on 2026-11-26 are unexercised until the next cron run. Method and scales: management `docs/standard.md` "Agent loops".

## Loop cards

### L-blog weekly blog post

| Field | Value |
| --- | --- |
| Purpose | Write and ship one blog post a week to https://skillfold.botsmith.dev/blog/ |
| Trigger | cron `17 7 * * 1` (Mon 07:17 UTC) and `workflow_dispatch` (`blog-post.yml`) |
| Inputs | `skills/blog-post/SKILL.md`, the prompt in `blog-post.yml`, `docs/blog-todo.md`, `src/`, `docs/`, and any web page it chooses to fetch (WebSearch, WebFetch, `curl` through Bash): untrusted input |
| Outputs | from the model: branch `blog/<slug>` and a PR. From the `ship` job: a squash-merge to `main` and a `gh workflow run docs.yml` deploy to GitHub Pages |
| Done when | an open PR on a `blog/` branch exists, or `site/blog/posts/*.md` on `main` grew by one since the run's starting commit |
| Checked by | the workflow step "Verify the run shipped something" (shell, outside the model; fails the job otherwise); the `ship` job checks every changed file is a post file before it merges; `npm run typecheck` and `npm test` are run by the model itself, since PRs made with `GITHUB_TOKEN` do not trigger `ci.yml` |
| Not done if | a pushed `blog/` branch with no PR (the verify step lists orphans); a PR whose diff goes outside `site/blog/posts/*.md`, `site/index.html`, `docs/blog-todo.md` (`ship` leaves it open and fails the run); `docs.yml` not green after the merge |
| Caps | `--max-turns 150` (`claude_args`, enforced by the CLI); `timeout-minutes: 30` on the model's job and 5 on `ship` (runs have taken about 3 minutes); no spend cap (plan usage, `--max-budget-usd` not set); `concurrency: blog-post` keeps one run at a time |
| On cap | the action still reports success; the verify step turns the job red and prints recovery (`gh pr create --head <branch> --fill`); GitHub's scheduled-workflow failure email goes to Byron |
| Stop | `gh workflow disable blog-post.yml -R byronxlg/skillfold`; re-enable with `gh workflow enable`; cancel one run with `gh run cancel <id>` |
| Credentials | `CLAUDE_CODE_OAUTH_TOKEN` (Byron's Claude plan); `GITHUB_TOKEN` as `GH_TOKEN` and the checkout credential, with `contents: write`, `pull-requests: write`, `id-token: write` in the model's job; `actions: write` only in `ship`, where no model runs. Not in its env but in the repo: `NPM_TOKEN` (the runbook README says publishing is OIDC only, so this looks unused) |
| Memory and log | git: `docs/blog-todo.md`, the PRs and merge commits; run logs and the result JSON (`num_turns`, `total_cost_usd`) in Actions for 90 days |
| Highest grade | G3 reachable (push the composite action to `main`: `contents: write` on an unprotected branch), held by the prompt and a tool allow-list that is not a wall; the npm publish dispatch is blocked by token scope; see Actions |
| Known failure modes | turns exhausted after push, before PR (first real run, `blog/mcp-stateless-rewrite`); caught by the verify step |

## Actions

| Loop | Action | Grade | Oversight | Enforced by | Why this pairing |
| --- | --- | --- | --- | --- | --- |
| L-blog | read repo, WebSearch, WebFetch, `curl` | G0 | O1 | run log; tool allow-list | reading changes nothing; the risk is what the pages tell it to do next |
| L-blog | write files, build, run tests in the runner | G1 | O1 | ephemeral runner | thrown away at job end |
| L-blog | push a `blog/` branch, open a PR | G1 | O2 | PR visible in the repo | closing the PR is the undo |
| L-blog (`ship` job, shell) | squash-merge a post-only PR to `main` | G2 | O2 | the `ship` step: only a PR opened during this run, from this repo, against `main`, every changed file a post file; the model has no `gh pr merge` on its list | Byron's standing approval for post-only merges; revert commit is the undo. Departs from O3 |
| L-blog (`ship` job, shell) | dispatch `docs.yml` (public site deploy) | G2 | O2 | only after a merge by the step above; the model's job has no `actions: write` | site is static, revert plus redeploy undoes it |
| L-blog | push any file straight to `main` (main is unprotected) | G3 | O1 | partly: the allow-list has `git push -u origin blog/` only and `--permission-mode default` denies the rest, but `npm test` and `npx tsx` run repo code the model can edit, with a `contents: write` token on an unprotected `main`. `GITHUB_TOKEN` cannot change `.github/workflows/*` | `action.yml` on `main` runs at once in every repo using `byronxlg/skillfold@main`; should be O6 |
| L-blog | bump `package.json` on `main`, then `gh workflow run publish.yml` (npm publish with provenance) | G3 | O6 | token scope: the model's job has no `actions: write`, so the dispatch is refused, and a `GITHUB_TOKEN` push does not trigger `publish.yml` | an npm release cannot be unpublished cleanly |
| L-blog | create releases, tags, issues, comments via `gh` | G2 | O1 | allow-list: `gh pr create, list, view, diff, edit, comment` only (not a wall, see the push row) | visible, undo by hand |
| L-blog | send data out (HTTP to any host, including repo contents) | G3 | O1 | nothing: `WebFetch` and `curl` stay on the list because the research needs them | the repo is public, so the loss is limited to the run's tokens; `GITHUB_TOKEN` expires with the job, the OAuth token does not |

## Calibration

The pairing an agent follows in this repo, for L-blog and for a session a person starts here
(management `docs/standard.md` "Calibration"). The Actions table above records what holds each
action today; the rows below are what an agent does.

Default pairing: G0 at O0-O1, G1 at O1-O2, G2 at O3-O4, G3 at O4-O5, or O6 when a person could
not catch the mistake in time. An action with no row below takes the default.

| Action | Grade | Default | Here | Direction | Enforced by | Why | Granted |
| --- | --- | --- | --- | --- | --- | --- | --- |
| L-blog: squash-merge its own post-only PR (post, generated block in `site/index.html`, `docs/blog-todo.md`), then dispatch `docs.yml` | G2 | O3-O4 | O2 | looser | the `ship` job checks the diff in shell and does the merge and the dispatch; the model cannot | the PR is the record; revert commit plus redeploy is the undo | standing approval as committed in skillfold#547 (2026-07-25), workflow header: "Post-only PRs are merged by the run itself"; no quoted words on record |
| Session: open a PR and merge it once `ci.yml` is green | G2 | O3-O4 | O2 | looser | `ci.yml` on the PR (not required: `main` is unprotected) | revert PR is the undo | Byron, 2026-10-08, "you can merge freely" |
| Session: merge a package-change PR that carries its version bump and changelog section, which publishes to npm | G3 | O4-O5 | O2 | looser | `release-check` in `ci.yml`; `publish.yml` (OIDC, provenance) | an unreleased package change is unfinished work; a bad release is fixed forward with a patch, never unpublished | Byron, 2026-10-23, "Publish it", "Make sure the workflow includes publishing always" (skillfold#599) |
| Any: push straight to `main`, or force-push | G2 | O3-O4 | O6: go through a PR | tighter | instruction only; `main` is unprotected | `action.yml` on `main` runs at once in every repo using `byronxlg/skillfold@main` | reason only |
| L-blog: merge or push a diff that touches anything outside the post files | G3 | O4-O5 | O6: leave the PR open and say why | tighter | the `ship` job merges post-only diffs alone; a direct push is held by the allow-list and the prompt, not by a block (G146) | same reach as above, and nobody watches the run | reason only |
| L-blog: bump `package.json`, dispatch `publish.yml`, or otherwise cause an npm release | G3 | O4-O5 | O6 | tighter | token scope: no `actions: write` in the model's job | an npm release cannot be taken back; the loop writes posts | reason only |
| L-blog: create releases, tags, issues or comments beyond its own PR | G2 | O3-O4 | O6 | tighter | tool allow-list (`gh pr` subcommands only) | the loop has nobody to ask and no need | reason only |
| L-blog: send repo contents, tokens or anything else to an outside host (reading pages is G0) | G3 | O4-O5 | O6 | tighter | nothing: `WebFetch` and `curl` are on the list (G146) | the OAuth token outlives the job | reason only |
| Any: create, rotate, revoke or delete a credential or repo secret (`CLAUDE_CODE_OAUTH_TOKEN`, `NPM_TOKEN`, npm trusted publisher) | G3 | O4-O5 | O6 | tighter | instruction only | irreversible; may be in use elsewhere | house rule; reason only |

## Guards

- [x] Done condition written before the run: in the prompt and checked by the verify step.
- [ ] Checker independent of the loop: partly. The verify step and the `ship` job are
      independent: one checks something shipped, the other that the diff is post-only before
      merging. Typecheck and tests are still run by the model; `ci.yml` does not run on its PRs.
- [x] Tools are an allow-list: `--permission-mode default` with `--allowedTools` naming each
      Bash command the skill uses; no `gh pr merge`, `gh workflow`, `gh api` or `gh release`.
      A narrowing, not a wall: `npm test` and `npx tsx src/cli.ts` run code the model can edit.
- [ ] Keys scoped: partly. The model's job has `contents: write` and `pull-requests: write`
      but no `actions: write`. `main` is still unprotected, and the OAuth token is Byron's plan
      token, not a scoped key.
- [x] Works in an isolated place: an ephemeral Actions runner, a fresh checkout per run.
- [ ] Turn, time and spend caps outside the model: turns yes (150), time yes
      (`timeout-minutes: 30`); no spend cap.
- [ ] Breaker for no progress: no. A failing week is retried next Monday; only the failure
      email reaches Byron.
- [ ] Kill switch tested: `gh workflow disable` not exercised.
- [x] Undo for each G2 action: revert commit, close PR, redeploy.
- [ ] Every G2 and G3 action has a person or a hard block: partly. Merge and deploy are done
      by shell after a diff check; the npm dispatch is blocked by token scope. A direct push to
      `main` and sending data out are not blocked.
- [ ] Log of every run kept: partly. Actions keeps logs 90 days; memory (`docs/blog-todo.md`)
      is in git.

The real risk: the loop reads arbitrary web pages (vendor posts, security writeups, papers)
while it holds a write token on an unprotected `main` and an OAuth token. A prompt injection in
a fetched page that got the model to edit a test and run `npm test` could still push to `main`
and change `action.yml` for every downstream repo. It can no longer dispatch `publish.yml`.

Done 2026-11-26 (workflow edits, unexercised until the next cron run): `timeout-minutes`; Bash
scoped to named commands with `--permission-mode default`; `actions: write` moved out of the
model's job; merge and deploy moved to the `ship` shell job behind a diff check.

Still open, none of them a workflow edit:

1. Protect `main` (require a PR) so the loop's token cannot push to it directly. Repo setting:
   Byron's.
2. Put `publish.yml` behind an `npm` environment with a required reviewer, or remove its
   `workflow_dispatch`.
3. Remove the `NPM_TOKEN` repo secret if it is unused (Byron's call: credentials are on the
   floor).
4. A spend cap (`--max-budget-usd`) once a sensible figure is known; runs cost about $0.30.
5. Exercise the kill switch once.

## Signals

| Signal | Recorded in | Acts when | health.md |
| --- | --- | --- | --- |
| Turns and wall time against cap | result JSON in the Actions log (`num_turns`; 19 on 2026-11-16), job duration | not acted on | none (tier 3) |
| Spend against cap, cost per finished item | result JSON `total_cost_usd` ($0.27 on 2026-11-16) | not acted on | none |
| Stop reason and outcome | result `subtype`; the verify step's exit code | job red: GitHub failure email | none |
| No-progress streak | not recorded | | none |
| Grade mix (G0 to G3 counts) | not recorded | | none |
| Gates hit and refusals | result `permission_denials_count` (1 on 2026-11-16) | not acted on | none |
