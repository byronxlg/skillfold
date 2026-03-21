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

Configuration language and compiler for multi-agent AI pipelines. Compiles a single YAML config into agent skills for 11 platforms including Claude Code, Cursor, Copilot, and Gemini. Validates skill references, state types, and write conflicts at build time. Ships with 11 reusable library skills, a Claude Code plugin, and example pipeline templates.

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

Every other orchestrator in the awesome-claude-code list is a runtime tool - it launches agents, manages sessions, and coordinates execution while agents run. Skillfold is the only compile-time entry in the Orchestrators category. It validates skill references, state types, write conflicts, and cycle exit conditions at build time, then produces plain Markdown files that Claude Code reads natively. Compiles to 11 platform targets: Claude Code, Agent Teams, Cursor, Windsurf, Codex, Copilot, Gemini, Goose, Roo Code, Kiro, and Junie. The README's "Works with Agent Teams" section explains the complementary relationship: skillfold defines what each agent knows and how agents connect at build time, while Agent Teams coordinates live sessions at execution time. When a pipeline has a team flow, the compiler also generates an executable `/run-pipeline` command that orchestrates the agents with a step-by-step execution plan, state table, and Agent tool invocations. There is no process to run, no server to start, and no SDK to integrate.

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
Pure compiler - no hooks, no implicit execution, no persistent state, no
credential storage. Network access only for optional remote skill fetching
(GitHub raw URLs). `GITHUB_TOKEN` read from environment, never stored or logged.
Single runtime dependency (`yaml`). Watch mode recompiles on file change but
does not execute agents.

**3. Documentation and Transparency: 9/10**
README accurately describes all features. Getting-started tutorial, integration
guide for 11 platforms, JSON Schema for IDE autocompletion, VitePress docs site,
CLI reference, config reference. No undocumented side effects.

**4. Functionality and Scope: 9/10**
Does exactly what it claims: compiles YAML config to agent skills for 11
platform targets. Validates skill references, state types, write conflicts,
cycles, and reachability at compile time. Self-hosts its own dev team pipeline.

**5. Repository Hygiene and Maintenance: 9/10**
CI on Node 20 + 22 via GitHub Actions. MIT license in LICENSE and package.json.
Automated npm publish with provenance. Semver policy documented. Active
development with 490+ issues/PRs in 3 days.

### Claude-Code-Specific Checklist

| Check | Answer | Detail |
|---|---|---|
| Defines hooks (stop, lifecycle, or similar)? | No | Pure compiler, no hooks of any kind. |
| Hooks execute shell scripts? | No | N/A - no hooks defined. |
| Commands invoke shell or external tools? | No | `/skillfold` and `/run-pipeline` are Markdown files. |
| Writes persistent local state files? | No | Reads YAML, writes Markdown. No databases, caches, or lockfiles. |
| Reads state to control execution flow? | No | Each compile run is stateless and deterministic. |
| Performs implicit execution without confirmation? | No | User invokes CLI explicitly. `watch` recompiles but does not execute agents. |
| Documents hook or command side effects? | N/A | No hooks or side effects to document. |
| Includes safe defaults? | Yes | Default output is `build/`. `--target claude-code` writes to `.claude/` only when explicitly requested. |
| Includes a clear disable or cancel mechanism? | N/A | Nothing to disable - compiler only runs when invoked. Ctrl-C stops `watch`. |

### Permissions and Side Effects Analysis

**A. Reported / Declared Permissions (from docs):**
- File system: Reads YAML config + SKILL.md files, writes compiled output to `build/` or `.claude/`
- Network: Optional fetch from `raw.githubusercontent.com` for remote skills
- Execution / hooks: None
- APIs / tools: Optional `GITHUB_TOKEN` env var for private repo skill fetching

**B. Likely Actual Permissions (inferred from code):**
- File system: `node:fs/promises` read/write for config parsing and output (confirmed)
- Network: `fetch()` for remote skills only (confirmed)
- Execution / hooks: `node:child_process` used in `run.ts` (spawns `claude` CLI for `skillfold run`) and `backends.ts` (spawns `gh` CLI for state backends). Not used in compile path. (confirmed)
- APIs / tools: `GITHUB_TOKEN` read from `process.env`, never stored (confirmed)

**C. Discrepancies:**
Minor: `node:child_process` is used by the optional `skillfold run` command
(not part of the core compile path). The compile workflow (`npx skillfold`)
does not spawn subprocesses. This should be noted but does not change the
risk profile for the primary use case (compilation).

### Red Flag Scan

- No malware indicators
- No undisclosed execution surfaces
- No unsafe defaults
- No supply-chain risks (single dependency: `yaml`)
- No obfuscated code
- No telemetry or analytics
- No data exfiltration vectors

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
- **Comprehensive docs** - Getting-started tutorial, integration guide for 11
  platforms, JSON Schema for IDE autocompletion, VitePress docs site.
- **Self-hosting** - The project's own dev team pipeline is compiled by
  skillfold, providing a non-trivial real-world usage example.
- **Semver policy** - Documented in CONTRIBUTING.md with automated npm publish
  via GitHub Actions with provenance.
