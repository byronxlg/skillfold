---
name: github
description: Work with GitHub for branches, PRs, code review, issues, projects, and discussions.
metadata:
  internal: true
---

# GitHub

You use GitHub as part of your workflow. The repo is `byronxlg/skillfold`.

## Agent Identity

All agents share one GitHub account. Tag every public message (issue bodies, PR descriptions, comments, review bodies) with your agent name at the top so the audit trail is clear:

```
**[agent-name]**

Your message here...
```

## Branches and PRs

- Create a feature branch for each piece of work
- Open a pull request with a clear title and description
- Use `gh pr create` to open PRs from the command line
- Use `gh pr view` and `gh pr diff` to review PRs
- Use `gh pr merge` to merge approved PRs
- Link PRs to issues: `gh pr create --body "Closes #ISSUE_NUMBER"`

## Code Review

- Review PRs by reading the diff with `gh pr diff <number>`
- Leave review comments with `gh pr review <number> --approve` or `--request-changes --body "..."`
- Check PR status with `gh pr checks <number>`
- Read review state: `gh pr view <number> --json reviews --jq '.reviews[-1] | {state, body}'`

## Issues

- Create an issue: `gh issue create --repo byronxlg/skillfold --title "..." --body "..."`
- Create with labels: `gh issue create --repo byronxlg/skillfold --title "..." --body "..." --label "task"`
- List issues: `gh issue list --repo byronxlg/skillfold`
- Filter by label: `gh issue list --repo byronxlg/skillfold --label "task"`
- View an issue: `gh issue view NUMBER --repo byronxlg/skillfold`
- Close an issue: `gh issue close NUMBER --repo byronxlg/skillfold`
- Add a comment: `gh issue comment NUMBER --repo byronxlg/skillfold --body "..."`

## Project Board

The team uses GitHub Project #4 (`skillfold`) as the source of truth for task tracking. Every issue and PR should be on the board with correct field values.

**Project ID:** `PVT_kwHOBBJnl84BSS4t`

### Fields

**Status** (field: `PVTSSF_lAHOBBJnl84BSS4tzg_3zuk`)

| Status | Option ID | When to use |
|--------|-----------|-------------|
| Backlog | `e2a069f9` | Roadmap items, not yet prioritized |
| Todo | `42049e09` | Prioritized, ready for next cycle |
| In Progress | `f59e1488` | Actively being worked |
| In Review | `6556c2f2` | PR open, awaiting review |
| Blocked | `973f86bf` | Waiting on external dependency |
| Done | `cf220d76` | Shipped and closed |

**Agent** (field: `PVTSSF_lAHOBBJnl84BSS4tzg_6hkc`)

| Agent | Option ID |
|-------|-----------|
| strategist | `4be20df1` |
| architect | `a598e901` |
| engineer | `d39473bf` |
| reviewer | `bc8fa2bd` |
| marketer | `d7953c0e` |
| human | `d5c96d9f` |

**Priority** (field: `PVTSSF_lAHOBBJnl84BSS4tzg_6hkg`)

| Priority | Option ID |
|----------|-----------|
| P0 - Critical | `55c372c9` |
| P1 - High | `39bccf40` |
| P2 - Normal | `c0e46bdb` |
| P3 - Low | `b07d72a2` |

**Due Date** (field: `PVTF_lAHOBBJnl84BSS4tzg_6hkk`, type: date, format: `YYYY-MM-DD`)

### Board Operations

Add an item:
```
gh project item-add 4 --owner byronxlg --url ISSUE_OR_PR_URL --format json
```

List all items (returns JSON with item IDs and field values):
```
gh project item-list 4 --owner byronxlg --format json
```

Set a field value:
```
gh project item-edit --project-id PVT_kwHOBBJnl84BSS4t --id ITEM_ID --field-id FIELD_ID --single-select-option-id OPTION_ID
```

Set a date:
```
gh project item-edit --project-id PVT_kwHOBBJnl84BSS4t --id ITEM_ID --field-id PVTF_lAHOBBJnl84BSS4tzg_6hkk --date YYYY-MM-DD
```

### Board Workflow

When creating an issue, add it to the board and set Status, Agent, and Priority:
1. Create the issue with `gh issue create`
2. Add to board: `gh project item-add 4 --owner byronxlg --url ISSUE_URL --format json`
3. Parse the item ID from the JSON response
4. Set Status, Agent, and Priority with `gh project item-edit`

When starting work on an issue: set Status to In Progress.
When opening a PR: set Status to In Review.
When blocked: set Status to Blocked.
When done: set Status to Done.

## Discussions

Discussions use the GitHub GraphQL API via `gh api graphql`. Repo ID: `R_kgDORrIFQw`. General category ID: `DIC_kwDORrIFQ84C42C8`.

- List discussions:
  ```
  gh api graphql -f query='{ repository(owner: "byronxlg", name: "skillfold") { discussions(first: 10, orderBy: {field: CREATED_AT, direction: DESC}) { nodes { number title createdAt } } } }'
  ```
- View a discussion:
  ```
  gh api graphql -f query='{ repository(owner: "byronxlg", name: "skillfold") { discussion(number: NUMBER) { title body comments(first: 20) { nodes { body author { login } } } } } }'
  ```
- Create a discussion:
  ```
  gh api graphql -f query='mutation { createDiscussion(input: {repositoryId: "R_kgDORrIFQw", categoryId: "DIC_kwDORrIFQ84C42C8", title: "...", body: "..."}) { discussion { number url } } }'
  ```
- Get a discussion's node ID (needed for commenting):
  ```
  gh api graphql -f query='{ repository(owner: "byronxlg", name: "skillfold") { discussion(number: NUMBER) { id } } }'
  ```
- Comment on a discussion:
  ```
  gh api graphql -f query='mutation { addDiscussionComment(input: {discussionId: "DISCUSSION_NODE_ID", body: "..."}) { comment { url } } }'
  ```
