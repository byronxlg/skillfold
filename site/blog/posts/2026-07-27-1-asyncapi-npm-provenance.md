---
title: A valid provenance attestation shipped malware. Here is how.
description: The July 2026 AsyncAPI npm compromise passed trusted publishing and provenance checks. What those checks actually proved, and what they never claimed to.
date: 2026-07-27
tags: [ecosystem]
---

<figure class="fig">
<svg viewBox="0 0 440 214" role="img" aria-labelledby="fig-t fig-d" xmlns="http://www.w3.org/2000/svg">
<title id="fig-t">What the AsyncAPI provenance attestation proved, and what it did not</title>
<desc id="fig-d">The attestation correctly proved the package came from the real repository, the real commit, and the real workflow. It could not prove the commit was authorized, because the workflow itself had been tricked into accepting it.</desc>
<rect x="4" y="6" width="212" height="132" rx="4" fill="#0d1219" stroke="#41b866"/>
<text x="16" y="28" font-family="monospace" font-size="10.5" fill="#41b866">attestation proved</text>
<text x="16" y="52" font-family="monospace" font-size="9.5" fill="#828f9e">real repository</text>
<text x="16" y="65" font-family="monospace" font-size="9.5" fill="#828f9e">real commit SHA</text>
<text x="16" y="86" font-family="monospace" font-size="9.5" fill="#828f9e">real GitHub Actions</text>
<text x="16" y="99" font-family="monospace" font-size="9.5" fill="#828f9e">workflow, real OIDC token</text>
<rect x="224" y="6" width="212" height="132" rx="4" fill="#0d1219" stroke="#e05a51"/>
<text x="236" y="28" font-family="monospace" font-size="10.5" fill="#e05a51">attestation could not prove</text>
<text x="236" y="52" font-family="monospace" font-size="9.5" fill="#828f9e">the commit was authorized</text>
<text x="236" y="65" font-family="monospace" font-size="9.5" fill="#828f9e">by a human maintainer</text>
<text x="236" y="86" font-family="monospace" font-size="9.5" fill="#828f9e">the workflow that ran it</text>
<text x="236" y="99" font-family="monospace" font-size="9.5" fill="#828f9e">had not been tricked</text>
<rect x="4" y="152" width="432" height="52" rx="4" fill="#0d1219" stroke="#29323f"/>
<text x="220" y="174" text-anchor="middle" font-family="monospace" font-size="10.5" fill="#c9d3df">provenance authenticates the pipeline</text>
<text x="220" y="191" text-anchor="middle" font-family="monospace" font-size="10.5" fill="#d9a032">not the intent behind what the pipeline ran</text>
</svg>
<figcaption>npm's trusted publishing worked exactly as designed on July 14, 2026 - and shipped malware anyway.</figcaption>
</figure>

On July 14, 2026, five malicious versions of four `@asyncapi` npm packages
went out carrying fully valid npm trusted publishing signatures. That is
the detail worth sitting with. Trusted publishing and provenance
attestations are the mitigation the package-manager ecosystem has spent the
last two years converging on, and they did exactly what they were designed
to do here. The packages still shipped a credential-stealing implant to
everyone who imported them.

## What happened

