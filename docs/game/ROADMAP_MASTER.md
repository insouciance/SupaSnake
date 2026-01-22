# SupaSnake v0.1 Roadmap Master
## Development Hub - Single Source of Truth

**Version:** 1.0
**Last Updated:** 2025-01-22
**Status:** Active Development
**Goal:** Validate 70/30 Lab/Snake hypothesis with 5-variant MVP

---

## Quick Links

| Document | Purpose |
|----------|---------|
| [FEATURE_SPECIFICATION_TEMPLATE](templates/FEATURE_SPECIFICATION_TEMPLATE.md) | How to write feature specs |
| [FEATURE_GRADING_FRAMEWORK](FEATURE_GRADING_FRAMEWORK.md) | How to grade features |
| [CONSTRAINT_LATTICE](00_CONSTRAINT_LATTICE.md) | 28 design rules |
| [SYSTEM_GRAPH](01_SYSTEM_GRAPH.md) | System dependencies |
| [MVP_SCOPE](02_MVP_SCOPE.md) | Phase planning |

---

## v0.1 MVP Scope Summary

**Target:** Minimum viable meta-game to test core hypothesis

| Metric | Target | Rationale |
|--------|--------|-----------|
| **Variants** | 5 (1 starter + 4 breedable) | Minimum to test breeding loop |
| **Dynasties** | 3 (CYBER, PRIMAL, COSMIC) | Already designed and locked |
| **Core Loop** | Snake → DNA → Collection → Breeding | Validate 70/30 split |
| **Timeline** | 6 weeks | Sprint 1-3 |

**What's IN v0.1:**
- Collection UI (browse snakes)
- Basic breeding (2 parents → 1 child)
- 5 snake variants
- Minimal tutorial (first 5 min)
- Energy tuning

**What's OUT (deferred to v0.2):**
- Evolution (Gen 2+)
- Set bonuses
- Achievements
- Social features
- Shop/monetization UI
- 500 variants

---

## Sprint Overview

| Sprint | Weeks | Focus | Features | Status |
|--------|-------|-------|----------|--------|
| **Sprint 0** | Pre | Documentation | Roadmap, specs, graders | ✅ Complete |
| **Sprint 1** | 1-2 | Data + Collection | Snake Data Model, Collection UI | 🔲 Not Started |
| **Sprint 2** | 3-4 | Breeding Loop | Breeding System | 🔲 Not Started |
| **Sprint 3** | 5-6 | Polish + Validate | Tutorial, Energy Tuning, Hypothesis Test | 🔲 Not Started |

---

## Feature Tracker

### Legend
- ✅ Complete (all graders pass)
- 🔄 In Progress
- 🔲 Not Started
- ⛔ Blocked (dependency not met)
- 📋 Spec Complete (ready to build)

### P0 Features (Must Have)

| Feature | Spec | Status | Graders | Dependencies | Sprint |
|---------|------|--------|---------|--------------|--------|
| **Snake Data Model** | [specs/SNAKE_DATA_MODEL_spec.md](specs/SNAKE_DATA_MODEL_spec.md) | 📋 Spec Complete | 🔲 | Backend ✅ | 1 |
| **Collection UI** | [specs/COLLECTION_UI_spec.md](specs/COLLECTION_UI_spec.md) | 📋 Spec Complete | 🔲 | Snake Data Model | 1 |
| **Breeding System** | [specs/BREEDING_SYSTEM_spec.md](specs/BREEDING_SYSTEM_spec.md) | 📋 Spec Complete | 🔲 | Collection UI | 2 |

### P1 Features (Should Have)

| Feature | Spec | Status | Graders | Dependencies | Sprint |
|---------|------|--------|---------|--------------|--------|
| **Basic Tutorial** | [specs/TUTORIAL_spec.md](specs/TUTORIAL_spec.md) | 📋 Spec Complete | 🔲 | Collection UI, Breeding | 3 |
| **Energy Tuning** | [specs/ENERGY_TUNING_spec.md](specs/ENERGY_TUNING_spec.md) | 📋 Spec Complete | 🔲 | None (existing system) | 3 |

### Already Complete (Foundation)

| Feature | Status | Notes |
|---------|--------|-------|
| Core Snake Game | ✅ | 60fps, 3D, polished |
| Energy System | ✅ | Server-authoritative |
| Backend APIs | ✅ | Supabase, auth, sessions |
| Dynasty System Design | ✅ | 3 dynasties, 10 variants each |

---

## Current Sprint: Sprint 0 (Documentation)

