#!/usr/bin/env bash
#
# demo.sh - Self-contained demo of the skillfold compiler pipeline
#
# Scaffolds a dev-team pipeline, compiles it to Claude Code format,
# shows the generated output, and cleans up.
#

set -euo pipefail

DEMO_DIR=""

cleanup() {
  if [ -n "$DEMO_DIR" ] && [ -d "$DEMO_DIR" ]; then
    rm -rf "$DEMO_DIR"
    echo ""
    echo "Cleaned up temp directory."
  fi
}

trap cleanup EXIT

DEMO_DIR="$(mktemp -d)"
echo "=== Skillfold Demo ==="
echo ""
echo "Working directory: $DEMO_DIR"
echo ""

# Step 1: Scaffold a pipeline from the dev-team template
echo "--- Step 1: Scaffold a pipeline ---"
echo ""
npx skillfold init demo --template dev-team --dir "$DEMO_DIR"
cd "$DEMO_DIR/demo"
echo ""

# Step 2: Compile to Claude Code's native agent layout
echo "--- Step 2: Compile to Claude Code format ---"
echo ""
npx skillfold --target claude-code
echo ""

# Step 3: Show the generated directory tree
echo "--- Step 3: Generated output ---"
echo ""
echo ".claude/agents/:"
find .claude/agents -type f | sort
echo ""
echo ".claude/skills/:"
find .claude/skills -type f | sort
echo ""

# Step 4: Display a compiled agent file
echo "--- Step 4: Sample agent (engineer.md, first 30 lines) ---"
echo ""
head -30 .claude/agents/engineer.md
echo ""

# Step 5: Show the team flow graph
echo "--- Step 5: Team flow graph ---"
echo ""
npx skillfold graph
echo ""

echo "=== Demo complete ==="
