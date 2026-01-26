#!/bin/bash
# Pre-Tool-Use Hook: Require Design Integrity Analysis
# Blocks code modifications until consequence analysis is done
# Exit 0 = allow, Exit 2 = block

# Only trigger for Write/Edit tools
TOOL_NAME="$CLAUDE_TOOL_NAME"
TOOL_INPUT="$CLAUDE_TOOL_INPUT"

if [[ "$TOOL_NAME" != "Write" && "$TOOL_NAME" != "Edit" ]]; then
    exit 0  # Allow non-code-modifying tools
fi

# Extract file path from tool input
FILE_PATH=$(echo "$TOOL_INPUT" | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*: *"//' | sed 's/"$//')

# Only check code files (.ts, .tsx, .js, .jsx, .py, .sql)
if [[ ! "$FILE_PATH" =~ \.(ts|tsx|js|jsx|py|sql)$ ]]; then
    exit 0  # Allow non-code files (markdown, json, etc.)
fi

# Check if Design Integrity analysis was done recently
INTEGRITY_FILE="state/.design_integrity_checked"

if [[ -f "$INTEGRITY_FILE" ]]; then
    # Check if file is recent (within last 2 hours = 7200 seconds)
    if [[ "$(uname)" == "Darwin" ]]; then
        # macOS
        FILE_MOD=$(stat -f %m "$INTEGRITY_FILE" 2>/dev/null || echo 0)
    else
        # Linux
        FILE_MOD=$(stat -c %Y "$INTEGRITY_FILE" 2>/dev/null || echo 0)
    fi

    CURRENT_TIME=$(date +%s)
    FILE_AGE=$((CURRENT_TIME - FILE_MOD))

    if [[ $FILE_AGE -lt 7200 ]]; then
        exit 0  # Analysis done recently, allow the code change
    fi
fi

# Block and provide guidance
echo "" >&2
echo "=============================================" >&2
echo "  DESIGN INTEGRITY CHECK REQUIRED" >&2
echo "=============================================" >&2
echo "" >&2
echo "Before modifying code, run consequence analysis" >&2
echo "to prevent breaking existing systems." >&2
echo "" >&2
echo "Attempting to modify: $FILE_PATH" >&2
echo "" >&2
echo "ACTION REQUIRED:" >&2
echo "" >&2
echo "  Use the Design Integrity subagent:" >&2
echo "" >&2
echo "    Task tool parameters:" >&2
echo "    - subagent_type: \"Design Integrity\"" >&2
echo "    - prompt: \"Analyze: [describe your change]\"" >&2
echo "" >&2
echo "The subagent will:" >&2
echo "  1. Identify affected systems (ripple analysis)" >&2
echo "  2. Check all 28 constraints from Constraint Lattice" >&2
echo "  3. Flag risks and dependencies" >&2
echo "  4. Mark analysis complete" >&2
echo "" >&2
echo "After analysis, retry the code change." >&2
echo "=============================================" >&2
echo "" >&2

exit 2  # Block the tool call
