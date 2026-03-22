---
layout: home

hero:
  name: Skillfold
  text: One config for every AI coding agent
  tagline: Define skills in YAML. Compose agents. Compile to 12 platforms. Catch errors before agents run.
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
import { onMounted, ref } from 'vue'

const terminalLines = ref([])
const terminalVisible = ref(false)

const lines = [
  { type: 'cmd', text: 'npx skillfold init my-pipeline' },
  { type: 'out', text: 'Created skillfold.yaml with 3 skills, 2 agents, review loop' },
  { type: 'cmd', text: 'npx skillfold --target claude-code' },
  { type: 'out', text: 'Compiled 2 agents to .claude/agents/ (0 errors, 0 warnings)' },
  { type: 'cmd', text: 'npx skillfold --target cursor' },
  { type: 'out', text: 'Compiled 2 agents to .cursor/rules/ (0 errors, 0 warnings)' },
]

function animateTerminal() {
  let lineIdx = 0
  let charIdx = 0
  terminalLines.value = []

  function typeNext() {
    if (lineIdx >= lines.length) return

    const line = lines[lineIdx]
    if (line.type === 'out') {
      terminalLines.value.push({ ...line, done: true })
      lineIdx++
      setTimeout(typeNext, 400)
    } else {
      if (charIdx === 0) {
        terminalLines.value.push({ ...line, text: '', done: false })
      }
      const current = terminalLines.value[terminalLines.value.length - 1]
      if (charIdx < line.text.length) {
        current.text = line.text.slice(0, charIdx + 1)
        charIdx++
        setTimeout(typeNext, 25)
      } else {
        current.done = true
        charIdx = 0
        lineIdx++
        setTimeout(typeNext, 300)
      }
    }
  }

  typeNext()
}

onMounted(() => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible')
      }
    })
  }, { threshold: 0.1 })

  document.querySelectorAll('.fade-in').forEach(el => observer.observe(el))

  const terminalObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !terminalVisible.value) {
        terminalVisible.value = true
        entry.target.classList.add('visible')
        animateTerminal()
        terminalObserver.unobserve(entry.target)
      }
    })
  }, { threshold: 0.3 })

  const terminalEl = document.querySelector('.quick-start-terminal')
  if (terminalEl) terminalObserver.observe(terminalEl)
})
</script>

<div class="quick-start-terminal fade-in">
<div class="terminal-window">
  <div class="terminal-header">
    <div class="terminal-dots">
      <span class="dot red"></span>
      <span class="dot yellow"></span>
      <span class="dot green"></span>
    </div>
    <span class="terminal-title">terminal</span>
  </div>
  <div class="terminal-body">
    <template v-for="(line, i) in terminalLines" :key="i">
      <div v-if="line.type === 'cmd'" class="terminal-line">
        <span class="terminal-prompt">$</span> {{ line.text }}<span v-if="!line.done" class="terminal-cursor">|</span>
      </div>
      <div v-else class="terminal-output">{{ line.text }}</div>
    </template>
    <div v-if="terminalLines.length === 0" class="terminal-line">
      <span class="terminal-prompt">$</span> <span class="terminal-cursor">|</span>
    </div>
  </div>
</div>
</div>

<div class="proof-bar fade-in">
  <div class="proof-badges">
    <a href="https://www.npmjs.com/package/skillfold"><img src="https://img.shields.io/npm/v/skillfold?color=10b981&label=npm" alt="npm version" /></a>
    <a href="https://www.npmjs.com/package/skillfold"><img src="https://img.shields.io/npm/dw/skillfold?color=06b6d4&label=downloads" alt="npm downloads" /></a>
    <a href="https://github.com/byronxlg/skillfold"><img src="https://img.shields.io/github/stars/byronxlg/skillfold?style=social" alt="GitHub stars" /></a>
    <a href="https://github.com/byronxlg/skillfold/blob/main/LICENSE"><img src="https://img.shields.io/github/license/byronxlg/skillfold?color=10b981" alt="MIT License" /></a>
  </div>
</div>

