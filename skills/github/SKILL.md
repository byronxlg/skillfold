---
name: github
description: Work with GitHub for branches, PRs, code review, issues, projects, and discussions.
---

# GitHub

You use GitHub as part of your workflow. The repo is `byronxlg/skillfold`.

## Branches and PRs

- Create a feature branch for each piece of work
- Open a pull request with a clear title and description
- Use `gh pr create` to open PRs from the command line
- Use `gh pr view` and `gh pr diff` to review PRs
- Use `gh pr merge` to merge approved PRs
- Link PRs to issues: `gh pr create --body "Closes #ISSUE_NUMBER"`

## Code Review on GitHub

- Review PRs by reading the diff with `gh pr diff <number>`
- Leave review comments with `gh pr review <number> --approve` or `--request-changes --body "..."`
- Check PR status with `gh pr checks <number>`

## Issues

- Create an issue: `gh issue create --repo byronxlg/skillfold --title "..." --body "..."`
- Create with labels: `gh issue create --repo byronxlg/skillfold --title "..." --body "..." --label "task"`
- List issues: `gh issue list --repo byronxlg/skillfold`
- View an issue: `gh issue view NUMBER --repo byronxlg/skillfold`
- Close an issue: `gh issue close NUMBER --repo byronxlg/skillfold`
- Add a comment: `gh issue comment NUMBER --repo byronxlg/skillfold --body "..."`

## Projects

The team uses GitHub Project #4 (`skillfold`) for pipeline tracking.

- Add an issue to the project: `gh project item-add 4 --owner byronxlg --url https://github.com/byronxlg/skillfold/issues/NUMBER`
- Add a PR to the project: `gh project item-add 4 --owner byronxlg --url https://github.com/byronxlg/skillfold/pull/NUMBER`
- List project items: `gh project item-list 4 --owner byronxlg --format json`
- Edit item fields: `gh project item-edit --project-id PVT_kwHOBBJnl84BSS4t --id ITEM_ID --field-id FIELD_ID --text "value"`

## Discussions

Discussions use the GitHub GraphQL API via `gh api graphql`.

- List discussions:
  ```
  gh api graphql -f query='{ repository(owner: "byronxlg", name: "skillfold") { discussions(first: 10, orderBy: {field: CREATED_AT, direction: DESC}) { nodes { number title createdAt } } } }'
  ```
- View a discussion:
  ```
  gh api graphql -f query='{ repository(owner: "byronxlg", name: "skillfold") { discussion(number: NUMBER) { title body comments(first: 20) { nodes { body author { login } } } } } }'
  ```
- Create a discussion (requires repo and category IDs):
  ```
  gh api graphql -f query='mutation { createDiscussion(input: {repositoryId: "REPO_ID", categoryId: "CATEGORY_ID", title: "...", body: "..."}) { discussion { number url } } }'
  ```
  Get IDs with: `gh api graphql -f query='{ repository(owner: "byronxlg", name: "skillfold") { id discussionCategories(first: 10) { nodes { id name } } } }'`
- Comment on a discussion (requires discussion node ID):
  ```
  gh api graphql -f query='mutation { addDiscussionComment(input: {discussionId: "DISCUSSION_NODE_ID", body: "..."}) { comment { url } } }'
  ```
  Get discussion node ID with: `gh api graphql -f query='{ repository(owner: "byronxlg", name: "skillfold") { discussion(number: NUMBER) { id } } }'`
