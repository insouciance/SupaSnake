#!/bin/bash
# Stop Hook: Monitor Context Quality
# Detects context rot and recommends actions
# Based on Anthropic research on context degradation

# Track execution time for metrics
START_TIME=$(date +%s%3N)

# Source metric logging helper
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/log_hook_metric.sh" 2>/dev/null || true

# Only run if we have a recent context snapshot
STATE_DIR="state/context_quality"
mkdir -p "$STATE_DIR"

QUALITY_FILE="$STATE_DIR/latest_quality.json"
HISTORY_FILE="$STATE_DIR/quality_history.jsonl"

# Get approximate token count from recent messages
# This is a rough estimate - in production, track actual token usage
RECENT_MESSAGES=$(git log --oneline -20 2>/dev/null | wc -l)
ESTIMATED_TOKENS=$((RECENT_MESSAGES * 500))  # Rough: 500 tokens per message

# If we have files open, add their token estimates
if [ -d ".git" ]; then
    MODIFIED_FILES=$(git diff --name-only 2>/dev/null | wc -l)
    FILE_TOKENS=$((MODIFIED_FILES * 2000))  # Rough: 2k tokens per file
    ESTIMATED_TOKENS=$((ESTIMATED_TOKENS + FILE_TOKENS))
fi

# Get current task from CLAUDE.md if available
CURRENT_TASK=""
if [ -f "CLAUDE.md" ]; then
    CURRENT_TASK=$(grep -A 1 "^\*\*Feature:\*\*" CLAUDE.md | tail -1 | sed 's/\*\*Feature:\*\* //' || echo "")
fi

# Create a mock context for scoring
# In production, this would come from actual conversation history
MOCK_CONTEXT="Current working context: $ESTIMATED_TOKENS tokens estimated
Current task: $CURRENT_TASK
Recent files: $(git diff --name-only 2>/dev/null | head -5 | tr '\n' ', ')
"

# Score context quality
SCORE_OUTPUT=$(echo "$MOCK_CONTEXT" | python3 scripts/context_quality_scorer.py \
    --tokens "$ESTIMATED_TOKENS" \
    --task "$CURRENT_TASK" \
    --export "$QUALITY_FILE" 2>&1)

if [ $? -ne 0 ]; then
    # Scorer failed, skip silently
    exit 0
fi

# Append to history
if [ -f "$QUALITY_FILE" ]; then
    cat "$QUALITY_FILE" >> "$HISTORY_FILE"
fi

# Parse recommendations from scorer output
SHOULD_CLEAR=$(echo "$SCORE_OUTPUT" | grep "Action: CLEAR" || echo "")
SHOULD_DELEGATE=$(echo "$SCORE_OUTPUT" | grep "Action: DELEGATE" || echo "")
QUALITY_SCORE=$(echo "$SCORE_OUTPUT" | grep "Context Quality:" | grep -oE '[0-9]+\.[0-9]+' | head -1)

# Alert if quality is degrading
if [ ! -z "$SHOULD_CLEAR" ]; then
    echo "" >&2
    echo "⚠️  CONTEXT QUALITY ALERT" >&2
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
    echo "" >&2
    echo "$SCORE_OUTPUT" | head -10 >&2
    echo "" >&2
    echo "📊 Research Finding: Performance degrades with increasing context" >&2
    echo "   Anthropic: Degradation starts at 5k tokens, significant at 50k+" >&2
    echo "" >&2
    echo "💡 Recommendation: Consider using /clear before next complex task" >&2
    echo "   Or: Delegate complex analysis to sub-agent (fresh 200k context)" >&2
    echo "" >&2
    echo "See: @knowledge_base/platform/quick_ref/decision_matrix.md" >&2
    echo "" >&2
elif [ ! -z "$SHOULD_DELEGATE" ]; then
    echo "" >&2
    echo "ℹ️  Context Quality: Approaching threshold" >&2
    echo "   Current: ~$ESTIMATED_TOKENS tokens" >&2
    echo "   Score: $QUALITY_SCORE/100" >&2
    echo "" >&2
    echo "💡 For complex tasks, consider using sub-agents" >&2
    echo "   Sub-agents get fresh 200k context for specialized analysis" >&2
    echo "" >&2
fi

# Track quality trend
if [ -f "$HISTORY_FILE" ]; then
    ENTRY_COUNT=$(wc -l < "$HISTORY_FILE")

    # If we have 5+ entries, check for declining trend
    if [ $ENTRY_COUNT -ge 5 ]; then
        # Get last 5 quality scores
        RECENT_SCORES=$(tail -5 "$HISTORY_FILE" | grep -oE '"overall": [0-9.]+' | grep -oE '[0-9.]+')

        # Simple trend detection: if last score < average of previous 4
        LAST_SCORE=$(echo "$RECENT_SCORES" | tail -1)
        PREV_AVG=$(echo "$RECENT_SCORES" | head -4 | awk '{sum+=$1} END {print sum/NR}')

        # If quality dropped >10 points
        if [ ! -z "$LAST_SCORE" ] && [ ! -z "$PREV_AVG" ]; then
            DIFF=$(echo "$PREV_AVG - $LAST_SCORE" | bc 2>/dev/null || echo "0")
            if [ ! -z "$DIFF" ] && [ $(echo "$DIFF > 10" | bc -l 2>/dev/null || echo "0") -eq 1 ]; then
                echo "⚠️  Context quality declining: ${DIFF} point drop" >&2
                echo "   Consider /clear to reset quality" >&2
                echo "" >&2
            fi
        fi
    fi
fi

# Log hook metrics
END_TIME=$(date +%s%3N)
DURATION=$((END_TIME - START_TIME))
OUTPUT_LENGTH=${#SCORE_OUTPUT}
SUCCESS=true
BLOCKED=false
EXIT_CODE=0

# Log metrics if function available
if type log_hook_metric &>/dev/null; then
    log_hook_metric \
        "08-monitor-context-quality" \
        "Stop" \
        "$SUCCESS" \
        "$DURATION" \
        "$BLOCKED" \
        "$EXIT_CODE" \
        "$OUTPUT_LENGTH" \
        "" 2>/dev/null || true
fi

exit 0
