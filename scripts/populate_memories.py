#!/usr/bin/env python3
"""
Populate Supabase claude_memories table with project-relevant memories
Run once to seed the database with 25 foundational memories

Schema columns:
- domain: TEXT NOT NULL
- category: TEXT NOT NULL
- title: TEXT NOT NULL
- content: TEXT NOT NULL
- summary: TEXT
- source_file: TEXT
- source_commit: TEXT
- tags: TEXT[]
- times_applied: INTEGER DEFAULT 0
- relevance_score: DECIMAL DEFAULT 0.0
"""

import sys
from pathlib import Path
from datetime import datetime, timezone

from dotenv import load_dotenv
load_dotenv()

sys.path.insert(0, str(Path(__file__).parent))

try:
    from memory_tool_handler import MemoryToolHandler
except ImportError:
    print("Error: memory_tool_handler not found", file=sys.stderr)
    sys.exit(1)


MEMORIES = [
    # === ARCHITECTURE (3) ===
    {
        "domain": "architecture",
        "category": "principle",
        "title": "Server Authority - Single Source of Truth",
        "summary": "Server is the single source of truth for all game state. Client displays UI and collects input only.",
        "source_file": ".claude/hooks/pre-tool-use/07-enforce-server-authority.sh",
        "tags": ["server-authority", "architecture", "security"],
        "content": """# Server Authority Principle

Server is the single source of truth for ALL game state.

## Client Responsibilities
- Display UI and collect user input
- Send actions to server
- Render server responses

## Server Responsibilities
- Process ALL game logic
- Validate ALL actions
- Store ALL game state

## localStorage Policy
Allowed: theme, volume, language, tutorial_seen, analytics_consent
Forbidden: DNA, score, level, inventory, collection, unlocks, achievements

## Enforcement
Hook 07-enforce-server-authority.sh blocks localStorage game state.
All API routes validate server-side.
"""
    },
    {
        "domain": "architecture",
        "category": "policy",
        "title": "localStorage Policy - UI vs Game State",
        "summary": "localStorage is ONLY for UI preferences. Game state must be server-side.",
        "source_file": ".claude/hooks/pre-tool-use/07-enforce-server-authority.sh",
        "tags": ["localStorage", "client-state", "architecture"],
        "content": """# localStorage Policy

The Rule: If losing it means losing progress -> Server. If losing it means re-selecting preferences -> localStorage.

## Allowed in localStorage
- theme (dark/light)
- volume (0-100)
- language (en/de/etc)
- tutorial_seen (boolean)
- analytics_consent (boolean)

## Forbidden in localStorage
- DNA balance, Score, Level/XP
- Inventory items, Collection unlocks
- Achievements, Battle pass progress

## Consequence
Write blocked with exit 2 if game state detected in localStorage.
"""
    },
    {
        "domain": "architecture",
        "category": "pattern",
        "title": "Economy Audit Trail",
        "summary": "All economy transactions logged with before/after balances for fraud detection.",
        "source_file": "supabase/migrations/002_server_authority.sql",
        "tags": ["economy", "audit", "transactions"],
        "content": """# Economy Audit Trail

All economy transactions logged to economy_transactions table.

## Fields
- player_id, transaction_type, currency_type
- amount, balance_before, balance_after
- source, metadata, created_at

## Transaction Types
daily_reward, streak_bonus, achievement_reward, purchase, spend, refund

## Benefits
- Fraud detection (impossible balance changes)
- Player support (see full history)
- Analytics (economy health metrics)
- Rollback capability
"""
    },

    # === GAME CONFIG (3) ===
    {
        "domain": "game",
        "category": "config",
        "title": "Centralized Game Configuration",
        "summary": "All game constants in src/shared/config/game.ts. Never hardcode values in components.",
        "source_file": "src/shared/config/game.ts",
        "tags": ["config", "game", "constants"],
        "content": """# Centralized Game Configuration

Location: src/shared/config/game.ts

## Structure
GAME_CONFIG contains: snake (speed, length), food (value, spawn), dna (rewards), levels (xp)

## Usage
import { GAME_CONFIG } from '@/shared/config/game';

## Rules
- Never hardcode game values in components
- Always import from config
- Use 'as const' for type safety
"""
    },
    {
        "domain": "engagement",
        "category": "config",
        "title": "Engagement Systems Configuration",
        "summary": "Daily rewards, streaks, achievements configured in engagement.ts. 28-day cycle with streak multipliers.",
        "source_file": "src/shared/config/engagement.ts",
        "tags": ["engagement", "daily-rewards", "streaks", "config"],
        "content": """# Engagement Systems Configuration

Location: src/shared/config/engagement.ts

## Daily Rewards (28-day cycle)
Days 1-6: 50-100 DNA
Day 7: 200 DNA bonus
Day 14: Rare skin
Day 21: 500 DNA bonus
Day 28: Legendary egg

## Streak Multipliers
3 days: 10% bonus
7 days: 25% bonus
14 days: 50% bonus
30 days: 100% bonus

Grace period: 48 hours
"""
    },
    {
        "domain": "game",
        "category": "system",
        "title": "DNA Economy System",
        "summary": "DNA is the primary currency. Earned through gameplay, daily rewards, achievements. All transactions server-validated.",
        "source_file": "src/shared/config/game.ts",
        "tags": ["economy", "dna", "currency"],
        "content": """# DNA Economy System

DNA is the primary soft currency.

## Earning
Per Food: 1 DNA
Level Up: 10 x level
Daily Login: 50-500 DNA
Achievements: 50-1000 DNA

## Spending
Common Egg: 100 DNA
Rare Egg: 500 DNA
Epic Egg: 2000 DNA
Skins: 200-2000 DNA
Battle Pass: 5000 DNA

## Validation
All transactions server-validated with audit trail.
"""
    },

    # === API PATTERNS (3) ===
    {
        "domain": "api",
        "category": "pattern",
        "title": "API Route Template",
        "summary": "Standard pattern: authenticate, validate input, process, return typed response with try-catch.",
        "source_file": "src/app/api/streaks/route.ts",
        "tags": ["api", "nextjs", "authentication", "pattern"],
        "content": """# API Route Template

## Standard Pattern
1. Authenticate: createClient() then getUser()
2. Return 401 if no user
3. Validate input from request.json()
4. Return 400 for invalid input
5. Process request
6. Return 200 with data
7. Catch errors, return 500

## Rules
- Always authenticate first
- Validate all input
- Log errors server-side
- Never expose internal errors
"""
    },
    {
        "domain": "api",
        "category": "pattern",
        "title": "Rate Limiting Pattern",
        "summary": "Use src/lib/server/rateLimit.ts. Sliding window algorithm. Default: 100 requests per minute.",
        "source_file": "src/lib/server/rateLimit.ts",
        "tags": ["api", "rate-limiting", "security"],
        "content": """# Rate Limiting Pattern

Location: src/lib/server/rateLimit.ts

## Usage
const limit = await rateLimit({ key, limit: 100, window: 60 });
if (!limit.success) return 429 response

## Limits by Endpoint
Default: 100 per 60s
Auth: 10 per 60s
Economy: 30 per 60s
Game Actions: 60 per 60s
"""
    },
    {
        "domain": "api",
        "category": "pattern",
        "title": "Game Validation - Anti-Cheat",
        "summary": "Server validates all game actions. Checks score reasonability, action timing, state consistency.",
        "source_file": "src/lib/server/gameValidator.ts",
        "tags": ["api", "validation", "anti-cheat", "security"],
        "content": """# Game Validation - Anti-Cheat

Location: src/lib/server/gameValidator.ts

## Validation Checks
1. Action timing (not too fast)
2. Score reasonability (max possible)
3. State consistency (valid transitions)
4. DNA earnings match gameplay
5. Level progression is consistent

## Consequences
- Invalid actions rejected silently
- Repeated violations flag account
"""
    },

    # === DATABASE SCHEMA (2) ===
    {
        "domain": "database",
        "category": "schema",
        "title": "Economy Transactions Schema",
        "summary": "Migration 002 adds economy_transactions, game_sessions, rate_limits tables.",
        "source_file": "supabase/migrations/002_server_authority.sql",
        "tags": ["database", "schema", "economy"],
        "content": """# Economy Transactions Schema

Migration: 002_server_authority.sql

## Tables
economy_transactions: player_id, transaction_type, currency_type, amount, balance_before, balance_after, metadata
game_sessions: player_id, started_at, ended_at, score, dna_earned, validated
rate_limits: key, count, window_start, expires_at

## Indexes
- player_id on all tables
- created_at for time queries
"""
    },
    {
        "domain": "database",
        "category": "schema",
        "title": "Engagement Features Schema",
        "summary": "Migration 003 adds daily_rewards, streaks, achievements, battle_pass tables.",
        "source_file": "supabase/migrations/003_engagement_features.sql",
        "tags": ["database", "schema", "engagement"],
        "content": """# Engagement Features Schema

Migration: 003_engagement_features.sql

## Tables
daily_rewards: player_id, day_number (1-28), reward_type, amount, claimed_at
player_streaks: player_id, current_streak, longest_streak, last_claim_date, multiplier
achievements: id, category, tier, title, description, reward
player_achievements: player_id, achievement_id, progress, completed_at
"""
    },

    # === REACT PATTERNS (4) ===
    {
        "domain": "react",
        "category": "pattern",
        "title": "Zustand State Management",
        "summary": "Use Zustand for client state. Persist UI preferences only, not game state. Use selectors.",
        "source_file": "src/lib/stores/uiStore.ts",
        "tags": ["react", "zustand", "state-management"],
        "content": """# Zustand State Management

Location: src/lib/stores/

## Store Pattern
create with persist middleware for UI preferences

## Usage with Selectors
Good: const theme = useUIStore((state) => state.theme);
Bad: const { theme } = useUIStore();

## Rules
- Only persist UI preferences
- Never persist game state
- Use selectors for performance
"""
    },
    {
        "domain": "react",
        "category": "pattern",
        "title": "Auth Provider Pattern",
        "summary": "AuthProvider wraps app, manages Supabase session. useAuth() provides user, loading, signIn, signOut.",
        "source_file": "src/components/auth/AuthProvider.tsx",
        "tags": ["react", "auth", "context", "supabase"],
        "content": """# Auth Provider Pattern

Location: src/components/auth/AuthProvider.tsx

## Structure
AuthContext with user, loading, signIn, signOut
AuthProvider listens to onAuthStateChange
useAuth() hook with context check

## Usage
const { user, loading, signOut } = useAuth();
if (loading) return Spinner;
if (!user) return LoginPrompt;
"""
    },
    {
        "domain": "react",
        "category": "pattern",
        "title": "Session Recovery Hook",
        "summary": "useSessionRecovery() detects expired sessions, shows recovery modal without losing page state.",
        "source_file": "src/hooks/useSessionRecovery.ts",
        "tags": ["react", "hooks", "auth", "session"],
        "content": """# Session Recovery Hook

Location: src/hooks/useSessionRecovery.ts

## Hook Returns
needsRecovery: boolean
isRecovering: boolean
recover: (email, password) => Promise

## Usage
if (needsRecovery) return SessionRecoveryModal;

Handles TOKEN_REFRESHED and unexpected SIGNED_OUT events.
"""
    },
    {
        "domain": "react",
        "category": "pattern",
        "title": "React Three Fiber Pattern",
        "summary": "3D rendering with R3F. Canvas wrapper, useFrame for game loop, separate logic from rendering.",
        "source_file": "src/components/game/GameCanvas.tsx",
        "tags": ["react", "three-fiber", "3d", "game"],
        "content": """# React Three Fiber Pattern

## Structure
GameCanvas.tsx: Canvas wrapper
Snake3D.tsx: Snake mesh
Food3D.tsx: Food objects
GameLoop.tsx: useFrame logic

## Rules
- Separate logic from rendering
- Use refs for frequent updates
- Avoid state updates in useFrame
- Use drei helpers
"""
    },

    # === TESTING (2) ===
    {
        "domain": "testing",
        "category": "requirement",
        "title": "95% Coverage Requirement",
        "summary": "All code must have 95%+ test coverage. Hook blocks writes without tests.",
        "source_file": ".claude/hooks/pre-tool-use/02-require-tests.sh",
        "tags": ["testing", "coverage", "quality"],
        "content": """# 95% Coverage Requirement

## Enforcement
Hook: .claude/hooks/pre-tool-use/02-require-tests.sh

## Test File Naming
src/lib/utils.ts -> src/lib/utils.test.ts
src/components/Foo.tsx -> src/components/Foo.test.tsx

## Commands
npm test -- --coverage
npm test -- src/lib/utils.test.ts
"""
    },
    {
        "domain": "testing",
        "category": "pattern",
        "title": "API Route Testing Pattern",
        "summary": "Test API routes with mocked Supabase. Test auth, validation, success, and error cases.",
        "source_file": "src/app/api/streaks/route.test.ts",
        "tags": ["testing", "api", "mocking"],
        "content": """# API Route Testing Pattern

## Setup
Mock @/lib/supabase/server createClient
Use createMocks for requests

## Test Cases
- Unauthenticated: 401
- Invalid input: 400
- Valid request: 200
- Database error: 500
- Rate limited: 429
"""
    },

    # === PLATFORM/HOOKS (2) ===
    {
        "domain": "platform",
        "category": "pattern",
        "title": "PreToolUse Hook Pattern",
        "summary": "PreToolUse hooks can block (exit 2 = block, exit 0 = allow). Receive JSON via stdin.",
        "source_file": ".claude/hooks/pre-tool-use/01-block-incomplete-code.sh",
        "tags": ["platform", "hooks", "pre-tool-use"],
        "content": """# PreToolUse Hook Pattern

Location: .claude/hooks/pre-tool-use/

## Exit Codes
exit 0 = Allow
exit 2 = Block (shows stderr)

## Template
Read INPUT from stdin
Parse with jq: tool_name, file_path, content
Check only Write/Edit tools
Check only src/ files
Block with exit 2 on violation

Only PreToolUse can block. Other hooks are informational.
"""
    },
    {
        "domain": "platform",
        "category": "convention",
        "title": "Hook Stderr Convention",
        "summary": "All hook output must go to stderr. Stdout is for tool output.",
        "source_file": ".claude/hooks/",
        "tags": ["platform", "hooks", "stderr"],
        "content": """# Hook Stderr Convention

## Rule
All hook messages go to stderr with >&2

## Why
stdout = tool output (data)
stderr = hook messages (status)
Claude sees both

## Tips
Use emoji prefixes
Indent continuation lines
Include fix suggestions
"""
    },

    # === GAME LOGIC (3) ===
    {
        "domain": "game",
        "category": "implementation",
        "title": "SnakeGameLogic Class",
        "summary": "Core game logic: movement, collision, scoring. Pure TypeScript, server-authoritative.",
        "source_file": "src/lib/game/SnakeGameLogic.ts",
        "tags": ["game", "logic", "snake"],
        "content": """# SnakeGameLogic Class

Location: src/lib/game/SnakeGameLogic.ts

## Key Methods
update(delta): Main game loop tick
setDirection(dir): Handle input
getState(): Get current state for rendering
reset(): Start new game

## State
snake positions, food positions, direction, score, level, dnaEarned

## Rules
Pure TypeScript, no React
Server validates all state
Client uses for prediction
"""
    },
    {
        "domain": "game",
        "category": "system",
        "title": "Snake Variants and Dynasty",
        "summary": "Snakes have genetic traits. Dynasty tracks lineage. Breeding combines traits with mutation.",
        "source_file": "src/shared/types/snake.ts",
        "tags": ["game", "breeding", "dynasty"],
        "content": """# Snake Variants and Dynasty

## Traits
pattern: solid, striped, spotted, gradient
colors: primary, secondary
ability: none, speed_boost, shield, magnet, ghost
rarity: common (60%), rare (25%), epic (12%), legendary (3%)

## Dynasty
Tracks lineage from founder
Generation counting
Prestige bonus from achievements

## Breeding
2 parents required
5% mutation chance
24-hour cooldown
"""
    },
    {
        "domain": "engagement",
        "category": "system",
        "title": "Daily Rewards 28-Day Cycle",
        "summary": "One reward per day. Days 7, 14, 21, 28 have bonus rewards. Streak multiplier applies.",
        "source_file": "src/shared/config/engagement.ts",
        "tags": ["engagement", "daily-rewards", "cycle"],
        "content": """# Daily Rewards 28-Day Cycle

## Schedule
Days 1-6: 50-100 DNA
Day 7: 200 DNA bonus
Days 8-13: 75-125 DNA
Day 14: Rare Skin
Days 15-20: 100-150 DNA
Day 21: 500 DNA bonus
Days 22-27: 125-200 DNA
Day 28: Legendary Egg

Cycle resets after day 28.
Streak multiplier applies to DNA rewards.

## UI
28-day calendar grid
Highlight current day
Preview upcoming rewards
"""
    },

    # === SECURITY (3) ===
    {
        "domain": "security",
        "category": "enforcement",
        "title": "Security Hooks",
        "summary": "Multiple hooks enforce: no secrets, no SQL concat, parameterized queries, server authority.",
        "source_file": ".claude/hooks/pre-tool-use/03-block-security-issues.sh",
        "tags": ["security", "hooks", "enforcement"],
        "content": """# Security Hooks

## 03-block-secrets.sh
Blocks: PASSWORD=", API_KEY=", SECRET=", Bearer tokens, AWS keys

## 04-sql-injection.sh
Blocks SQL string concatenation
Requires parameterized queries

## 07-enforce-server-authority.sh
Blocks game state in localStorage

## 08-validate-rls.sh
Ensures RLS policies for new tables

No bypass available.
"""
    },
    {
        "domain": "security",
        "category": "pattern",
        "title": "RLS Policies",
        "summary": "All tables have Row Level Security. Players can only read/write their own data.",
        "source_file": "supabase/migrations/001_initial_schema.sql",
        "tags": ["security", "rls", "supabase"],
        "content": """# Row Level Security

## Standard Pattern
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

CREATE POLICY for SELECT: auth.uid() = player_id
CREATE POLICY for INSERT: auth.uid() = player_id
CREATE POLICY for UPDATE: auth.uid() = player_id

No delete by default (soft delete).

## Service Role
Server uses SUPABASE_SERVICE_ROLE_KEY to bypass RLS.
"""
    },
    {
        "domain": "security",
        "category": "policy",
        "title": "Secrets Prevention",
        "summary": "Never hardcode secrets. Use environment variables. Hook scans and blocks.",
        "source_file": ".claude/hooks/pre-tool-use/03-block-security-issues.sh",
        "tags": ["security", "secrets", "environment"],
        "content": """# Secrets Prevention

## Rule
Never hardcode secrets. Always use process.env.

## Detected Patterns
PASSWORD=", API_KEY=", SECRET=", TOKEN="
Bearer tokens, sk_live_, sk_test_
AKIA (AWS), eyJ (JWT)

## Git Protection
.env* in .gitignore
.env.example shows structure only
"""
    },
]


