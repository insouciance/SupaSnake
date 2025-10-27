# Architectural Decision: Server Authority

**Date:** 2025-10-19
**Status:** Active
**Impact:** Critical - Affects all game state management

## Decision

Implement server-authoritative architecture where the server is the single source of truth for all game state.

## Context

We need to build a secure, cheat-proof mobile F2P game that can eventually support multiplayer features.

## Rationale

### Why Server Authority?

**Security:**
- Prevents cheating (players can't modify localStorage for infinite DNA)
- Enables server-side validation of all mutations
- Protects game economy

**Multiplayer Readiness:**
- Single source of truth enables future multiplayer
- No sync conflicts between clients
- Consistent state across all devices

**Data Integrity:**
- Player progress stored in database, not localStorage
- No data loss from cleared browser/app cache
- Reliable backup and recovery

### AAA Standard for 2026

This is the industry standard for professional game development. Games that store state client-side are considered amateur and vulnerable.

## Implementation

### The 4 Principles

1. **Client Displays, Server Decides**
   - Client shows UI and collects input
   - Server processes all game logic
   - Client receives results and updates display

2. **API Routes for All Mutations**
   - Every state change goes through API
   - Client never directly accesses database
   - API validates, processes, persists

3. **Secrets Stay Server-Side**
   - No SERVICE_ROLE_KEY in client code
   - No private keys in client code
   - Sensitive operations in API routes only

4. **Config-Driven Balance**
   - Game constants in `src/shared/config/game.ts`
   - No hard-coded DNA costs, spawn rates
   - Can tune without code changes

### Enforcement Mechanism

5 hooks enforce server authority deterministically:

1. **Hook 07** - Blocks localStorage for game state
2. **Hook 08** - Blocks client database access
3. **Hook 09** - Blocks client secrets
4. **Hook 10** - Blocks hard-coded constants
5. **Hook 04** - Comprehensive architecture audit

**Result:** Violations are impossible to commit to production.

### localStorage Policy

**✅ Allowed (UI State):**
- Theme, volume, language
- Input preferences
- Tutorial completion flags
- Analytics consent

**❌ Never Allowed (Game State):**
- DNA, score, level
- Inventory, collection
- Unlocks, achievements
- Any progress data

**Rule:** If losing it means losing progress → Server. If losing it means re-selecting preferences → localStorage.

## Alternatives Considered

### Alternative 1: Client-Side State with Sync

**Pros:**
- Works offline
- Faster perceived performance

**Cons:**
- Vulnerable to cheating
- Complex sync logic
- Conflict resolution needed
- Still need server validation

**Why Rejected:** Adds complexity without solving security issues. Players can still cheat by modifying local state.

### Alternative 2: Hybrid (Some State Client, Some Server)

**Pros:**
- Flexibility for different data types

**Cons:**
- Confusing mental model
- Easy to make mistakes
- Partial security (still vulnerable)

**Why Rejected:** Inconsistent architecture leads to bugs. Better to have one clear rule.

## Consequences

### Positive

✅ Cheat-proof game state
✅ Multiplayer-ready architecture
✅ Reliable data persistence
✅ Professional AAA quality
✅ Deterministic enforcement via hooks

### Negative

❌ Requires network for gameplay
❌ Slightly higher server costs
❌ More API routes to maintain

**Mitigation:** Implement offline queue for mutations, sync when connection restored. Cache read-only reference data (game constants, variant info) client-side.

## Validation

**How to verify:**
1. Disable JavaScript in browser → Game should fail gracefully
2. Clear localStorage → Should NOT lose game progress
3. Modify localStorage manually → Should NOT affect game state
4. Test with multiple devices → Should sync seamlessly
5. Run Hook 04 architecture audit → Should pass all checks

## Related Decisions

- Use Supabase Row Level Security (RLS) for permissions
- API routes in `src/app/api/` with Next.js
- Shared types in `src/shared/types/` for client-server communication

## References

- [Server Authority Guide](/knowledge_base/platform/how_to/maintain_server_authority.md)
- [Architectural Gates](/knowledge_base/platform/quick_ref/architectural_gates.md)
- [Hook 07 Implementation](/.claude/hooks/pre-tool-use/07-enforce-server-authority.sh)

## Lessons Learned

**2025-10-19:** Hooks are essential for enforcement. Without them, developers (including AI assistants) will accidentally violate server authority. Deterministic enforcement is the only way to guarantee compliance.
