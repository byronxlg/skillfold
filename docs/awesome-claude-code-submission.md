# awesome-claude-code Submission Draft

> **WARNING: This submission MUST be filed manually via the web UI by a human.**
> The `gh` CLI cannot submit issue forms. A human must open the link below,
> fill in each field, and submit.

Submit via the GitHub web UI at:
https://github.com/hesreallyhim/awesome-claude-code/issues/new?template=recommend-resource.yml

Earliest submission date: March 26, 2026 (7-day repo age requirement met).

---

## Form Fields

**Display Name:** Skillfold

**Category:** Tooling

**Sub-Category:** Tooling: Orchestrators

**Primary Link:** https://github.com/byronxlg/skillfold

**Author Name:** byronxlg

**Author Link:** https://github.com/byronxlg

**License:** MIT

**Description:**

Configuration language and compiler for multi-agent AI pipelines. Compiles YAML skill definitions into standard SKILL.md files and Claude Code agent layouts at build time - no runtime, no SDK, no daemon. Ships with a shared skills library, a slash command plugin, and an adopt command that converts existing Claude Code agents into managed pipelines.

**Validate Claims:**

```bash
npx skillfold init demo --template dev-team && cd demo && npx skillfold --target claude-code && ls .claude/agents/ && head -20 .claude/agents/engineer.md && grep -c "^#" .claude/agents/engineer.md
```

This scaffolds a three-agent pipeline from a library template, compiles it to Claude Code agent layout, and shows that each agent file contains composed skill instructions with YAML frontmatter. The final `grep -c` confirms multiple skill sections were composed into a single agent file.

**Specific Task(s):**

Run the command above and inspect the compiled agent files in `.claude/agents/`. Each file contains composed skill instructions from multiple atomic skills, with YAML frontmatter. Inspect the compiled agent files to confirm that multiple atomic skills were composed into a single agent file. Check that the YAML frontmatter and section headers are present.

**Specific Prompt(s):**

Install skillfold (`npm install skillfold`), then run: `npx skillfold init demo --template dev-team && cd demo && npx skillfold --target claude-code`. Now inspect `.claude/agents/engineer.md` - it should contain composed instructions from multiple atomic skills. Then try the generated slash command: use `/run-pipeline` to see the orchestrator execution plan.

**Additional Comments:**

Every other orchestrator in the awesome-claude-code list is a runtime tool - it launches agents, manages sessions, and coordinates execution while agents run. Skillfold is the only compile-time entry in the Orchestrators category. It validates skill references, state types, write conflicts, and cycle exit conditions at build time, then produces plain Markdown files that Claude Code reads natively. When a pipeline has a team flow, the compiler also generates an executable `/run-pipeline` command that orchestrates the agents with a step-by-step execution plan, state table, and Agent tool invocations. There is no process to run, no server to start, and no SDK to integrate.

Self-hosting: skillfold's own dev team pipeline is compiled by skillfold itself (`skillfold.yaml` in the repo root). The 7-agent pipeline (strategist, architect, designer, marketer, engineer, reviewer, orchestrator) produces the project's own discussions, issues, and pull requests.

CI integration: ships a reusable GitHub Action (`action.yml`) that verifies compiled output is up-to-date via `--check`, so stale agent files fail the build.

Single dependency (`yaml`), 328 tests across 59 suites, Node 20+.

---

## Pre-Submission Evaluation (for Byron, not part of the submission)

The awesome-claude-code maintainer runs an automated evaluation using the
`evaluate-repository.md` command against every submission. This section
pre-runs that evaluation against skillfold and documents the results.

### Evaluation Dimensions

| Dimension | What it checks | Assessment |
|---|---|---|
| Code quality | Structure, readability, correctness, consistency | Pass - TypeScript strict mode, ESM, consistent conventions, 322 tests |
| Security / safety | Implicit execution, file/network access, credentials | Pass - Pure compiler, no hooks, no persistent state, no credential storage |
| Documentation / transparency | Docs match implementation, side effects disclosed | Pass - README, getting-started guide, integration guide, JSON Schema |
| Functionality / scope | Does what it claims, breadth of features | Pass - Compiles YAML to SKILL.md and Claude Code agents as advertised |
| Repo hygiene | Maintenance, licensing, publication quality | Pass - CI on Node 20+22, MIT license, npm provenance, semver policy |

