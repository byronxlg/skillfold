# skills.sh Listing Status

## Current Status: Discoverable but not listed on leaderboard

### Discovery Works

Running `npx skills@latest add byronxlg/skillfold --list` finds all 11 library
skills:

- code-review
- code-writing
- decision-making
- file-management
- github-workflow
- planning
- research
- skillfold-cli
- summarization
- testing
- writing

The project-internal skills (in `skills/`) are correctly hidden because they
have `metadata.internal: true` in their SKILL.md frontmatter.

### Why We're Not on the Leaderboard

The skills.sh leaderboard at https://skills.sh ranks skills by installation
count, tracked via anonymous telemetry from the `skills` CLI. Our skills have
zero installations because:

1. The project is new (first commit March 19, 2026)
2. Nobody has run `npx skills add byronxlg/skillfold` yet

There is no submission process for skills.sh. Listing is automatic once skills
accumulate enough installations to appear on the leaderboard (which currently
shows 89,460+ skills, so the bar for appearing at all may be just one install).

### How the CLI Discovers Our Skills

The Vercel `skills` CLI (npm package `skills`, currently v1.4.5) clones the
repo and searches standard directories for SKILL.md files. It finds our skills
via these discovery paths:

- `skills/` - found, but all 10 skills here have `metadata.internal: true`
- `library/skills/` - not a standard path, but found via recursive fallback
- `plugin/skills/` - found via the `.claude-plugin/plugin.json` manifest
- `.claude/skills/` - standard Claude Code path, also searched

The recursive search fallback ensures all our public skills are discovered even
though `library/skills/` is not a standard discovery directory.

### What Would Help

1. **Installations**: Anyone running `npx skills add byronxlg/skillfold` would
   register telemetry and contribute to leaderboard presence. Mentioning this
   install command in the README and docs would help.

2. **Marketplace JSON**: Adding `.claude-plugin/marketplace.json` to the plugin
   directory would give the CLI an explicit skill manifest to read, rather than
   relying on directory scanning. This also enables compatibility with the
   Claude Code plugin marketplace system.

3. **README badge/install command**: Prominently showing the install command
   in the README would drive organic installations:
   ```
   npx skills add byronxlg/skillfold
   ```

### No Action Required for Listing

There is nothing to "submit" to skills.sh. The skills are already discoverable.
Leaderboard presence will come naturally as users install them. The main
leverage is making the install command visible in documentation and marketing.
