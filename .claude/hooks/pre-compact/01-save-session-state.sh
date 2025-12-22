#!/bin/bash
# PreCompact Hook: Auto-generate Handoff from Context Clues
# Writes handoff automatically since Claude doesn't get a turn before compact
# Exit 0: Always (non-blocking)

# Create handoff directory
mkdir -p state/handoff

# Gather context clues
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "main")
LAST_COMMIT_MSG=$(git log --oneline -1 2>/dev/null | cut -d' ' -f2- || echo "unknown")
UNCOMMITTED=$(git status --short 2>/dev/null | head -10 || echo "")
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Get active domain from read activity
DOMAIN_FILE="state/read_activity/domain_activity.json"
if [[ -f "$DOMAIN_FILE" ]]; then
    ACTIVE_DOMAIN=$(jq -r 'to_entries | sort_by(.value.last_read) | reverse | .[0].key // "unknown"' "$DOMAIN_FILE" 2>/dev/null || echo "unknown")
    RECENT_FILES=$(jq -r '[to_entries[].value.recent_files[]] | unique | .[-5:][]' "$DOMAIN_FILE" 2>/dev/null | tr '\n' ',' | sed 's/,$//' || echo "")
else
    ACTIVE_DOMAIN="unknown"
    RECENT_FILES=""
fi

# Build files_to_load array from recent reads
FILES_JSON="[]"
if [[ -n "$RECENT_FILES" ]]; then
    FILES_JSON=$(echo "$RECENT_FILES" | tr ',' '\n' | jq -R -s 'split("\n") | map(select(length > 0))')
fi

# Infer task from last commit or uncommitted changes
if [[ -n "$UNCOMMITTED" ]]; then
    TASK="Working on uncommitted changes in $ACTIVE_DOMAIN domain"
    STATUS="in_progress"
    NEXT_ACTION="Review uncommitted changes and continue work"
else
    TASK="Completed: $LAST_COMMIT_MSG"
    STATUS="complete"
    NEXT_ACTION="Check for next task or user direction"
fi

# Write handoff JSON
cat > state/handoff/current.json <<HANDOFF
{
  "task": "$TASK",
  "status": "$STATUS",
  "domain": "$ACTIVE_DOMAIN",
  "next_action": "$NEXT_ACTION",
  "files_to_load": $FILES_JSON,
  "branch": "$CURRENT_BRANCH",
  "timestamp": "$TIMESTAMP",
  "auto_generated": true
}
HANDOFF

# Output reminder to stderr (will be in summary)
cat >&2 <<EOF

╔══════════════════════════════════════════════════════════════════╗
║  📋 AUTO-COMPACT HANDOFF SAVED                                   ║
╠══════════════════════════════════════════════════════════════════╣
║  File: state/handoff/current.json                                ║
║  Domain: $ACTIVE_DOMAIN
║  Status: $STATUS
║                                                                  ║
║  AFTER COMPACT: Read state/handoff/current.json to resume        ║
╚══════════════════════════════════════════════════════════════════╝

EOF

exit 0
