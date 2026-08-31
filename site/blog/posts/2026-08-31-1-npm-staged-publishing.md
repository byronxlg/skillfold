---
title: npm built a pause button for publishing. Most CI still skips it.
description: npm's staged publishing adds a human approval step before a package goes live, and a fresh trusted-publishing compromise shows what that step would catch.
date: 2026-08-31
tags: [ecosystem]
---

On August 28, 2026, ten malicious versions of
`@7nohe/openapi-react-query-codegen` reached the npm registry, spanning
every maintained release line of the package. According to
[Socket's writeup](https://socket.dev/blog/openapi-react-query-codegen-npm-compromise)
published the same day, the cause was a `release.yml` workflow that
triggered on any issue comment containing the text `npm publish`, without
checking who posted it. As Socket put it: "Any GitHub account can publish a
fork's contents under this repository's OIDC identity by commenting
`npm publish` on any pull request."

The attacker used exactly that. They staged malicious preinstall scripts
across separate commit chains in a fork, then triggered the workflow by
comment. The resulting packages published through the project's legitimate
trusted-publishing pipeline, and all ten carried valid npm provenance
attestations. Socket's report is blunt about what that attestation does and
does not mean: "Provenance proves *which workflow* built an artifact; it
does not prove that the workflow only builds trusted source."

This is not a new lesson - the July 2026 AsyncAPI compromise made the same
point when a hijacked `pull_request_target` workflow exposed a maintainer
token and let five malicious versions ship with fully valid provenance (see
[our earlier post](/blog/asyncapi-npm-provenance/)). What's new
this time is that npm now has a specific, shipped answer to this exact
failure mode, and the August 28 incident is a clean test of what it would
have caught.

## What staged publishing actually does

npm's [staged publishing](https://docs.npmjs.com/staged-publishing/) went
generally available per
[GitHub's May 22, 2026 changelog entry](https://github.blog/changelog/2026-05-22-staged-publishing-and-new-install-time-controls-for-npm/).
Instead of `npm publish` making a version installable immediately, a
maintainer runs `npm stage publish` to push a tarball into a review queue.
Someone then inspects it with `npm stage view`, and either approves it with
two-factor authentication (`npm stage approve`) or rejects it. Nothing in
the queue is installable until a human clears it.

Critically, the docs confirm this is not limited to interactive publishing:
"If you use trusted publishing (OIDC) from CI/CD, you can use staged
publishing to submit a package for review before it goes live." A registry
can go further and require it - npm's docs describe a "stage-only"
configuration where `npm publish` from CI is rejected outright and only
`npm stage publish` is accepted, so a compromised or hijacked workflow can
still push a build into the queue, but never straight to installable.

Adoption is opt-in per package, and it requires npm CLI 11.15.0 or newer.
Security researcher Adnan Khan's comment on the feature, quoted in
[InfoQ's August 7, 2026 coverage](https://www.infoq.com/news/2026/08/npm-stage-available/),
frames the target directly: "Publish from CI via OIDC then approve the
package before it goes live for everyone. Shai-Hulud? Denied."

## Would it have caught this one

`@7nohe/openapi-react-query-codegen` was not using staged publishing - the
comment-triggered workflow called `npm publish` directly, and the tarballs
went live the moment the trusted-publishing token signed them. Had the
project instead run `npm stage publish` from that same workflow (or
configured the package as stage-only), the attacker's comment would still
have triggered the build and the same OIDC identity would still have signed
it. But the result would have sat in the review queue instead of reaching
consumers, and the same commit-chain oddities Socket later reconstructed
through source inspection of the archived tarballs - new scripts introduced
ahead of a modified preinstall step - are exactly the kind of thing a
maintainer reviewing a staged tarball before approval is positioned to
catch. That's an inference about the counterfactual, not something Socket's
report claims; the report itself only establishes what happened after
publication, through forensic analysis of the archives, not what staged
publishing would have changed had it been in place beforehand.

## Where skillfold's own guarantee stops

skillfold's `npm:` source resolves a package with `npm pack` at an exact
version, then records that version and a sha256 hash of the resolved
content in `skillfold.lock` (`src/npm.ts`, `src/lock.ts`). Running
`skillfold install --frozen` recomputes that hash and fails if the fetched
content doesn't match the lock (`src/resolve.ts`). That is a reproducibility
guarantee, not a vetting one, and the distinction matters for exactly the
scenario above.

skillfold never checks whether the npm package it's pinning used staged
publishing, and it has no concept of npm provenance attestations at all -
it doesn't fetch or verify them. If `skillfold add npm:some-pkg/skill` or
`skillfold update` resolves to a version that shipped through a compromised
trusted-publishing pipeline, the lockfile will faithfully record that
exact version, hash its exact (malicious) content, and `install --frozen`
will report success on every future run, because success only means "this
matches what we pinned before," not "this was ever safe to pin." The same
is true of skillfold's GitHub source: it pins a commit SHA, which is
reproducible and tamper-evident, but says nothing about whether that commit
was reviewed by anyone before you pointed at it.

That's the honest boundary. skillfold makes drift visible and reversion
possible; it does not, and cannot, verify that a version was ever safe in
the first place. That verification, if it happens at all, has to happen at
the publisher's end - which is exactly the gap staged publishing is built
to close, for the packages that turn it on.
