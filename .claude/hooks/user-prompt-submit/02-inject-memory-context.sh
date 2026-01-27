#!/bin/bash
# UserPromptSubmit Hook: Inject Memory Context + Handoff
# Loads handoff from previous session + relevant memories + decisions

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

    # Check for rich format (has "summary" field) vs sparse format (has "task" field)
    SUMMARY=$(echo "$HANDOFF" | jq -r '.summary // empty')

    if [[ -n "$SUMMARY" ]]; then
        # Rich handoff format
        ACCOMPLISHMENTS=$(echo "$HANDOFF" | jq -r '.accomplishments[]? // empty' | sed 's/^/- /')
        CURRENT_FOCUS=$(echo "$HANDOFF" | jq -r '.current_focus // empty')
        NEXT_STEPS=$(echo "$HANDOFF" | jq -r '.next_steps[]? // empty' | sed 's/^/- /')
        KEY_FILES=$(echo "$HANDOFF" | jq -r '.key_files[]? // empty' | tr '\n' ', ' | sed 's/,$//')
        HANDOFF_DECISIONS=$(echo "$HANDOFF" | jq -r '.decisions[]? // empty' | sed 's/^/- /')

        INJECTION="[SESSION HANDOFF - Resuming Previous Work]
Summary: $SUMMARY
"
        [[ -n "$ACCOMPLISHMENTS" ]] && INJECTION="${INJECTION}Accomplishments:
$ACCOMPLISHMENTS
"
        [[ -n "$CURRENT_FOCUS" ]] && INJECTION="${INJECTION}Current Focus: $CURRENT_FOCUS
"
        [[ -n "$NEXT_STEPS" ]] && INJECTION="${INJECTION}Next Steps:
$NEXT_STEPS
"
        [[ -n "$KEY_FILES" ]] && INJECTION="${INJECTION}Key Files: $KEY_FILES
"
        [[ -n "$HANDOFF_DECISIONS" ]] && INJECTION="${INJECTION}Decisions:
$HANDOFF_DECISIONS
"
        INJECTION="${INJECTION}[END HANDOFF]

"
    else
        # Sparse handoff format (legacy/auto-generated)
        TASK=$(echo "$HANDOFF" | jq -r '.task // empty')
        STATUS=$(echo "$HANDOFF" | jq -r '.status // empty')
        DOMAIN=$(echo "$HANDOFF" | jq -r '.domain // empty')
        NEXT_ACTION=$(echo "$HANDOFF" | jq -r '.next_action // empty')
        FILES=$(echo "$HANDOFF" | jq -r '.files_to_load[]? // empty' | tr '\n' ', ')

        if [[ -n "$TASK" ]]; then
            INJECTION="[SESSION HANDOFF - Resuming Previous Work]
Task: $TASK
Status: $STATUS
Domain: $DOMAIN
Next Action: $NEXT_ACTION
Files to Load: $FILES
"
        fi
    fi

    # Archive the handoff after loading
    if [[ -n "$INJECTION" ]]; then
        TIMESTAMP=$(date +%Y%m%d_%H%M%S)
        mv "$HANDOFF_FILE" "state/handoff/archive_${TIMESTAMP}.json" 2>/dev/null
    fi
fi

# Also inject recent decisions from the decisions log
DECISIONS_FILE="state/handoff/decisions.jsonl"
if [[ -f "$DECISIONS_FILE" ]]; then
    RECENT_DECISIONS=$(tail -5 "$DECISIONS_FILE" | jq -r '.decision' 2>/dev/null | sed 's/^/- /')
    if [[ -n "$RECENT_DECISIONS" ]]; then
        # Add to existing handoff or create new section
        if [[ -n "$INJECTION" ]]; then
            # Insert before [END HANDOFF] if present, otherwise append
            if [[ "$INJECTION" == *"[END HANDOFF]"* ]]; then
                INJECTION=$(echo "$INJECTION" | sed "s/\[END HANDOFF\]/Recent Decisions (from log):\n$RECENT_DECISIONS\n[END HANDOFF]/")
            else
                INJECTION="${INJECTION}Recent Decisions:
$RECENT_DECISIONS
[END HANDOFF]

"
            fi
        else
            INJECTION="[SESSION HANDOFF - Recent Decisions]
$RECENT_DECISIONS
[END HANDOFF]

"
        fi
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
