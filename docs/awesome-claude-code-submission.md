# awesome-claude-code Submission Draft

> **WARNING: This submission MUST be filed manually via the web UI by a human.**
> The `gh` CLI cannot submit issue forms. A human must open the link below,
> fill in each field, and submit.

Submit via the GitHub web UI at:
https://github.com/hesreallyhim/awesome-claude-code/issues/new?template=recommend-resource.yml

Earliest submission date: March 27, 2026 (7-day cooldown expiry from PR #1020, see below).

### Cooldown Warning

A prior violation triggered a cooldown:

- **PR #1020** was submitted directly as a pull request to awesome-claude-code
  instead of through the required issue template.
- It was auto-closed by their bot. The 7-day cooldown from March 20
  sets the earliest retry to **March 27, 2026**.
- **Do not submit early.** A repeat violation would escalate the cooldown.
- The submission **MUST** go through the
  [issue template web UI](https://github.com/hesreallyhim/awesome-claude-code/issues/new?template=recommend-resource.yml),
  **NOT** via `gh` CLI, **NOT** as a direct PR.

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

Configuration language and compiler for multi-agent AI pipelines. Compiles a single YAML config into agent skills for 12 targets (Claude Code, Cursor, Copilot, Gemini, Goose, and more), validating skill references, state types, and write conflicts at build time. Ships with 11 reusable library skills and example pipeline templates.

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

Every other orchestrator in the awesome-claude-code list is a runtime tool - it launches agents, manages sessions, and coordinates execution while agents run. Skillfold is the only compile-time entry in the Orchestrators category. It validates skill references, state types, write conflicts, and cycle exit conditions at build time, then produces plain Markdown files that Claude Code reads natively. Compiles to 12 platform targets: Claude Code, Agent Teams, Cursor, Windsurf, Codex, Copilot, Gemini, Goose, Roo Code, Kiro, Junie, and generic SKILL.md. The README's "Works with Agent Teams" section explains the complementary relationship: skillfold defines what each agent knows and how agents connect at build time, while Agent Teams coordinates live sessions at execution time. When a pipeline has a team flow, the compiler also generates an executable `/run-pipeline` command that orchestrates the agents with a step-by-step execution plan, state table, and Agent tool invocations. There is no process to run, no server to start, and no SDK to integrate.

Self-hosting: skillfold's own dev team pipeline is compiled by skillfold itself (`skillfold.yaml` in the repo root). The 7-agent pipeline (strategist, architect, designer, marketer, engineer, reviewer, orchestrator) produces the project's own discussions, issues, and pull requests.

CI integration: ships a reusable GitHub Action (`action.yml`) that verifies compiled output is up-to-date via `--check`, so stale agent files fail the build.

11 library skills (planning, research, code-writing, testing, etc.) are discoverable via `npx skills add byronxlg/skillfold`.

Single dependency (`yaml`), 858 tests across 168 suites, Node 20+.

---

## Pre-Submission Evaluation (for Byron, not part of the submission)

The awesome-claude-code maintainer runs an automated evaluation using the
`evaluate-repository.md` command against every submission. This section
pre-runs that evaluation against skillfold and documents the results.

### Evaluation Dimensions (scored 1-10 per the rubric)

**1. Code Quality: 9/10**
TypeScript strict mode, ESM modules, consistent conventions across all source
files. 858 tests across 168 suites using `node:test` (zero test framework deps).
Custom error classes with descriptive messages. No `any`, no unnecessary type
assertions.

**2. Security and Safety: 9/10**
Core compiler is pure - no hooks, no implicit execution, no persistent state,
no credential storage. Network access only for optional remote skill fetching
(GitHub raw URLs) and npm registry search. `GITHUB_TOKEN` read from
environment, never stored or logged. Single runtime dependency (`yaml`).
Watch mode recompiles on file change but does not execute agents. The opt-in
`skillfold run` command has a broader surface (spawns `claude` CLI or SDK,
`gh` CLI for backends) but is clearly separated from the compiler and
documented in SECURITY.md. All shell execution uses `execFile` (not `exec`).
The `agentConfig.hooks` pass-through is inert data, documented in SECURITY.md.

**3. Documentation and Transparency: 9/10**
README accurately describes all features. Getting-started tutorial, integration
guide for 12 targets, JSON Schema for IDE autocompletion, VitePress docs site,
CLI reference, config reference. No undocumented side effects.

**4. Functionality and Scope: 9/10**
Does exactly what it claims: compiles YAML config to agent skills for 12
platform targets. Validates skill references, state types, write conflicts,
cycles, and reachability at compile time. Self-hosts its own dev team pipeline.

**5. Repository Hygiene and Maintenance: 9/10**
CI on Node 20 + 22 via GitHub Actions. MIT license in LICENSE and package.json.
Automated npm publish with provenance. Semver policy documented in
CONTRIBUTING.md. Active development with 550+ issues/PRs. SECURITY.md
covers the compiler, `skillfold run`, network access, file system access,
hook pass-through, and npm lifecycle scripts.

### Claude-Code-Specific Checklist

| Check | Answer | Detail |
|---|---|---|
| Defines hooks (stop, lifecycle, or similar)? | No | The compiler itself installs no hooks. The `agentConfig.hooks` field passes through hook config to compiled agent frontmatter, but skillfold does not execute them - the consuming platform does. Documented in SECURITY.md. |
| Hooks execute shell scripts? | No | Skillfold does not execute any hooks. Hook pass-through is inert data in YAML frontmatter. |
| Commands invoke shell or external tools? | Partially | The core compiler (`npx skillfold`) does not. The opt-in `skillfold run` command spawns `claude` CLI or uses the Claude Agent SDK, and `gh` CLI for state backends. Documented in SECURITY.md. |
| Writes persistent local state files? | Partially | The core compiler writes only Markdown output. The opt-in `skillfold run` writes `state.json` and `.skillfold/run/` checkpoints (both gitignored). Documented in SECURITY.md. |
| Reads state to control execution flow? | Partially | The core compiler is stateless. The opt-in `skillfold run --resume` reads checkpoints from `.skillfold/run/`. Documented in SECURITY.md. |
| Performs implicit execution without confirmation? | No | User invokes CLI explicitly. `watch` recompiles on file changes but does not execute agents. The `prepare` npm lifecycle script runs `tsc` (standard TypeScript compilation), only when installing from git source. |
| Documents hook or command side effects? | Yes | SECURITY.md has dedicated sections for the compiler, `skillfold run`, `skillfold search`, `skillfold init`, `skillfold plugin`, network access, file system access, hook pass-through, and npm lifecycle scripts. |
| Includes safe defaults? | Yes | Default output is `build/`. `--target claude-code` writes to `.claude/` only when explicitly requested. `skillfold run` requires explicit invocation and supports `--dry-run`. |
| Includes a clear disable or cancel mechanism? | Yes | Compiler only runs when invoked. Ctrl-C stops `watch`. `skillfold run --dry-run` previews without executing. |

### Permissions and Side Effects Analysis

**A. Reported / Declared Permissions (from docs / SECURITY.md):**
- File system: Reads YAML config + SKILL.md files, writes compiled output to `build/` or `.claude/`. `skillfold run` additionally writes `state.json` and `.skillfold/run/`.
- Network: Optional fetch from `raw.githubusercontent.com` for remote skills. `skillfold search` queries npm registry. `skillfold run` uses `gh` CLI for state backends.
- Execution / hooks: Compiler: none. `skillfold run`: spawns `claude` CLI or SDK, and `gh` CLI. All via `execFile`.
- APIs / tools: Optional `GITHUB_TOKEN` env var for private repo skill fetching

**B. Likely Actual Permissions (inferred from code):**
- File system: `node:fs/promises` read/write for config parsing and output (confirmed)
- Network: `fetch()` for remote skills and npm registry search (confirmed)
- Execution / hooks: `node:child_process` used in `run.ts` (spawns `claude` CLI via `execFile` for `skillfold run`) and `backends.ts` (spawns `gh` CLI via `execFile` for state backends). Not used in compile path. All shell execution uses `execFile` (not `exec`) to prevent injection. (confirmed)
- APIs / tools: `GITHUB_TOKEN` read from `process.env`, never stored (confirmed)
- npm lifecycle: `prepare` script runs `npm run build` (`tsc`), standard for TypeScript packages (confirmed)
- Hook pass-through: `agentConfig.hooks` in config is copied verbatim to compiled agent YAML frontmatter. Skillfold does not execute these hooks. (confirmed)

**C. Discrepancies:**
None material. `node:child_process` is used by the optional `skillfold run`
command (not part of the core compile path). The compile workflow
(`npx skillfold`) does not spawn subprocesses. The `agentConfig.hooks`
pass-through is documented in SECURITY.md and does not represent execution
by skillfold itself.

### Red Flag Scan

- No malware indicators
- No undisclosed execution surfaces (all execution paths documented in SECURITY.md)
- No unsafe defaults
- No supply-chain risks (single runtime dependency: `yaml`)
- No obfuscated code
- No telemetry or analytics
- No data exfiltration vectors
- `prepare` lifecycle script runs `tsc` only (standard TypeScript compilation)
- `agentConfig.hooks` pass-through is documented and inert

### Overall Assessment

**Overall Score: 9/10**

**Recommendation: Recommend**

Skillfold is a straightforward build tool. It reads YAML, writes Markdown, and
does nothing else. The attack surface is minimal, the behavior is transparent,
and the documentation accurately describes what the tool does.

**Fast-Reject Heuristic:** None apply. No malicious behavior, no implicit
execution, no claim/behavior mismatch, safe defaults.

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
- **858 tests** across 168 suites, run with `node:test` (zero test framework
  dependencies).
- **MIT license**, clearly stated in LICENSE and package.json.
- **CI on Node 20 + 22** via GitHub Actions, with `--check` flag for verifying
  compiled output is current.
- **Comprehensive docs** - Getting-started tutorial, integration guide for 12
  targets, JSON Schema for IDE autocompletion, VitePress docs site.
- **Self-hosting** - The project's own dev team pipeline is compiled by
  skillfold, providing a non-trivial real-world usage example.
- **Semver policy** - Documented in CONTRIBUTING.md with automated npm publish
  via GitHub Actions with provenance.
