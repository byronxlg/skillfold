# Blog to-do

Editorial state for the blog at `site/blog/`. The weekly workflow
(`.github/workflows/blog-post.yml`) reads this alongside
`skills/blog-post/SKILL.md`.

The blog is **current-events-first**. Each run scans the beats below for the
week's strongest story and writes about the story, not about skillfold. The
Queue further down is the fallback for weeks with no real news.

## Beats

Sources worth checking every run. Prefer the primary source in each row over
anyone's coverage of it.

| Beat | Where to look |
|---|---|
| Agent skills standard | `agentskills.io`, the spec repo's commits and PRs, new adopting tools |
| Claude Code | the official changelog and release notes |
| Codex / AGENTS.md | OpenAI's Codex release notes, `AGENTS.md` convention changes |
| Skill registries | Anthropic's skill directory, `skills.sh`, other registries: growth, policy, incidents |
| Supply-chain security | Snyk, Unit 42, Cloud Security Alliance, arXiv cs.CR on skills / MCP / agent supply chains |
| MCP | the MCP spec repo and release notes |
| Package managers | npm/pnpm lockfile and provenance changes, trusted publishing, SBOM and SLSA work |
| Adjacent tools | anything managing agent config or distributing skills, including competitors |

The security beat has been the most productive so far: it produces attributed
numbers and primary disclosures, and it connects directly to pinning and
integrity verification without needing a forced angle.

Rules for using a beat:

- Verify from the primary source. Content farms restate each other and their
  numbers drift; see the source-quality rules in the skill.
- A story qualifies only if it is both verifiable and genuinely about
  reproducibility, distribution, or trust in agent config.
- Do not force a connection to skillfold. A quiet week gets an evergreen post
  from the Queue, not a stretched take.
- Do not re-cover a story in Shipped unless the picture materially changed.

## Queue (quiet-week fallback)

Evergreen topics, ordered by value. Take the topmost unchecked one.

- [ ] Pin, update, and the difference between install and install --frozen -
  intent: "lockfile skills", "reproducible claude skills", "npm ci equivalent"
- [ ] Auditing what is actually in your .claude/skills directory - intent:
  "what skills do I have installed", "claude skills drift"
- [ ] Sharing a skill set across a team without copying directories - intent:
  "share claude skills with team", "team claude code setup"
- [ ] Rules vs skills: which instructions belong in which file - intent:
  "claude rules vs skills", ".claude/rules explained"
- [ ] Publishing a skill on npm so other people can install it by name -
  intent: "publish claude skill", "distribute agent skills", "agentskills map"
- [ ] Keeping personal skills in your dotfiles with global mode - intent:
  "sync claude skills across machines", "claude skills dotfiles"
- [ ] Catching skill drift in CI before it reaches an agent - intent:
  "claude skills ci", "verify agent config in ci"
- [ ] What a SKILL.md actually needs, and what it does not - intent:
  "SKILL.md format", "how to write an agent skill"
- [ ] Migrating a hand-managed skills directory to a manifest, one skill at a
  time - intent: "adopt skillfold", "manage existing claude skills"

## Rollouts

Large features awaiting a `release` post. Add a line when one lands; a rollout
post takes priority over the beats that week. Patch releases do not belong
here - they belong in `CHANGELOG.md`.

- (none pending)

## Shipped

Every published post lands here. `ecosystem` lines name the story so the
repeat check can match it.

- [x] Five vendors agreed on a plugin folder. Distribution is still your
  problem. (story: Agent Plugins 1.0.0, published 2026-08-06 by a Technical
  Steering Committee spanning Amazon, Cursor, Microsoft, OpenAI, and Vercel -
  a vendor-neutral `plugin.json` + `skills/` + `mcp.json` folder format for
  packaging Agent Skills and MCP servers together, adopted at launch by
  ChatGPT, Codex, Cursor, GitHub Copilot, Kiro, and VS Code, notably without
  Claude Code, whose own plugin manifest lives at a different path
  (`.claude-plugin/plugin.json`); the spec explicitly leaves dependencies,
  version pinning, registries, and installation out of scope) - 2026-08-24,
  site/blog/posts/2026-08-24-1-agent-plugins-1.0.md
- [x] NVIDIA is signing its agent skills. Here is what a signature buys you
  (story: NVIDIA's May 19, 2026 Technical Blog post on NVIDIA-Verified Agent
  Skills - a publishing pipeline for CUDA-X/AI Blueprint skills combining
  catalog scanning via the open-sourced SkillSpector tool, OpenSSF Model
  Signing signatures, and machine-readable skill cards, motivated by the
  26.1%-vulnerable finding in arXiv:2601.10338) - 2026-08-03,
  site/blog/posts/2026-08-03-1-nvidia-verified-agent-skills.md
- [x] A valid provenance attestation shipped malware. Here is how. (story:
  the July 14, 2026 AsyncAPI npm compromise - a hijacked `pull_request_target`
  workflow exposed the asyncapi-bot PAT, letting an attacker push unauthorized
  commits through the project's legitimate npm trusted-publishing pipeline;
  the resulting five malicious versions carried fully valid provenance
  attestations, per Microsoft Threat Intelligence's 2026-07-15 writeup) -
  2026-07-27, site/blog/posts/2026-07-27-1-asyncapi-npm-provenance.md
- [x] A study mapped 1.4 million agent skills. Most declare no dependencies
  at all. (story: "Skills Are Not Islands" (arXiv:2607.01136, submitted
  2026-07-01) built SkillDepAnalyzer and ran it over 1,434,046 SkillsMP
  skills, finding 99.55% have activation frontmatter but only 1.40% declare
  any dependency-like field, plus transitive exposure to malicious skills,
  dangerous code, axios, and vulnerable MCP services) - 2026-07-25,
  site/blog/posts/2026-07-25-7-agent-skill-supply-chain-study.md
- [x] Microsoft ships stable Agent Skills for .NET and Python
  (story: Microsoft's Agent Framework promoted Agent Skills from
  experimental to stable for .NET on 2026-07-07 and Python on 2026-07-15,
  both built on the agentskills.io SKILL.md spec) - 2026-07-25,
  site/blog/posts/2026-07-25-6-microsoft-agent-skills-dotnet-python.md
- [x] MCP's stateless rewrite ships July 28: what actually changes
  (story: the 2026-07-28 MCP specification revision - stateless protocol
  core, formal Extensions framework, Tasks moved to an extension,
  authorization hardening, and the first formal deprecation/lifecycle
  policy) - 2026-07-25,
  site/blog/posts/2026-07-25-5-mcp-stateless-rewrite.md
- [x] What the skill supply-chain research actually recommends
  (story: Feb-May 2026 agent skill supply-chain disclosures from Snyk, Unit 42,
  Koi Security and Bitdefender, plus the CSA context-poisoning briefing) -
  2026-07-25,
  site/blog/posts/2026-07-25-4-what-the-skill-supply-chain-research-recommends.md
- [x] Your skills directory is undeclared state - 2026-07-25,
  site/blog/posts/2026-07-25-1-your-skills-directory-is-undeclared-state.md
- [x] Composed skills, or how to stop copy-pasting prompts - 2026-07-25,
  site/blog/posts/2026-07-25-2-composed-skills.md
- [x] One manifest, two agents - 2026-07-25,
  site/blog/posts/2026-07-25-3-one-manifest-two-agents.md
