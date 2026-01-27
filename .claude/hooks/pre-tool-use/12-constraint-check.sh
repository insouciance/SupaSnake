#!/bin/bash
# PreToolUse Hook: Constraint Violation Detection
# Detects common HARD constraint violations before code is written
# Exit 0: Allow, Exit 2: BLOCK
#
# Checks for:
# - BM-001: Premium-only content patterns
# - BM-002: Forced ad patterns
# - BM-003: Paywall patterns
# - SO-002: Daily clan requirement patterns

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Only check Write and Edit tools (code being written)
if [[ "$TOOL_NAME" != "Write" && "$TOOL_NAME" != "Edit" ]]; then
  exit 0
fi

# Get content being written
CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Skip non-code files
if [[ "$FILE_PATH" == *.md || "$FILE_PATH" == *.json || "$FILE_PATH" == *.txt ]]; then
  exit 0
fi

# Skip test files and mocks
if [[ "$FILE_PATH" == *test* || "$FILE_PATH" == *mock* || "$FILE_PATH" == *spec* ]]; then
  exit 0
fi

# BM-001: Pay for Convenience, Not Power
# Check for premium-only content patterns
if echo "$CONTENT" | grep -qiE "premium.?only|paid.?exclusive|purchase.?required|vip.?exclusive"; then
  cat >&2 <<EOF
CONSTRAINT VIOLATION: BM-001 (Pay for Convenience, Not Power)

Detected pattern suggesting premium-only content:
$(echo "$CONTENT" | grep -iE "premium.?only|paid.?exclusive|purchase.?required|vip.?exclusive" | head -3)

Rule: All content must be achievable by F2P players.
Paying players may progress FASTER, but cannot achieve outcomes impossible for F2P.

Fix: Ensure F2P players can achieve equivalent outcome through gameplay.
Reference: docs/game/00_CONSTRAINT_LATTICE.md (BM-001)
EOF
  exit 2
fi

# BM-002: No Forced Ad Viewing
# Check for forced ad patterns
if echo "$CONTENT" | grep -qiE "must.?watch.?ad|ad.?required|no.?skip.?ad|force.*ad|mandatory.*ad"; then
  cat >&2 <<EOF
CONSTRAINT VIOLATION: BM-002 (No Forced Ad Viewing)

Detected pattern suggesting forced ads:
$(echo "$CONTENT" | grep -iE "must.?watch.?ad|ad.?required|no.?skip.?ad|force.*ad|mandatory.*ad" | head -3)

Rule: Ads must ALWAYS be opt-in for bonus rewards.
Players may NEVER be required to watch ads for core gameplay.

Fix: Make ads optional with clear bonus value exchange.
Reference: docs/game/00_CONSTRAINT_LATTICE.md (BM-002)
EOF
  exit 2
fi

# BM-003: No Paywalling Basic Features
# Check for paywall patterns on core features
if echo "$CONTENT" | grep -qiE "paywall|locked.?behind.?purchase|requires.?purchase|buy.?to.?unlock"; then
  # Check if it's related to core features
  if echo "$CONTENT" | grep -qiE "breeding|evolution|lab|collection|snake|energy"; then
    cat >&2 <<EOF
CONSTRAINT VIOLATION: BM-003 (No Paywalling Basic Features)

Detected paywall pattern on core feature:
$(echo "$CONTENT" | grep -iE "paywall|locked.?behind.?purchase|requires.?purchase|buy.?to.?unlock" | head -3)

Rule: Core gameplay loop (Play Snake -> Collect DNA -> Breed -> Evolve) must be fully functional without any purchase.

Fix: Ensure feature works with F2P resources. Premium can accelerate, not unlock.
Reference: docs/game/00_CONSTRAINT_LATTICE.md (BM-003)
EOF
    exit 2
  fi
fi

# SO-002: No Daily Clan Requirements
# Check for daily requirement patterns in clan/corp code
if echo "$FILE_PATH" | grep -qiE "clan|corp|guild"; then
  if echo "$CONTENT" | grep -qiE "daily.?requirement|must.?login.?daily|streak.?penalty|daily.?quota|miss.?day"; then
    cat >&2 <<EOF
CONSTRAINT VIOLATION: SO-002 (No Daily Clan Requirements)

Detected daily requirement pattern in clan code:
$(echo "$CONTENT" | grep -iE "daily.?requirement|must.?login.?daily|streak.?penalty|daily.?quota|miss.?day" | head -3)

Rule: Clan participation must NEVER require daily play.
Inactivity should have zero negative consequences.

Fix: Remove daily requirements. Use weekly/cumulative instead.
Reference: docs/game/00_CONSTRAINT_LATTICE.md (SO-002)
EOF
    exit 2
  fi
fi

# All checks passed
exit 0
