# Hyperframes Composition Brief: Skillfold

## Objective
Create a short launch-style brag video for Skillfold.

## Output
- Composition directory: `brag/composition/`
- Rendered video: `brag/brag.mp4`
- Format: landscape - 1920x1080
- Duration: 20 seconds

## Source Material
- Project root: repository root (skillfold)
- Primary files read: README.md, site/index.html, site/assets/base.css, docs/getting-started.md
- Product name: Skillfold
- Tagline / strongest claim: "Your skills, declared. Installed anywhere_" /
  "Anyone who clones the repo runs skillfold install and gets byte-identical skills."
- Key UI or visual moment to recreate: the landing-page hero terminal window
- Copy that must appear verbatim:
  - "Your .claude/skills directory is state with no source of truth."
  - the README `skillfold.yaml` snippet (5 lines)
  - the README `skillfold install` console output (6 lines)
  - "npm install -g skillfold"

## Creative Direction
- Tone preset: polished
- Creative direction: a quiet terminal session that speaks for itself
- Interpretation: long holds, fades and small rises only, typed text as the only "fast" motion
- Angle: the README's own argument as a terminal session; the product brags by doing the thing
- Hook: the README problem line on an empty frame
- Outro / punchline: wordmark, tagline, install command, site URL
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals
  - Unrelated visual redesign

## Visual Identity
- Background: #0a0e14, panel #0d1219, lines #1b232e / #29323f
- Text: #c9d3df; dim #828f9e; faint #57626f
- Accent: #4d8bf5; green #41b866; amber #d9a032
- Display font: Plex Mono 600 (local woff2, @font-face in file)
- Body font: Plex Mono 400 / 500
- Visual references from the project: `.term`, `.term-bar`, `.c-p`, `.c-key`, `.c-add`,
  `.c-pin`, `.c-dim` styles in site/index.html; `.brand` wordmark in base.css

## Storyboard
Use the storyboard in `brag/brag-plan.md` as the creative contract.

Scene summary:
1. Hook - 3.5s - README problem line
2. The manifest - 5.0s - terminal, `cat skillfold.yaml`, five YAML lines on the beat grid
3. Install - 6.0s - typed `skillfold install`, six output rows on the beat grid
4. The point - 2.9s - "Commit the lockfile. Every clone gets byte-identical skills."
5. Outro - 2.6s - wordmark on the 17.47 cue, tagline, install command, URL

## Audio
- Audio role: steady clean bed, sparse accents
- Audio arc: fade in under the hook, rhythm from typing and rows, bell on the wordmark, fade out
- Music: assets/music/happy-beats-business-moves-vol-12-by-ende-dot-app.mp3
- Music treatment: volume 0.30, 0.6s fade in, fade out 18.5-20.0 via a volume automation lane
- Music cue guidance: bundled preset (109.96 BPM). Strong cues 8.74 (typing starts), 17.47
  (wordmark). Beat grid 4.39, 4.91, 5.34, 6.00, 6.56 (YAML lines) and 9.83, 10.37, 10.93,
  12.02, 12.55 (install rows).
- Audio-reactive treatment: subtle; RMS drives the terminal border glow and a background
  vignette. Extracted with hyperframes-creative extract-audio-data.py at 30 fps.
- Audio-coupled moments:
  - Scene 3 typed command - randomized keypress ticks (seeded), volume 0.35
  - Scene 3 first row - impact/impactSoft_medium_001 at 9.80, volume 0.5
  - Scene 5 wordmark - interface/bong_001 at 17.45, volume 0.55
- SFX selection guidance: low high-frequency-risk files only (sfx-analysis.md)
- SFX analysis guidance: brag skill assets/sfx/sfx-analysis.md
- Exact SFX choice: as above, chosen against the implemented animation
- Audio files: copied into `brag/composition/assets/`

## Hyperframes Instructions
Standalone composition, one paused GSAP timeline registered after fonts are ready, root
`data-duration="20"`, GSAP loaded from a local vendored copy so the render is offline.
Run `npx hyperframes check` before render.
