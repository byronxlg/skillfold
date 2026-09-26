#!/usr/bin/env bash
# End-to-end: @installed against real CLIs that ship skills in their npm packages
# (@playwright/cli, hyperframes, skillfold) under npm, pnpm, an npm workspace,
# and global mode with an isolated npm prefix. Needs network, npm, pnpm, and a
# build ("npm run build"). Run with "npm run test:e2e".
set -uo pipefail
export NODE_NO_WARNINGS=1
WT=$(cd "$(dirname "$0")/.." && pwd)
SF="node $WT/dist/cli.js"
ROOT=$(mktemp -d "${TMPDIR:-/tmp}/skillfold-e2e.XXXXXX")
export SKILLFOLD_CACHE=$ROOT/cache
trap 'rm -rf "$ROOT"' EXIT

pass=0; fail=0
ok()   { echo "PASS: $*"; pass=$((pass+1)); }
bad()  { echo "FAIL: $*"; fail=$((fail+1)); }
expect_ok()   { local d="$1"; shift; if "$@" >"$ROOT/out" 2>&1; then ok "$d"; else bad "$d"; cat "$ROOT/out"; fi; }
expect_fail() { local d="$1"; shift; if "$@" >"$ROOT/out" 2>&1; then bad "$d (exited 0)"; cat "$ROOT/out"; else ok "$d"; fi; }
out_has() { if grep -qE -- "$2" "$ROOT/out"; then ok "$1"; else bad "$1"; cat "$ROOT/out"; fi; }
same_file() { if cmp -s "$2" "$3"; then ok "$1"; else bad "$1: $2 != $3"; fi; }

MANIFEST='targets: [claude, codex, cursor]
skills:
  playwright-cli: npm:@playwright/cli/skills/playwright-cli@installed
  hyperframes-cli: npm:hyperframes/dist/skills/hyperframes-cli@installed
  skillfold-cli: npm:skillfold/skillfold-cli@installed
'

verify_content() { # dir label
  local d=$1 l=$2
  for layout in .claude/skills .agents/skills .cursor/skills; do
    # Installed SKILL.md has its frontmatter name rewritten to the manifest name; compare bodies.
    diff <(grep -v '^name:' "$d/node_modules/@playwright/cli/skills/playwright-cli/SKILL.md") \
         <(grep -v '^name:' "$d/$layout/playwright-cli/SKILL.md") >/dev/null \
      && ok "$l: playwright-cli body matches node_modules in $layout" \
      || bad "$l: playwright-cli body differs in $layout"
  done
  diff -r "$d/node_modules/hyperframes/dist/skills/hyperframes-cli" "$d/.claude/skills/hyperframes-cli" -x SKILL.md >/dev/null \
    && ok "$l: hyperframes-cli supporting files match" || bad "$l: hyperframes-cli supporting files differ"
}

