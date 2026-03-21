# Publishing Skills to npm

This guide explains how to publish reusable skills so others can discover them with `skillfold search` and import them into their pipelines.

## How Discovery Works

Skillfold uses npm as its skill registry. Packages that include the `agentskills` keyword in package.json become discoverable via `skillfold search`. Each package declares its skills in an `agentskills` field, mapping skill names to directory paths.

## Directory Structure

A skill package follows a straightforward layout:

```
my-skills/
  package.json
  skillfold.yaml        # optional: lets users import with one line
  skills/
    my-skill/
      SKILL.md
    another-skill/
      SKILL.md
```

Each skill directory contains a `SKILL.md` file following the [Agent Skills specification](https://agentskills.io/specification) - YAML frontmatter with `name` and `description`, followed by the skill body.

## package.json

Three fields matter for discovery:

```json
{
  "name": "my-skills",
  "version": "1.0.0",
  "keywords": ["agentskills"],
  "agentskills": {
    "my-skill": "./skills/my-skill",
    "another-skill": "./skills/another-skill"
  },
  "files": ["skills", "skillfold.yaml"]
}
```

- **keywords**: Must include `agentskills` so `skillfold search` can find the package
- **agentskills**: Flat key-value map of skill names to directory paths (relative to package root)
- **files**: Include the skill directories and optional config so they end up in the published package

## With or Without skillfold.yaml

### With skillfold.yaml (recommended)

If you include a `skillfold.yaml`, users can import all your skills with one line:

```yaml
# skillfold.yaml in the skill package
name: my-skills

skills:
  atomic:
    my-skill: ./skills/my-skill
    another-skill: ./skills/another-skill
```

Users import it:

```yaml
# user's skillfold.yaml
imports:
  - node_modules/my-skills/skillfold.yaml

skills:
  composed:
    my-agent:
      compose: [my-skill, another-skill]
```

This approach also lets you ship state schemas alongside skills.

### Without skillfold.yaml

Users reference individual skills directly:

```yaml
skills:
  atomic:
    my-skill: ./node_modules/my-skills/skills/my-skill
    another-skill: ./node_modules/my-skills/skills/another-skill
```

This works but requires knowing the internal directory structure.

## Publishing

```bash
npm publish
```

To automate publishing on release, use a GitHub Actions workflow. See [skillfold's own publish workflow](https://github.com/byronxlg/skillfold/blob/main/.github/workflows/publish.yml) as a reference.

## Verifying Discovery

After publishing, verify your package is discoverable:

```bash
npx skillfold search my-skills
```

This queries the npm registry for packages with the `agentskills` keyword and displays matching results with skill counts and import paths.

## Example

Skillfold itself publishes 11 reusable skills. See the [`agentskills` field in package.json](https://github.com/byronxlg/skillfold/blob/main/package.json) and the [`library/` directory](https://github.com/byronxlg/skillfold/tree/main/library) for a working example.
