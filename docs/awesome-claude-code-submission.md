# awesome-claude-code submission

Tracking doc for listing skillfold in
[awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code).

Status as of 2026-07-26: **not listed, not submitted, no cooldown in force.**
Ready to submit.

## Submit through the web form, not the API

Use the prefilled link below and press Submit:

```
https://github.com/hesreallyhim/awesome-claude-code/issues/new?template=recommend-resource.yml&title=%5BResource%5D%3A+Skillfold&display_name=Skillfold&category=Skills&link=https%3A%2F%2Fgithub.com%2Fbyronxlg%2Fskillfold&author_name=byronxlg&author_link=https%3A%2F%2Fgithub.com%2Fbyronxlg&description=Skillfold+manages+Claude+Code+skills+as+declared+dependencies.+Skills+are+listed+in+a+skillfold.yaml+manifest%2C+pinned+to+exact+commits+or+versions+in+a+lockfile+with+sha256+content+hashes%2C+and+installed+reproducibly+into+.claude%2Fskills+from+local+paths%2C+GitHub+repositories%2C+or+npm+packages.+It+also+composes+multiple+skills+into+a+single+generated+SKILL.md+and+can+install+the+same+manifest+for+Codex.
```

Do not create the issue with `gh issue create` or the REST API. Their
validation workflow (`.github/workflows/validate-new-issue.yml`) is gated on:

```yaml
if: contains(github.event.issue.labels.*.name, 'resource-submission')
```

That label is applied by the issue template itself. A non-collaborator cannot
set labels on their repo through the API, so an API-created issue is never
validated and is silently ignored.

## Field values

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

Tick all three checklist boxes. All three are true: skillfold appears zero times
in the list, every link resolves, and the tool is specific to Claude Code
(the Codex target is additive, not the primary use).

## Category choice

`Skills` did not exist when the earlier attempts were made, and it is the
accurate category. Both prior attempts used `Orchestrators`, which described the
pre-2.0 product. Do not resubmit under a Multi-Agent Orchestration heading.

## History: two auto-closed attempts

Both prior attempts were **pull requests**, which the project does not accept.
Submissions must go through the issue template.

- **PR #1020** (2026-03-20) submitted directly as a pull request. Auto-closed,
  7-day cooldown applied to the account.
- **PR #1022** (2026-03-20) a second pull request the same day. Auto-closed,
  cooldown escalated to 14 days, expiring **2026-04-03**.

The cooldown expired on 2026-04-03 and no submission has been made since, so
there is no active penalty. A third procedural violation would escalate further,
which is the reason for the "web form, not API" rule above.

## Why this doc exists

The previous copy of this file was deleted in the 2.0 overhaul (`9eedcfa`). The
cooldown lapsed on 2026-04-03 and nobody noticed for nearly four months, because
the only reminder deleted itself. Keep this file until skillfold is listed, then
replace its contents with a link to the accepted entry.