### Claude-Code-Specific Checklist

| Check | Answer | Detail |
|---|---|---|
| Hooks defined? | No | Skillfold does not install git hooks, pre-commit hooks, or lifecycle hooks of any kind. It is a pure compiler. |
| Hooks/commands invoke shell scripts? | No | The `/skillfold` and `/run-pipeline` slash commands are Markdown files. They do not invoke shell scripts. |
| Persistent state files? | No | The compiler reads YAML and writes Markdown. It stores nothing between runs. No databases, caches, or lockfiles. |
| Control-flow dependencies on state? | No | Each compile run is stateless and deterministic from the input config. |
| Implicit execution without user confirmation? | No | Nothing runs automatically. The user invokes the CLI explicitly. `watch` mode recompiles on file changes but does not execute agents. |
| Safe defaults? | Yes | Default output is `build/` directory. `--target claude-code` writes to `.claude/` only when explicitly requested. |
| Disable mechanism? | N/A | Nothing to disable - the compiler only runs when invoked. |
| Network access? | Minimal | Only for remote skill fetching (GitHub URLs), and only when the config references remote skills. Uses `GITHUB_TOKEN` from environment for private repos, never stores or logs it. |
| File system access? | Scoped | Reads config + skill directories, writes to output directory. Does not modify source files. |

### Permissions Analysis

**Declared permissions (from docs):**
- Reads: YAML config files, SKILL.md files from skill directories
- Writes: Compiled output to `build/` or `.claude/` directory
- Network: Optional fetch from `raw.githubusercontent.com` for remote skills
- Environment: Optional `GITHUB_TOKEN` for private repos

**Inferred permissions (from code):**
- `node:fs/promises` - read/write for config parsing and output
- `node:path` - path resolution
- `node:child_process` - not used
- `node:net`/`node:http` - not used directly; `fetch()` for remote skills only

No discrepancies between declared and inferred permissions.

### Red Flag Scan

- No malware indicators
- No undisclosed execution surfaces
- No unsafe defaults
- No supply-chain risks (single dependency: `yaml`)
- No obfuscated code
- No telemetry or analytics
- No data exfiltration vectors

### Recommendation: Recommend

Skillfold is a straightforward build tool. It reads YAML, writes Markdown, and
does nothing else. The attack surface is minimal, the behavior is transparent,
and the documentation accurately describes what the tool does.

### Why Skillfold should score well

- **No hooks** - Skillfold does not install git hooks, pre-commit hooks, or any
  lifecycle hooks. It is a pure compiler.
- **No implicit execution** - Nothing runs automatically. The user invokes the
  CLI explicitly. `watch` mode recompiles on file changes but does not execute
  agents.
- **No persistent state** - The compiler reads YAML and writes Markdown. It
  stores nothing between runs.
- **No credential handling** - The only optional credential is `GITHUB_TOKEN`
  for fetching private remote skills, and it is read from the environment, never
  stored or logged.
- **Single dependency** - The only runtime dependency is `yaml` (YAML parser).
  No transitive dependency tree to audit.
- **328 tests** across 59 suites, run with `node:test` (zero test framework
  dependencies).
- **MIT license**, clearly stated in LICENSE and package.json.
- **CI on Node 20 + 22** via GitHub Actions, with `--check` flag for verifying
  compiled output is current.
- **Comprehensive docs** - Getting-started tutorial, integration guide for 5
  platforms, JSON Schema for IDE autocompletion, inline JSDoc on all exports.
- **Self-hosting** - The project's own dev team pipeline is compiled by
  skillfold, providing a non-trivial real-world usage example.
- **Semver policy** - Documented in CONTRIBUTING.md with automated npm publish
  via GitHub Actions with provenance.
