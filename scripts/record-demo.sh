#!/usr/bin/env bash
#
# record-demo.sh - Record the skillfold init-compile-inspect demo path
#
# Runs the full demo sequence and prints output that reads like a terminal
# session. Useful for capturing static output or recording with asciinema.
#
# Usage:
#   ./scripts/record-demo.sh              # run and print to stdout
#   ./scripts/record-demo.sh | tee demo.txt  # capture output to file
#
# To record as an animated SVG:
#   asciinema rec demo.cast -c ./scripts/record-demo.sh
#   svg-term-cli --in demo.cast --out demo.svg --window
#
set -e

DEMO_DIR=""

cleanup() {
  if [ -n "$DEMO_DIR" ] && [ -d "$DEMO_DIR" ]; then
    rm -rf "$DEMO_DIR"
  fi
}

trap cleanup EXIT

DEMO_DIR=$(mktemp -d)

echo "# Skillfold Demo"
echo "# Scaffold a pipeline, compile it, and inspect the output."
echo ""

# Step 1: Initialize from the dev-team template
echo '$ npx skillfold init demo --template dev-team'
npx skillfold init "$DEMO_DIR" --template dev-team 2>&1 | sed "s|$DEMO_DIR|demo|g"
echo ""

# Step 2: Compile to Claude Code agent layout
echo '$ cd demo && npx skillfold --target claude-code'
(cd "$DEMO_DIR" && npx skillfold --target claude-code 2>&1)
echo ""

# Step 3: List the compiled agents
echo '$ ls .claude/agents/'
ls "$DEMO_DIR/.claude/agents/"
echo ""

# Step 4: Show the first 20 lines of the engineer agent
echo '$ head -20 .claude/agents/engineer.md'
head -20 "$DEMO_DIR/.claude/agents/engineer.md"
echo ""

# Step 5: Show the pipeline summary
echo '$ npx skillfold list'
(cd "$DEMO_DIR" && npx skillfold list 2>&1)