run_pm() { # pm
  local pm=$1 d=$ROOT/$1
  echo; echo "=== $pm project ==="
  mkdir -p "$d"; cd "$d" || exit 1
  git init -q .
  echo '{"name":"app","version":"1.0.0","private":true}' > package.json
  if [ "$pm" = npm ]; then
    npm install -D --silent @playwright/cli@0.1.18 hyperframes@0.8.74 skillfold@2.5.0 >/dev/null 2>&1
  else
    pnpm add -D @playwright/cli@0.1.18 hyperframes@0.8.74 skillfold@2.5.0 >/dev/null 2>&1
  fi
  printf '%s' "$MANIFEST" > skillfold.yaml

  expect_ok "$pm: install" $SF install
  grep -q 'resolved: npm:@playwright/cli/skills/playwright-cli@0.1.18' skillfold.lock && ok "$pm: playwright pinned 0.1.18" || bad "$pm: playwright pin"
  grep -q 'resolved: npm:hyperframes/dist/skills/hyperframes-cli@0.8.74' skillfold.lock && ok "$pm: hyperframes pinned 0.8.74" || bad "$pm: hyperframes pin"
  grep -q 'resolved: npm:skillfold/skillfold-cli@2.5.0' skillfold.lock && ok "$pm: skillfold pinned 2.5.0" || bad "$pm: skillfold pin"
  grep -q 'source: npm:skillfold/skillfold-cli@installed' skillfold.lock && ok "$pm: lock keeps @installed source" || bad "$pm: lock source"
  verify_content "$d" "$pm@old"
  local old_hash; old_hash=$(shasum .claude/skills/playwright-cli/SKILL.md .claude/skills/hyperframes-cli/SKILL.md)
  expect_ok "$pm: check in sync" $SF check
  expect_ok "$pm: install --frozen in sync" $SF install --frozen

  # Bump every dependency the way Dependabot would; skillfold.lock untouched.
  if [ "$pm" = npm ]; then
    npm install -D --silent @playwright/cli@0.1.21 hyperframes@0.8.77 skillfold@2.6.0 >/dev/null 2>&1
  else
    pnpm add -D @playwright/cli@0.1.21 hyperframes@0.8.77 skillfold@2.6.0 >/dev/null 2>&1
  fi
  expect_fail "$pm: check fails after bump" $SF check
  out_has "$pm: check names playwright drift" 'follows @playwright/cli@installed: 0.1.21 is installed \((package-lock.json|pnpm-lock.yaml)\) but the lockfile pins 0.1.18'
  out_has "$pm: check names hyperframes drift" 'follows hyperframes@installed: 0.8.77 is installed'
  out_has "$pm: check names skillfold drift" 'follows skillfold@installed: 2.6.0 is installed'
  $SF list > "$ROOT/out" 2>&1
  out_has "$pm: list shows stale" 'playwright-cli .* 0.1.18 +stale'
  expect_fail "$pm: install --frozen fails after bump" $SF install --frozen
  out_has "$pm: frozen message" 'lockfile pins .* but .* is installed'

  expect_ok "$pm: install re-pins" $SF install
  grep -q '@0.1.21' skillfold.lock && grep -q '@0.8.77' skillfold.lock && grep -q 'skillfold-cli@2.6.0' skillfold.lock \
    && ok "$pm: lock re-pinned to new versions" || bad "$pm: lock re-pin"
  verify_content "$d" "$pm@new"
  [ "$old_hash" != "$(shasum .claude/skills/playwright-cli/SKILL.md .claude/skills/hyperframes-cli/SKILL.md)" ] \
    && ok "$pm: installed skill content changed with the version" || bad "$pm: content unchanged after re-pin"
  expect_ok "$pm: check in sync after re-pin" $SF check
  expect_ok "$pm: install --frozen after re-pin" $SF install --frozen
  git -c user.email=t@t -c user.name=t add -A >/dev/null 2>&1; git -c user.email=t@t -c user.name=t commit -qm lock >/dev/null 2>&1

  # Fresh clone: no node_modules. check reads the lockfile; frozen install downloads exact versions.
  rm -rf node_modules .claude .agents .cursor
  expect_ok "$pm: install --frozen on a fresh clone (no node_modules)" $SF install --frozen
  expect_ok "$pm: check on a fresh clone" $SF check
  git status --porcelain skillfold.lock | grep -q . && bad "$pm: frozen install changed the lock" || ok "$pm: lock untouched by frozen install"
}

run_pm npm
run_pm pnpm

echo; echo "=== npm workspace ==="
W=$ROOT/ws; mkdir -p "$W/packages/app"; cd "$W" || exit 1
git init -q .
echo '{"name":"root","private":true,"workspaces":["packages/*"]}' > package.json
echo '{"name":"app","version":"1.0.0","devDependencies":{"@playwright/cli":"0.1.20"}}' > packages/app/package.json
npm install --silent >/dev/null 2>&1
cd packages/app
printf 'skills:\n  playwright-cli: npm:@playwright/cli/skills/playwright-cli@installed\n' > skillfold.yaml
expect_ok "workspace: install from a package dir" $SF install
grep -q '@0.1.20' skillfold.lock && ok "workspace: pinned the root lockfile version 0.1.20" || bad "workspace pin"
$SF check > "$ROOT/out" 2>&1; out_has "workspace: check ok" '^ok:'

