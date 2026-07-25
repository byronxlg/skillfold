---
name: blog-post
description: Write and publish a new blog post for the skillfold site (site/blog/). Use whenever asked to write a blog post, cover a news story about the agent tooling ecosystem, announce a feature rollout, publish the next post from the queue, or when the weekly blog automation runs. Covers the full pipeline - finding the story, verifying it against primary sources, writing the markdown post, regenerating the site, and shipping the PR.
---

# Writing a blog post

The blog lives at `https://byronxlg.github.io/skillfold/blog/`, deployed by
`.github/workflows/docs.yml` on merge to main.

**You write exactly one file.** A post is a markdown file in
`site/blog/posts/` with YAML frontmatter. `scripts/build-blog.ts` derives
everything else - the blog index, the post page, the RSS feed, the sitemap,
and the newest-three list on the landing page. Never hand-edit generated
output; it is gitignored and rebuilt on every deploy.

A post touches these files and no others:

| File | Change |
|---|---|
| `site/blog/posts/<date>-<n>-<slug>.md` | the new post (create) |
| `site/index.html` | only the generated block, and only via `npm run build:blog` |
| `docs/blog-todo.md` | record it under Shipped; check off a Queue item if you used one |

If you are editing `site/blog/index.html`, `site/feed.xml`,
`site/sitemap.xml`, or `site/robots.txt`, stop: those are build products.

## The editorial line

**This is not a product blog.** A blog that explains skillfold over and over
is worth nothing to anyone who has not already adopted it, and it is the
default failure mode of dev-tool blogs. Do not write another one.

The blog covers **the problem space skillfold lives in**: agent
configuration, skill distribution, reproducibility, and the supply chain
underneath all of it. That space now generates real news every week. Write
about the news. skillfold earns a mention when it genuinely bears on the
story, and stays out of the post when it does not.

Three post types, in descending order of how often you should write them:

| Type | Tag | What it is |
|---|---|---|
| Current events | `ecosystem` | A real story in the space, and what it means. The default. |
| Evergreen | `concepts`, `feature`, `workflow` | A durable problem, capability, or task explained. The quiet-week fallback. |
| Rollout | `release` | A large feature shipping. Only when one actually ships. |

## 1. Find the story

Scan the beats listed in `docs/blog-todo.md` for the week's strongest story.
The recurring ones:

- The agent skills standard itself - spec changes, new adopting tools,
  `agentskills.io`, `AGENTS.md` conventions.
- Claude Code and Codex releases. Read the actual changelog, not coverage
  of it.
- Skill registries and marketplaces - growth, policy changes, incidents.
- Security research on skills, MCP, and agent supply chains. This beat has
  been the most productive: real papers, real vendor disclosures, real
  numbers.
- MCP spec developments.
- Package-manager news that rhymes with the problem: lockfile format
  changes, provenance and trusted publishing, SBOM and SLSA work.
- Other tools solving config or skill management, including ones that
  compete with skillfold. Cover them fairly or not at all.

A story is worth a post when it is **verifiable from primary sources** and
**genuinely connected** to reproducibility, distribution, or trust in agent
config. Both conditions, not either.

Do not force a connection. If the honest read is "interesting, but it has
nothing to do with what we know about", write the evergreen fallback
instead. A forced tie-in is more damaging than a quiet week, because it
tells the reader the blog is an ad.

Check the Shipped list in `docs/blog-todo.md` first. Do not re-cover a story
already written up unless the picture materially changed, and then say what
changed and link the earlier post.

## 2. Verify everything

Your knowledge cutoff is behind the news. **Fetch, do not recall.**

**Source quality is the whole game.** The agent-tooling space is saturated
with SEO content farms that restate each other, and their numbers drift with
every retelling. Rules:

- A claim needs a **primary source**: the vendor's own release notes or
  changelog, the spec commit or PR, the security vendor's own writeup, the
  paper itself, the registry's own data. Aggregator blogs and listicles are
  not sources, no matter how confident they sound.
- Every statistic gets its **attribution and date in the prose**: "Snyk's
  February 2026 audit of 3,984 skills found 36.82% had at least one security
  flaw", not "over a third of skills are insecure".
- If a number appears only in content-farm summaries and you cannot reach
  the original, **cut the number** or skip the story.
- Anything contested needs two independent sources.
- Link the primary source inline so a reader can check you.

Claims about skillfold's own behavior are verified differently: never from
memory, always from the repo.

- Read the implementation. `src/resolve.ts` for pin reuse and frozen mode,
  `src/install.ts` for managed-directory safety and pruning,
  `src/compose.ts` for composition, `src/targets.ts` and `src/agentsmd.ts`
  for targets and the AGENTS.md block, `src/lock.ts` for the lockfile shape.
- Read the reference docs that pin the contract: `docs/manifest.md`,
  `docs/cli.md`, `docs/getting-started.md`, `docs/publishing.md`. If a post
  and the docs disagree, one of them is a bug - resolve it, do not paper
  over it.
- Run the command. Any console output you quote comes from an actual run
  (`npx tsx src/cli.ts <command>`), never from memory. Use a scratch
  directory when the command writes files.

If a claim cannot be verified, cut it.

## 3. Write the post

