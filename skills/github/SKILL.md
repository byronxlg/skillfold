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
- Filter by label: `gh issue list --repo byronxlg/skillfold --label "direction"`
- View an issue: `gh issue view NUMBER --repo byronxlg/skillfold`
- Close an issue: `gh issue close NUMBER --repo byronxlg/skillfold`
- Add a comment: `gh issue comment NUMBER --repo byronxlg/skillfold --body "..."`

## Projects

The team uses GitHub Project #4 (`skillfold`) for pipeline tracking.

- Add an item: `gh project item-add 4 --owner byronxlg --url ISSUE_OR_PR_URL`
- List items: `gh project item-list 4 --owner byronxlg --format json`
- Set status to Todo: `gh project item-edit --project-id PVT_kwHOBBJnl84BSS4t --id ITEM_ID --field-id PVTSSF_lAHOBBJnl84BSS4tzg_3zuk --single-select-option-id f75ad846`
- Set status to In Progress: `gh project item-edit --project-id PVT_kwHOBBJnl84BSS4t --id ITEM_ID --field-id PVTSSF_lAHOBBJnl84BSS4tzg_3zuk --single-select-option-id 47fc9ee4`
- Set status to Done: `gh project item-edit --project-id PVT_kwHOBBJnl84BSS4t --id ITEM_ID --field-id PVTSSF_lAHOBBJnl84BSS4tzg_3zuk --single-select-option-id 98236657`

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