Microsoft's Threat Intelligence team
[published the incident writeup](https://www.microsoft.com/en-us/security/blog/2026/07/15/unpacking-asyncapi-npm-supply-chain-compromise-import-time-payload-delivery/)
on July 15, 2026. Five versions across four packages were affected:
`@asyncapi/specs@6.11.2-alpha.1` and `6.11.2`, `@asyncapi/generator@3.3.1`,
`@asyncapi/generator-components@0.7.1`, and
`@asyncapi/generator-helpers@1.1.1`. AsyncAPI's tooling is widely used for
generating code and docs from AsyncAPI specifications, so the blast radius
was every build that pulled a fresh install in the roughly 24 hours the
versions were live.

The entry point was a GitHub Actions workflow triggered on
`pull_request_target`, which runs with the base repository's permissions
and secrets even when it checks out a fork's code. Microsoft's writeup
describes this as placing "the job in the base repository's security
context" while still checking out untrusted code - the standard failure
mode for that trigger, well documented, and still exploitable here. That
exposed the `asyncapi-bot` personal access token, which the attacker used
to push unauthorized commits that then rode the project's own, legitimate
release workflow to npm.

That release workflow used npm trusted publishing: GitHub Actions OIDC
tokens instead of a long-lived npm auth token, with npm issuing a signed
provenance attestation tying each published version to the exact source
commit and workflow run that built it. It is the configuration [npm's own
documentation](https://docs.npmjs.com/trusted-publishers/) recommends, and
none of it failed. Per Microsoft, "the attestations accurately identified
the legitimate repositories, commits, and workflows that created the
packages, even though the triggering commits were unauthorized." The chain
of custody was genuine. The commit at the start of that chain was not one
a human maintainer intended to ship.

The payload itself is worth noting for a second reason: it runs at import
time, when the package is `require`d or imported, rather than during
`npm install`. That means the standard defensive advice to run
`npm install --ignore-scripts` does nothing here - there is no install
script to skip. The loader spawns a detached process that pulls an
encrypted ~8.2 MB second stage from IPFS and launches what Microsoft calls
the Miasma runtime, with command-and-control, persistence, and credential
harvesting.

## What provenance is actually for

Provenance attestations answer one question: did this exact artifact come
from this exact commit, built by this exact workflow, on this exact CI
provider? That is a real, useful, previously-unanswerable question, and
the AsyncAPI incident proves the answer works - the forensic reconstruction
in Microsoft's writeup exists *because* the attestations correctly
recorded which commits and runs produced the malicious tarballs.

What provenance was never designed to answer is whether the commit at the
end of that chain reflects what a maintainer meant to publish. A stolen
PAT and a trusted release pipeline produce an attestation indistinguishable
from a legitimate one, because from the attestation's point of view,
nothing about the pipeline misbehaved. The compromise happened one layer
up, in the trigger that decided which code got to run with the bot's
credentials at all.

That is a narrower, more precise claim than "provenance doesn't work," and
it is the one the incident actually supports.

## Where this connects, and where it stops

skillfold's own lockfile makes a structurally similar promise for skill
and rule sources: a `resolved` commit SHA or exact npm version, plus a
sha256 `integrity` hash computed over the fetched files, checked again on
every `install --frozen` or `check`. That is real - I read `src/lock.ts`
and `src/resolve.ts` to confirm it holds - and it buys the same thing npm's
attestation buys: proof that what is on disk today matches what was
originally pinned, byte for byte, whoever or whatever produced it.

It buys nothing about what was pinned. If a skill or an npm package is
compromised at the exact moment someone runs `skillfold add` or
`skillfold update` against it, the lockfile pins the compromised version
as faithfully as a clean one, hashes it, and reports `ok` on every
subsequent install. This is the same blind spot as npm's OIDC attestation,
for the same structural reason: a cryptographic record of *what got
published and from where* cannot see backward into whether the commit
behind it was the one a human actually meant to ship.

One thing does not carry over directly, and it is worth being precise
about rather than reaching for the scarier-sounding claim: skillfold's npm
resolution runs `npm pack` to download a tarball and extracts it with
`tar` - it never runs `npm install` and never `require`s or executes any
code from the package. So the specific mechanism in this incident, code
that runs at import time and bypasses `--ignore-scripts`, does not touch
skillfold's own fetch path, because skillfold never imports what it fetches
in the first place. What an agent later does with the instructions or
scripts inside a fetched skill is a separate question skillfold's pinning
does not answer either way.

## The takeaway

Trusted publishing and provenance are worth adopting - they closed off
credential theft as an attack path here, and the forensic trail in
Microsoft's writeup only exists because they were in place. But treat them,
and any lockfile that makes similar promises, as answering "has this
changed since I looked at it," not "was this safe when I looked at it."
Those are different questions, and the second one still needs a human to
read the diff before the pipeline runs, rather than trusting the signature
after it does.
