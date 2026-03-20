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

Compile-time pipeline compiler that turns YAML config into Claude Code agents. Atomic skills compose into agents, team flows define typed execution graphs with conditional routing and parallel map, and `--target claude-code` compiles everything to `.claude/agents/*.md` with no runtime or daemon. Single dependency, 322 tests.

**Validate Claims:**

```bash
npx skillfold init demo --template dev-team && cd demo && npx skillfold --target claude-code && ls .claude/agents/ && head -20 .claude/agents/engineer.md
```

This scaffolds a three-agent pipeline, compiles it to Claude Code agent layout, and shows that each agent file contains composed skill instructions with YAML frontmatter.

**Specific Task(s):**

Run the command above and inspect the compiled agent files in `.claude/agents/`. Each file contains composed skill instructions from multiple atomic skills, with YAML frontmatter.

**Specific Prompt(s):**

Install the skillfold plugin:

```bash
npm install skillfold
```

Then tell Claude Code: "Use /skillfold to compile the pipeline and show me the generated agents." After compiling with `--target claude-code`, a `/run-pipeline` slash command is generated that orchestrates the compiled agents.

**Additional Comments:**

Every other orchestrator in the awesome-claude-code list is a runtime tool - it launches agents, manages sessions, and coordinates execution while agents run. Skillfold is the only compile-time tool in the category. It validates skill references, state types, write conflicts, and cycle exit conditions at build time, then produces plain Markdown files that Claude Code reads natively. When a pipeline has a team flow, the compiler also generates an executable `/run-pipeline` command that orchestrates the agents with a step-by-step execution plan, state table, and Agent tool invocations. There is no process to run, no server to start, and no SDK to integrate. The compiler has 322 tests, a single dependency (yaml), and runs on Node 20+.

---

## Evaluator Context (for Byron, not part of the submission)

The awesome-claude-code maintainer runs an automated evaluation using the
`evaluate-repository.md` command against every submission. Understanding the
scoring criteria helps confirm Skillfold is ready.

### Scoring dimensions

| Dimension | What it checks |
|---|---|
| Code quality | Clean structure, type safety, test coverage |
| Security / safety | Hooks, implicit execution, persistent state, credential handling |
| Documentation / transparency | README, inline docs, license clarity |
| Functionality / scope | Does it solve a real problem, breadth of features |
| Repo hygiene | CI, conventional structure, no dead code or secrets |

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
- **322 tests** across 58 suites, run with `node:test` (zero test framework
  dependencies).
- **MIT license**, clearly stated in LICENSE and package.json.
- **CI on Node 20 + 22** via GitHub Actions, with `--check` flag for verifying
  compiled output is current.
- **Comprehensive docs** - Getting-started tutorial, integration guide for 5
  platforms, JSON Schema for IDE autocompletion, inline JSDoc on all exports.
