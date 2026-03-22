<div class="page-hero">
<h1>Authoring Skills</h1>
<p>Create atomic skills - the smallest unit of reusable instruction in a skillfold pipeline. Each skill is a directory with a single SKILL.md that tells an agent how to perform a specific task.</p>
</div>

This guide walks through creating an atomic skill from scratch.

## Directory structure

A skill is a directory with one file:

```
my-skill/
  SKILL.md
```

The directory name is typically the skill name. You can place it anywhere - a `skills/` directory is a common convention but not required.

## SKILL.md format

A `SKILL.md` file has two parts: YAML frontmatter and a markdown body.

```markdown
---
name: my-skill
description: One-line description of what this skill does.
---

# My Skill

Instructions for the agent go here.
```

**Frontmatter** is delimited by `---` lines at the top of the file. It supports two fields:

- **name** - Identifier for the skill. Used in composition and pipeline output. Should match the directory name.
- **description** - Short summary of the skill's purpose. Appears in compiled output and pipeline listings.

**Body** is the markdown content below the frontmatter. This is where you write the actual instructions the agent will follow. When skills are composed into an agent, their bodies are concatenated in declaration order.

## Writing effective instructions

A skill body is read by an AI agent, not a human end user. Write it as if you are briefing a capable colleague who needs to know your expectations.

### Be specific about behavior

Vague instructions lead to inconsistent results. Compare:

```markdown
# Bad
Write good tests.

# Good
Write tests that verify behavior, not implementation details. Cover the happy
path first, then edge cases and error conditions. Name each test to describe
the expected behavior: "returns empty array when no items match".
```

### State what not to do

Agents benefit from explicit boundaries. If there are common mistakes or approaches you want to avoid, say so:

```markdown
## Boundaries

- Do not modify files outside the `src/` directory
- Do not add dependencies without explicit approval
- Do not refactor code unrelated to the current task
```

### Include examples when format matters

If the skill produces structured output or follows a specific format, show an example:

```markdown
## Output

Produce a numbered plan with steps grouped by phase. Each step includes:

1. **Setup** - Install dependencies and configure environment
   - Depends on: nothing
   - Produces: working local environment
   - Verify: `npm test` passes
```

### Keep it focused

Each skill should address one concern. A skill that tries to cover code writing, testing, and deployment is harder to compose and reuse than three separate skills. If you find a skill growing beyond a few sections, consider splitting it.

## Real-world examples

Here is a complete skill for testing:

```markdown
---
name: testing
description: Write and reason about tests, covering behavior, edge cases, and errors.
---

# Testing

## Guidelines

- Follow existing project patterns for test runner, assertion library, and file location
- Write tests that verify behavior, not implementation details
- Cover the happy path first, then edge cases and error conditions
- Name tests to describe the expected behavior: "returns empty array when no items match"
- Keep each test focused on one assertion or closely related group of assertions
- Use descriptive variable names in test setup - avoid `foo`, `bar`, `x`
- When fixing a bug, write a test that reproduces it before writing the fix
- Run the full test suite after changes to catch regressions
```

And a shorter skill for product strategy:

```markdown
---
name: product-strategy
description: Product Strategy
---

# Product Strategy

You think about product positioning, adoption strategy, and competitive
landscape. You evaluate decisions through the lens of what drives adoption
and what creates lasting differentiation.

## Principles

- Lead with the problem, not the solution
- Adoption comes from making the first 5 minutes effortless
- Compete on fundamentals (correctness, speed, simplicity), not features
- Every public-facing artifact is a product surface - README, error messages, CLI output
```

Both follow the same pattern: frontmatter for metadata, a heading, and concise instructions organized into sections. The length varies based on how much guidance the task requires.

## Referencing in config

Once you have a skill directory, reference it in your `skillfold.yaml` under `skills.atomic`. There are three ways to point to a skill:

**Local path** - relative to the config file:

```yaml
skills:
  atomic:
    my-skill: ./skills/my-skill
```

**GitHub URL** - a tree URL pointing to a directory in a repository:

```yaml
skills:
  atomic:
    my-skill: https://github.com/user/repo/tree/main/skills/my-skill
```

For private repositories, set the `GITHUB_TOKEN` environment variable.

**npm package** - a path inside an installed npm package:

```yaml
skills:
  atomic:
    my-skill: npm:@team/package/skills/my-skill
```

The `npm:` prefix resolves to the package's install path under `node_modules/`. Run `npm install @team/package` first.

## Using in composition

Atomic skills become useful when composed into agents. A composed skill lists one or more atomic skills, and the compiler concatenates their bodies in order:

```yaml
skills:
  atomic:
    planning: ./skills/planning
    coding: ./skills/coding
    testing: ./skills/testing

  composed:
    engineer:
      compose: [planning, coding, testing]
      description: "Implements the plan, writes code, and runs tests."
```

The compiled `engineer` agent receives the combined instructions from all three skills, in the order listed. This is how you build specialized agents from reusable building blocks - a reviewer agent might compose `planning` and `code-review`, while a QA agent composes `planning` and `testing`.

Composition is recursive: a composed skill can reference other composed skills, and the compiler resolves the full chain.

## Validating your skill

After creating a skill and referencing it in your config, verify everything works:

```bash
npx skillfold validate     # check config and skill references
npx skillfold list         # see the full pipeline summary
npx skillfold              # compile to build/
```

The compiler will report clear errors if the skill directory is missing, the `SKILL.md` file cannot be read, or the frontmatter is malformed.

## Next steps

- [Publishing Skills](publishing.md) - Package and share your skills on npm
- [Config Format](reference/config.md) - Full reference for `skillfold.yaml` syntax
- [Getting Started](getting-started.md) - End-to-end pipeline walkthrough
