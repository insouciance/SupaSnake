#!/bin/bash
# PreCompact Hook: Trigger Intelligent Handoff
# Prompts Claude to analyze session and write focused handoff to memory
# Exit 0: Always (non-blocking)

# Gather context clues for Claude
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "main")
LAST_COMMITS=$(git log --oneline -3 2>/dev/null || echo "No commits")
UNCOMMITTED=$(git status --short 2>/dev/null | head -5 || echo "No changes")
ACTIVE_DOMAIN=$(cat state/read_activity/domain_activity.json 2>/dev/null | jq -r 'keys[0] // "unknown"' 2>/dev/null || echo "unknown")
RECENT_READS=$(cat state/read_activity/recent_reads.json 2>/dev/null | jq -r '.reads[:5][].file' 2>/dev/null | xargs -I{} basename {} 2>/dev/null | tr '\n' ', ' || echo "none")

# Output instructions to Claude
cat >&2 <<EOF

╔══════════════════════════════════════════════════════════════════╗
║  ⚠️  CONTEXT RESET IMMINENT - HANDOFF REQUIRED                   ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Before context clears, write a focused handoff to memory.       ║
║                                                                  ║
║  CONTEXT CLUES:                                                  ║
║  • Branch: $CURRENT_BRANCH
║  • Active Domain: $ACTIVE_DOMAIN
║  • Recent Reads: $RECENT_READS
║  • Last Commits:
$(echo "$LAST_COMMITS" | sed 's/^/║    /')
║  • Uncommitted:
$(echo "$UNCOMMITTED" | sed 's/^/║    /')
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║  ACTION REQUIRED:                                                ║
║                                                                  ║
║  1. Analyze what you were ACTUALLY working on (not CLAUDE.md)    ║
║  2. Identify what's essential vs what's stale                    ║
║  3. Write handoff to: state/handoff/current.json                 ║
║                                                                  ║
║  HANDOFF FORMAT:                                                 ║
║  {                                                               ║
║    "task": "What user asked for",                                ║
║    "status": "in_progress|blocked|complete",                     ║
║    "domain": "engagement|auth|game|platform|...",                ║
║    "next_action": "Specific next step",                          ║
║    "files_to_load": ["only essential files"],                    ║
║    "decisions_made": ["key decisions this session"],             ║
║    "context_to_drop": ["what became stale/irrelevant"]           ║
║  }                                                               ║
║                                                                  ║
║  The new context will load this handoff automatically.           ║
╚══════════════════════════════════════════════════════════════════╝

EOF

# Create handoff directory
mkdir -p state/handoff

exit 0
