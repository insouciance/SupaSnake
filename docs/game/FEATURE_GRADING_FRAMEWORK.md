# Feature Grading Framework
## How to Measure "Feature Complete"

**Version:** 1.0
**Date:** 2025-01-22
**Purpose:** Standardized evaluation process for all SupaSnake features

---

## Overview

Every feature must pass three levels of grading before it's considered complete:

```
┌─────────────────────────────────────────────────────────┐
│                    GRADING PYRAMID                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│                    ┌─────────┐                          │
│                    │  HUMAN  │  ← Manual playtesting    │
│                    │ (10%)   │                          │
│                ┌───┴─────────┴───┐                      │
│                │      LLM       │  ← AI-assisted review │
│                │    (30%)       │                       │
│            ┌───┴─────────────────┴───┐                  │
│            │     DETERMINISTIC       │  ← Automated     │
│            │        (60%)            │                  │
│            └─────────────────────────┘                  │
│                                                         │
│  Run from bottom to top. Each level gates the next.     │
└─────────────────────────────────────────────────────────┘
```

**Principle:** Deterministic graders run first (fast, cheap). Only if they pass do LLM graders run (slower, cost). Only if LLM graders pass does human verification happen (slowest, most expensive).

---

## 1. Deterministic Graders (Automated)

### What They Check

| Grader | Command | Pass Criteria | Blocks |
|--------|---------|---------------|--------|
| **TypeScript Build** | `npm run build` | 0 errors, 0 warnings | All other graders |
| **Unit Tests** | `npm test` | 100% pass | LLM graders |
| **Constraint Hook** | Automatic on code write | No exit 2 blocks | All code changes |
| **ESLint** | `npm run lint` | 0 errors | Commit |
| **Performance** | Lighthouse or manual | 60fps, <100ms response | Human verification |

### Running Deterministic Graders

```bash
# Full deterministic suite
npm run build && npm test && npm run lint

# Quick check (build + tests for specific feature)
npm run build && npm test -- --grep "[FeatureName]"
```

### Constraint Hook Integration

The pre-tool-use hook `.claude/hooks/pre-tool-use/12-constraint-check.sh` automatically checks for:
- BM-001 violations (premium-only content patterns)
- BM-002 violations (forced ad patterns)
- BM-003 violations (paywall on core features)
- SO-002 violations (daily clan requirements)

**If blocked:** Fix the code before proceeding. The hook error message explains what to change.

---

## 2. LLM Graders (AI-Assisted)

### Sub-Agents Available

| Sub-Agent | Purpose | When to Use |
|-----------|---------|-------------|
| **UX Reviewer** | User experience quality | After UI is implemented |
| **Code Quality Reviewer** | Code maintainability | After all code written |
| **Balance Reviewer** | Game balance | After mechanics finalized |
| **Security Reviewer** | Security vulnerabilities | Before production deploy |
| **Performance Reviewer** | Performance analysis | After feature complete |

### Grading Scale

| Score | Meaning | Action |
|-------|---------|--------|
| **9-10** | Excellent | Ship as-is |
| **7-8** | Good | Ship, note improvements for later |
| **5-6** | Acceptable | Fix issues before shipping |
| **3-4** | Poor | Major rework needed |
| **1-2** | Failing | Redesign required |

**Pass threshold:** >= 7/10 for all LLM graders

### Standard LLM Grader Prompts

#### UX Review Prompt
```yaml
You are reviewing the [FEATURE_NAME] feature for user experience quality.

Context:
- Game: SupaSnake (mobile-first F2P snake game with collection meta-game)
- Key constraint: CE-001 (70% Lab time, 30% Snake time)
- Target: Casual mobile gamers

Files to review:
[List relevant component files]

Evaluation criteria (score each 1-10):

1. **Discoverability (weight: 2x)**
   - Can a new user find and understand this feature in <30 seconds?
   - Is it clear what actions are available?

2. **Responsiveness (weight: 2x)**
   - Are all interactions <100ms response time?
   - Is there appropriate loading/feedback states?

3. **Visual Consistency (weight: 1x)**
   - Does the design match the game aesthetic?
   - Are colors, typography, spacing consistent?

4. **Error Handling (weight: 1x)**
   - Are error states communicated clearly?
   - Can users recover from errors easily?

5. **Mobile Usability (weight: 2x)**
   - Are touch targets >= 44px?
   - Does it work in portrait orientation?
   - Is text readable without zooming?

Provide:
- Score for each criterion with justification
- Weighted average (pass if >= 7.0)
- Top 3 specific improvements if score < 9
```

