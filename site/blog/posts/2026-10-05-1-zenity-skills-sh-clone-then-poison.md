---
title: Clone a popular skill, wait, then poison it - what Zenity found on skills.sh
description: Zenity Labs found cloned skills on skills.sh that stayed clean until they had installs, then went after credentials. What pinning covers and what it does not.
date: 2026-10-05
tags: [ecosystem]
---

Zenity Labs disclosed a credential-stealing skills campaign around Black
Hat USA 2026, and the mechanism is worth separating from the headline
number. According to [Zenity's Black Hat
recap](https://zenity.io/blog/ai-agent-security-black-hat-recap),
attackers cloned legitimate agent skills, let the copies build a clean
track record, and then inserted instructions to "hunt for SSH keys, cloud
credentials, and other secrets." The skills were distributed through
Vercel's skills.sh registry, and Zenity says there were "well over a
million aggregate installs before Vercel and GitHub removed the listings."

## What Zenity reported

The recap and Zenity's [research
page](https://zenity.io/research/ai-total) for its AI Total service give
these facts, and no more:

- The copies were clean first and malicious later. The point of the delay
  is that a registry's install count and ranking measure past behavior,
  not the current content of the file.
- Removal came "within hours of disclosure," per the recap.
- Beyond the campaign, Zenity's sandbox analysis "turned up dozens of
  additional skills exhibiting malicious or dangerous behavior in public
  registries."
- One skill had been installed more than 250,000 times and, in Zenity's
  words, "stayed undetected for months," climbing into the top 150 skills
  on a popular registry.
- More than 30% of the malicious skills used the agent itself, including
  Claude Code and OpenClaw, as a malware dropper, instructing it to pull
  files from an attacker-controlled endpoint and execute them.
- One skill told the agent to rewrite its own system prompt so it would
  reinstall itself after deletion.

A caution on the numbers: Zenity's own pages do not say whether installs
are unique machines or aggregate counts, and the pages I could reach do
not give a campaign start date. Other outlets repeat a 1.7 million
figure from a press release I could not fetch, so this post does not use
it. "Well over a million aggregate installs" is the vendor's own phrasing.

## Why the order matters

Most scanning happens at one moment: when a skill is submitted, or when
you first read it. A clone-then-poison campaign is built to pass that
moment. The first version is clean, so the review is clean. The harm
arrives in a later edit, to a file that your agent reads as
instructions, not one that runs as code in a sandbox.

That makes the question for a user less "is this skill safe" and more
"is the skill I am running the skill I looked at." Those are different
questions, and only the second one can be answered mechanically.

## Where a lockfile helps

If you install a skill from a git ref, whatever the ref points to today
is what you get. When the ref is a branch, the contents can change
between two installs without you doing anything.

skillfold's behavior here is documented in [the CLI
reference](https://github.com/byronxlg/skillfold/blob/main/docs/cli.md):

- `install` records the exact commit SHA and a sha256 content hash for
  each remote skill in `skillfold.lock`, and reuses an existing pin
  instead of moving it.
- Only `skillfold update`, or editing the source string in the manifest,
  re-resolves a ref. That makes "the skill changed" a deliberate step with
  a visible lockfile diff, not something that happens during a routine
  install.
- `skillfold install --frozen` fails when the manifest and lockfile
  disagree and verifies content hashes, and `skillfold check` verifies
  offline that what is on disk matches the recorded hash.

For this campaign shape, that means a skill you pinned before it was
poisoned stays at the reviewed revision until you run `update`, and at
that point the lockfile shows a new SHA and hash to read before you
commit it. A skill edited in place on disk fails `check`.

```yaml
skills:
  # pinned in skillfold.lock at install time, moves only on update
  some-skill: github:example-owner/some-skills/skills/some-skill@main
```

## What this does not solve

This is the important part, and it is narrower than the headline.

- **It does not tell you the first version was good.** The lockfile
  records what you installed. If you pin a skill that was already
  malicious, you have pinned malware.
- **It does not review the update.** `update` moves the pin and shows
  you a changed hash. Reading the diff of a new skill revision is still
  your job, and a skill is natural-language instruction, which no hash can
  judge.
- **It does not detect typosquats or cloned names.** skillfold resolves
  the exact source string you wrote. If you wrote the clone's path,
  skillfold installs the clone.
- **It does nothing about the agent being the dropper.** Zenity reports
  that over 30% of the malicious skills told the agent to fetch and
  execute files. Whether that works depends on your agent's permissions
  and sandboxing, which skillfold does not configure.
- **It does not cover users who install directly from a registry's
  own installer.** Only skills declared in a manifest are pinned.

## What to take from it

Install counts and rankings are social proof, and the campaign shows they
can be earned by something that was harmless at the time. The durable
defenses are the boring ones: install from a source you named on
purpose, pin it to a revision you read, make changes arrive as diffs, and
limit what a skill's instructions can make an agent do. A lockfile gives
you the second and third of those. The others are on you and your agent's
configuration.