def main():
    """Populate memories into Supabase"""
    print("Populating Supabase claude_memories table...")
    print(f"Total memories to create: {len(MEMORIES)}")
    print()

    handler = MemoryToolHandler()

    if not handler.use_supabase:
        print("ERROR: Supabase not configured. Check .env file.", file=sys.stderr)
        sys.exit(1)

    created = 0
    updated = 0
    errors = 0

    for memory in MEMORIES:
        try:
            # Check if memory already exists by title
            existing = handler.supabase.table('claude_memories') \
                .select('id') \
                .eq('title', memory['title']) \
                .execute()

            if existing.data:
                # Update existing
                handler.supabase.table('claude_memories') \
                    .update({
                        'domain': memory['domain'],
                        'category': memory['category'],
                        'summary': memory['summary'],
                        'content': memory['content'],
                        'source_file': memory.get('source_file'),
                        'tags': memory.get('tags', []),
                        'updated_at': datetime.now(timezone.utc).isoformat(),
                    }) \
                    .eq('id', existing.data[0]['id']) \
                    .execute()
                print(f"  Updated: {memory['title']}")
                updated += 1
            else:
                # Create new
                handler.supabase.table('claude_memories') \
                    .insert({
                        'domain': memory['domain'],
                        'category': memory['category'],
                        'title': memory['title'],
                        'summary': memory['summary'],
                        'content': memory['content'],
                        'source_file': memory.get('source_file'),
                        'tags': memory.get('tags', []),
                        'relevance_score': 1.0,
                        'times_applied': 0,
                    }) \
                    .execute()
                print(f"  Created: {memory['title']}")
                created += 1

        except Exception as e:
            print(f"  Error with '{memory['title']}': {e}", file=sys.stderr)
            errors += 1

    print()
    print(f"Summary: {created} created, {updated} updated, {errors} errors")
    print()

    # Verify count
    try:
        result = handler.supabase.table('claude_memories') \
            .select('id', count='exact') \
            .execute()
        print(f"Total memories in database: {result.count}")
    except Exception as e:
        print(f"Could not verify count: {e}", file=sys.stderr)


if __name__ == '__main__':
    main()
