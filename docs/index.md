---
layout: home

hero:
  name: Skillfold
  text: Typed coordination for multi-agent pipelines
  tagline: Compile YAML configs into agent skills, execution flows, and orchestrators - validated at compile time.
  image:
    light: /hero-light.svg
    dark: /hero-dark.svg
    alt: Skillfold pipeline diagram
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: Live Demo
      link: /demo
    - theme: alt
      text: GitHub
      link: https://github.com/byronxlg/skillfold

features:
  - icon:
      src: /icons/compose.svg
    title: Skill Composition
    details: Define atomic skills once, compose them into agents. No copy-paste, no drift. 11 library skills included, installable standalone via npx skills add.
  - icon:
      src: /icons/validate.svg
    title: Typed State and Flows
    details: Declare state schemas, wire agents into execution flows with conditional routing and parallel map. Validated at compile time.
  - icon:
      src: /icons/integrate.svg
    title: Built-in Integrations
    details: GitHub Issues, Discussions, and PRs as first-class state locations. The compiler resolves URLs and validates paths.
  - icon:
      src: /icons/platform.svg
    title: Multi-Platform
    details: "Compile to 12 targets: Claude Code, Agent Teams, Cursor, Windsurf, VS Code Copilot, OpenAI Codex, Gemini CLI, Goose, Roo Code, Kiro, Junie, or standard SKILL.md files."
---

<script setup>
import { withBase } from 'vitepress'
</script>

<div class="install-banner">
<div class="install-inner">

::: code-group

```sh [npm]
npm install skillfold
```

```sh [yarn]
yarn add skillfold
```

```sh [pnpm]
pnpm add skillfold
```

```sh [bun]
bun add skillfold
```

:::

</div>
</div>

<div class="stats-bar">
  <div class="stat">
    <span class="stat-value">12</span>
    <span class="stat-label">Platform Targets</span>
  </div>
  <div class="stat">
    <span class="stat-value">11</span>
    <span class="stat-label">Library Skills</span>
  </div>
  <div class="stat">
    <span class="stat-value">859</span>
    <span class="stat-label">Tests</span>
  </div>
  <div class="stat">
    <span class="stat-value">168</span>
    <span class="stat-label">Test Suites</span>
  </div>
</div>

<div class="home-content">

## What It Looks Like

Define your agent pipeline in YAML. The compiler validates everything - skill references, state types, flow transitions, cycle exit conditions - before anything runs.

```yaml
skills:
  atomic:
    planning: npm:skillfold/library/skills/planning
    code-writing: npm:skillfold/library/skills/code-writing
    testing: npm:skillfold/library/skills/testing
  composed:
    engineer:
      compose: [planning, code-writing, testing]

state:
  tasks:
    type: list<Task>
    location:
      github-issues: { repo: my-org/my-repo, label: task }

team:
  flow:
    - planner:
        writes: [state.tasks]
      then: map
    - map:
        over: state.tasks
        as: task
        flow:
          - engineer:
              reads: [task.description]
              writes: [task.output]
      then: end
```

Compile to any platform:

::: code-group

```sh [Claude Code]
npx skillfold --target claude-code
# Output: .claude/agents/*.md, .claude/skills/*/SKILL.md
```

```sh [Cursor]
npx skillfold --target cursor
# Output: .cursor/rules/*.mdc
```

```sh [Codex]
npx skillfold --target codex
# Output: AGENTS.md
```

```sh [Gemini]
npx skillfold --target gemini
# Output: .gemini/agents/*.md
```

```sh [More targets]
npx skillfold --target windsurf   # .windsurf/rules/*.md
npx skillfold --target copilot    # .github/instructions/*.md
npx skillfold --target goose      # .goosehints
npx skillfold --target roo-code   # .roo/skills/
npx skillfold --target kiro       # .kiro/skills/
npx skillfold --target junie      # .junie/skills/
```

:::

Or run the pipeline directly:

```sh
npx skillfold run --target claude-code --spawner sdk
```

</div>

<div class="comparison-section">
<div class="comparison-inner">

