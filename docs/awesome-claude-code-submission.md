# awesome-claude-code submission

Tracking doc for listing skillfold in
[awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code).

**Status as of 2026-07-26: blocked upstream. Do not attempt to submit.**

Issue creation is restricted to repository collaborators. Opening the form
returns:

> An owner of this repository has limited the ability to create an issue to
> users that are collaborators on this repository.

This is deliberate and temporary. Their `CONTRIBUTING.md` says:

> This document is provisional while the new redesign settles. I'm disabling
> recommendations for a little while we "catch up".

The last recommendation from an outside contributor was 2026-07-19. Everything
opened since is from the maintainer. There is no alternative route: pull
requests are explicitly forbidden, and the `gh` CLI explicitly does not work.

## Preconditions before submitting when it reopens

The maintainer states the bar directly in `CONTRIBUTING.md` and in
[issue #2310](https://github.com/hesreallyhim/awesome-claude-code/issues/2310):

> Build something awesome; Get users; Submit it to Awesome Claude Code - or just
> focus on the project, and I'll notice it if it gathers enough interest.

and:

> If "getting on the list" is any part of a promotional strategy for your
> project, you should be prepared to have a backup plan.

What they look for is signal that other people already use the thing: stars,
real git history, and evidence the author kept working past the initial release.

How skillfold measured up on 2026-07-26:

| Signal | Value | Reading |
|---|---|---|
| Git history | since 2026-03-19 | fine, not a day-one submission |
| Sustained work | v1.x through v2.3.0 | fine |
| npm downloads | 423/month, 90/week | thin but real |
| GitHub stars | 11 | the weak one |

Stars are the gap. Submitting into a backlog of 701 open issues with 11 stars is
unlikely to land, so the sequencing is: build adoption first, submit second.

## Submission mechanics, for when it reopens

Recommendations must be made through the web UI issue form. Their
`CONTRIBUTING.md` warns that any other route risks a temporary interaction ban,
and that is exactly what happened here twice before.

Their validation workflow (`.github/workflows/validate-new-issue.yml`) is gated
on:

```yaml
if: contains(github.event.issue.labels.*.name, 'resource-submission')
```

That label is applied by the issue template itself. A non-collaborator cannot
set labels through the API, so an API-created issue is never validated and is
silently ignored.

Prefilled form link (only works once the restriction lifts):

```
https://github.com/hesreallyhim/awesome-claude-code/issues/new?template=recommend-resource.yml&title=%5BResource%5D%3A+Skillfold&display_name=Skillfold&category=Skills&link=https%3A%2F%2Fgithub.com%2Fbyronxlg%2Fskillfold&author_name=byronxlg&author_link=https%3A%2F%2Fgithub.com%2Fbyronxlg&description=Skillfold+manages+Claude+Code+skills+as+declared+dependencies.+Skills+are+listed+in+a+skillfold.yaml+manifest%2C+pinned+to+exact+commits+or+versions+in+a+lockfile+with+sha256+content+hashes%2C+and+installed+reproducibly+into+.claude%2Fskills+from+local+paths%2C+GitHub+repositories%2C+or+npm+packages.+It+also+composes+multiple+skills+into+a+single+generated+SKILL.md+and+can+install+the+same+manifest+for+Codex.
```

| Field | Value |
|---|---|
| Display Name | `Skillfold` |
| Category | `Skills` |
| Link | `https://github.com/byronxlg/skillfold` |
| Author Name | `byronxlg` |
| Author Link | `https://github.com/byronxlg` |

Description (402 characters; their limit is 10 to 500, 1 to 3 sentences,
descriptive rather than promotional, and it must not address the reader):

> Skillfold manages Claude Code skills as declared dependencies. Skills are
> listed in a skillfold.yaml manifest, pinned to exact commits or versions in a
> lockfile with sha256 content hashes, and installed reproducibly into
> .claude/skills from local paths, GitHub repositories, or npm packages. It also
> composes multiple skills into a single generated SKILL.md and can install the
> same manifest for Codex.

`Skills` did not exist as a category when the earlier attempts were made. Both
of those used `Orchestrators`, which described the pre-2.0 product. Do not
resubmit under a Multi-Agent Orchestration heading.

## History: two auto-closed attempts

Both prior attempts were **pull requests**, which the project does not accept.

- **PR #1020** (2026-03-20) submitted as a pull request. Auto-closed, 7-day
  cooldown applied to the account.
- **PR #1022** (2026-03-20) a second pull request the same day. Auto-closed,
  cooldown escalated to 14 days, expiring 2026-04-03.

That cooldown expired long ago and is not what is blocking now. The current
block is the repository-wide restriction described above, which applies to
everyone who is not a collaborator.

## Re-checking

The restriction lifts at the maintainer's discretion, with no announced date.
To test cheaply, check whether any non-maintainer has opened an issue recently:

```sh
gh api search/issues -X GET \
  -f q='repo:hesreallyhim/awesome-claude-code is:issue' \
  -f sort=created -f order=desc \
  --jq '.items[] | "\(.created_at) \(.user.login) \(.title)"' | head
```

If logins other than `hesreallyhim` appear with recent dates, submissions are
open again.

Note that skillfold was never on the previous list, so the stated plan to
re-incorporate previously-listed resources does not apply here.

## Why this doc exists

An earlier copy was deleted in the 2.0 overhaul (`9eedcfa`), and the expiry of
the old cooldown went unnoticed for nearly four months because the only reminder
had deleted itself. Keep this file until skillfold is listed, then replace its
contents with a link to the accepted entry.
