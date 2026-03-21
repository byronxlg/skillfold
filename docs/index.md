---
layout: home

hero:
  name: Skillfold
  text: One config for every AI coding agent
  tagline: Define agent pipelines in YAML. Compile to 12 platforms. Validate state, flows, and skills at compile time - before anything runs.
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
import { onMounted } from 'vue'

onMounted(() => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible')
      }
    })
  }, { threshold: 0.1 })

  document.querySelectorAll('.fade-in').forEach(el => observer.observe(el))
})
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
    <span class="stat-value">0</span>
    <span class="stat-label">Runtime Dependencies</span>
  </div>
  <div class="stat">
    <span class="stat-value">859+</span>
    <span class="stat-label">Tests</span>
  </div>
</div>

<div class="badges-bar">
  <a href="https://www.npmjs.com/package/skillfold"><img src="https://img.shields.io/npm/v/skillfold?color=10b981&label=npm" alt="npm version" /></a>
  <a href="https://github.com/byronxlg/skillfold"><img src="https://img.shields.io/github/stars/byronxlg/skillfold?style=social" alt="GitHub stars" /></a>
  <a href="https://github.com/byronxlg/skillfold/blob/main/LICENSE"><img src="https://img.shields.io/github/license/byronxlg/skillfold?color=10b981" alt="MIT License" /></a>
</div>

<div class="how-it-works fade-in">

## How It Works

<div class="steps">
  <div class="step">
    <div class="step-number">1</div>
    <h3>Define</h3>
    <p>Write one <code>skillfold.yaml</code> with your skills, state schema, and execution flow.</p>
  </div>
  <div class="step-connector"></div>
  <div class="step">
    <div class="step-number">2</div>
    <h3>Compile</h3>
    <p>The compiler validates types, checks flows, detects conflicts - before anything runs.</p>
  </div>
  <div class="step-connector"></div>
  <div class="step">
    <div class="step-number">3</div>
    <h3>Deploy</h3>
    <p>Emit platform-native files for any of 12 targets. Or run the pipeline directly.</p>
  </div>
</div>

</div>

<div class="before-after fade-in">

## Before and After

<div class="ba-grid">
  <div class="ba-card ba-before">
    <div class="ba-label">Without Skillfold</div>

```
.claude/agents/planner.md     # planning instructions
.claude/agents/engineer.md    # planning + coding (copy-pasted)
.claude/agents/reviewer.md    # planning + review (copy-pasted)
.cursor/rules/planner.mdc     # same content, different format
.cursor/rules/engineer.mdc    # copy-paste again
```

<span class="ba-caption">5 files across 2 platforms. "Planning" is duplicated in 4 of them. Change it once? Update it everywhere. Miss one? Silent drift.</span>
  </div>
  <div class="ba-card ba-after">
    <div class="ba-label">With Skillfold</div>

```yaml
skills:
  atomic:
    planning: ./skills/planning    # defined once
  composed:
    engineer:
      compose: [planning, code-writing]
    reviewer:
      compose: [planning, code-review]
```

```sh
npx skillfold --target claude-code  # generates .claude/
npx skillfold --target cursor       # generates .cursor/
```

<span class="ba-caption">One source of truth. Change "planning" once, recompile, every agent on every platform updates.</span>
  </div>
</div>

</div>

<div class="home-content fade-in">

## What a Pipeline Looks Like

```yaml
skills:
  atomic:
    planning: npm:skillfold/library/skills/planning
    code-writing: npm:skillfold/library/skills/code-writing
  composed:
    engineer:
      compose: [planning, code-writing]

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
# .claude/agents/*.md, .claude/skills/*/SKILL.md
```

```sh [Cursor]
npx skillfold --target cursor
# .cursor/rules/*.mdc
```

```sh [Codex]
npx skillfold --target codex
# AGENTS.md
```

```sh [Gemini]
npx skillfold --target gemini
# .gemini/agents/*.md
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

<div class="comparison-section fade-in">
<div class="comparison-inner">

## Compiler vs. Runtime Orchestration

Skillfold catches errors before agents run. Runtime tools like CrewAI and LangGraph catch them during execution.

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

<a class="comparison-link" :href="withBase('/comparisons')">Detailed comparisons -></a>

</div>
</div>

<div class="targets-section fade-in">

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

<div class="dogfood-section fade-in">
<div class="dogfood-inner">
  <div class="dogfood-badge">Self-Hosting</div>
  <h2>Built with Skillfold</h2>
  <p>This project's own dev team - planner, engineer, reviewer, marketer, architect, designer - is defined in <code>skillfold.yaml</code> and compiled with the tool it ships. The pipeline manages its own issues, PRs, and releases.</p>
  <a class="dogfood-link" href="https://github.com/byronxlg/skillfold/blob/main/skillfold.yaml">See the pipeline config -></a>
</div>
</div>

<div class="cta-section fade-in">

## Ready to get started?

<div class="cta-grid">
  <a class="cta-card" :href="withBase('/getting-started')">
    <strong>Getting Started Guide</strong>
    <span>Build your first pipeline in 5 minutes</span>
  </a>
  <a class="cta-card" :href="withBase('/demo')">
    <strong>Live Demo</strong>
    <span>Try the interactive pipeline visualizer</span>
  </a>
  <a class="cta-card" :href="withBase('/builder')">
    <strong>Pipeline Builder</strong>
    <span>Edit YAML and see the graph update live</span>
  </a>
  <a class="cta-card" :href="withBase('/library')">
    <strong>Library Skills</strong>
    <span>11 ready-to-use skills, no config needed</span>
  </a>
</div>

</div>
