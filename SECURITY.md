# Security Policy

## Trust Model

Skillfold is a compiler. It reads YAML configuration files and writes Markdown (`.md`) files. It does not execute generated output or run user-defined code.

### Dependencies

Single runtime dependency: [`yaml`](https://github.com/eemeli/yaml) (YAML parser).

### What Skillfold Does

- **Reads**: YAML config files (`skillfold.yaml`) and skill directories containing `SKILL.md` files
- **Writes**: Compiled Markdown files to the configured output directory (default: `build/`)
- **No hooks, no background processes, no daemons**
- **No persistent state files**

### Network Access

Network access is optional and limited to fetching skills from GitHub URLs via `raw.githubusercontent.com`. This only happens when a config references a remote skill by GitHub URL. Private repository access requires the `GITHUB_TOKEN` environment variable.

No other network requests are made.

### File System Access

Skillfold reads config files and skill directories, and writes compiled output to the configured output directory. It does not read or write files outside these paths.

### npm Lifecycle Scripts

The `prepare` script runs `npm run build`, which is standard TypeScript compilation (`tsc`). This only runs when installing from git source. There is no implicit execution beyond standard npm lifecycle scripts.

## Reporting Vulnerabilities

Report vulnerabilities via [GitHub Security Advisories](https://github.com/byronxlg/skillfold/security/advisories/new).

Do not open public issues for security vulnerabilities.