## Compiler vs. Runtime Orchestration

Skillfold validates your pipeline at compile time and emits plain files that agents read directly. Runtime tools like CrewAI, AutoGen, and LangGraph coordinate agents at execution time through a framework process. Both are valid - which one fits depends on your pipeline.

<div class="comparison-grid">
  <div class="comparison-card">
    <h3>Skillfold (compile-time)</h3>
    <ul>
      <li><strong>Output:</strong> Standard files (SKILL.md, .claude/agents/, Cursor rules)</li>
      <li><strong>Lock-in:</strong> None - plain files any tool can read</li>
      <li><strong>Validation:</strong> Compile-time type checking</li>
      <li><strong>Overhead:</strong> Zero - no middleware at runtime</li>
      <li><strong>Best for:</strong> Known pipeline topology with typed state</li>
    </ul>
  </div>
  <div class="comparison-card">
    <h3>Runtime orchestration</h3>
    <ul>
      <li><strong>Output:</strong> Proprietary runtime objects and APIs</li>
      <li><strong>Lock-in:</strong> Tied to the framework's SDK</li>
      <li><strong>Validation:</strong> Runtime errors during execution</li>
      <li><strong>Overhead:</strong> Framework process alongside agents</li>
      <li><strong>Best for:</strong> Dynamic workflows that adapt mid-execution</li>
    </ul>
  </div>
</div>

[Detailed comparisons ->](/comparisons)

</div>
</div>

<div class="targets-section">

## Compile Once, Run Anywhere

One config, 12 platform targets. Write your pipeline in YAML and compile to whichever agent platform your team uses.

<div class="targets-grid">
  <div class="target"><img class="target-icon" :src="withBase('/icons/targets/claude.svg')" alt="" />Claude Code</div>
  <div class="target"><img class="target-icon" :src="withBase('/icons/targets/agent-teams.svg')" alt="" />Agent Teams</div>
  <div class="target"><img class="target-icon" :src="withBase('/icons/targets/cursor.svg')" alt="" />Cursor</div>
  <div class="target"><img class="target-icon" :src="withBase('/icons/targets/windsurf.svg')" alt="" />Windsurf</div>
  <div class="target"><img class="target-icon" :src="withBase('/icons/targets/copilot.svg')" alt="" />VS Code Copilot</div>
  <div class="target"><img class="target-icon" :src="withBase('/icons/targets/codex.svg')" alt="" />OpenAI Codex</div>
  <div class="target"><img class="target-icon" :src="withBase('/icons/targets/gemini.svg')" alt="" />Gemini CLI</div>
  <div class="target"><img class="target-icon" :src="withBase('/icons/targets/goose.svg')" alt="" />Goose</div>
  <div class="target"><img class="target-icon" :src="withBase('/icons/targets/roo.svg')" alt="" />Roo Code</div>
  <div class="target"><img class="target-icon" :src="withBase('/icons/targets/kiro.svg')" alt="" />Kiro</div>
  <div class="target"><img class="target-icon" :src="withBase('/icons/targets/junie.svg')" alt="" />Junie</div>
  <div class="target"><img class="target-icon" :src="withBase('/icons/targets/skill.svg')" alt="" />SKILL.md</div>
</div>

[See platform integration details ->](/integrations)

</div>

<div class="cta-section">

## Ready to get started?

<div class="cta-grid">
  <a class="cta-card" href="/skillfold/getting-started">
    <strong>Getting Started Guide</strong>
    <span>Build your first pipeline in 5 minutes</span>
  </a>
  <a class="cta-card" href="/skillfold/demo">
    <strong>Live Demo</strong>
    <span>Try the interactive pipeline visualizer</span>
  </a>
  <a class="cta-card" href="/skillfold/builder">
    <strong>Pipeline Builder</strong>
    <span>Edit YAML and see the graph update live</span>
  </a>
  <a class="cta-card" href="/skillfold/library">
    <strong>Library Skills</strong>
    <span>11 ready-to-use skills, no config needed</span>
  </a>
</div>

</div>
