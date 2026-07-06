# Security Policy

## Trust Model

Skillfold is a file manager for skills. It reads a YAML manifest, downloads skill files from declared sources, and writes them into a skills directory. It never executes skill content, generated output, or user-defined code.

### Dependencies

Single runtime dependency: [`yaml`](https://github.com/eemeli/yaml) (YAML parser).

### What skillfold reads and writes

- **Reads**: `skillfold.yaml`, `skillfold.lock`, skill directories (local sources, `node_modules`, the download cache), and the installed skills directory.
- **Writes**: the skills directory (default `.claude/skills`), `skillfold.lock`, and the download cache (`~/.cache/skillfold`, override with `SKILLFOLD_CACHE`).
- **Managed-directory safety**: skillfold only overwrites or removes skill directories whose names appear in the lockfile. Anything else requires `--force`.
- **No hooks, no background processes, no daemons.**

### Supply-chain properties

- The lockfile pins every remote skill to an immutable identifier (full commit SHA for GitHub, exact version for npm) plus a sha256 content hash over all files.
- `skillfold install --frozen` and `skillfold check` verify those hashes, so a tampered cache, registry substitution, or force-pushed tag surfaces as a hard failure rather than a silent change.
- Skill content is still prompt material for your agent. Review skills from sources you do not control before installing them, the same way you would review a dependency.

### Process execution

- `npm pack` and `tar` are invoked via `child_process.execFile` (never a shell) to download npm packages that are not already installed in `node_modules`.
- No other processes are spawned.

### Network Access

Network access happens only during `install`/`add`/`update` for remote sources, and is limited to:

- **GitHub sources**: `api.github.com` (ref resolution, file listing) and `raw.githubusercontent.com` (file download). Private repos use the `GITHUB_TOKEN` / `GH_TOKEN` environment variable.
- **npm sources**: `registry.npmjs.org` (version resolution and tarball download via `npm pack`).
- **`skillfold search`**: queries the npm registry over HTTPS.

`check` is fully offline. Installs with a warm cache are fully offline.

### npm Lifecycle Scripts

The `prepare` script runs `npm run build`, which is standard TypeScript compilation (`tsc`). This only runs when installing from git source. Downloaded skill packages are extracted with `tar`; their lifecycle scripts are never executed.

## Reporting Vulnerabilities

Report vulnerabilities via [GitHub Security Advisories](https://github.com/byronxlg/skillfold/security/advisories/new).

Do not open public issues for security vulnerabilities.
