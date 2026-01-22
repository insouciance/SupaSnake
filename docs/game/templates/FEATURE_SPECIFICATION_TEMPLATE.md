# Feature: [FEATURE_NAME] Specification v1.0
## Production-Ready Design

**Version:** 1.0
**Date:** YYYY-MM-DD
**Status:** [ ] Draft | [ ] Review | [ ] 🔒 LOCKED
**Priority:** [CRITICAL | HIGH | MEDIUM | LOW]
**Sprint:** [Sprint N]

---

## 1. Executive Summary

**One-Paragraph Description:**
[What is this feature? What problem does it solve? Why is it needed for v0.1?]

### Core Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| [Key decision 1] | [Choice made] | [Why this choice] |
| [Key decision 2] | [Choice made] | [Why this choice] |
| [Key decision 3] | [Choice made] | [Why this choice] |

### Constraints Addressed

| Constraint | How This Feature Supports It |
|------------|------------------------------|
| [CE-001] | [Explanation] |
| [BM-003] | [Explanation] |

### Dependencies

**Requires (must exist before this):**
- [ ] [System/Feature] - Status: [Built | In Progress | Not Started]

**Unblocks (enabled by this):**
- [ ] [System/Feature]

---

## 2. Design Specification

### 2.1 Core Mechanics

[Detailed description of how the feature works]

**User Flow:**
```
1. User does [action]
2. System responds with [behavior]
3. User sees [outcome]
4. Loop back to step 1 OR end state
```

### 2.2 Edge Cases

| Edge Case | Expected Behavior |
|-----------|-------------------|
| [Edge case 1] | [How system handles it] |
| [Edge case 2] | [How system handles it] |

### 2.3 Business Rules

- **Rule 1:** [Description]
- **Rule 2:** [Description]

---

## 3. Technical Implementation

### 3.1 Database Schema (if applicable)

```sql
-- [TABLE_NAME]
CREATE TABLE [table_name] (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- fields here
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE [table_name] ENABLE ROW LEVEL SECURITY;

CREATE POLICY "[policy_name]" ON [table_name]
  FOR SELECT USING (auth.uid() = user_id);
```

### 3.2 API Endpoints (if applicable)

| Endpoint | Method | Description | Request | Response |
|----------|--------|-------------|---------|----------|
| `/api/[path]` | GET | [Description] | `{...}` | `{...}` |
| `/api/[path]` | POST | [Description] | `{...}` | `{...}` |

### 3.3 UI Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `[ComponentName]` | `app/[path]/page.tsx` | [Description] |
| `[ComponentName]` | `components/[path].tsx` | [Description] |

### 3.4 State Management

```typescript
// Zustand store (if needed)
interface [Feature]State {
  // state fields
}

interface [Feature]Actions {
  // action methods
}
```

---

## 4. Acceptance Criteria

### 4.1 MUST HAVE (Feature fails without these)

- [ ] **[Criterion 1]:** [Specific, measurable requirement]
- [ ] **[Criterion 2]:** [Specific, measurable requirement]
- [ ] **[Criterion 3]:** [Specific, measurable requirement]

### 4.2 SHOULD HAVE (Important but not blocking)

- [ ] **[Criterion 1]:** [Specific, measurable requirement]
- [ ] **[Criterion 2]:** [Specific, measurable requirement]

### 4.3 NICE TO HAVE (Defer if time-constrained)

- [ ] **[Criterion 1]:** [Specific, measurable requirement]

---

## 5. Grading Logic

### 5.1 Deterministic Graders (Automated)

| Check | Command/Test | Pass Criteria |
|-------|--------------|---------------|
| TypeScript compilation | `npm run build` | 0 errors |
| Unit tests | `npm test [feature]` | 100% pass |
| Constraint hook | Constraint check hook | No violations |
| Performance | Lighthouse / manual | 60fps, <100ms response |

**Unit Test Specifications:**

```typescript
// tests/[feature].test.ts

describe('[Feature]', () => {
  test('[Test case 1]', () => {
    // Test description and expected outcome
  });

  test('[Test case 2]', () => {
    // Test description and expected outcome
  });
});
```

### 5.2 LLM Grader Prompts