#### Code Quality Review Prompt
```yaml
You are reviewing the [FEATURE_NAME] code for maintainability.

Context:
- Stack: Next.js 14 + TypeScript + Supabase
- Style: Functional components, Zustand for state

Files to review:
[List relevant code files]

Evaluation criteria (score each 1-10):

1. **Type Safety (weight: 2x)**
   - Are all types explicit (no 'any')?
   - Are interfaces well-defined?

2. **Component Size (weight: 1x)**
   - Are components <200 lines?
   - Is logic appropriately split?

3. **Separation of Concerns (weight: 2x)**
   - Is business logic separate from UI?
   - Are API calls in appropriate service layer?

4. **Error Handling (weight: 1x)**
   - Are errors caught and handled?
   - Are error messages user-friendly?

5. **Testability (weight: 1x)**
   - Are functions pure where possible?
   - Are dependencies injectable?

6. **Documentation (weight: 1x)**
   - Are complex functions commented?
   - Are component props documented?

Provide:
- Score for each criterion with justification
- Weighted average (pass if >= 7.0)
- Top 3 specific code improvements if score < 9
```

#### Balance Review Prompt
```yaml
You are reviewing the [FEATURE_NAME] for game balance.

Context:
- Game: SupaSnake F2P collection game
- Monetization: Pay for convenience, not power (BM-001)
- Economy: DNA is primary currency

Relevant constraints:
- BM-001: F2P must achieve same outcomes as payers
- BA-002: Resource economy balanced across modes
- CE-001: 70% Lab time, 30% Snake time

Feature details:
[Describe the feature's economy/progression impact]

Evaluation criteria (score each 1-10):

1. **F2P Parity (weight: 3x)**
   - Can F2P players achieve same outcomes?
   - Is time-to-reward reasonable for F2P?

2. **Economy Impact (weight: 2x)**
   - Are DNA costs/rewards balanced?
   - Does this create inflation/deflation?

3. **Progression Feel (weight: 2x)**
   - Is progress rewarding?
   - Is it too fast (trivial) or too slow (frustrating)?

4. **Exploit Prevention (weight: 1x)**
   - Are there obvious exploits?
   - Can players abuse edge cases?

5. **Engagement Support (weight: 2x)**
   - Does this support Lab-first design?
   - Does it encourage daily return?

Provide:
- Score for each criterion with justification
- Weighted average (pass if >= 7.0)
- Specific balance concerns if any
```

### Running LLM Graders

**Method 1: Sub-Agent (Recommended)**
```
"Run UX Reviewer sub-agent on Collection UI feature"
```

**Method 2: Direct Prompt**
Copy the relevant prompt, fill in feature details, submit to Claude.

**Method 3: Batch Review**
```
"Review [FEATURE] using all three grader prompts: UX, Code Quality, Balance"
```

### Recording Results

After grading, log results in `state/evals/grader_results.md`:

```markdown
## [FEATURE_NAME] - [DATE]

### LLM Grader Results

| Grader | Score | Pass? | Notes |
|--------|-------|-------|-------|
| UX Review | 8.2/10 | ✅ | Minor touch target issue |
| Code Quality | 7.5/10 | ✅ | Needs more type safety |
| Balance | 9.0/10 | ✅ | Well balanced |

**Overall:** PASS (all >= 7.0)
**Improvements noted:** [list items for future]
```

---

## 3. Human Graders (Manual)

### When to Use Human Graders

- After ALL deterministic and LLM graders pass
- For subjective "feel" that AI can't assess
- For playtest verification
- For calibration (comparing LLM scores to human judgment)

### Standard Playtest Checklist

