#!/usr/bin/env bash
# Tmux session initialization script
# Place this file in your project root and customize it for your project

# Get the project directory name for the session name
PROJECT_NAME=$(basename "$PWD")
SESSION_NAME="${PROJECT_NAME}"

# Check if session already exists
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "Session '$SESSION_NAME' already exists. Attaching..."
    tmux attach-session -t "$SESSION_NAME"
    exit 0
fi

echo "Creating new session '$SESSION_NAME'..."

# Create new session (detached) with first window
tmux new-session -d -s "$SESSION_NAME" -n editor

# Window 1: Editor (Claude and VSCode)
tmux send-keys -t "$SESSION_NAME:editor" "claude --dangerously-skip-permissions" C-m


# Window 2: Dev
tmux new-window -t "$SESSION_NAME" -n dev
tmux send-keys -t "$SESSION_NAME:dev" "clear" C-m

# Window 3: Git (lazygit)
tmux new-window -t "$SESSION_NAME" -n git
tmux send-keys -t "$SESSION_NAME:git" "lazygit" C-m

# Window 4: VSCode
tmux new-window -t "$SESSION_NAME" -n vscode
tmux send-keys -t "$SESSION_NAME:vscode" "code . -r" C-m

# Select the editor window to start
tmux select-window -t "$SESSION_NAME:editor"

# Attach to the session
tmux attach-session -t "$SESSION_NAME"
