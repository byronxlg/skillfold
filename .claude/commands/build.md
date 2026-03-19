Read `dist/orchestrator.md` and follow it. That file is your compiled skill.

If `dist/` is stale or missing, recompile first: `npx tsx src/cli.ts`

After each full pass through the plan, land the increment with a commit. If the team or its skills need improving, update `skillfold.yaml` or `skills/`, recompile, and the next cycle picks up the changes.
