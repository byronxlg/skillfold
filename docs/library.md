<div class="page-hero">
  <h1>Library Skills</h1>
  <p>11 generic, reusable skills that work with any coding agent. Use them with skillfold pipelines or install standalone.</p>
  <div class="stat-pills">
    <span class="stat-pill"><strong>11</strong> skills</span>
    <span class="stat-pill"><strong>4</strong> categories</span>
    <span class="stat-pill">Works standalone</span>
  </div>
</div>

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

## Engineering

<div class="skill-grid">
  <div class="skill-card">
    <div class="skill-name">code-writing</div>
    <div class="skill-desc">Write clean, correct, production-quality code. Prioritizes correctness, then clarity, then performance. Follows project conventions, handles errors explicitly, keeps functions small and focused.</div>
    <code class="skill-install">npx skills add byronxlg/skillfold -s code-writing</code>
  </div>
  <div class="skill-card">
    <div class="skill-name">code-review</div>
    <div class="skill-desc">Review code for correctness, clarity, and security. Checks edge cases, null/undefined risks, race conditions, resource leaks, naming, and test coverage.</div>
    <code class="skill-install">npx skills add byronxlg/skillfold -s code-review</code>
  </div>
  <div class="skill-card">
    <div class="skill-name">testing</div>
    <div class="skill-desc">Write and reason about tests covering behavior, edge cases, and errors. Each test verifies one thing with a descriptive name. Treats tests as documentation.</div>
    <code class="skill-install">npx skills add byronxlg/skillfold -s testing</code>
  </div>
</div>

## Thinking

<div class="skill-grid">
  <div class="skill-card">
    <div class="skill-name">planning</div>
    <div class="skill-desc">Break problems into steps, identify dependencies, and estimate scope. Works backward from desired outcomes, ensures steps have clear deliverables, prefers smaller validatable steps.</div>
    <code class="skill-install">npx skills add byronxlg/skillfold -s planning</code>
  </div>
  <div class="skill-card">
    <div class="skill-name">research</div>
    <div class="skill-desc">Gather information, evaluate sources, and synthesize findings. Searches broadly first, evaluates source quality, distinguishes facts from opinions, synthesizes into actionable conclusions.</div>
    <code class="skill-install">npx skills add byronxlg/skillfold -s research</code>
  </div>
  <div class="skill-card">
    <div class="skill-name">decision-making</div>
    <div class="skill-desc">Evaluate trade-offs, document options, and justify recommendations. Makes criteria explicit, separates reversible from irreversible decisions, documents what was rejected and why.</div>
    <code class="skill-install">npx skills add byronxlg/skillfold -s decision-making</code>
  </div>
</div>

## Communication

<div class="skill-grid">
  <div class="skill-card">
    <div class="skill-name">writing</div>
    <div class="skill-desc">Produce clear, structured prose and documentation. Uses headings, lists, and paragraphs for structure. Writes for the audience, stays concise with active voice.</div>
    <code class="skill-install">npx skills add byronxlg/skillfold -s writing</code>
  </div>
  <div class="skill-card">
    <div class="skill-name">summarization</div>
    <div class="skill-desc">Condense information with audience-appropriate detail levels. Preserves accuracy and key points, cuts supporting detail and repetition, maintains original tone.</div>
    <code class="skill-install">npx skills add byronxlg/skillfold -s summarization</code>
  </div>
</div>

## Tooling

<div class="skill-grid">
  <div class="skill-card">
    <div class="skill-name">github-workflow</div>
    <div class="skill-desc">Work with GitHub branches, PRs, issues, and reviews via the <code>gh</code> CLI. Creates feature branches, opens PRs, views diffs, checks CI status, and merges.</div>
    <code class="skill-install">npx skills add byronxlg/skillfold -s github-workflow</code>
  </div>
  <div class="skill-card">
    <div class="skill-name">file-management</div>
    <div class="skill-desc">Read, create, edit, and organize files and directories. Verifies existence before operations, creates parent directories, backs up before destructive changes.</div>
    <code class="skill-install">npx skills add byronxlg/skillfold -s file-management</code>
  </div>
  <div class="skill-card">
    <div class="skill-name">skillfold-cli</div>
    <div class="skill-desc">Use the skillfold compiler to manage multi-agent pipeline configs. Compiles YAML into SKILL.md files, validates configs, and manages the four config sections.</div>
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
