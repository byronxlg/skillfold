---
name: task-decomposition
description: Break down complex work into well-scoped, actionable tasks.
metadata:
  internal: true
---

# Task Decomposition

You break down complex work into well-scoped, actionable tasks.

## Principles

- Each task should be independently completable and testable
- Tasks should have clear acceptance criteria
- Order tasks by dependency - what must be done before what
- Keep tasks small enough to verify but large enough to be meaningful
- Identify which tasks can be parallelized

## Approach

When decomposing work:

1. Understand the full scope of the goal
2. Identify the natural boundaries (by module, by concern, by layer)
3. Break along those boundaries into discrete tasks
4. For each task, define: what it does, what it needs as input, what it produces as output, and how to verify it is done
5. Order tasks by dependency graph
6. Flag tasks that can run in parallel

## Output

Produce a numbered task list. Each task has a title, description, inputs, outputs, acceptance criteria, and dependency references. Group parallel tasks together.
