#!/bin/bash
# UserPromptSubmit Hook: Inject Memory Context
# Makes Claude check relevant memories before starting work

USER_PROMPT=$(cat)

# Only inject memory for substantial prompts (>20 chars)
if [[ ${#USER_PROMPT} -lt 20 ]]; then
    echo "$USER_PROMPT"
    exit 0
fi

# Get relevant memories based on prompt content
# Use concise format by default (saves ~67% tokens vs detailed)
# Based on Anthropic research: "concise versions use roughly one-third the tokens"
MEMORIES=$(python3 scripts/retrieve_memories.py \
    --prompt "$USER_PROMPT" \
    --limit 3 \
    --format concise \
    --token-budget 500 \
    2>/dev/null)

# If no relevant memories or error, just pass through
if [[ -z "$MEMORIES" ]] || [[ "$MEMORIES" == *"Error"* ]]; then
    echo "$USER_PROMPT"
    exit 0
fi

# Inject memory context
cat <<EOF
$USER_PROMPT

[MEMORY RECALL - Relevant Past Learnings]
$MEMORIES
[END MEMORY RECALL]

Note: Above memories are from previous sessions. Apply patterns where relevant.
EOF
