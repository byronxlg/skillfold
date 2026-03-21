# Anthropic Plugin Marketplace Submission

## Status: Ready to publish as self-hosted marketplace

There is no centralized Anthropic plugin submission portal. Claude Code uses a
decentralized plugin marketplace system where anyone can create and host their
own marketplace. Users add marketplaces with `/plugin marketplace add`.

## Our Plugin Structure

The `plugin/` directory already contains a valid Claude Code plugin:

```
plugin/
  .claude-plugin/
    plugin.json          - Plugin manifest (name, version, description)
  commands/
    skillfold.md         - /skillfold slash command
  skills/
    code-review/SKILL.md
    code-writing/SKILL.md
    decision-making/SKILL.md
    file-management/SKILL.md
    github-workflow/SKILL.md
    planning/SKILL.md
    research/SKILL.md
    skillfold-cli/SKILL.md
    summarization/SKILL.md
    testing/SKILL.md
    writing/SKILL.md
```

The `plugin.json` manifest is valid and contains required fields (name,
version, description, author, repository).

## What's Needed to Be a Marketplace

To make skillfold a discoverable marketplace (not just a standalone plugin),
we need to add a `marketplace.json` file:

### Option A: Add marketplace.json to the existing plugin directory

Create `plugin/.claude-plugin/marketplace.json`:

```json
{
  "name": "skillfold",
  "owner": {
    "name": "byronxlg",
    "email": null
  },
  "metadata": {
    "description": "Multi-agent pipeline compiler with reusable skills library",
    "version": "1.5.0"
  },
  "plugins": [
    {
      "name": "skillfold",
      "source": ".",
      "description": "Multi-agent pipeline compiler. Compose skills, wire team flows, generate orchestrators.",
      "version": "1.5.0",
      "author": {
        "name": "byronxlg"
      },
      "homepage": "https://github.com/byronxlg/skillfold",
      "repository": "https://github.com/byronxlg/skillfold",
      "license": "MIT",
      "keywords": ["pipeline", "compiler", "multi-agent", "skills", "orchestrator"],
      "category": "productivity"
    }
  ]
}
```

### Option B: Create a separate marketplace repository

For a more scalable approach, create a dedicated marketplace repo
(e.g., `byronxlg/claude-plugins`) that references the skillfold plugin:

```json
{
  "name": "byronxlg-plugins",
  "owner": {
    "name": "byronxlg"
  },
  "plugins": [
    {
      "name": "skillfold",
      "source": {
        "source": "git-subdir",
        "url": "https://github.com/byronxlg/skillfold.git",
        "path": "plugin"
      },
      "description": "Multi-agent pipeline compiler with 11 reusable skills and a /skillfold command.",
      "license": "MIT",
      "keywords": ["pipeline", "compiler", "multi-agent", "skills"]
    }
  ]
}
```

## Installation Commands (for users)

Once the marketplace is set up, users install with:

```
/plugin marketplace add byronxlg/skillfold
/plugin install skillfold@skillfold
```

Or for Option B:

```
/plugin marketplace add byronxlg/claude-plugins
/plugin install skillfold@byronxlg-plugins
```

## Version Alignment

The `plugin.json` currently declares version `1.3.0` while the npm package is
at `1.5.0`. This should be updated to match before publishing the marketplace.

## Compatibility with skills.sh

The `skills` CLI (from Vercel) also discovers plugins via
`.claude-plugin/marketplace.json`. Adding the marketplace file to our plugin
directory would make the skills installable via both:

- `npx skills add byronxlg/skillfold` (Agent Skills standard)
- `/plugin marketplace add byronxlg/skillfold` (Claude Code marketplace)

## Next Steps

1. Update `plugin/.claude-plugin/plugin.json` version to match npm package
2. Add `plugin/.claude-plugin/marketplace.json`
3. Test with `/plugin marketplace add ./plugin` locally
4. Validate with `claude plugin validate plugin/`
5. Document marketplace installation in the README