### Sprint 0 Goals
- [x] Create FEATURE_SPECIFICATION_TEMPLATE.md
- [x] Create FEATURE_GRADING_FRAMEWORK.md
- [x] Create ROADMAP_MASTER.md
- [x] Create SNAKE_DATA_MODEL_spec.md
- [x] Create COLLECTION_UI_spec.md
- [x] Create BREEDING_SYSTEM_spec.md
- [x] Create TUTORIAL_spec.md
- [x] Create ENERGY_TUNING_spec.md

### Sprint 0 Exit Criteria
- [x] All 5 feature specs complete with grading logic
- [ ] At least one spec reviewed and approved
- [ ] Grading framework tested on existing Snake game

---

## Dependency Graph (v0.1)

```
                    ┌──────────────────┐
                    │   Backend ✅      │
                    │ (Supabase, Auth)  │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ Snake Data Model │ ← Sprint 1
                    │   (5 variants)   │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │  Collection UI   │ ← Sprint 1
                    │ (browse snakes)  │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ Breeding System  │ ← Sprint 2
                    │ (2→1 breeding)   │
                    └────────┬─────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐
    │  Basic Tutorial  │          │  Energy Tuning   │ ← Sprint 3
    │   (first 5 min)  │          │  (balance adj)   │
    └──────────────────┘          └──────────────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ HYPOTHESIS TEST  │
                    │ (70/30 split?)   │
                    └──────────────────┘
```

---

## Constraints Checkpoint (v0.1)

### HARD Constraints (Must Meet)

| Constraint | Target | How We'll Validate |
|------------|--------|-------------------|
| BM-001: No P2W | F2P can achieve all outcomes | Grader check, playtest |
| BM-002: No forced ads | Ads are opt-in | Code review |
| BM-003: No paywall on core | Core loop free | Playtest checklist |
| TE-001: 60fps | Performance test | Lighthouse, manual |
| TE-003: Cross-platform sync | Backend persistence | Integration test |

### SOFT Constraints (Target, Track)

| Constraint | Target | How We'll Track |
|------------|--------|-----------------|
| CE-001: 70/30 split | 70% Lab time | Analytics (add in Sprint 3) |
| CE-004: Retention | D1 40%, D7 15% | Post-launch tracking |
| PR-003: 20+ variants D30 | Adjusted to 5 for v0.1 | Collection tracking |

### WATCH Constraints (Deferred)

| Constraint | v0.1 Status | v0.2 Target |
|------------|-------------|-------------|
| CO-001: 500 variants | 5 variants | 30 variants |
| SO-001: 40% clan | No clans | Basic clans |
| CO-002: 5 languages | English only | Add 4 more |

---

## Development Workflow

### Before Starting a Feature

```
1. READ the spec in docs/game/specs/
2. COMPLETE Feature Impact Assessment (state/feature_decisions/)
3. VERIFY dependencies are met (check this document)
4. START implementation
```

### After Completing a Feature

```
1. RUN deterministic graders (build, test, lint)
2. RUN LLM graders (UX, Code Quality, Balance)
3. COMPLETE human playtest checklist
4. UPDATE this document:
   - Change feature status to ✅
   - Update graders column
   - Add any notes
5. LOG results in state/evals/
```

### If a Feature Fails Grading

```
1. IDENTIFY which grader failed
2. READ the failure feedback
3. FIX the specific issues
4. RE-RUN graders from the failed level
5. DO NOT skip grading levels
```

---

## Grading Summary (Updated per feature)

| Feature | Deterministic | UX Review | Code Quality | Balance | Human | Overall |
|---------|---------------|-----------|--------------|---------|-------|---------|
| Snake Data Model | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 |
| Collection UI | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 |
| Breeding System | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 |
| Tutorial | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 |
| Energy Tuning | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 |

---

## Risk Tracker

| Risk | Likelihood | Impact | Mitigation | Status |
|------|------------|--------|------------|--------|
| 70/30 split doesn't emerge | Medium | High | Add engagement hooks to Lab | Monitoring |
| Energy balance wrong | High | High | A/B test in soft launch | Planned |
| Breeding too simple | Low | Medium | Design expansion for v0.2 | Documented |
| 5 variants not enough | Medium | Medium | Can add more post-launch | Accepted |

---

## Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2025-01-22 | 1.0 | Claude | Initial roadmap creation |

---

## Next Actions

**Immediate (Today):**
1. Complete Sprint 0 (all feature specs)
2. Test grading framework on existing Snake game

**Sprint 1 Start:**
1. Implement Snake Data Model
2. Implement Collection UI
3. Run graders, iterate until pass

---

*This document is the single source of truth for v0.1 development. Update it after every feature completion.*
