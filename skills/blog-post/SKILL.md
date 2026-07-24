---
name: blog-post
description: Write and publish a new blog post for the skillfold site (site/blog/). Use whenever asked to write a blog post, add blog or SEO content, publish the next post from the queue, or when the weekly blog automation runs. Covers the full pipeline - picking the topic from docs/blog-todo.md, verifying every claim against the source, writing the markdown post, regenerating the site, and shipping the PR.
---

# Writing a blog post

The blog lives at `https://byronxlg.github.io/skillfold/blog/`, deployed by
`.github/workflows/docs.yml` on merge to main.

Unlike a hand-maintained static site, **you write exactly one file**. A post is
a markdown file in `site/blog/posts/` with YAML frontmatter.
`scripts/build-blog.ts` derives everything else - the blog index, the post
page, the RSS feed, the sitemap, and the newest-three list on the landing page.
Never hand-edit generated output; it is gitignored and rebuilt on every deploy.

A post touches these files and no others:

| File | Change |
|---|---|
| `site/blog/posts/<date>-<n>-<slug>.md` | the new post (create) |
| `site/index.html` | only the generated block, and only via `npm run build:blog` |
| `docs/blog-todo.md` | check the topic off Queue, add it under Shipped |

If you find yourself editing `site/blog/index.html`, `site/feed.xml`,
`site/sitemap.xml`, or `site/robots.txt`, stop: those are build products.

## 1. Pick the topic

Take the **topmost unchecked topic** in `docs/blog-todo.md`. The queue is
ordered by value; do not cherry-pick a more interesting one further down.

If the queue is empty, refill it with five new topics before writing. Good
topics come from the gap between what skillfold does and what people
currently do by hand: a real workflow problem, named the way someone would
search for it. Bad topics are release notes and feature tours.

Check the Shipped list first. Do not re-cover a topic already written up
unless the behavior itself changed, and then say what changed and link the
earlier post.

## 2. Get the facts right

This is the part that matters most. skillfold posts make concrete claims
about how a tool behaves, and a wrong claim in a post that ranks is worse
than no post at all.

**Never write skillfold behavior from memory.** Before describing anything:

- Read the implementation. `src/resolve.ts` for pin reuse and frozen mode,
  `src/install.ts` for managed-directory safety and pruning, `src/compose.ts`
  for composition, `src/targets.ts` and `src/agentsmd.ts` for targets and the
  AGENTS.md block, `src/lock.ts` for the lockfile shape.
- Read the docs that already pin the contract: `docs/manifest.md`,
  `docs/cli.md`, `docs/getting-started.md`, `docs/publishing.md`. If a post
  and the docs disagree, one of them is a bug - resolve it, do not paper over it.
- Run the command. Any console output you quote must come from an actual run
  (`npx tsx src/cli.ts <command>`), not from memory of what it prints. Use a
  scratch directory, not this repo, when the command would write files.
- Check the tests. `src/*.test.ts` encode the edge cases; they are the fastest
  way to learn what a function actually guarantees.

If a claim cannot be verified against source, docs, or a real run, cut it.

Claims about other tools (Claude Code, Codex, npm, the agent skills standard)
need a citation you actually fetched, not a recollection. WebSearch or
WebFetch it, and link it.

## 3. Write the post

Filename: `site/blog/posts/YYYY-MM-DD-N-<slug>.md`, where `YYYY-MM-DD` is
today's real date and `N` is a sequence number that only matters when several
posts share a date (lower sorts higher on the page; use `1`). Neither the
date nor the number appears in the URL.

Frontmatter:

```yaml
---
title: What the reader is trying to do
description: 140-160 characters stating what the post explains and what the reader leaves with.
date: 2026-07-25
tags: [concepts]
---
```

- `title`, `description`, and `date` are required; the build fails without them.
- `date` must be `YYYY-MM-DD` and must be today's real date.
- `tags`: one tag, from `concepts` (how to think about the problem),
  `feature` (how a specific capability works), or `workflow` (how to do a
  task end to end).
- `slug` is derived from the filename. Set it explicitly only to keep a URL
  stable when renaming.
- `draft: true` keeps a post out of the build entirely.

Content rules:

- 800-1400 words. Long enough to teach the topic, short enough that every
  section pulls weight.
- The title is what someone would search for or ask a colleague, phrased as
  their problem, not as a feature name. "Your skills directory is undeclared
  state", not "Introducing lockfiles".
- Open with the reader's situation, not with skillfold. The tool appears when
  it is genuinely the answer, usually a third of the way in and again at the
  end. A post that pitches in the first paragraph reads like an ad and gets
  closed like one.
- Say what the tool will not do, and when not to use the thing you are
  describing. Every post should contain at least one honest limitation. This
  is the single biggest difference between a post developers trust and one
  they bounce off.
- Voice: plain, precise, technical. No emojis. No em dashes - use hyphens or
  restructure the sentence. No exclamation marks. Do not use "simply",
  "just", "easy", or "powerful".
- Use `##` for sections and `###` sparingly. The generator gives every
  heading an id, so sections are linkable.
- Fenced code blocks with a language tag (```yaml, ```sh, ```console). Keep
  lines under about 76 characters: longer lines force a horizontal scrollbar
  at the article measure.
- Use `console` for anything showing a prompt and real output, `sh` for
  commands alone. Output in a `console` block must be a real run's output.
- Link to the docs (`https://github.com/byronxlg/skillfold/blob/main/docs/...`)
  rather than restating a reference table in full.
- Markdown tables are supported and are the right shape for
  option-by-option comparisons.

## 4. Build and verify

```sh
npm run build:blog
```

This regenerates the post page, blog index, feed, sitemap, and the landing
page block. Then:

- `npm run typecheck` and `npm test` still pass (they should be untouched,
  but a post is a commit like any other).
- Serve and click through: `npx http-server -p 8899 -s site`, then check
  `/blog/`, the new post, and the landing page `#blog` section. Confirm the
  post renders, the prev/next links point at real posts, and the landing
  block lists the new post first. Kill the server when done.
- Grep the new slug across `site/` - it must appear in the generated post
  path, the blog index, the feed, the sitemap, and the landing block. If it
  is missing anywhere, the build did not run or the frontmatter is wrong.
- Re-read the post for claims you did not actually verify in step 2. Cut them.

`site/index.html` is committed, so if `build:blog` rewrote its generated
block (it says so in its output), commit that change with the post.

## 5. Update the queue

In `docs/blog-todo.md`: check the topic off under Queue, and add a line under
Shipped with the date and the post path:

```md
- [x] <title> - 2026-07-25, site/blog/posts/2026-07-25-1-<slug>.md
```

Shipped is how the next run avoids re-covering a topic, so every published
post lands there.

## 6. Ship

Branch `blog/<slug>`, commit as `Blog: <title>`, push, and open a PR
describing the topic in a paragraph and naming the search intent it targets.

The PR is the audit trail and the revert point, not a review gate. If the
diff is only the post, the landing page's generated block, and
`docs/blog-todo.md`, squash-merge it yourself:

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