echo; echo "=== not a dependency ==="
N=$ROOT/nodep; mkdir -p "$N"; cd "$N" || exit 1; git init -q .
printf 'skills:\n  playwright-cli: npm:@playwright/cli/skills/playwright-cli@installed\n' > skillfold.yaml
expect_fail "nodep: install fails" $SF install
out_has "nodep: clear message" 'needs @playwright/cli as a dependency of this project'

echo; echo "=== init in a project that depends on skillfold ==="
I=$ROOT/init; mkdir -p "$I"; cd "$I" || exit 1; git init -q .
echo '{"name":"app","version":"1.0.0","private":true}' > package.json
npm install -D --silent skillfold@2.6.0 >/dev/null 2>&1
expect_ok "init: runs" $SF init
grep -q 'skillfold: npm:skillfold/skillfold-cli@installed' skillfold.yaml && ok "init: declares @installed" || bad "init: manifest"
[ -f skills/hello-skillfold/SKILL.md ] && ok "init: example skill scaffolded" || bad "init: example skill missing"
expect_ok "init: install" $SF install
grep -q 'skillfold-cli@2.6.0' skillfold.lock && ok "init: pinned to the dependency 2.6.0" || bad "init: pin"

echo; echo "=== global mode (isolated npm prefix and home) ==="
G=$ROOT/global; mkdir -p "$G"
export npm_config_prefix=$G/prefix HOME=$G/home XDG_CONFIG_HOME=$G/home/.config CODEX_HOME=$G/home/.codex
mkdir -p "$HOME"
TGZ=$(cd "$WT" && npm pack --silent --pack-destination "$ROOT" 2>/dev/null | tail -1)
npm install -g --silent "$ROOT/$TGZ" @playwright/cli@0.1.19 >/dev/null 2>&1
GSF=$G/prefix/bin/skillfold
[ -x "$GSF" ] && ok "global: this build installed globally" || bad "global: install"
SELF=$($GSF --version)
expect_ok "global: init -g" $GSF init -g
grep -q 'npm:skillfold/skillfold-cli@installed' "$XDG_CONFIG_HOME/skillfold/skillfold.yaml" && ok "global: init declares @installed" || bad "global: init"
expect_ok "global: add playwright @installed" $GSF add -g npm:@playwright/cli/skills/playwright-cli@installed
grep -q "skillfold-cli@$SELF" "$XDG_CONFIG_HOME/skillfold/skillfold.lock" && ok "global: skillfold skill pinned to the global CLI $SELF" || bad "global: self pin"
grep -q '@0.1.19' "$XDG_CONFIG_HOME/skillfold/skillfold.lock" && ok "global: playwright pinned to global 0.1.19" || bad "global: playwright pin"
[ -f "$HOME/.claude/skills/playwright-cli/SKILL.md" ] && ok "global: installed into ~/.claude/skills" || bad "global: skill dir"
expect_ok "global: check -g" $GSF check -g
npm install -g --silent @playwright/cli@0.1.21 >/dev/null 2>&1
expect_fail "global: check -g fails after global upgrade" $GSF check -g
out_has "global: drift names the global install" "follows @playwright/cli@installed: 0.1.21 is installed \\(.*/prefix/lib/node_modules/@playwright/cli\\)"
expect_ok "global: install -g re-pins" $GSF install -g
grep -q '@0.1.21' "$XDG_CONFIG_HOME/skillfold/skillfold.lock" && ok "global: re-pinned 0.1.21" || bad "global: re-pin"
expect_ok "global: check -g after re-pin" $GSF check -g
# A different CLI (npx-style, the worktree build) runs against the same config: warn about the mismatch.
printf '%s\n' "skills:" "  skillfold-cli: npm:skillfold/skillfold-cli@2.5.0" > "$XDG_CONFIG_HOME/skillfold/skillfold.yaml"
$GSF install -g > "$ROOT/out" 2>&1
out_has "global: warns when a fixed skillfold pin differs from the CLI" "pinned to skillfold 2.5.0 but this CLI is $SELF; declare it as npm:skillfold/skillfold-cli@installed"

echo; echo "passed: $pass  failed: $fail"
[ "$fail" -eq 0 ]
