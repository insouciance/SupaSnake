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

# Check if Design Integrity analysis was done for this task
# Marker is cleared by user-prompt-submit hook on each new prompt
# So existence = analysis done for current task
INTEGRITY_FILE="state/.design_integrity_checked"

if [[ -f "$INTEGRITY_FILE" ]]; then
    exit 0  # Analysis done for this task, allow code changes
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
