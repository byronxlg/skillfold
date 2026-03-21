# Library Skills

Skillfold ships with 11 generic, reusable skills that work with any coding agent. Each skill is a standalone `SKILL.md` file - you can use them with skillfold pipelines, install them individually via the [skills CLI](https://skills.sh), or read them directly.

## Install with the skills CLI

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

| Skill | Description | Install |
|-------|-------------|---------|
| **planning** | Break problems into steps, identify dependencies, and estimate scope | `npx skills add byronxlg/skillfold -s planning` |
| **research** | Gather information, evaluate sources, and synthesize findings | `npx skills add byronxlg/skillfold -s research` |
| **decision-making** | Evaluate trade-offs, document options, and justify recommendations | `npx skills add byronxlg/skillfold -s decision-making` |
| **code-writing** | Write clean, correct, production-quality code | `npx skills add byronxlg/skillfold -s code-writing` |
| **code-review** | Review code for correctness, clarity, and security | `npx skills add byronxlg/skillfold -s code-review` |
| **testing** | Write and reason about tests, covering behavior, edge cases, and errors | `npx skills add byronxlg/skillfold -s testing` |
| **writing** | Produce clear, structured prose and documentation | `npx skills add byronxlg/skillfold -s writing` |
| **summarization** | Condense information with audience-appropriate detail levels | `npx skills add byronxlg/skillfold -s summarization` |
| **github-workflow** | Work with GitHub branches, PRs, issues, and reviews via the gh CLI | `npx skills add byronxlg/skillfold -s github-workflow` |
| **file-management** | Read, create, edit, and organize files and directories | `npx skills add byronxlg/skillfold -s file-management` |
| **skillfold-cli** | Use the skillfold compiler to manage multi-agent pipeline configs | `npx skills add byronxlg/skillfold -s skillfold-cli` |

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
