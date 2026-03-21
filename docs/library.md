# Library Skills

Skillfold ships with 11 generic, reusable skills that work with any coding agent. Each skill is a standalone `SKILL.md` file - you can use them with skillfold pipelines, install them individually via the [skills CLI](https://skills.sh), or read them directly.

## Install

Install all 11 skills at once:

```bash
npx skills add byronxlg/skillfold
```

Or install individual skills:

```bash
npx skills add byronxlg/skillfold -s <skill-name>
```

No skillfold config or compilation needed. Each skill installs as a standard `SKILL.md` file that any agent can read.

---

## Available Skills

<div class="skill-grid">
  <div class="skill-card">
    <div class="skill-name">planning</div>
    <div class="skill-desc">Break problems into steps, identify dependencies, and estimate scope.</div>
    <code class="skill-install">npx skills add byronxlg/skillfold -s planning</code>
  </div>
  <div class="skill-card">
    <div class="skill-name">research</div>
    <div class="skill-desc">Gather information, evaluate sources, and synthesize findings.</div>
    <code class="skill-install">npx skills add byronxlg/skillfold -s research</code>
  </div>
  <div class="skill-card">
    <div class="skill-name">decision-making</div>
    <div class="skill-desc">Evaluate trade-offs, document options, and justify recommendations.</div>
    <code class="skill-install">npx skills add byronxlg/skillfold -s decision-making</code>
  </div>
  <div class="skill-card">
    <div class="skill-name">code-writing</div>
    <div class="skill-desc">Write clean, correct, production-quality code.</div>
    <code class="skill-install">npx skills add byronxlg/skillfold -s code-writing</code>
  </div>
  <div class="skill-card">
    <div class="skill-name">code-review</div>
    <div class="skill-desc">Review code for correctness, clarity, and security.</div>
    <code class="skill-install">npx skills add byronxlg/skillfold -s code-review</code>
  </div>
  <div class="skill-card">
    <div class="skill-name">testing</div>
    <div class="skill-desc">Write and reason about tests, covering behavior, edge cases, and errors.</div>
    <code class="skill-install">npx skills add byronxlg/skillfold -s testing</code>
  </div>
  <div class="skill-card">
    <div class="skill-name">writing</div>
    <div class="skill-desc">Produce clear, structured prose and documentation.</div>
    <code class="skill-install">npx skills add byronxlg/skillfold -s writing</code>
  </div>
  <div class="skill-card">
    <div class="skill-name">summarization</div>
    <div class="skill-desc">Condense information with audience-appropriate detail levels.</div>
    <code class="skill-install">npx skills add byronxlg/skillfold -s summarization</code>
  </div>
  <div class="skill-card">
    <div class="skill-name">github-workflow</div>
    <div class="skill-desc">Work with GitHub branches, PRs, issues, and reviews via the gh CLI.</div>
    <code class="skill-install">npx skills add byronxlg/skillfold -s github-workflow</code>
  </div>
  <div class="skill-card">
    <div class="skill-name">file-management</div>
    <div class="skill-desc">Read, create, edit, and organize files and directories.</div>
    <code class="skill-install">npx skills add byronxlg/skillfold -s file-management</code>
  </div>
  <div class="skill-card">
    <div class="skill-name">skillfold-cli</div>
    <div class="skill-desc">Use the skillfold compiler to manage multi-agent pipeline configs.</div>
    <code class="skill-install">npx skills add byronxlg/skillfold -s skillfold-cli</code>
  </div>
</div>

---

## Using with skillfold pipelines

If you use the skillfold compiler, import all library skills at once instead of installing them individually:

```yaml
imports:
  - npm:skillfold/library/skillfold.yaml
```

This makes all 11 skills available as atomic skills in your pipeline config. Compose them into agents:

```yaml
skills:
  composed:
    engineer:
      compose: [planning, code-writing, testing]
      description: "Implements the plan by writing production code and tests."
    reviewer:
      compose: [code-review, testing]
      description: "Reviews code for correctness, clarity, and test coverage."
```

See the [Examples](/examples) page for complete pipeline configs using library skills.

## Browsing on skills.sh

All 11 skills are indexed on [skills.sh](https://skills.sh) and discoverable via the skills CLI leaderboard. Search for them with:

```bash
npx skills search skillfold
```
