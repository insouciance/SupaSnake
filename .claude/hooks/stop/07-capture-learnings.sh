#!/bin/bash
# Stop Hook: Capture Learnings
# Automatically captures patterns from recent code changes
# This makes the platform learn from every implementation

# Only run if in a git repo
if [[ ! -d ".git" ]]; then
    exit 0  # Not a git repo, skip
fi

# Check for staged changes
STAGED_FILES=$(git diff --cached --name-only 2>/dev/null)
if [[ -z "$STAGED_FILES" ]]; then
    exit 0  # No staged changes, skip
fi

# Check for code files in staged changes
CODE_FILES=$(echo "$STAGED_FILES" | grep -E '\.(ts|tsx|js|jsx|py|cpp|go|rs)$')
if [[ -z "$CODE_FILES" ]]; then
    exit 0  # No code changes, skip
fi

echo "" >&2
echo "📚 Capturing learnings from code changes..." >&2

# Get the diff
DIFF=$(git diff --cached 2>/dev/null)

if [[ -z "$DIFF" ]]; then
    exit 0  # No diff content, skip
fi

# Extract patterns (run in background to not slow down workflow)
python3 scripts/extract_code_patterns.py --diff "$DIFF" --files "$CODE_FILES" 2>&1 | sed 's/^/   /' >&2 &

echo "✓ Pattern extraction started (runs in background)" >&2
echo "" >&2

exit 0
