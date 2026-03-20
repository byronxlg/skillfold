---
name: github
description: Work with GitHub for branches, PRs, code review, and discussions.
---

# GitHub

You use GitHub as part of your workflow.

## Branches and PRs

- Create a feature branch for each piece of work
- Open a pull request with a clear title and description
- Use `gh pr create` to open PRs from the command line
- Use `gh pr view` and `gh pr diff` to review PRs
- Use `gh pr merge` to merge approved PRs

## Code Review on GitHub

- Review PRs by reading the diff with `gh pr diff <number>`
- Leave review comments with `gh pr review <number> --approve` or `--request-changes --body "..."`
- Check PR status with `gh pr checks <number>`

## Discussions

- Create a discussion: `gh discussion create --repo byronxlg/skillfold --category General --title "..." --body "..."`
- Comment on a discussion: `gh discussion comment <number> --repo byronxlg/skillfold --body "..."`
- List discussions: `gh discussion list --repo byronxlg/skillfold`
- View a discussion: `gh discussion view <number> --repo byronxlg/skillfold`
