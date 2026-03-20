# Contributing to Skillfold

## Prerequisites

- Node.js 20 or later
- npm

## Setup

```bash
git clone https://github.com/byronxlg/skillfold.git
cd skillfold
npm install
```

## Development

Run the compiler in development mode:

```bash
npx tsx src/cli.ts
```

Compile to Claude Code layout:

```bash
npx tsx src/cli.ts --target claude-code
```

## Testing

Run the full test suite:

```bash
npm test
```

Type check without emitting:

```bash
npx tsc --noEmit
```

Both must pass before submitting a PR.

## Code Conventions

- TypeScript strict mode, ESM modules
- Node stdlib imports use the `node:` prefix (e.g., `import { readFile } from 'node:fs/promises'`)
- Import order: node stdlib, then third-party, then local - alphabetical within each group
- File extensions in imports: `.js` (NodeNext module resolution)
- No `any` types, no unnecessary type assertions
- Custom errors extend `Error` with descriptive messages including context

## Versioning

This project follows [Semantic Versioning](https://semver.org/):

- **Patch** (e.g., 1.4.1): Bug fixes, typo corrections, minor tweaks
- **Minor** (e.g., 1.5.0): New features that are backwards compatible
- **Major** (e.g., 2.0.0): Breaking changes to the config format, CLI interface, or compiled output structure

Version bumps happen in `package.json` before tagging a release. The publish workflow (`.github/workflows/publish.yml`) is triggered by GitHub releases and publishes to npm with provenance.

## Pull Requests

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Add or update tests for any new functionality
4. Run `npm test` and `npx tsc --noEmit` to verify
5. Open a PR with a clear description of what changed and why

Keep PRs focused on a single change. If you have multiple unrelated changes, open separate PRs.

## Issues

Check [existing issues](https://github.com/byronxlg/skillfold/issues) before opening a new one. Include reproduction steps and expected vs actual behavior for bug reports.
