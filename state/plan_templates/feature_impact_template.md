# Feature Impact Assessment: [FEATURE NAME]

**Date**: YYYY-MM-DD
**Assessor**: Claude + [Human]
**Time to Complete**: Target <10 min
**Status**: [ ] Draft | [ ] Reviewed | [ ] Approved | [ ] Rejected

---

## 1. Feature Summary (2 min)

**What**: [One sentence description]

**Why**: [Business/player value]

**Primary System**: [From 01_SYSTEM_GRAPH.md]

**Tier**: [0-5 from System Graph]

---

## 2. Dependency Scan (2 min)

### Systems This Feature READS FROM:
| System | Data Needed | Risk if Unavailable |
|--------|-------------|---------------------|
| | | |

### Systems This Feature WRITES TO:
| System | Data Changed | Downstream Impact |
|--------|--------------|-------------------|
| | | |

### Prerequisites (Must Exist First):
- [ ] [System] - Status: [Built/In Progress/Not Started]

---

## 3. Constraint Quick-Check (3 min)

**Severity Key:**
- **HARD**: Violation = cannot ship
- **SOFT**: Violation = needs justification/mitigation
- **WATCH**: Monitor in testing

### Business Model (BM)
- [ ] BM-001: Pay for Convenience, Not Power — Severity: ___
- [ ] BM-002: No Forced Ad Viewing — Severity: ___
- [ ] BM-003: No Paywalling Basic Features — Severity: ___
- [ ] BM-004: Starter Bundle Timing — Severity: ___

### Core Engagement (CE)
- [ ] CE-001: 70/30 Lab/Snake Time Split — Severity: ___
- [ ] CE-002: 3+ Sessions Daily — Severity: ___
- [ ] CE-003: 15+ Min Session Length — Severity: ___
- [ ] CE-004: Retention Targets (D1/D7/D30) — Severity: ___
- [ ] CE-005: Energy as Engagement Gate — Severity: ___

### Progression (PR)
- [ ] PR-001: Infinite Progression — Severity: ___
- [ ] PR-002: Prestige with Permanent Bonuses — Severity: ___
- [ ] PR-003: 20+ Variants by D30 — Severity: ___
- [ ] PR-004: Gen 5+ by D30 — Severity: ___
- [ ] PR-005: 100+ Lab Interactions by D30 — Severity: ___

### Balance (BA)
- [ ] BA-001: Skill-Based Competitive Fairness — Severity: ___
- [ ] BA-002: Resource Economy Balance — Severity: ___
- [ ] BA-003: Exponential Cost, Linear Power — Severity: ___
- [ ] BA-004: No Inventory Management Tedium — Severity: ___

### Social (SO) — FLEXIBLE for v0.1
- [ ] SO-001: 40% Clan Participation by D30 — Severity: WATCH
- [ ] SO-002: No Daily Clan Requirements — Severity: WATCH
- [ ] SO-003: Corp-Based Trading Only — Severity: WATCH
- [ ] SO-004: Social Discovery Day 2-3 — Severity: WATCH

### Technical (TE)
- [ ] TE-001: 60fps on Mid-Range Devices — Severity: ___
- [ ] TE-002: Offline Capability — Severity: ___
- [ ] TE-003: Cross-Platform Progression — Severity: ___
- [ ] TE-004: 10k Concurrent Users — Severity: ___

### Content (CO) — FLEXIBLE for v0.1
- [ ] CO-001: 500+ Variants — Severity: WATCH
- [ ] CO-002: 5 Languages at Launch — Severity: WATCH
- [ ] CO-003: WCAG 2.1 AA Accessibility — Severity: WATCH
- [ ] CO-004: Monthly Content Drops — Severity: WATCH

---

## 4. Multi-System Ripple Analysis (2 min)

**Primary Change**: [What this feature directly modifies]

**Level 1 Effects** (Direct):
- [System] → [Specific change]

**Level 2 Effects** (One hop):
- [System A change] → affects [System B] because [reason]

**Level 3 Effects** (Two hops, if critical):
- [System B change] → affects [System C] because [reason]

---

## 5. Rollback Criteria (1 min)

### Automatic Rollback Triggers:
- [ ] D7 retention drops >5% from baseline
- [ ] Session length drops below 10 min average
- [ ] Lab time ratio drops below 50%
- [ ] Crash rate exceeds 2%
- [ ] [Custom]: [threshold]

### Manual Review Triggers:
- [ ] Player complaints exceed [N] per day about [topic]
- [ ] [Specific behavior] observed

### Rollback Method:
- [ ] Feature flag (instant disable)
- [ ] Database migration reversal
- [ ] Client update required
- [ ] Cannot rollback (document why)

---

## 6. Go/No-Go Decision

### Summary:
| Category | HARD Violations | SOFT Violations | WATCH Items |
|----------|-----------------|-----------------|-------------|
| Business Model | | | |
| Core Engagement | | | |
| Progression | | | |
| Balance | | | |
| Technical | | | |

**Total HARD Violations**: [count]
**Total SOFT Violations Needing Mitigation**: [count]

### Decision: [ ] GO | [ ] GO WITH CONDITIONS | [ ] NO-GO

**Conditions (if applicable)**:
1.
2.

**Approver**: [Name/Role]
**Date**: YYYY-MM-DD

---

## Post-Implementation Notes

_Fill in after feature ships:_

**Actual Impact**:
-

**Lessons Learned**:
-

**Constraints to Re-evaluate**:
-
