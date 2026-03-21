---
description: Drive the project forward by building and running an autonomous team.
---

Drive the project forward. Use skillfold to build skillfold.

Goal: Make skillfold the obvious choice for any project that wants to run an agent team. The tool is built for agents, but it needs human-readable docs, clear examples, and a trustworthy appearance to gain the confidence of the humans who decide to adopt it.

Use all tools available to you freely - web search, web fetch, GitHub, MCP tools, browser, etc. Don't hold back.

1. Review what happened in previous runs. Check recent git history, open PRs, open issues, discussion threads, and cron logs (`.claude/logs/`). Identify what worked, what failed, and what got stuck. Fix any issues before moving on.
2. Read the project board (`gh project item-list 4 --owner byronxlg --format json`). The board is the source of truth for task state. Check what's in each status column (Backlog, Todo, In Progress, In Review, Blocked). Also check open GitHub issues - any issue not on the board should be added. Any issue filed by humans (not tagged with `**[agent-name]**`) is an external task that the team must incorporate into its direction.
3. Read and review `skillfold.yaml`. Update it if the team needs to change - add skills, adjust the flow, fix broken references.
4. Look for friction points that slow down the rest of the team. If agents are blocked by missing tools, permissions, or unclear instructions, fix those now.
5. Do any research or preparation needed before execution.
6. Compile with `npx tsx src/cli.ts`, then read the generated `build/orchestrator/SKILL.md`. Act as the orchestrator and execute the plan. As you invoke each agent, update the project board: set issues to In Progress when an agent starts, In Review when a PR opens, Done when work is complete.
