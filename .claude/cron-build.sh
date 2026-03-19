#!/bin/bash
set -euo pipefail

# Ensure cron has a usable environment
export HOME="/Users/byron"
export PATH="/Users/byron/.local/bin:/Users/byron/.bun/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

PROJECT_DIR="/Users/byron/repos/skillfold"
CLAUDE="/Users/byron/.local/bin/claude"
LOG_DIR="$PROJECT_DIR/.claude/logs"
SCRIPT_PATH="$PROJECT_DIR/.claude/cron-build.sh"
CRON_SCHEDULE="*/20 * * * *"
CRON_MARKER="# skillfold-build"

install_cron() {
  local cron_line="$CRON_SCHEDULE $SCRIPT_PATH >> $LOG_DIR/cron-build.log 2>&1 $CRON_MARKER"
  local existing
  existing=$(crontab -l 2>/dev/null || true)

  if echo "$existing" | grep -qF "$CRON_MARKER"; then
    echo "Cron job already installed. Updating..."
    existing=$(echo "$existing" | grep -vF "$CRON_MARKER")
  fi

  echo "${existing:+$existing
}$cron_line" | crontab -
  echo "Cron job installed: $CRON_SCHEDULE"
}

uninstall_cron() {
  local existing
  existing=$(crontab -l 2>/dev/null || true)

  if ! echo "$existing" | grep -qF "$CRON_MARKER"; then
    echo "No cron job found to remove."
    return
  fi

  echo "$existing" | grep -vF "$CRON_MARKER" | crontab -
  echo "Cron job removed."
}

case "${1:-run}" in
  install)
    mkdir -p "$LOG_DIR"
    install_cron
    exit 0
    ;;
  uninstall)
    uninstall_cron
    exit 0
    ;;
  run)
    ;;
  *)
    echo "Usage: $0 {run|install|uninstall}"
    exit 1
    ;;
esac

mkdir -p "$LOG_DIR"
cd "$PROJECT_DIR"

ALLOWED_TOOLS="Read,Write,Edit,Glob,Grep,Bash(gh:*),Bash(git:*),Bash(npm:*),Bash(npx:*),Bash(ls:*),Bash(mkdir:*),Agent"

TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')

echo "=== $TIMESTAMP Starting build run ==="
"$CLAUDE" --print \
  --allowedTools "$ALLOWED_TOOLS" \
  -n "skillfold-build-$TIMESTAMP" \
  "/build"
EXIT_CODE=$?
echo "=== $(date '+%Y-%m-%d_%H-%M-%S') Finished build run (exit: $EXIT_CODE) ==="
exit $EXIT_CODE
