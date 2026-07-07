# Skillfold code conventions

- TypeScript, strict mode, ESM modules. Node stdlib imports use the `node:` prefix.
- Imports are ordered node stdlib, then third-party, then local, alphabetical within each group. Local imports keep the `.js` extension (NodeNext resolution).
- Custom errors extend `SkillfoldError` and carry messages safe to print directly.
- No `any`, no unnecessary type assertions.
- Network access is injectable (`fetcher` options) so tests run fully offline.
- Run `npm test` and `npx tsc --noEmit` before committing.
