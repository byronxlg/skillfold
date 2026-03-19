# Skillfold

Configuration language and compiler for multi-agent AI pipelines. Compiles YAML config into standard SKILL.md files.

## Quick Reference

- **Run compiler**: `npx tsx src/cli.ts`
- **Run with custom config**: `npx tsx src/cli.ts --config path.yaml --out-dir build/`
- **Build**: `npm run build`
- **Type check**: `npx tsc --noEmit`

## Project Structure

```
src/
  cli.ts          - CLI entry point, arg parsing
  config.ts       - YAML parsing, config types, validation (cycles, references)
  resolver.ts     - Reads SKILL.md files from skill directories
  compiler.ts     - Recursive composition and body concatenation
  errors.ts       - ConfigError, ResolveError, CompileError
skills/           - Atomic skill definitions (each has a SKILL.md)
dist/             - Compiler output (gitignored)
skillfold.yaml    - Pipeline config for the dev team itself
BRIEF.md          - Full design brief
```

## Code Conventions

- TypeScript, strict mode, ESM modules
- Node stdlib imports use `node:` prefix
- Imports: node stdlib -> third-party -> local, alpha within groups
- File extensions in imports: `.js` (NodeNext module resolution)
- Custom errors extend Error with descriptive messages including skill name context
- No `any`, no unnecessary type assertions

## Design Brief Summary

Read BRIEF.md for full context. Key points:

- **Skill composition**: Atomic skills define reusable fragments. Composed skills concatenate atomic skill bodies in declared order. Composition is recursive.
- **Skill graphing** (not yet implemented): Agents wired into typed execution graphs with conditional routing, loops, and parallel map.
- **State validation** (not yet implemented): Typed state schema, reads/writes validation, write conflict detection.
- **Orchestrator generation** (not yet implemented): Generated from the graph definition.

## What's Implemented

- Config parsing with cycle detection and reference validation
- Skill path resolution and SKILL.md reading
- Recursive skill composition and compilation to dist/

## What's Next

See BRIEF.md "Compiler Responsibilities" and "Open Questions" sections. Major remaining work:
1. State schema parsing and type system
2. Graph parsing and validation
3. Orchestrator SKILL.md generation
4. Map/parallel support
