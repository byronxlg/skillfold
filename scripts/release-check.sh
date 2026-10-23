#!/usr/bin/env bash
# A pull request that changes what ships in the npm package must bump package.json's
# version and add a matching CHANGELOG.md section, so the merge publishes it (publish.yml).
# Usage: scripts/release-check.sh <base-ref>
set -euo pipefail
base=${1:?usage: release-check.sh <base-ref>}

changed=$(git diff --name-only "$base"...HEAD -- src library skillfold.schema.json \
  | grep -v '\.test\.ts$' | grep -v '^src/testutil\.ts$' || true)
new=$(node -p "require('./package.json').version")
old=$(git show "$base:package.json" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version")

if [ -z "$changed" ] && [ "$new" = "$old" ]; then
  echo "release check: no package change, nothing to publish"
  exit 0
fi
if [ "$new" = "$old" ]; then
  echo "release check: these files ship in the npm package but package.json is still $old:" >&2
  echo "$changed" | sed 's/^/  /' >&2
  echo "Bump the version (CONTRIBUTING.md, Versioning) and add a '## X.Y.Z' CHANGELOG.md section." >&2
  exit 1
fi
if ! grep -qx "## $new" CHANGELOG.md; then
  echo "release check: package.json is $new but CHANGELOG.md has no '## $new' section" >&2
  exit 1
fi
if grep -qx "## Unreleased" CHANGELOG.md; then
  echo "release check: CHANGELOG.md still has '## Unreleased'; fold it into '## $new'" >&2
  exit 1
fi
echo "release check: $old -> $new, publishes on merge"