Filename: `site/blog/posts/YYYY-MM-DD-N-<slug>.md`, where `YYYY-MM-DD` is
today's real date and `N` orders posts that share a date. A higher `N` was
published later and sits higher on the page, so take the next number above
the highest already used for that date (`1` if the date is new). Neither the
date nor the number appears in the URL, so renumbering never breaks a
permalink.

```yaml
---
title: What the reader is trying to understand
description: 140-160 characters stating what the post explains and what the reader leaves with.
date: 2026-07-25
tags: [ecosystem]
---
```

- `title`, `description`, and `date` are required; the build fails without them.
- `description` is 140-160 characters.
- **Quote any value containing `": "`.** YAML reads an unquoted colon-space as
  a nested mapping and the build fails. Either quote it
  (`description: "Skills: a primer"`) or rewrite the sentence without the
  colon. This is the single most common way a post fails to build.
- `date` must be `YYYY-MM-DD` and must be today's real date.
- `tags`: exactly one of `ecosystem` (a current story), `concepts` (how to
  think about a problem), `feature` (how a capability works), `workflow` (a
  task end to end), or `release` (a rollout).
- `slug` is derived from the filename. Set it explicitly only to keep a URL
  stable when renaming.
- `draft: true` keeps a post out of the build entirely.

Content rules:

- 800-1400 words. Long enough to teach the topic, short enough that every
  section pulls weight.
- Lead with the story or the reader's problem. **Never lead with skillfold**
  (the one exception is a `release` post, which is about skillfold by
  definition).
- The title names what happened or what the reader wants to know. Not a
  feature name, not a pun.
- **Every post states a limitation.** For an `ecosystem` post that means
  saying plainly what skillfold does not fix about the story. This is the
  single biggest thing separating a post developers trust from one they
  bounce off, and it is the first thing to check when reviewing your own
  draft.
- No predictions about what will happen next. No dunking on competing
  tools. No security FUD - do not describe a threat in order to sell a
  lockfile. Report what was found, cite who found it, say what it does and
  does not imply.
- Voice: plain, precise, technical. No emojis. No em dashes - use hyphens or
  restructure. No exclamation marks. Do not use "simply", "just", "easy",
  or "powerful".
- `##` for sections, `###` sparingly. The generator gives every heading an id.
- Fenced code blocks with a language tag (```yaml, ```sh, ```console). Keep
  lines under about 76 characters or they force a horizontal scrollbar at the
  article measure. Use `console` only for real output from a real run.
- Markdown tables are supported and are the right shape for comparisons.
- Link to the docs rather than restating a reference table in full.

### Rollout posts

Write one when a feature is large enough to change how someone uses the tool:
a new source kind, a new install target, a breaking change, a major version.
Not for patch releases or bug fixes - those belong in `CHANGELOG.md`.

A rollout post must cover: the problem the feature solves, what it looks like
in the manifest, the migration path for existing users, what it explicitly
does not do, and a link to the reference docs. Tag it `release`.

## 4. Build and verify

```sh
npm run build:blog
```

This regenerates the post page, blog index, feed, sitemap, and the landing
page block. Then:

- `npm run typecheck` and `npm test` still pass.
- Serve and click through: `npx http-server -p 8899 -s site`, then check
  `/blog/`, the new post, and the landing `#blog` section. Confirm the post
  renders, prev/next point at real posts, and the landing block lists the new
  post first. Kill the server when done.
- Grep the new slug across `site/` - it must appear in the generated post
  path, the blog index, the feed, the sitemap, and the landing block.
- Re-read the draft against two questions: is there a claim here I did not
  actually verify, and does this post state its limitation? Fix both before
  shipping.

`site/index.html` is committed, so if `build:blog` rewrote its generated
block (it says so in its output), commit that change with the post.

## 5. Update the queue

In `docs/blog-todo.md`, add a line under Shipped. An `ecosystem` post's line
must name the story, not just the title, so the repeat check can match it:

```md
- [x] <title> (story: <what happened>, <date>) - 2026-07-25, site/blog/posts/<file>.md
```

If you used a Queue topic, check it off too. Shipped is how the next run
avoids re-covering ground, so every published post lands there.

## 6. Ship

Branch `blog/<slug>`, commit as `Blog: <title>`, push, and open a PR
describing the story and why it is worth covering.

**Open the PR in the same breath as the push.** A pushed branch with no PR is
invisible: nothing reviews it, nothing deploys it, and the next run will not
find it. The first unattended run did exactly this, pushing a finished post and
then stopping before `gh pr create`. Push and open the PR as one step, then do
any remaining polish on the PR.

The PR is the audit trail and revert point, not a review gate. If the diff is
only the post, the landing page's generated block, and `docs/blog-todo.md`,
squash-merge it yourself:

```sh
gh pr merge --squash --delete-branch
```

If the diff touches anything else - the workflow, this skill, `scripts/`,
`src/`, the manifest - leave the PR open for review and say why in a comment.
That boundary is the whole safety model for unattended runs; do not widen it.

When merging from inside a GitHub Actions run, dispatch the deploy afterwards:

```sh
gh workflow run docs.yml
```

Pushes made with `GITHUB_TOKEN` do not trigger other workflows on their own.
A merge done interactively with a human's `gh` auth triggers the deploy
automatically and needs no dispatch.
