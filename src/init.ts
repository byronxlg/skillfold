import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const STARTER_CONFIG = `name: my-pipeline

# To import shared skills from the skillfold library, uncomment:
# imports:
#   - node_modules/skillfold/library/skillfold.yaml

skills:
  atomic:
    plan: ./skills/plan
    execute: ./skills/execute

  composed:
    planner:
      compose: [plan]
      description: "Analyzes the goal and produces a plan."

    worker:
      compose: [plan, execute]
      description: "Executes tasks from the plan."

    orchestrator:
      compose: [plan]
      description: "Coordinates pipeline execution."

state:
  goal:
    type: string

  result:
    type: string

team:
  orchestrator: orchestrator

  flow:
    - planner:
        writes: [state.goal]
      then: worker

    - worker:
        reads: [state.goal]
        writes: [state.result]
      then: end
`;

const PLAN_SKILL = `---
name: plan
description: Analyze problems and produce structured plans.
---

# Plan

You analyze problems and produce structured, actionable plans. Break work into clear steps with defined inputs and outputs.
`;

const EXECUTE_SKILL = `---
name: execute
description: Execute tasks and produce results.
---

# Execute

You take a plan and execute it step by step, producing concrete output for each task.
`;

export function initProject(dir: string): string[] {
  const configPath = join(dir, "skillfold.yaml");

  if (existsSync(configPath)) {
    throw new Error(
      "skillfold.yaml already exists. Remove it first or use a different directory."
    );
  }

  const files: string[] = [];

  // Create skillfold.yaml
  mkdirSync(dir, { recursive: true });
  writeFileSync(configPath, STARTER_CONFIG, "utf-8");
  files.push("skillfold.yaml");

  // Create skills/plan/SKILL.md
  const planDir = join(dir, "skills", "plan");
  mkdirSync(planDir, { recursive: true });
  writeFileSync(join(planDir, "SKILL.md"), PLAN_SKILL, "utf-8");
  files.push("skills/plan/SKILL.md");

  // Create skills/execute/SKILL.md
  const executeDir = join(dir, "skills", "execute");
  mkdirSync(executeDir, { recursive: true });
  writeFileSync(join(executeDir, "SKILL.md"), EXECUTE_SKILL, "utf-8");
  files.push("skills/execute/SKILL.md");

  return files;
}
