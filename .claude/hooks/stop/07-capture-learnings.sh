#!/bin/bash
# Stop Hook: Capture Learnings
# Automatically captures patterns from code AND documentation changes
# This makes the platform learn from every implementation and decision

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
    # Still update marker to avoid re-checking
    echo "$CURRENT_HEAD" > "$LAST_CAPTURE_FILE"
    exit 0
fi

# Check for code files in recent changes
CODE_FILES=$(echo "$CHANGED_FILES" | grep -E '\.(ts|tsx|js|jsx|py|sh)$')

# Check for documentation files (specs, decisions, constraints, rules, ADRs)
DOC_FILES=$(echo "$CHANGED_FILES" | grep -E '\.(md)$' | grep -E '(spec|decision|constraint|rule|adr|lattice)' -i)

# If neither code nor important docs, just update marker and skip
if [[ -z "$CODE_FILES" && -z "$DOC_FILES" ]]; then
    echo "$CURRENT_HEAD" > "$LAST_CAPTURE_FILE"
    exit 0
fi

echo "" >&2
echo "📚 Capturing learnings from recent commit..." >&2

# Get the diff from last commit
DIFF=$(git diff HEAD~1..HEAD 2>/dev/null)

# Mark as captured (do this before background processes)
echo "$CURRENT_HEAD" > "$LAST_CAPTURE_FILE"

# Extract code patterns if code files changed
if [[ -n "$CODE_FILES" && -n "$DIFF" ]]; then
    echo "   → Extracting code patterns from: $(echo "$CODE_FILES" | wc -l | tr -d ' ') files" >&2
    .venv/bin/python3.14 scripts/extract_code_patterns.py --diff "$DIFF" --files "$CODE_FILES" 2>&1 | sed 's/^/   /' >&2 &
fi

# Extract documentation patterns if doc files changed
if [[ -n "$DOC_FILES" ]]; then
    echo "   → Extracting documentation patterns from: $(echo "$DOC_FILES" | wc -l | tr -d ' ') files" >&2
    # Pass the list of changed doc files to the extractor
    echo "$DOC_FILES" | while read -r doc_file; do
        if [[ -f "$doc_file" ]]; then
            .venv/bin/python3.14 scripts/extract_doc_patterns.py --file "$doc_file" 2>&1 | sed 's/^/   /' >&2 &
        fi
    done
fi

echo "✓ Pattern extraction started (runs in background)" >&2
echo "" >&2

exit 0
