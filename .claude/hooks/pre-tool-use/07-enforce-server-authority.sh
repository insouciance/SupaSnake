#!/bin/bash
# PreToolUse Hook: Enforce Server Authority
# Prevents localStorage usage for game state (AAA 2026 standard)
# Based on: Anthropic "Writing Tools for Agents" - actionable error messages
# Exit 0: Allow, Exit 2: BLOCK

# Read JSON input from stdin
INPUT=$(cat)

# Extract fields
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty')
NEW_STRING=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty')

# Only check Write and Edit tools
if [[ "$TOOL_NAME" != "Write" && "$TOOL_NAME" != "Edit" ]]; then
  exit 0
fi

# Combine content sources
TEXT="$CONTENT$NEW_STRING"

# Skip if no text to check
if [[ -z "$TEXT" ]]; then
  exit 0
fi

# Check if file uses localStorage
if ! echo "$TEXT" | grep -Eq 'localStorage\.(get|set|remove)Item|localStorage\['; then
  exit 0  # No localStorage usage, allow
fi

# Game state patterns that MUST NOT be in localStorage
# These indicate server authority violations
GAME_STATE_PATTERNS=(
  "dna"
  "DNA"
  "variant"
  "score"
  "points"
  "currency"
  "coins"
  "gems"
  "player"
  "inventory"
  "collection"
  "unlock"
  "achievement"
  "progress"
  "level"
  "xp"
  "experience"
  "stat"
  "energy"
  "stamina"
  "gameState"
  "game_state"
  "breeding"
  "evolution"
  "lab"
  "snake"
  "highScore"
  "leaderboard"
)

# Check if localStorage is used with game state keys
for pattern in "${GAME_STATE_PATTERNS[@]}"; do
  # Case-insensitive check for localStorage with game state key
  if echo "$TEXT" | grep -Eiq "localStorage\.(get|set|remove)Item\s*\(\s*['\"].*${pattern}|localStorage\[['\"].*${pattern}"; then
    cat >&2 <<'EOF'
❌ BLOCKED: Server Authority Violation (AAA 2026 Standard)

🎮 Architecture principle: Server is single source of truth for ALL game state

📍 Problem detected:
EOF
    echo "  File: $FILE_PATH" >&2
    echo "  Pattern: localStorage with game state key \"$pattern\"" >&2
    cat >&2 <<'EOF'

⚠️  Why this is CRITICAL:

1. Cheating (Revenue Impact):
   Player opens DevTools → localStorage.setItem('dna', '999999')
   Result: Infinite DNA without paying
   Impact: $0 revenue, broken economy, unfair gameplay

2. Data Loss (Player Churn):
   Player clears browser data → Lost ALL progress forever
   Result: Angry 1-star review "Lost 50 hours of progress!"
   Impact: High churn rate, reputation damage, support burden

3. Multiplayer Impossible (Feature Limitation):
   Each client has different "truth" → Can't sync state
   Result: No leaderboards, PvP, guilds, trading
   Impact: Limited monetization, lower engagement

4. No Validation (Quality & Security):
   Client can set ANY value → Game breaks or exploits
   Result: Invalid state crashes game, exploits spread
   Impact: Poor player experience, support costs

📋 How to fix:

Step 1: Remove localStorage for game state

❌ BAD (client storage - NEVER do this):
```typescript
// This allows cheating!
const dna = parseInt(localStorage.getItem('dna') || '0');
localStorage.setItem('dna', (dna + reward).toString());
```

Step 2: Create API route for mutations

✅ GOOD (server authority - AAA standard):
```typescript
// File: src/app/api/game/reward-dna/route.ts
import { createClient } from '@/utils/supabase/server';

export async function POST(request: Request) {
  const supabase = createClient();

  // 1. Authenticate
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  // 2. Validate input
  const { rewardAmount, reason } = await request.json();
  if (!isValidReward(rewardAmount, reason)) {
    return new Response('Invalid reward', { status: 400 });
  }

  // 3. Server processes & validates
  const { data, error } = await supabase
    .from('user_resources')
    .update({ dna: supabase.sql`dna + ${rewardAmount}` })
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return new Response(error.message, { status: 500 });

  // 4. Return server's value (single source of truth)
  return Response.json({ dna: data.dna });
}
```

Step 3: Call API from client

✅ GOOD (client displays, server decides):
```typescript
// File: src/components/GameUI.tsx
const rewardDNA = async (amount: number) => {
  const response = await fetch('/api/game/reward-dna', {
    method: 'POST',
    body: JSON.stringify({ rewardAmount: amount, reason: 'level_complete' })
  });

  const { dna } = await response.json();
  setDNA(dna);  // Display only, no game logic
};
```

📊 The 4 Principles of Server Authority:

1. **Client Displays, Server Decides**
   Client: Shows UI, collects input
   Server: Processes ALL game logic
   Client: Receives results, updates display

2. **API Routes for All Mutations**
   Every state change goes through API
   Client never directly accesses database

3. **Secrets Stay Server-Side**
   No SERVICE_ROLE_KEY in client code

4. **Config-Driven Balance**
   Game constants in src/shared/config/game.ts

✅ localStorage ALLOWED for (UI state only):
  • Theme, volume, language
  • Tutorial completion flags
  • Analytics consent

❌ localStorage FORBIDDEN for (game state):
  • DNA, score, level, XP
  • Inventory, collection, unlocks
  • Any data that affects gameplay

💡 Rule of thumb:
  If losing it means losing PROGRESS → Server
  If losing it means re-selecting PREFERENCES → localStorage

Platform standard: AAA 2026 server authority (5 hooks enforce deterministically)
EOF
    exit 2
  fi
done

# localStorage used but no game state patterns detected - allow
# (Likely UI preferences, which are legitimate)
exit 0
