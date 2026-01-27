# Feature Impact Assessment: Collection UI (v0.1 MVP)

**Date**: 2025-01-22
**Assessor**: Claude + User
**Time to Complete**: 8 min
**Status**: [X] Approved

---

## 1. Feature Summary (2 min)

**What**: Basic Collection UI - Display owned snakes, filter by dynasty, view snake details

**Why**: Core meta-game requirement. Players need to see what they've collected and select snakes for breeding. Without this, earned DNA has no purpose.

**Primary System**: Collection Management (from 01_SYSTEM_GRAPH.md)

**Tier**: 2 (Meta-Game Core)

---

## 2. Dependency Scan (2 min)

### Systems This Feature READS FROM:
| System | Data Needed | Risk if Unavailable |
|--------|-------------|---------------------|
| Backend | Player's owned snakes | Cannot display collection |
| Resource Collection | DNA balance (display) | Minor - UI only |
| Core Snake Engine | Dynasty themes/colors | Use defaults if missing |

### Systems This Feature WRITES TO:
| System | Data Changed | Downstream Impact |
|--------|--------------|-------------------|
| Backend | View/filter state (optional) | None - local state OK |
| Breeding UI | Selected parent snakes | Required for next feature |

### Prerequisites (Must Exist First):
- [X] Backend Infrastructure - Status: Built
- [X] Auth & Account System - Status: Built
- [X] UI Framework - Status: Built (Next.js + React)
- [ ] Snake Data Model - Status: Needs definition (5 variants)

---

## 3. Constraint Quick-Check (3 min)

**Affected constraints marked with severity:**

### Business Model (BM)
- [ ] BM-001: Pay for Convenience, Not Power — N/A
- [ ] BM-002: No Forced Ad Viewing — N/A
- [X] BM-003: No Paywalling Basic Features — Severity: **HARD**
  - Collection UI must be free. No premium filters or locked views.
- [ ] BM-004: Starter Bundle Timing — N/A

### Core Engagement (CE)
- [X] CE-001: 70/30 Lab/Snake Time Split — Severity: **SOFT**
  - Collection UI is part of Lab. Must be engaging enough to drive 70% time.
- [ ] CE-002: 3+ Sessions Daily — N/A
- [ ] CE-003: 15+ Min Session Length — N/A
- [ ] CE-004: Retention Targets — N/A (indirect impact)
- [ ] CE-005: Energy as Engagement Gate — N/A

### Progression (PR)
- [ ] PR-001: Infinite Progression — N/A
- [ ] PR-002: Prestige with Permanent Bonuses — N/A
- [X] PR-003: 20+ Variants by D30 — Severity: **SOFT** (adjusted to 5 for v0.1)
  - UI must clearly show collection progress toward goal
- [ ] PR-004: Gen 5+ by D30 — N/A
- [X] PR-005: 100+ Lab Interactions by D30 — Severity: **SOFT**
  - Browsing collection counts as Lab interaction

### Balance (BA)
- [ ] BA-001: Skill-Based Competitive Fairness — N/A
- [ ] BA-002: Resource Economy Balance — N/A
- [ ] BA-003: Exponential Cost, Linear Power — N/A
- [X] BA-004: No Inventory Management Tedium — Severity: **SOFT**
  - Filtering must be intuitive. No manual sorting required.

### Social (SO) — FLEXIBLE for v0.1
- All marked WATCH - no social features in v0.1 Collection UI

### Technical (TE)
- [X] TE-001: 60fps on Mid-Range Devices — Severity: **HARD**
  - List rendering must be performant with 5 items (trivial)
  - Future: Must scale to 500+ items with virtualization
- [ ] TE-002: Offline Capability — Severity: WATCH (nice to have)
- [X] TE-003: Cross-Platform Progression — Severity: **HARD**
  - Collection must sync via backend (already built)
- [ ] TE-004: 10k Concurrent Users — N/A for UI

### Content (CO) — FLEXIBLE for v0.1
- All marked WATCH - v0.1 has only 5 variants

---

## 4. Multi-System Ripple Analysis (2 min)

**Primary Change**: Add Collection UI page to Lab section

**Level 1 Effects** (Direct):
- Lab UI → New "Collection" tab/section added
- Backend → Need GET endpoint for player snakes (may exist)

**Level 2 Effects** (One hop):
- Collection UI → enables Breeding UI (can select parents)
- Collection UI → Tutorial needs to guide here (FTUE impact)

**Level 3 Effects** (Two hops):
- Breeding enabled → Evolution enabled → Full meta-game loop unlocked
- Tutorial guidance → Player discovers Lab → 70/30 split validated

---

## 5. Rollback Criteria (1 min)

### Automatic Rollback Triggers:
- [ ] Session length drops below 10 min average
- [X] Lab time ratio drops below 50%
- [ ] Crash rate exceeds 2%

### Manual Review Triggers:
- [ ] Players report confusion finding collection
- [ ] Collection interactions <5 per session

### Rollback Method:
- [X] Feature flag (instant disable) - flag: `collection_ui_v1`
- [ ] Database migration reversal - N/A (read-only)
- [ ] Client update required - No
- [ ] Cannot rollback - N/A

---

## 6. Go/No-Go Decision

### Summary:
| Category | HARD Violations | SOFT Needing Mitigation | WATCH Items |
|----------|-----------------|-------------------------|-------------|
| Business Model | 0 | 0 | 0 |
| Core Engagement | 0 | 1 (CE-001) | 0 |
| Progression | 0 | 2 (PR-003, PR-005) | 0 |
| Balance | 0 | 1 (BA-004) | 0 |
| Technical | 0 | 0 | 1 (TE-002) |
| Social | 0 | 0 | 4 |
| Content | 0 | 0 | 4 |

**Total HARD Violations**: 0
**Total SOFT Needing Mitigation**: 4

### Mitigations for SOFT Constraints:

1. **CE-001 (70/30 split)**: Make collection browsing satisfying
   - Add snake detail cards with stats
   - Visual feedback on new acquisitions
   - Track time spent to validate hypothesis

2. **PR-003/PR-005 (Collection progress)**: Show clear progress
   - Display "X of 5 collected" prominently
   - Celebrate new acquisitions

3. **BA-004 (No tedium)**: Simple filtering
   - Filter by dynasty (3 dynasties)
   - Sort by newest/generation
   - No pagination needed for 5 items

### Decision: [X] GO

**Conditions**:
1. Track Lab time ratio from Day 1 (validate CE-001)
2. Add basic analytics for collection interactions

**Approver**: User
**Date**: 2025-01-22

---

## Post-Implementation Notes

_Fill in after feature ships:_

**Actual Impact**:
- TBD

**Lessons Learned**:
- TBD

**Constraints to Re-evaluate**:
- TBD
