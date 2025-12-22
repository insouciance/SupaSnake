#!/bin/bash
# Stop Hook: Capture Learnings
# Automatically captures patterns from recent code changes
# This makes the platform learn from every implementation

# Only run if in a git repo
if [[ ! -d ".git" ]]; then
    exit 0  # Not a git repo, skip
fi

# Track when we last captured to avoid duplicates
LAST_CAPTURE_FILE="state/.last_capture_commit"
mkdir -p state

LAST_CAPTURED=$(cat "$LAST_CAPTURE_FILE" 2>/dev/null || echo "")
CURRENT_HEAD=$(git rev-parse HEAD 2>/dev/null)

# Skip if we already captured this commit
if [[ "$LAST_CAPTURED" == "$CURRENT_HEAD" ]]; then
    exit 0
fi

# Check for recent commits (last commit's changes)
CHANGED_FILES=$(git diff --name-only HEAD~1..HEAD 2>/dev/null)
if [[ -z "$CHANGED_FILES" ]]; then
    exit 0  # No changes in last commit, skip
fi

# Check for code files in recent changes
CODE_FILES=$(echo "$CHANGED_FILES" | grep -E '\.(ts|tsx|js|jsx|py|sh)$')
if [[ -z "$CODE_FILES" ]]; then
    exit 0  # No code changes, skip
fi

echo "" >&2
echo "📚 Capturing learnings from recent commit..." >&2

# Get the diff from last commit
DIFF=$(git diff HEAD~1..HEAD 2>/dev/null)

if [[ -z "$DIFF" ]]; then
    exit 0  # No diff content, skip
fi

# Mark as captured
echo "$CURRENT_HEAD" > "$LAST_CAPTURE_FILE"

# Extract patterns (run in background to not slow down workflow)
.venv/bin/python3.14 scripts/extract_code_patterns.py --diff "$DIFF" --files "$CODE_FILES" 2>&1 | sed 's/^/   /' >&2 &

echo "✓ Pattern extraction started (runs in background)" >&2
echo "" >&2

exit 0
