# Skillfold Plugin for Claude Code

A Claude Code plugin shipping 11 reusable agent skills and a `/skillfold` compiler command.

## Installation

```bash
npm install skillfold
claude plugin add ./node_modules/skillfold/plugin
```

Or install directly from the repository:

```bash
claude plugin add https://github.com/byronxlg/skillfold/tree/main/plugin
```

## What's Included

### Skills (11)

| Skill | Description |
|-------|-------------|
| planning | Break problems into steps, identify dependencies, estimate scope |
| research | Gather information, evaluate sources, synthesize findings |
| decision-making | Evaluate trade-offs, document options, justify recommendations |
| code-writing | Write clean, correct, production-quality code |
| code-review | Review code for correctness, clarity, and security |
| testing | Write and reason about tests, covering behavior and edge cases |
| writing | Produce clear, structured prose and documentation |
| summarization | Condense information with audience-appropriate detail levels |
| github-workflow | Work with GitHub branches, PRs, issues, and reviews via gh CLI |
| file-management | Read, create, edit, and organize files and directories |
| skillfold-cli | Use the skillfold compiler to manage pipeline configs |

### Commands

- `/skillfold` - Compile, validate, or inspect a skillfold pipeline

## Usage

After installation, skills are available to Claude Code agents automatically. The `/skillfold` command provides access to the compiler CLI:

```
/skillfold compile
/skillfold validate
/skillfold list
/skillfold graph
/skillfold init my-project
```

## Building Your Own Pipeline

Skillfold compiles YAML pipeline configs into agent skills. To create a pipeline that uses these skills:

```yaml
imports:
  - npm:skillfold/library/skillfold.yaml

skills:
  composed:
    my-agent:
      compose: [planning, code-writing, testing]
      description: "Plans and implements features with tests"
```

Then compile: `npx skillfold`

See the [getting started guide](https://github.com/byronxlg/skillfold/blob/main/docs/getting-started.md) for a full walkthrough.

## License

MIT
