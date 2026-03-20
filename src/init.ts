import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const STARTER_CONFIG = `# yaml-language-server: $schema=node_modules/skillfold/skillfold.schema.json
name: my-pipeline

# To import shared skills from the skillfold library, uncomment:
# imports:
#   - node_modules/skillfold/library/skillfold.yaml

skills:
  atomic:
    planning: ./skills/planning
    coding: ./skills/coding
    reviewing: ./skills/reviewing

  composed:
    planner:
      compose: [planning]
      description: "Analyzes the goal and produces a structured plan."

    engineer:
      compose: [planning, coding]
      description: "Implements the plan, writes code and tests."

    reviewer:
      compose: [reviewing]
      description: "Reviews code for correctness, clarity, and security."

    orchestrator:
      compose: [planning]
      description: "Coordinates pipeline execution."

state:
  Review:
    approved: bool
    feedback: string

  plan:
    type: string

  code:
    type: string

  review:
    type: Review

team:
  orchestrator: orchestrator

  flow:
    - planner:
        writes: [state.plan]
      then: engineer

    - engineer:
        reads: [state.plan]
        writes: [state.code]
      then: reviewer

    - reviewer:
        reads: [state.code]
        writes: [state.review]
      then:
        - when: review.approved == false
          to: engineer
        - when: review.approved == true
          to: end
`;

const PLANNING_SKILL = `---
name: planning
description: Break problems into steps and produce structured plans.
---

# Planning

You break problems into structured, actionable plans.

- Clarify the goal before planning
- Identify dependencies between steps
- Estimate scope and flag risks early
- Produce plans that others can execute without ambiguity
`;

const CODING_SKILL = `---
name: coding
description: Write clean, correct, production-quality code.
---

# Coding

You write clean, correct, production-quality code.

- Follow existing patterns and conventions in the codebase
- Write tests alongside implementation
- Handle errors gracefully with meaningful messages
- Keep functions small and focused on a single task
`;

const REVIEWING_SKILL = `---
name: reviewing
description: Review code for correctness, clarity, and security.
---

# Reviewing

You review code for correctness, clarity, and security.

- Check that the implementation matches the stated goal
- Look for edge cases, error handling gaps, and security issues
- Verify tests cover the key behaviors
- Provide specific, actionable feedback
`;

export function initProject(dir: string): string[] {
  const configPath = join(dir, "skillfold.yaml");

  if (existsSync(configPath)) {
    throw new Error(
      "skillfold.yaml already exists. Remove it first or use a different directory."
    );
  }

  const files: string[] = [];

  mkdirSync(dir, { recursive: true });
  writeFileSync(configPath, STARTER_CONFIG, "utf-8");
  files.push("skillfold.yaml");

  const skills: Array<[string, string]> = [
    ["planning", PLANNING_SKILL],
    ["coding", CODING_SKILL],
    ["reviewing", REVIEWING_SKILL],
  ];

  for (const [name, content] of skills) {
    const skillDir = join(dir, "skills", name);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), content, "utf-8");
    files.push(`skills/${name}/SKILL.md`);
  }

  return files;
}
