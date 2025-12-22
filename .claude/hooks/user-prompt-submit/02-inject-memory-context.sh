#!/bin/bash
# UserPromptSubmit Hook: Inject Memory Context + Handoff
# Loads handoff from previous session + relevant memories

USER_PROMPT=$(cat)

# Only inject for substantial prompts (>20 chars)
if [[ ${#USER_PROMPT} -lt 20 ]]; then
    echo "$USER_PROMPT"
    exit 0
fi

INJECTION=""

# Check for active handoff from previous session
HANDOFF_FILE="state/handoff/current.json"
if [[ -f "$HANDOFF_FILE" ]]; then
    HANDOFF=$(cat "$HANDOFF_FILE")
    TASK=$(echo "$HANDOFF" | jq -r '.task // empty')
    STATUS=$(echo "$HANDOFF" | jq -r '.status // empty')
    DOMAIN=$(echo "$HANDOFF" | jq -r '.domain // empty')
    NEXT_ACTION=$(echo "$HANDOFF" | jq -r '.next_action // empty')
    FILES=$(echo "$HANDOFF" | jq -r '.files_to_load[]? // empty' | tr '\n' ', ')
    DECISIONS=$(echo "$HANDOFF" | jq -r '.decisions_made[]? // empty' | head -3)

    if [[ -n "$TASK" ]]; then
        INJECTION="[SESSION HANDOFF - Resuming Previous Work]
Task: $TASK
Status: $STATUS
Domain: $DOMAIN
Next Action: $NEXT_ACTION
Files to Load: $FILES
Recent Decisions:
$DECISIONS
[END HANDOFF]

"
        # Archive the handoff after loading
        TIMESTAMP=$(date +%Y%m%d_%H%M%S)
        mv "$HANDOFF_FILE" "state/handoff/archive_${TIMESTAMP}.json" 2>/dev/null
    fi
fi

# Get relevant memories based on prompt content
MEMORIES=$(.venv/bin/python3.14 scripts/retrieve_memories.py \
    --prompt "$USER_PROMPT" \
    --limit 3 \
    --format concise \
    --token-budget 500 \
    2>/dev/null)

# Build final injection
if [[ -n "$MEMORIES" ]] && [[ "$MEMORIES" != *"Error"* ]]; then
    INJECTION="${INJECTION}[MEMORY RECALL - Relevant Past Learnings]
$MEMORIES
[END MEMORY RECALL]

"
fi

# Output with injection
if [[ -n "$INJECTION" ]]; then
    cat <<EOF
$USER_PROMPT

$INJECTION
EOF
else
    echo "$USER_PROMPT"
fi
