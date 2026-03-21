# Publishing Pipeline Configs to npm

Skillfold uses npm as its package registry. Any pipeline config - with its skills, state schema, and team flow - can be published as a standard npm package. No separate registry or tooling required.

## Package Structure

A publishable pipeline config contains a `package.json`, a `skillfold.yaml` with the pipeline definition, and the atomic skill directories it references:

```
my-pipeline/
  package.json
  skillfold.yaml         # pipeline config (skills, state, team flow)
  skills/
    planning/SKILL.md    # atomic skills used by the config
    testing/SKILL.md
```

Each skill directory follows the standard layout: a directory containing a `SKILL.md` file with YAML frontmatter and instructions.

## package.json

Required fields for a publishable pipeline config:

```json
{
  "name": "@team/dev-pipeline",
  "version": "1.0.0",
  "keywords": ["skillfold-pipeline"],
  "description": "Dev team pipeline with planning, coding, and review agents",
  "files": ["skillfold.yaml", "skills/"]
}
```

- **name** - Standard npm package name. Scoped names (`@team/...`) are recommended for team-owned packages.
- **keywords** - Must include `skillfold-pipeline`. This is what `skillfold search` uses to find packages on the registry.
- **files** - Limits the published package to only the config and skill files. Keep the package small.

## Publishing

Publish like any npm package:

```bash
npm publish              # public package
npm publish --access public   # first publish of a scoped package
```

Consumers import the full config to get the complete pipeline - skills, state schema, and team flow definition.

## Using Published Configs

Install the package, then import it in your config:

```bash
npm install @team/dev-pipeline
```

Import the full config to get all skills and state:

```yaml
imports:
  - npm:@team/dev-pipeline
```

Or reference individual skills directly:

```yaml
skills:
  atomic:
    planning: npm:@team/dev-pipeline/skills/planning
```

The `npm:` prefix resolves to the package's install path under `node_modules/`.

## Discovery

Search for published pipeline configs on npm:

```bash
skillfold search planning    # search by keyword
skillfold search             # list all skillfold pipeline configs
```

This queries the npm registry for packages with the `skillfold-pipeline` keyword and displays their name, description, and version.

## Versioning

Follow standard semver conventions:

- **Patch** (1.0.1) - Fix typos, clarify instructions, no behavior change
- **Minor** (1.1.0) - Add new skills, add optional state fields
- **Major** (2.0.0) - Rename or remove skills, change state schema in breaking ways

Consumers pin versions through their `package.json` as usual. Run `npm update` to pull in compatible updates.
