#!/usr/bin/env bash
#
# demo.sh - Skillfold end-to-end demo
#
# Scaffolds a pipeline from the dev-team template, compiles it to
# Claude Code agent layout, and shows the output structure.
#
# Usage: ./scripts/demo.sh
#
set -euo pipefail

DEMO_DIR="demo-$$"

echo "=== Skillfold Demo ==="
echo ""

# Step 1: Scaffold a new pipeline from the dev-team template.
# This creates a directory with a skillfold.yaml config and skill directories,
# using the built-in dev-team template (planner, engineer, reviewer with review loop).
echo "--- Step 1: Scaffold a pipeline from the dev-team template ---"
echo ""
echo "$ npx skillfold init $DEMO_DIR --template dev-team"
npx skillfold init "$DEMO_DIR" --template dev-team
echo ""

# Step 2: Compile the pipeline to Claude Code agent layout.
# The --target claude-code flag outputs to .claude/agents/*.md instead of build/.
echo "--- Step 2: Compile to Claude Code agent layout ---"
echo ""
echo "$ cd $DEMO_DIR && npx skillfold --target claude-code"
cd "$DEMO_DIR"
npx skillfold --target claude-code
echo ""

# Step 3: Show the generated output structure.
# Each agent gets a .md file in .claude/agents/ with composed skill instructions.
echo "--- Step 3: Output structure ---"
echo ""
if command -v lsd &>/dev/null; then
  lsd --tree .claude/
elif command -v tree &>/dev/null; then
  tree .claude/
else
  find .claude/ -type f | sort
fi
echo ""

# Step 4: Show a sample agent file.
# The engineer agent composes planning + code-writing + testing skills.
echo "--- Step 4: Sample agent file (.claude/agents/engineer.md) ---"
echo ""
cat .claude/agents/engineer.md
echo ""

# Cleanup
cd ..
rm -rf "$DEMO_DIR"

echo "=== Demo complete ==="
