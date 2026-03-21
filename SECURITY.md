# Security Policy

## Trust Model

Skillfold is a compiler. It reads YAML configuration files and writes Markdown (`.md`) files. It does not execute generated output or run user-defined code.

### Dependencies

Single runtime dependency: [`yaml`](https://github.com/eemeli/yaml) (YAML parser).

### Compiler (default)

The default `skillfold` command is a pure compiler:

- **Reads**: YAML config files (`skillfold.yaml`) and skill directories containing `SKILL.md` files
- **Writes**: Compiled Markdown files to the configured output directory (default: `build/`)
- **No hooks, no background processes, no daemons**
- **No persistent state files**

### Pipeline Runner (`skillfold run`)

The `skillfold run` command is an opt-in execution mode with a broader surface:

- **Process execution**: Spawns `claude` CLI via `child_process.execFile` (CLI spawner, default) or uses the `@anthropic-ai/claude-agent-sdk` (SDK spawner, `--spawner sdk`). The SDK spawner runs with `bypassPermissions` to enable unattended pipeline execution.
- **State files**: Writes `state.json` (pipeline state) and `.skillfold/run/` (checkpoint files for `--resume`). Both are gitignored.
- **State backends**: Optionally reads from and writes to GitHub issues, discussions, and pull requests via `gh` CLI (`child_process.execFile`).
- **Dry run**: Use `--dry-run` to preview execution without spawning agents or writing state.

All shell execution uses `execFile` (not `exec`) to prevent shell injection.

### Other Commands

- **`skillfold search`**: Queries the npm registry (HTTPS) for packages with the `skillfold-pipeline` keyword.
- **`skillfold init`**: Creates project directories and starter files in the current working directory.
- **`skillfold plugin`**: Copies compiled output to a plugin directory structure. No network access.

### Network Access

Network access is optional and limited to:

- **Remote skills**: Fetches from `raw.githubusercontent.com` when a config references a GitHub URL. Private repos require the `GITHUB_TOKEN` environment variable.
- **State backends** (`skillfold run`): Uses `gh` CLI to read/write GitHub issues, discussions, and pull requests.
- **npm search** (`skillfold search`): Queries the npm registry.

No other network requests are made.

### File System Access

Skillfold reads config files and skill directories, and writes compiled output to the configured output directory. The `skillfold run` command additionally writes `state.json` and `.skillfold/run/` checkpoint files. It does not read or write files outside these paths.

### npm Lifecycle Scripts

The `prepare` script runs `npm run build`, which is standard TypeScript compilation (`tsc`). This only runs when installing from git source. There is no implicit execution beyond standard npm lifecycle scripts.

## Reporting Vulnerabilities

Report vulnerabilities via [GitHub Security Advisories](https://github.com/byronxlg/skillfold/security/advisories/new).

Do not open public issues for security vulnerabilities.