```markdown
## [FEATURE_NAME] Playtest Checklist

**Tester:** [Name]
**Date:** [Date]
**Device:** [Device model]
**Build:** [Version/commit]

### Core Functionality
- [ ] Feature loads without errors
- [ ] All buttons/interactions work
- [ ] Data saves correctly
- [ ] Feature works after app restart

### User Experience
- [ ] First impression: [Positive/Neutral/Negative]
- [ ] Confusion points: [List any]
- [ ] Delight moments: [List any]
- [ ] Would you use this feature daily? [Y/N, why]

### Edge Cases
- [ ] Works with 0 items (empty state)
- [ ] Works with max items (stress test)
- [ ] Works offline (if applicable)
- [ ] Handles errors gracefully

### Balance Feel
- [ ] Progression feels rewarding
- [ ] Costs feel fair
- [ ] No obvious exploits found

### Final Verdict
- [ ] **PASS** - Ready to ship
- [ ] **PASS WITH NOTES** - Ship but track issues
- [ ] **FAIL** - Needs rework before shipping

**Notes:**
[Free-form observations]
```

### Calibration Process

**Purpose:** Compare human judgment to LLM grader scores to improve prompts over time.

**Process:**
1. Complete LLM grading first (don't read results)
2. Complete human playtest independently
3. Compare scores
4. If significant disagreement (>2 points), analyze why
5. Update grader prompts to better match human judgment

**Log calibration in `state/evals/calibration.md`:**

```markdown
## Calibration Log

### [DATE] - [FEATURE]

| Criterion | LLM Score | Human Score | Delta | Notes |
|-----------|-----------|-------------|-------|-------|
| UX Overall | 8.0 | 6.5 | -1.5 | LLM missed mobile usability issue |
| Balance | 7.5 | 8.0 | +0.5 | Human found it more fun than LLM expected |

**Action:** Update UX grader prompt to emphasize mobile testing.
```

---

## 4. Grading Workflow Summary

### Per-Feature Workflow

```
1. IMPLEMENT
   └── Code the feature

2. DETERMINISTIC GRADERS (gate)
   ├── npm run build (must pass)
   ├── npm test (must pass)
   ├── npm run lint (must pass)
   └── If any fail → fix and re-run

3. LLM GRADERS (gate)
   ├── UX Review (must >= 7)
   ├── Code Quality Review (must >= 7)
   ├── Balance Review (must >= 7)
   └── If any fail → fix and re-run

4. HUMAN VERIFICATION
   ├── Playtest checklist
   ├── Calibration comparison
   └── Final verdict

5. DONE
   ├── Update ROADMAP_MASTER.md status
   ├── Log results in state/evals/
   └── Move to next feature
```

### Quick Reference Card

| Stage | Tool | Pass Criteria | Time |
|-------|------|---------------|------|
| Build | `npm run build` | 0 errors | ~1 min |
| Test | `npm test` | 100% pass | ~2 min |
| Lint | `npm run lint` | 0 errors | ~30 sec |
| UX Review | Sub-agent | >= 7/10 | ~5 min |
| Code Quality | Sub-agent | >= 7/10 | ~5 min |
| Balance | Sub-agent | >= 7/10 | ~5 min |
| Playtest | Human | Checklist pass | ~15 min |

**Total grading time per feature:** ~30 minutes

---

## 5. Grading Results Storage

### File Structure

```
state/evals/
├── grader_results.md      # LLM grader scores per feature
├── calibration.md         # Human vs LLM comparison
├── ui_checklist.md        # UI/UX test tracking
├── issues.md              # Bugs and problems found
├── wins.md                # What's working well
└── consistency.md         # pass@k testing results
```

### Aggregated Metrics

Track over time:
- Average grader scores per feature
- Calibration delta trends
- Time to pass all graders
- Most common failure reasons

---

## Appendix: Grader Prompt Library

See individual feature specs in `docs/game/specs/` for feature-specific grader prompts.

Generic prompts in this document can be customized per feature by:
1. Filling in [FEATURE_NAME] and file lists
2. Adding feature-specific evaluation criteria
3. Adjusting weights based on feature priorities
