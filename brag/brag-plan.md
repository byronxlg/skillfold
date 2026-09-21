# Brag Plan: Skillfold

## What is this app?
Skillfold is a declarative skill manager for Claude Code, Codex and Cursor: declare skills in
`skillfold.yaml`, pin exact revisions in `skillfold.lock`, install them reproducibly.

## The angle
The README's own argument, shown as a terminal session. No metaphors: the manifest, the
install output, the lockfile line. A developer tool bragging by doing the thing.

## Hook (first 2-3 seconds)
The problem line, verbatim from the README, on an empty dark frame:
"Your .claude/skills directory is state with no source of truth."

## Key moments (the middle)
- The `skillfold.yaml` snippet from the README appears line by line inside a site-style
  terminal window (`cat skillfold.yaml`).
- `skillfold install` is typed at the prompt, then the README's install output lands line by
  line: three `+` rows with the pin in amber, the summary, `lockfile: skillfold.lock`.
- One sentence over the finished terminal: "Commit the lockfile. Every clone gets
  byte-identical skills."

## Outro / punchline
`>_ skillfold` wordmark, the tagline "Your skills, declared. Installed anywhere_", and
`npm install -g skillfold`. Music fades.

## User flow worth showing
Declare (`skillfold.yaml`) -> install (`skillfold install`) -> lockfile written. That is the
whole product loop and it is the centre of the video.

## Tone
- Preset: polished
- Creative direction: a quiet terminal session that speaks for itself
- Interpretation: few scenes, long holds, monospace everywhere, motion limited to fades,
  small rises and typed text. Nothing bounces.

## Format: landscape - 1920x1080
## Duration: 20s

## Visual identity (from the project)
- Background: #0a0e14 (`--bg`), panels #0d1219 (`--bg-2`)
- Lines: #1b232e / #29323f
- Text: #c9d3df (`--ink`), dim #828f9e, faint #57626f
- Accent: #4d8bf5 (blue), #41b866 (green, `+` and ok), #d9a032 (amber, pins)
- Display font: IBM Plex Mono 600 (vendored woff2 from site/assets/fonts)
- Body font: IBM Plex Mono 400/500
- Strongest visual element: the hero terminal window on the landing page (bar with green dot,
  prompt in blue, `+` rows in green, pins in amber)

## Share copy (draft)
Introducing Skillfold: declare your agent skills in one YAML file, pin them in a lockfile,
install them anywhere. Built in TypeScript, one dependency.

## Audio direction
- Role: steady clean bed, sparse professional accents
- Music: happy-beats-business-moves-vol-12-by-ende-dot-app.mp3 (bundled, "steady and clean")
- Music treatment: start at 0, volume 0.30, 0.6s fade in, fade out over the last 1.5s
- Music cue guidance: preset read (109.96 BPM). Strong cues 8.74s (install command lands),
  17.47s (wordmark). Beat grid for the YAML lines 4.39-6.56 and the install rows 9.83-12.02.
- Audio-reactive treatment: subtle; music RMS modulates the terminal window's border glow and
  the background vignette. No waveform or equalizer visuals.
- SFX posture: sparse, polished. Soft key ticks under the typed command, one soft impact when
  the install output lands, one bong on the wordmark.
- Audio-coupled moments: typed `skillfold install`; line-by-line install rows on the beat
  grid; wordmark on a strong cue.
- Restraint rule: no SFX on the YAML lines (reading time), nothing above 0.6 volume, no
  pulsing text.

## Storyboard

### Scene 1 - Hook - 3.5s (0.0-3.5)
Empty `--bg` frame. The README problem line rises in, two lines, Plex Mono 500, ink colour.
`.claude/skills` in accent blue. Holds until 3.2s, fades.
Sequential/interaction: none
Audio intent: the bed starts quietly, nothing else
Audio-coupled idea: none
Music: steady bed, fade in
Transition mood: soft -> Scene 2

### Scene 2 - The manifest - 5.0s (3.5-8.5)
The landing-page terminal window (bar: green dot, "skillfold - declare, pin, install") fades
in. Prompt line `~/project $ cat skillfold.yaml`, then the README YAML block, one line per
beat (4.39, 4.91, 5.34, 6.00, 6.56), verbatim:
  # skillfold.yaml
  skills:
    commit-helper: ./skills/commit-helper
    frontend-design: github:anthropics/skills/skills/frontend-design
    planning: npm:skillfold/planning
Holds from 6.6 to 8.5 so the block reads.
Sequential/interaction: yes, five lines arrive one by one
Audio intent: the bed carries it; no ticks (text reading time)
Audio-coupled idea: beat-grid line reveals
Transition mood: none (same terminal continues) -> Scene 3

### Scene 3 - Install - 6.0s (8.5-14.5)
Same terminal. A new prompt appears and `skillfold install` types out (8.74 strong cue for the
first character, ~0.05s per char). Then the README output, verbatim, one row per beat:
  + commit-helper            ./skills/commit-helper                                  (9.83)
  + frontend-design          github:anthropics/skills/skills/frontend-design -> 8f3a9c1  (10.37)
  + planning                 npm:skillfold/planning -> 2.0.0                          (10.93)
  (blank)
  3 installed, 0 unchanged -> .claude/skills                                          (12.02)
  lockfile: skillfold.lock                                                            (12.55)
`+` green, pins amber, paths dim. Holds to 14.5.
Sequential/interaction: yes, typed command then rows one by one
Audio intent: key ticks under the typing; a soft impact as the first row lands
Audio-coupled idea: typed text; beat-grid rows
Transition mood: soft -> Scene 4

### Scene 4 - The point - 2.9s (14.5-17.4)
Terminal fades out, then a centred line on the empty frame: "Commit the lockfile. Every clone gets
byte-identical skills." Plex Mono 600, ink, `byte-identical` in accent. Settled by 15.0, holds.
Sequential/interaction: none
Audio intent: bed only
Audio-coupled idea: none
Transition mood: soft -> Scene 5

### Scene 5 - Outro - 2.6s (17.4-20.0)
Frame clears. `>_ skillfold` wordmark (blue prompt, ink name) lands on the 17.47 strong cue,
tagline "Your skills, declared. Installed anywhere_" under it, then
`npm install -g skillfold` and `byronxlg.github.io/skillfold` in dim. Holds to the end.
Sequential/interaction: three lines, staggered 0.3s
Audio intent: one bong on the wordmark, music fades out under the hold
Audio-coupled idea: beat-locked wordmark
Transition mood: fade to end

**Music mood for this video:** steady, clean, corporate-adjacent
**Audio summary:** a quiet bed fades in under the hook, the typed command and install rows
give it rhythm, one bell marks the wordmark, and the bed fades out on the CTA.