<div class="works-with fade-in">
<div class="works-with-label">Works with</div>
<div class="works-with-grid">
  <div class="works-with-item"><img :src="withBase('/icons/targets/claude.svg')" alt="" />Claude Code</div>
  <div class="works-with-item"><img :src="withBase('/icons/targets/agent-teams.svg')" alt="" />Agent Teams</div>
  <div class="works-with-item"><img :src="withBase('/icons/targets/cursor.svg')" alt="" />Cursor</div>
  <div class="works-with-item"><img :src="withBase('/icons/targets/windsurf.svg')" alt="" />Windsurf</div>
  <div class="works-with-item"><img :src="withBase('/icons/targets/copilot.svg')" alt="" />Copilot</div>
  <div class="works-with-item"><img :src="withBase('/icons/targets/codex.svg')" alt="" />Codex</div>
  <div class="works-with-item"><img :src="withBase('/icons/targets/gemini.svg')" alt="" />Gemini</div>
  <div class="works-with-item"><img :src="withBase('/icons/targets/goose.svg')" alt="" />Goose</div>
  <div class="works-with-item"><img :src="withBase('/icons/targets/roo.svg')" alt="" />Roo Code</div>
  <div class="works-with-item"><img :src="withBase('/icons/targets/kiro.svg')" alt="" />Kiro</div>
  <div class="works-with-item"><img :src="withBase('/icons/targets/junie.svg')" alt="" />Junie</div>
  <div class="works-with-item"><img :src="withBase('/icons/targets/skill.svg')" alt="" />SKILL.md</div>
</div>
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
    <p>The compiler validates types, checks flows, and detects conflicts before anything runs.</p>
  </div>
  <div class="step-connector"></div>
  <div class="step">
    <div class="step-number">3</div>
    <h3>Deploy</h3>
    <p>Emit platform-native files for any of 12 targets. Or run the pipeline directly.</p>
  </div>
</div>

</div>

<div class="metrics-section fade-in">
<div class="metrics-grid">
  <div class="metric-card">
    <div class="metric-value">&lt;1s</div>
    <div class="metric-label">Compilation time</div>
    <div class="metric-detail">7 agents, 12 skills, full validation</div>
  </div>
  <div class="metric-card">
    <div class="metric-value">0</div>
    <div class="metric-label">Runtime dependencies</div>
    <div class="metric-detail">Compile-time only, nothing ships</div>
  </div>
  <div class="metric-card">
    <div class="metric-value">859+</div>
    <div class="metric-label">Tests passing</div>
    <div class="metric-detail">168 suites, zero external deps</div>
  </div>
  <div class="metric-card">
    <div class="metric-value">12</div>
    <div class="metric-label">Platform targets</div>
    <div class="metric-detail">One config, every major agent tool</div>
  </div>
</div>
</div>

<div class="before-after fade-in">

## Why a Compiler?

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

<span class="ba-caption">5 files across 2 platforms. "Planning" is duplicated 4 times. Add a third platform and the count hits 9. Five agents sharing 3 skills across 3 platforms? That's 45+ files to keep in sync.</span>
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

<div class="pipeline-demo">
<div class="pipeline-input">
<div class="pipeline-label">skillfold.yaml</div>

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
      github-issues: { repo: my-org/my-repo }

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

</div>
<div class="pipeline-output">
<div class="pipeline-label">Compile to any target</div>

<div class="target-tabs">
  <button class="target-tab active" onclick="document.querySelectorAll('.target-tab').forEach(t=>t.classList.remove('active'));this.classList.add('active');document.querySelectorAll('.target-panel').forEach(p=>p.style.display='none');document.getElementById('panel-claude').style.display='block'">Claude Code</button>
  <button class="target-tab" onclick="document.querySelectorAll('.target-tab').forEach(t=>t.classList.remove('active'));this.classList.add('active');document.querySelectorAll('.target-panel').forEach(p=>p.style.display='none');document.getElementById('panel-cursor').style.display='block'">Cursor</button>
  <button class="target-tab" onclick="document.querySelectorAll('.target-tab').forEach(t=>t.classList.remove('active'));this.classList.add('active');document.querySelectorAll('.target-panel').forEach(p=>p.style.display='none');document.getElementById('panel-codex').style.display='block'">Codex</button>
  <button class="target-tab" onclick="document.querySelectorAll('.target-tab').forEach(t=>t.classList.remove('active'));this.classList.add('active');document.querySelectorAll('.target-panel').forEach(p=>p.style.display='none');document.getElementById('panel-more').style.display='block'">+9 more</button>
</div>

<div id="panel-claude" class="target-panel" style="display:block">

```
npx skillfold --target claude-code

.claude/
  agents/planner.md
  agents/engineer.md
  skills/planning/SKILL.md
  skills/code-writing/SKILL.md
  commands/run-pipeline.md
```

</div>
<div id="panel-cursor" class="target-panel" style="display:none">

