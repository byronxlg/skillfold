# Blog to-do

Topic pipeline for the blog at `site/blog/`. The weekly workflow
(`.github/workflows/blog-post.yml`) takes the topmost unchecked topic below,
writes it up following `skills/blog-post/SKILL.md`, and opens a PR.

Rules:

- Keep it ordered: most valuable next post at the top of the unchecked list.
- One line per topic: working title, then the search intent it targets.
- When a post ships, check it off and add a line under Shipped with the date
  and file path.
- Add new ideas at whatever position their value deserves, not just the end.
- If the queue empties, refill it with five topics before writing.

Every published post lands under Shipped; that list is how the workflow
avoids re-covering a topic.

## Queue

- [ ] Pin, update, and the difference between install and install --frozen -
  intent: "lockfile skills", "reproducible claude skills", "npm ci equivalent"
- [ ] Auditing what is actually in your .claude/skills directory - intent:
  "what skills do I have installed", "claude skills drift"
- [ ] Sharing a skill set across a team without copying directories - intent:
  "share claude skills with team", "team claude code setup"
- [ ] Publishing a skill on npm so other people can install it by name -
  intent: "publish claude skill", "distribute agent skills", "agentskills map"
- [ ] Keeping personal skills in your dotfiles with global mode - intent:
  "sync claude skills across machines", "claude skills dotfiles"
- [ ] Rules vs skills: which instructions belong in which file - intent:
  "claude rules vs skills", ".claude/rules explained"
- [ ] Catching skill drift in CI before it reaches an agent - intent:
  "claude skills ci", "verify agent config in ci"
- [ ] What a SKILL.md actually needs, and what it does not - intent:
  "SKILL.md format", "how to write an agent skill"
- [ ] Migrating a hand-managed skills directory to a manifest, one skill at a
  time - intent: "adopt skillfold", "manage existing claude skills"

## Shipped

- [x] Your skills directory is undeclared state - 2026-07-25,
  site/blog/posts/2026-07-25-1-your-skills-directory-is-undeclared-state.md
- [x] Composed skills, or how to stop copy-pasting prompts - 2026-07-25,
  site/blog/posts/2026-07-25-2-composed-skills.md
- [x] One manifest, two agents - 2026-07-25,
  site/blog/posts/2026-07-25-3-one-manifest-two-agents.md
