# Publishing Skills

Any GitHub repo or npm package can distribute skills. A skill is a directory with a `SKILL.md` (YAML frontmatter with `name` and `description`, then the body) plus any supporting files.

## Via GitHub (zero setup)

Push a skill directory to any public repo. It is immediately addressable:

```sh
skillfold add github:you/your-repo/skills/tdd
```

Consumers can pin a tag, branch, or commit SHA with `@ref`. Tag releases so pins are meaningful:

```sh
git tag v1.0.0 && git push --tags
```

```sh
skillfold add github:you/your-repo/skills/tdd@v1.0.0
```

Private repos work too - consumers set `GITHUB_TOKEN`.

## Via npm (versioned, discoverable)

Publish a package whose `package.json` maps skill names to directories:

```json
{
  "name": "my-skills",
  "version": "1.0.0",
  "description": "Skills for test-driven development workflows",
  "keywords": ["skillfold-skill"],
  "files": ["skills"],
  "agentskills": {
    "tdd": "./skills/tdd",
    "red-green-refactor": "./skills/red-green-refactor"
  }
}
```

Layout:

```
my-skills/
  package.json
  skills/
    tdd/
      SKILL.md
      references/checklist.md
    red-green-refactor/
      SKILL.md
```

Then `npm publish`. Consumers install with:

```sh
skillfold add npm:my-skills/tdd
skillfold add npm:my-skills/tdd@1.0.0     # exact pin
```

Notes:

- The `skillfold-skill` keyword makes the package discoverable via `skillfold search`.
- The `agentskills` map is a plain name -> path object, shared with the wider agent-skills ecosystem.
- A single-skill package can skip the map and put `SKILL.md` at the package root; consumers use `npm:my-skill` with no subpath.
- Skill names in the map should be lowercase-kebab (installed directories are named after them by default).

## Checklist before publishing

- `SKILL.md` frontmatter has an accurate `name` and a `description` that says when to use the skill.
- Supporting files live inside the skill directory (everything in it gets installed).
- No secrets: installed files land in consumers' repos.
- Test locally: `skillfold add ./skills/tdd` from a scratch project.
