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

**Author Name:** Byron Smith

**Author Link:** https://github.com/byronxlg

**License:** MIT

**Description:**

Compile-time pipeline compiler for multi-agent AI workflows. A single YAML config defines atomic skills, composed agents, typed state schemas, and execution flows with conditional routing - the compiler validates references, types, and write conflicts, then outputs native agent files for 12 platforms including Claude Code, Cursor, Copilot, and Gemini. 859 tests across 168 suites, single runtime dependency.

**Validate Claims:**

```bash
# Install skillfold (single dependency: yaml)
npm install skillfold

# Scaffold a 3-agent pipeline from a library template
npx skillfold init demo --template dev-team
cd demo

# Compile to Claude Code agent layout
npx skillfold --target claude-code

# Inspect the output: each agent file has YAML frontmatter + composed skill sections
ls .claude/agents/
cat .claude/agents/engineer.md

# Compile the same config for Cursor to see cross-platform output
npx skillfold --target cursor
ls .cursor/rules/

# Validate config correctness (checks references, types, cycles)
npx skillfold validate

# Generate an interactive pipeline graph
npx skillfold graph --html > pipeline.html
# Open pipeline.html in a browser to see the execution flow
```

Each step is independent - stop at any point. The key claims to verify: (1) a single YAML config produces agent files for multiple platforms, (2) composed agents contain merged instructions from multiple atomic skills, (3) the validator catches real errors (try misspelling a skill reference in `skillfold.yaml` and re-run `npx skillfold validate`).

**Specific Task(s):**

1. Run the validate claims commands above. Inspect `.claude/agents/engineer.md` to confirm it contains composed sections from multiple atomic skills (code-writing, testing, github-workflow) with YAML frontmatter.

2. Open the generated `pipeline.html` in a browser. Click nodes to see skill composition details and state reads/writes in the sidebar.

3. Try compiling for a different platform: `npx skillfold --target copilot` produces `.github/copilot-instructions.md` and `.github/instructions/*.instructions.md`. Same source config, different output format.

4. Break something on purpose: edit `skillfold.yaml`, change a skill reference to a nonexistent name, and run `npx skillfold validate`. The compiler catches it at build time with a descriptive error.

**Specific Prompt(s):**

After installing (`npm install skillfold`), try these prompts in Claude Code:

Prompt 1 - Scaffold and compile:
"Run `npx skillfold init demo --template dev-team && cd demo && npx skillfold --target claude-code` and then show me the contents of `.claude/agents/engineer.md`. Explain how the atomic skills were composed into this agent file."

Prompt 2 - Cross-platform compilation:
"In the demo directory, run `npx skillfold --target cursor` and then `npx skillfold --target copilot`. Compare the output formats in `.cursor/rules/` and `.github/instructions/` - same source config, different platform output."

Prompt 3 - Pipeline visualization:
"Run `npx skillfold graph --html > pipeline.html` and describe the execution flow shown in the graph. What agents are involved and how do they connect?"

**Additional Comments:**

Skillfold is the only compile-time entry in the Orchestrators category. Every other orchestrator on the list launches agents, manages sessions, or coordinates execution at runtime. Skillfold validates and compiles at build time, then produces plain Markdown files that each platform reads natively. There is no daemon, no server, and no runtime dependency beyond the target platform itself.

Output targets: skill (default SKILL.md), Claude Code (agents + skills + commands), Agent Teams (bootstrap artifacts), Cursor (.cursor/rules/), Windsurf (.windsurf/rules/), Codex (AGENTS.md), Copilot (.github/instructions/), Gemini (.gemini/agents/), Goose (.goosehints), Roo Code (.roo/), Kiro (.kiro/), Junie (.junie/).

The project self-hosts: `skillfold.yaml` in the repo root defines a 7-agent dev team pipeline that compiles the project's own agent skills. 859 tests across 168 suites run with `node:test` (zero test framework dependencies). Single runtime dependency (`yaml`). All shell execution uses `execFile` (not `exec`). SECURITY.md documents every execution surface.

The `--target agent-teams` output is complementary to Claude Code's built-in Agent Teams: skillfold defines what each agent knows and how they connect at build time, Agent Teams coordinates the live sessions.

No network requests except optional remote skill fetching (GitHub raw URLs) and `npx skillfold search` (npm registry). No hooks installed. No telemetry.

---

## Pre-Submission Evaluation (for Byron, not part of the submission)

The awesome-claude-code maintainer runs an automated evaluation using the
`evaluate-repository.md` command against every submission. This section
pre-runs that evaluation against skillfold and documents the results.

### Evaluation Dimensions (scored 1-10 per the rubric)

**1. Code Quality: 9/10**
TypeScript strict mode, ESM modules, consistent conventions across all source
files. 859 tests across 168 suites using `node:test` (zero test framework deps).
Custom error classes with descriptive messages. No `any`, no unnecessary type
assertions.

**2. Security and Safety: 8/10**
Core compiler is pure - no hooks, no implicit execution, no persistent state,
no credential storage. Network access only for optional remote skill fetching
(GitHub raw URLs) and npm registry search. `GITHUB_TOKEN` read from
environment, never stored or logged. Single runtime dependency (`yaml`).
Watch mode recompiles on file change but does not execute agents. The opt-in
`skillfold run` command has a broader surface (spawns `claude` CLI or SDK,
`gh` CLI for backends) but is clearly separated from the compiler and
documented in SECURITY.md. All shell execution uses `execFile` (not `exec`).
The `agentConfig.hooks` pass-through is inert data, documented in SECURITY.md.
The SDK spawner uses `bypassPermissions` for unattended execution - documented
in SECURITY.md with a dedicated "Spawner permission model" section explaining
the two spawner profiles and mitigation via `--dry-run`.

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
CONTRIBUTING.md. Active development with 500+ issues/PRs. SECURITY.md
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

**Overall Score: 8.5/10**

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
- **859 tests** across 168 suites, run with `node:test` (zero test framework
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
