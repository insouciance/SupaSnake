#!/bin/bash
# Stop Hook: Save session state after each response
# Ensures handoff exists before /clear (which doesn't trigger pre-compact)
# Exit 0: Always (non-blocking)

# Only save if there's meaningful work (uncommitted changes)
UNCOMMITTED=$(git status --short 2>/dev/null | head -10 || echo "")
if [[ -z "$UNCOMMITTED" ]]; then
    # No uncommitted changes, skip saving
    exit 0
fi

# Don't overwrite a rich manual handoff (has "summary" field)
HANDOFF_FILE="state/handoff/current.json"
if [[ -f "$HANDOFF_FILE" ]]; then
    HAS_SUMMARY=$(jq -r '.summary // empty' "$HANDOFF_FILE" 2>/dev/null)
    if [[ -n "$HAS_SUMMARY" ]]; then
        # Manual handoff exists, don't overwrite with auto-generated sparse one
        exit 0
    fi
fi

# Create handoff directory
mkdir -p state/handoff

# Gather context clues
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "main")
LAST_COMMIT_MSG=$(git log --oneline -1 2>/dev/null | cut -d' ' -f2- || echo "unknown")
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Get active domain from read activity
DOMAIN_FILE="state/read_activity/domain_activity.json"
if [[ -f "$DOMAIN_FILE" ]]; then
    ACTIVE_DOMAIN=$(jq -r 'to_entries | sort_by(.value.last_read) | reverse | .[0].key // ""' "$DOMAIN_FILE" 2>/dev/null || echo "")
    RECENT_FILES=$(jq -r '[to_entries[].value.recent_files[]] | unique | .[-5:][]' "$DOMAIN_FILE" 2>/dev/null | tr '\n' ',' | sed 's/,$//' || echo "")
else
    ACTIVE_DOMAIN=""
    RECENT_FILES=""
fi

# Build files_to_load array from recent reads
FILES_JSON="[]"
if [[ -n "$RECENT_FILES" ]]; then
    FILES_JSON=$(echo "$RECENT_FILES" | tr ',' '\n' | jq -R -s 'split("\n") | map(select(length > 0))')
fi

# Get recent decisions from decisions log
DECISIONS_JSON="[]"
DECISIONS_FILE="state/handoff/decisions.jsonl"
if [[ -f "$DECISIONS_FILE" ]]; then
    DECISIONS_JSON=$(tail -5 "$DECISIONS_FILE" | jq -s '[.[].decision]' 2>/dev/null || echo "[]")
fi

# Infer task from uncommitted changes
TASK="Working on uncommitted changes in $ACTIVE_DOMAIN domain"
STATUS="in_progress"
NEXT_ACTION="Review uncommitted changes and continue work"

# Write handoff JSON (overwrites previous auto-generated - always keep latest)
cat > state/handoff/current.json <<HANDOFF
{
  "task": "$TASK",
  "status": "$STATUS",
  "domain": "$ACTIVE_DOMAIN",
  "next_action": "$NEXT_ACTION",
  "files_to_load": $FILES_JSON,
  "decisions": $DECISIONS_JSON,
  "branch": "$CURRENT_BRANCH",
  "timestamp": "$TIMESTAMP",
  "auto_generated": true,
  "source": "stop-hook"
}
HANDOFF

exit 0
