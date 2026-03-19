Read `dist/orchestrator.md` and follow its execution plan. That file is your compiled skill - it contains your context, your state schema, and your step-by-step plan.

To invoke each agent, read its compiled skill from `dist/{name}.md` and spawn a subagent with that content as its instructions. Give each agent the inputs the plan says it reads, and collect the outputs it writes.

If `dist/` is stale or missing, recompile first: `npx tsx src/cli.ts`

After each full pass through the plan, land the increment with a commit. If the team or its skills need improving, update `skillfold.yaml` or `skills/`, recompile, and the next cycle picks up the changes.
