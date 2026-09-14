---
title: Claude Code can score whether a plugin helps. It doesn't ask which copy you ran.
description: Claude Code's new plugin eval command measures a plugin's effect with a no-plugin baseline and gates CI on it - but the score never records which revision produced it.
date: 2026-09-14
tags: [ecosystem]
---

Testing a Claude Code plugin has meant one thing so far: load it with
`--plugin-dir` and try it. That tells you the plugin can work. It says
nothing about how often it works, whether a rubric change or a new model
quietly broke it, or whether the plugin is doing anything at all versus
Claude just being capable enough to get there on its own.

Claude Code 2.1.269, shipped
[September 11, 2026 per the official changelog](https://code.claude.com/docs/en/changelog),
closes that gap:

> Added `claude plugin eval`: run a plugin's eval suite against Claude Code
> and get scored, reproducible results (JSON + HTML report); see
> `claude plugin eval --help`

## What it actually measures

An eval suite lives in an `evals/` directory inside the plugin. Each case is
a subdirectory holding a `prompt.md` - a realistic request a user might type
- and one or more graders. The
[plugin evals documentation](https://code.claude.com/docs/en/plugin-evals)
lists six grader types: `regex`, `tool_used`, `tool_order`, and
`file_exists` are computed from the transcript and cost nothing; `llm` and
`baseline` call a judge model and add to the run's cost. A grader can check
that a specific skill fired, that a file came out matching a pattern, or
that a second model's rubric verdict was PASS.

The part that makes the score mean something is the baseline. By default
every case runs twice: once with the plugin loaded, once without. The
difference between the two scores, written `Δ`, is what the plugin actually
contributed. The docs are explicit about what a tie means: "If a case
scores 1.0 both with and without the plugin, the plugin isn't what made it
pass." Without that control, a high score could just mean the prompt was
easy.

That doubles the cost of a run, so `claude plugin eval init` exists to
generate a first suite for you: it reads the plugin, proposes prompts that
should and shouldn't trigger it, drafts graders, and pilots each one before
writing the case files.

## Built to sit in CI, not just a terminal

The design clearly targets automation, not one-off checks. `claude plugin
eval` writes a versioned `aggregate-result.json` with a `schemaVersion` field
so a gating script doesn't break when new fields get added. A `--threshold`
flag (default `1.0`) fails the run - and the process exit code - when any
case scores below it. A `--trust-plugin` flag skips the interactive trust
prompt that would otherwise stall a non-interactive job. And the docs
specifically warn to pin `--model` in CI, "so a model rollout isn't mistaken
for a plugin regression" - a sign the team building this expects it to run
on every PR, repeatedly, against a moving model target.

That's a real and useful thing to have. A plugin's skill descriptions can
degrade in ways nothing else catches - a rubric that used to trigger cleanly
stops firing after a wording change, or a new model interprets a prompt
differently than the one the suite was written against. Eval turns that from
a vague feeling into a number with a sign.

## What the score doesn't tell you

Read the security section of the same doc closely and the boundary is
explicit: `claude plugin eval` "loads the target plugin's skills and hooks
and runs its eval suite on your machine, as you." It evaluates whatever is
on disk at the plugin's path right now - a checkout, an installed copy, a
`--plugin-dir` folder - not a specific pinned revision of it. The JSON
result records `costUsd`, `durationSeconds`, and `claudeVersion` - the
version of Claude Code that ran the suite - but nothing in the documented
schema identifies which commit or version of the *plugin* produced the
score.

That distinction matters more in CI than at your terminal. Two developers
can each get `Δ +0.67` on the same eval suite while running two different
uncommitted edits to the plugin, and both runs are honestly reporting what
they measured: the plugin, whichever one was on disk, helped. Nothing in the
report says which plugin that was. A CI gate built on `--threshold` proves
the code sitting in that job's checkout passed the suite at that moment. It
does not by itself prove that the copy a teammate has installed, or the copy
that shipped to a marketplace, is the one that earned the score - that's a
separate claim, and it needs a separate mechanism to back it: a version
pinned in a manifest, and a hash checked against what's actually installed.

## Where a lockfile fits, and where it stops

This is the piece skillfold is built for and nothing else in this post is:
proving that an installed skill's bytes are the exact ones a manifest
declared. `skillfold check` and `install --frozen` compare a sha256 hash of
what's on disk against the hash recorded in `skillfold.lock`
(`src/install.ts`), and fail loudly on any mismatch (`docs/cli.md`). That
answers "is this the revision we pinned," which a plugin eval score never
claims to answer on its own.

But a lockfile has the opposite blind spot from an eval score. Content
integrity says the bytes are unchanged; it says nothing about whether those
bytes do anything useful. A skill can pass every hash check in
`skillfold check` while its description never triggers on real phrasing, or
its instructions produce the wrong output every time - `skillfold` has no
way to run a session, invoke an agent, or grade a transcript, and isn't
trying to. Pinning and evaluating are answers to different questions -
"is this the code we agreed on" and "does that code work" - and a plugin
that's rigorously eval-gated in CI can still be silently swapped for an
unpinned edit the moment it leaves that job, with nothing in either tool
noticing on its own.
