# Getting Started with Skillfold

This tutorial walks you from zero to a compiled multi-agent pipeline. By the end, you will have a working pipeline with skill composition, typed state, conditional routing, and a review loop.

**Two paths:** If you already have Claude Code agents in `.claude/agents/`, start with [Adopting an existing setup](#adopting-an-existing-setup). Otherwise, continue below to scaffold from scratch.

## Adopting an Existing Setup

If you have `.claude/agents/*.md` files, skillfold can adopt them into a pipeline:

```bash
npx skillfold adopt
```

This reads each agent file, creates a `skills/{name}/SKILL.md` for each one, and generates a `skillfold.yaml` config. The generated config starts with a 1:1 mapping - each agent has its own atomic skill. From there you can:

1. Extract shared instructions into reusable atomic skills
2. Compose multiple skills per agent
3. Add state and team flow for orchestration

Compile to verify nothing changed:

```bash
npx skillfold --target claude-code
```

Then skip to [step 4](#4-compile-and-examine-output) below.

---

## 1. Install

Install skillfold from npm:

```bash
npm install skillfold
```

Requires Node.js 20+. Verify with `npx skillfold --version`.

## 2. Scaffold a starter pipeline

```bash
npx skillfold init my-project
cd my-project
```

This creates:

```
my-project/
  skillfold.yaml
  skills/planning/SKILL.md
  skills/coding/SKILL.md
  skills/reviewing/SKILL.md
```

Each skill directory contains a `SKILL.md` file with YAML frontmatter and instructions.

## 3. Understand the generated config

Open `skillfold.yaml`. It defines a four-agent pipeline with a review loop:

```yaml
name: my-pipeline

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
```

There are three layers:

- **skills** - Three atomic skills (`planning`, `coding`, `reviewing`) and four composed agents. The `engineer` agent composes both `planning` and `coding`, so its compiled SKILL.md contains both skill bodies concatenated in order.
- **state** - A `Review` custom type with `approved` and `feedback` fields, plus three state fields: `plan`, `code`, and `review`. The compiler validates that every read and write references a real field.
- **team** - A flow where `planner` writes the plan, `engineer` reads it and writes code, and `reviewer` reads the code and writes a review. The reviewer transitions conditionally: back to `engineer` if not approved, or to `end` if approved. Skillfold validates that every cycle has an exit condition.

## 4. Compile and examine output

Compile the pipeline:

```bash
npx skillfold
```

This produces compiled SKILL.md files in `build/`:

```
build/
  planner/SKILL.md       # planning body
  engineer/SKILL.md      # planning + coding bodies, composed
  reviewer/SKILL.md      # reviewing body
  orchestrator/SKILL.md  # planning body + generated execution plan
```

Each file is a valid SKILL.md per the [Agent Skills standard](https://agentskills.io/specification), with YAML frontmatter and concatenated skill bodies. The `engineer/SKILL.md` contains both the `planning` and `coding` skill content.

Open `build/orchestrator/SKILL.md` to see the generated execution plan with numbered steps, a state table, and the conditional review loop.

You can also inspect the pipeline without compiling:

```bash
npx skillfold validate   # check config for errors
npx skillfold list       # display a structured summary
npx skillfold graph      # output a Mermaid flowchart
```

## 5. Import library skills

Skillfold ships with 11 generic skills you can use instead of writing your own. Uncomment the imports line in your config:

```yaml
imports:
  - npm:skillfold/library/skillfold.yaml
```

Now you can reference library skills in your compositions. For example, replace the local `planning` and `coding` skills with the richer library versions:

```yaml
skills:
  atomic:
    reviewing: ./skills/reviewing

  composed:
    planner:
      compose: [planning]
      description: "Analyzes the goal and produces a structured plan."

    engineer:
      compose: [planning, code-writing, testing]
      description: "Implements the plan, writes code and tests."

    reviewer:
      compose: [code-review]
      description: "Reviews code for correctness, clarity, and security."

    orchestrator:
      compose: [planning]
      description: "Coordinates pipeline execution."
```

The import makes all 11 library skills available: `planning`, `research`, `decision-making`, `code-writing`, `code-review`, `testing`, `writing`, `summarization`, `github-workflow`, `file-management`, and `skillfold-cli`.

## 6. Add async nodes for external agents

Not every participant in a pipeline is a Claude Code agent. Humans, CI systems, and external services can be modeled as **async nodes** - checkpoints where the pipeline waits for external input before continuing.

```yaml
team:
  flow:
    - owner:
        async: true
        writes: [state.direction]
        policy: block
      then: architect

    - architect:
        reads: [state.direction]
        writes: [state.plan]
      then: engineer
```

The `owner` node is async - it does not invoke an agent. Instead, the orchestrator checks `state.direction` at its external location and waits for a value to appear. Once the human (or external system) provides direction, the pipeline proceeds.

**Policy options** control what happens when the value is not yet available:

| Policy | Behavior |
|--------|----------|
| `block` (default) | Wait until the value is provided |
| `skip` | Skip this step and proceed without the value |
| `use-latest` | Use the most recent available value and proceed |

Async nodes participate in the flow graph like regular nodes - they have reads, writes, and transitions. But they are excluded from skill compilation (no SKILL.md is generated) and from the Agent tool list in the orchestrator.

## 7. Declare resource namespaces

When a state field has a `location`, the compiler can validate that the location path matches a declared namespace. Add a top-level `resources` section to your config:

```yaml
resources:
  github:
    discussions: "https://github.com/org/repo/discussions"
    issues: "https://github.com/org/repo/issues"
    pull-requests: "https://github.com/org/repo/pulls"

skills:
  atomic:
    github: ./skills/github
```

Now when a state field references `github` with a `location.path`, the compiler checks that the first path segment matches a declared resource namespace. A path like `discussions/general` matches `discussions`; a path like `wikis/page` would fail with a clear error.

The orchestrator state table also benefits: instead of abstract `github: discussions/general`, it renders the resolved URL `https://github.com/org/repo/discussions/general`, giving the orchestrator agent concrete locations to work with.

Resource groups without matching state locations still work. The compiler emits a warning suggesting you add resource declarations when a state location references a skill with no resource group.

## 8. Use built-in state integrations

For common external services, skillfold provides built-in integrations that generate validated URLs and orchestrator instructions automatically. Instead of declaring resource namespaces and using the `skill+path` format, you can reference a service directly in the state location.

```yaml
state:
  direction:
    type: string
    location:
      github-discussions:
        repo: myorg/myrepo
        category: strategy

  tasks:
    type: "list<Task>"
    location:
      github-issues:
        repo: myorg/myrepo
        label: task

  review:
    type: string
    location:
      github-pull-requests:
        repo: myorg/myrepo
```

Three integrations are available:

| Integration | Required | Optional |
|-------------|----------|----------|
| `github-issues` | `repo` | `label`, `assignee` |
| `github-discussions` | `repo` | `category` |
| `github-pull-requests` | `repo` | `state` |

The compiler validates the config fields, resolves URLs for the orchestrator state table, and generates human-readable instructions so the orchestrator knows where to read and write each state field.

For services without a built-in integration, the traditional `skill+path` format from the previous section still works:

```yaml
location:
  skill: jira
  path: DEV/dev-board
```

## 9. Local overrides

On a multi-developer team, you may want personal overrides without modifying the shared config. Create a `skillfold.local.yaml` alongside your main config:

```yaml
# skillfold.local.yaml - personal overrides (gitignored)
skills:
  composed:
    engineer:
      compose: [planning, coding, testing]
      description: "My local engineer with extra testing skill."
      model: claude-sonnet-4-20250514
```

The local file merges on top of the main config:

- **Skills** - adds or replaces atomic and composed skills
- **State** - adds fields (does not remove existing ones)
- **Team** - replaces the team flow entirely if present

The local file does not need a `name` field (the name comes from the main config) and cannot have its own `imports`.

When `skillfold init` scaffolds a project, it adds `*.local.yaml` to `.gitignore` automatically. Add it manually to existing projects:

```bash
echo "*.local.yaml" >> .gitignore
```

The compiler logs when a local override is applied:

```
skillfold: using local override from skillfold.local.yaml
```

The local filename is derived from the main config: if your config is `my-pipeline.yaml`, the local file is `my-pipeline.local.yaml`.

## 10. Start from a template

If you prefer starting from a real-world pattern instead of the minimal starter:

```bash
npx skillfold init my-team --template dev-team
```

Available templates:

| Template | Pattern |
|----------|---------|
| **dev-team** | Linear pipeline with review loop (planner, engineer, reviewer) |
| **content-pipeline** | Map/parallel pattern over topics (researcher, writer, editor) |
| **code-review-bot** | Minimal two-agent flow (analyzer, reporter) |

Templates use library skills via imports, so they work out of the box with no local skill directories needed.

## 11. Deploy to your platform

Compile directly to where your platform reads skills. See the [Integration Guide](integrations.md) for all platforms.

```bash
npx skillfold --out-dir .claude/skills     # Claude Code (skills only)
npx skillfold --target claude-code         # Claude Code (skills + agents)
npx skillfold plugin                       # Claude Code plugin package
npx skillfold --out-dir .agents/skills     # cross-platform
npx skillfold --out-dir .github/skills     # VS Code Copilot
npx skillfold --out-dir .gemini/skills     # Gemini CLI
```

For Claude Code, `--target claude-code` generates agent markdown files alongside skills, with role metadata and team flow integration. The `plugin` command packages everything as a distributable Claude Code plugin.

Skillfold also ships a built-in plugin with 11 generic skills. Install it by referencing `node_modules/skillfold/plugin/` from your Claude Code configuration.

## 12. Sharing skills

Once you have skills worth reusing across projects or teams, publish them to npm. Any skill directory or pipeline config can be packaged and shared.

```bash
npm publish
```

Consumers install your package and import it:

```yaml
imports:
  - npm:@team/shared-skills
```

See the [Publishing Guide](publishing.md) for package structure, required fields, and discovery via `skillfold search`.

## 13. Next steps

- Read the full config specification in [BRIEF.md](https://github.com/byronxlg/skillfold/blob/main/BRIEF.md)
- Explore the [shared library examples](https://github.com/byronxlg/skillfold/tree/main/library/examples/) for real pipeline patterns
- Use `skillfold graph` to visualize your team flow as a Mermaid diagram, or `skillfold graph --html` for interactive HTML output with clickable nodes and SVG export
- Use the `flow:` field on a flow node to import a sub-flow from an external config, composing pipelines from reusable building blocks
- Try parallel `map` to process lists of items concurrently
- Add `skillfold --check` to CI to verify compiled output stays in sync
- Use `skillfold plugin` to package your pipeline for distribution
- Use `skillfold search` to discover community skill packages on npm
- Set `GITHUB_TOKEN` to reference skills from private GitHub repositories