**UX Review (sub-agent: UX Reviewer):**
```yaml
UX_REVIEW_PROMPT: |
  Review the [FEATURE_NAME] implementation for user experience quality.

  Context:
  - Feature purpose: [brief description]
  - Target users: [who uses this]
  - Key constraint: CE-001 (70/30 Lab/Snake time split)

  Check:
  1. Is the UI intuitive? Can a new user understand it in <10 seconds?
  2. Are interactions responsive (<100ms feedback)?
  3. Does the visual design match the game aesthetic?
  4. Are error states handled gracefully?
  5. Is the feature discoverable within the Lab flow?

  Score 1-10 with justification for each criterion.
  Overall score must be >= 7 to pass.
```

**Code Quality Review (sub-agent: Code Quality Reviewer):**
```yaml
CODE_QUALITY_PROMPT: |
  Review the [FEATURE_NAME] code for maintainability and best practices.

  Files to review:
  - [file1.tsx]
  - [file2.ts]

  Check:
  1. TypeScript types are explicit (no 'any')
  2. Components are appropriately sized (<200 lines)
  3. Business logic is separated from UI
  4. Error handling is comprehensive
  5. No hardcoded values (uses constants/config)

  Score 1-10 with justification for each criterion.
  Overall score must be >= 7 to pass.
```

**Balance Review (sub-agent: Balance Reviewer):**
```yaml
BALANCE_REVIEW_PROMPT: |
  Review the [FEATURE_NAME] for game balance.

  Context:
  - This feature affects: [progression/economy/engagement]
  - Key constraint: [relevant BA/CE/PR constraint]

  Check:
  1. Does this create unfair advantages? (BM-001)
  2. Is the economy impact balanced? (BA-002)
  3. Does this support the 70/30 Lab/Snake split? (CE-001)
  4. Does progression feel rewarding but not trivial?
  5. Are there exploits or edge cases that break balance?

  Score 1-10 with justification for each criterion.
  Overall score must be >= 7 to pass.
```

### 5.3 Human Verification

**Playtest Checklist:**

| Test | Steps | Expected Result | Pass? |
|------|-------|-----------------|-------|
| [Test 1] | 1. Do X, 2. Do Y | [Expected outcome] | ⬜ |
| [Test 2] | 1. Do X, 2. Do Y | [Expected outcome] | ⬜ |
| [Test 3] | 1. Do X, 2. Do Y | [Expected outcome] | ⬜ |

**Calibration Notes:**
- [Record where LLM graders disagreed with human judgment]
- [Use this to improve grader prompts over time]

---

## 6. Implementation Timeline

### Week-by-Week Breakdown

| Day/Week | Task | Deliverable | Owner |
|----------|------|-------------|-------|
| Day 1 | [Task] | [Deliverable] | [Owner] |
| Day 2-3 | [Task] | [Deliverable] | [Owner] |
| Day 4-5 | [Task] | [Deliverable] | [Owner] |

### Milestone Checkpoints

| Milestone | Date | Criteria |
|-----------|------|----------|
| Design Complete | Day X | All sections 1-4 filled |
| Implementation Complete | Day Y | All code written |
| Graders Pass | Day Z | All graders >= 7/10 |
| Ready for Integration | Day N | All checkboxes checked |

---

## 7. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| [Risk 1] | High/Med/Low | High/Med/Low | [How to prevent/handle] |
| [Risk 2] | High/Med/Low | High/Med/Low | [How to prevent/handle] |

### Rollback Plan

**If this feature needs to be disabled:**
1. Feature flag: `[FEATURE_FLAG_NAME]`
2. Database rollback: [Migration to revert]
3. Fallback behavior: [What happens when disabled]

---

## 8. Visual Design (if applicable)

### Wireframes / Mockups

```
┌─────────────────────────────────────┐
│           [Screen Title]            │
├─────────────────────────────────────┤
│                                     │
│    [ASCII wireframe or describe]    │
│                                     │
└─────────────────────────────────────┘
```

### Color Scheme / Assets

| Element | Color/Asset | Notes |
|---------|-------------|-------|
| [Element] | [Color code or asset path] | [Usage notes] |

---

## 9. Future Considerations (v0.2+)

**Deferred for v0.1:**
- [Feature/enhancement 1]
- [Feature/enhancement 2]

**Expansion path:**
- [How this feature could grow in future versions]

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | YYYY-MM-DD | [Name] | Initial specification |

---

**Specification Status:**
- [ ] All sections complete
- [ ] Reviewed by [stakeholder]
- [ ] Graders defined and testable
- [ ] Ready for implementation (🔒 LOCK when ready)
