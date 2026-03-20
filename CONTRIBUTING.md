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

## Running the Compiler

Run from source using `tsx`:

```bash
npx tsx src/cli.ts                        # compile pipeline
npx tsx src/cli.ts --target claude-code    # compile to Claude Code layout
npx tsx src/cli.ts validate               # validate config only
npx tsx src/cli.ts list                   # inspect pipeline
npx tsx src/cli.ts graph                  # output Mermaid flowchart
```

## Tests

The test suite uses `node:test` with no extra dependencies:

```bash
npm test              # run all tests
npx tsc --noEmit      # type check
```

Tests must pass before submitting a PR. CI runs on Node 20 and Node 22.

## Code Conventions

- TypeScript strict mode, ESM modules
- Node stdlib imports use the `node:` prefix (e.g., `import { readFile } from 'node:fs/promises'`)
- Import order: node stdlib, then third-party, then local - alphabetical within each group
- File extensions in imports: `.js` (NodeNext module resolution)
- No `any` types
- No unnecessary type assertions
- Custom errors extend `Error` with descriptive messages that include skill name context
- Keep functions small and focused on a single task

## Pull Request Process

1. Branch from `main`
2. Make focused changes that solve one problem
3. Add tests following existing patterns in the test suite
4. Run `npm test` and `npx tsc --noEmit` locally
5. Push and open a PR against `main`
6. CI must pass (Node 20 + 22)

## Project Structure

See the [project structure section](README.md#reference) in the README and `CLAUDE.md` for detailed layout.

## Questions

Open a GitHub issue for questions about contributing or the codebase.
