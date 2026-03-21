# Publishing Skills to npm

Skillfold uses npm as its package registry. Any skill or pipeline config can be published as a standard npm package - no separate registry or tooling required.

## Package Structure

A publishable skill package contains a `package.json`, an optional `skillfold.yaml` for importable pipeline configs, and one or more atomic skill directories:

```
my-skills/
  package.json
  skillfold.yaml         # pipeline config (optional, for importable configs)
  skills/
    planning/SKILL.md    # atomic skills
    testing/SKILL.md
```

Each skill directory follows the standard layout: a directory containing a `SKILL.md` file with YAML frontmatter and instructions.

## package.json

Required fields for a publishable skill package:

```json
{
  "name": "@team/shared-skills",
  "version": "1.0.0",
  "keywords": ["skillfold-skill"],
  "description": "Shared planning and review skills",
  "files": ["skillfold.yaml", "skills/"]
}
```

- **name** - Standard npm package name. Scoped names (`@team/...`) are recommended for team-owned packages.
- **keywords** - Must include `skillfold-skill`. This is what `skillfold search` uses to find packages on the registry.
- **files** - Limits the published package to only the config and skill files. Keep the package small.

## Publishing

Publish like any npm package:

```bash
npm publish              # public package
npm publish --access public   # first publish of a scoped package
```

If the package includes a `skillfold.yaml`, consumers can import the full config. If it only contains skill directories, consumers reference individual skills by path.

## Using Published Skills

Install the package, then reference it in your config:

```bash
npm install @team/shared-skills
```

Import the full config to get all skills and state:

```yaml
imports:
  - npm:@team/shared-skills
```

Or reference individual skills directly:

```yaml
skills:
  atomic:
    planning: npm:@team/shared-skills/skills/planning
```

The `npm:` prefix resolves to the package's install path under `node_modules/`.

## Discovery

Search for published skill packages on npm:

```bash
skillfold search planning    # search by keyword
skillfold search             # list all skillfold-skill packages
```

This queries the npm registry for packages with the `skillfold-skill` keyword and displays their name, description, and version.

## Versioning

Follow standard semver conventions:

- **Patch** (1.0.1) - Fix typos, clarify instructions, no behavior change
- **Minor** (1.1.0) - Add new skills, add optional state fields
- **Major** (2.0.0) - Rename or remove skills, change state schema in breaking ways

Consumers pin versions through their `package.json` as usual. Run `npm update` to pull in compatible updates.