```
npx skillfold --target cursor

.cursor/
  rules/planner.mdc
  rules/engineer.mdc
```

</div>
<div id="panel-codex" class="target-panel" style="display:none">

```
npx skillfold --target codex

AGENTS.md    # single file, all agents
```

</div>
<div id="panel-more" class="target-panel" style="display:none">

```
--target windsurf     # .windsurf/rules/
--target copilot      # .github/instructions/
--target gemini       # .gemini/agents/
--target goose        # .goosehints
--target roo-code     # .roo/skills/
--target kiro         # .kiro/skills/
--target junie        # .junie/skills/
--target agent-teams  # .claude/ (team mode)
--target skill        # build/ (standard)
```

</div>

</div>
</div>

</div>

<div class="comparison-section fade-in">
<div class="comparison-inner">

## Compiler vs. Runtime Orchestration

Skillfold validates at compile time and produces standard files with zero runtime overhead. Runtime frameworks validate during execution and require their SDK at runtime. Each approach has trade-offs.

<div class="comparison-table-wrap">

| | **Skillfold** | **Runtime frameworks** |
|---|---|---|
| **Output** | Standard files any tool reads | Proprietary runtime objects |
| **Lock-in** | None - delete the tool, keep the files | Tied to the framework SDK |
| **Validation** | Compile-time type checking | Runtime errors during execution |
| **Overhead** | Zero at runtime | Framework process alongside agents |
| **Adaptability** | Fixed topology, defined ahead of time | Dynamic workflows that adapt mid-run |
| **Best for** | Known pipelines with typed state | Exploratory workflows with evolving structure |

</div>

<a class="comparison-link" :href="withBase('/comparisons')">Detailed comparisons &#8594;</a>

</div>
</div>

<div class="templates-section fade-in">

## Start from a Template

Three example pipelines ship with the library. Use them directly or as a starting point.

<div class="templates-grid">
  <a class="template-card" :href="withBase('/examples')">
    <div class="template-name">dev-team</div>
    <div class="template-desc">Planner, engineer, reviewer with a review loop. The default <code>skillfold init</code> template.</div>
    <div class="template-flow">planner &#8594; engineer &#8594; reviewer &#8594; (loop)</div>
  </a>
  <a class="template-card" :href="withBase('/examples')">
    <div class="template-name">content-pipeline</div>
    <div class="template-desc">Parallel map over topics. Researcher, writer, and editor run concurrently per item.</div>
    <div class="template-flow">researcher &#8594; map(writer, editor)</div>
  </a>
  <a class="template-card" :href="withBase('/examples')">
    <div class="template-name">code-review-bot</div>
    <div class="template-desc">Minimal two-agent flow. Analyzer scans code, reporter writes the review.</div>
    <div class="template-flow">analyzer &#8594; reporter</div>
  </a>
</div>

</div>

<div class="dogfood-section fade-in">
<div class="dogfood-inner">
  <div class="dogfood-badge">Self-Hosting</div>
  <h2>Built with Skillfold</h2>
  <p>This project's own dev team - planner, engineer, reviewer, marketer, architect, designer - is defined in <code>skillfold.yaml</code> and compiled with the tool it ships. The pipeline manages its own issues, PRs, and releases.</p>
  <a class="dogfood-link" href="https://github.com/byronxlg/skillfold/blob/main/skillfold.yaml">See the pipeline config &#8594;</a>
</div>
</div>

<div class="github-cta fade-in">
<div class="github-cta-inner">
  <div class="github-cta-icon">
    <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
  </div>
  <h3>Open source, MIT licensed</h3>
  <p>Star the repo to follow development. Contributions welcome.</p>
  <a class="github-star-btn" href="https://github.com/byronxlg/skillfold">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 .587l3.668 7.568L24 9.306l-6 5.848 1.417 8.259L12 19.446l-7.417 3.967L6 15.154 0 9.306l8.332-1.151z"/></svg>
    Star on GitHub
  </a>
</div>
</div>

<div class="cta-section fade-in">

## Get started in 60 seconds

<div class="cta-install">

```sh
npm install skillfold && npx skillfold init my-pipeline
```

</div>

<div class="cta-links">
  <a class="cta-primary" :href="withBase('/getting-started')">Read the guide &#8594;</a>
  <a class="cta-secondary" :href="withBase('/demo')">Try the live demo &#8594;</a>
  <a class="cta-secondary" href="https://github.com/byronxlg/skillfold">View on GitHub &#8594;</a>
</div>

</div>
