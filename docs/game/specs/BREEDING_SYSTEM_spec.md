# Feature: Breeding System Specification v1.0
## Production-Ready Design

**Version:** 1.0
**Date:** 2025-01-22
**Status:** [ ] Draft | [x] Review | [ ] LOCKED
**Priority:** CRITICAL (P0)
**Sprint:** Sprint 2

---

## 1. Executive Summary

**One-Paragraph Description:**
The Breeding System is the core meta-game progression loop that validates the 70/30 Lab/Snake hypothesis. Players combine two owned snakes from the same dynasty to produce offspring with increased generation (and thus stats). This creates a compelling "play Snake to earn DNA → spend DNA to breed → get stronger snakes → play Snake better" loop. For v0.1 MVP, breeding is same-dynasty only, instant, and produces Gen 2+ offspring with 5% stat increases per generation.

### Core Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Breeding Rule** | Same dynasty only | v0.1 simplicity, avoids hybrid complexity |
| **Breeding Timer** | Instant (0 seconds) | Better UX for MVP testing, no frustrating waits |
| **DNA Cost** | 200 base + (avg_parent_gen × 100) | Scales with power, prevents exploitation |
| **Offspring Generation** | max(parent1_gen, parent2_gen) + 1 | Clear progression, incentivizes high-gen parents |
| **Offspring Variant** | 50/50 random from parents | Simple, fair, no complex genetics |

### Constraints Addressed

| Constraint | How This Feature Supports It |
|------------|------------------------------|
| **CE-001** | Breeding IS the Lab engagement driver (70% time) |
| **BM-001** | F2P can breed with DNA earned in gameplay |
| **BA-002** | Scaling costs prevent infinite power creep |
| **PR-002** | 1 breeding/day achievable for active players |

### Dependencies

**Requires (must exist before this):**
- [x] Snake Data Model - Status: Spec complete
- [x] Collection UI - Status: Spec complete (snake selection UI)
- [x] DNA Resource System - Status: Built

**Unblocks (enabled by this):**
- [ ] Tutorial (breeding tutorial step)
- [ ] Advanced breeding (cross-dynasty in v0.5)
- [ ] Generation achievements
- [ ] Set completion via breeding

---

## 2. Design Specification

### 2.1 Core Mechanics

**Breeding Formula:**
```
INPUTS:
- Parent 1: OwnedSnake (dynasty A, generation X, variant V1)
- Parent 2: OwnedSnake (dynasty A, generation Y, variant V2)

VALIDATION:
- Parent 1 and Parent 2 must be same dynasty
- Player must own both parents
- Player must have sufficient DNA

DNA COST:
- cost = 200 + ((parent1.generation + parent2.generation) / 2) × 100
- Gen 1 + Gen 1 → 200 + 100 = 300 DNA
- Gen 2 + Gen 2 → 200 + 200 = 400 DNA
- Gen 5 + Gen 5 → 200 + 500 = 700 DNA

OUTPUTS:
- Offspring Generation: max(parent1.generation, parent2.generation) + 1
- Offspring Dynasty: Same as parents (100% inheritance)
- Offspring Variant: 50% chance parent1's variant, 50% chance parent2's variant
- Offspring Stats: base_stats × (1 + (offspring_generation - 1) × 0.05)
```

**User Flow:**
```
1. User opens Lab → taps "Breed" tab
2. User sees parent selection slots (empty)
3. User taps "Select Parent 1" → opens snake picker (filtered to owned)
4. User selects a snake → Parent 1 slot filled
5. User taps "Select Parent 2" → opens snake picker (filtered to same dynasty)
6. User selects another snake → Parent 2 slot filled
7. System shows DNA cost and offspring preview
8. User taps "Breed" → DNA deducted, offspring created instantly
9. Celebration animation plays
10. Offspring card revealed with stats
11. User taps "View in Collection" → opens Collection at new snake
```

### 2.2 Generation Scaling

| Generation | Stat Multiplier | Example Speed (base 10) |
|------------|-----------------|------------------------|
| Gen 1 | 1.00× | 10.0 |
| Gen 2 | 1.05× | 10.5 |
| Gen 3 | 1.10× | 11.0 |
| Gen 4 | 1.15× | 11.5 |
| Gen 5 | 1.20× | 12.0 |
| Gen 10 | 1.45× | 14.5 |
| Gen 20 | 1.95× | 19.5 |

**Diminishing Returns:**
- Each generation costs more DNA (linear scaling)
- Each generation gives same +5% (not exponential)
- Players will naturally plateau around Gen 10-15 for typical play

### 2.3 Breeding Scenarios

**Scenario 1: First Breeding (New Player)**
```
Parent 1: CYBER SPARK Gen 1 (starter)
Parent 2: CYBER PULSE Gen 1 (unlocked for 500 DNA)
Cost: 200 + ((1+1)/2 × 100) = 300 DNA
Result: CYBER SPARK or CYBER PULSE Gen 2 (50/50)
Stats: 10.5 speed (vs 10.0 at Gen 1) = +5%
```

**Scenario 2: Advanced Breeding**
```
Parent 1: CYBER SPARK Gen 3
Parent 2: CYBER PULSE Gen 5
Cost: 200 + ((3+5)/2 × 100) = 600 DNA
Result: CYBER SPARK or CYBER PULSE Gen 6 (50/50)
Stats: Gen 6 = 1.25× base stats = 12.5 speed
```

**Scenario 3: Same Variant Breeding**
```
Parent 1: CYBER SPARK Gen 2
Parent 2: CYBER SPARK Gen 4
Cost: 200 + ((2+4)/2 × 100) = 500 DNA
Result: CYBER SPARK Gen 5 (100% - no random needed)
```

### 2.4 Edge Cases

| Edge Case | Expected Behavior |
|-----------|-------------------|
| Different dynasties | "Parents must be same dynasty" error |
| Same snake twice | "Cannot breed snake with itself" error |
| Only 1 snake owned | "Need 2 snakes to breed" message |
| Insufficient DNA | "Need X more DNA" with cost breakdown |
| Bred snake at max gen (50) | "This snake has reached max generation" |
| Network failure mid-breed | Rollback, no DNA deducted, retry prompt |

### 2.5 Business Rules

- **Rule 1:** Both parents must be same dynasty (v0.1 constraint)
- **Rule 2:** Both parents must be owned by the breeding player
- **Rule 3:** A snake can be used in unlimited breedings (not consumed)
- **Rule 4:** Maximum generation cap: 50 (prevents infinite scaling)
- **Rule 5:** Offspring immediately available (no hatch timer)
- **Rule 6:** Parents retain their generation (breeding doesn't level them)

---

## 3. Technical Implementation

### 3.1 Database Schema Additions

```sql
-- =====================================================
-- BREEDING HISTORY TABLE
-- Tracks all breeding events for lineage/audit
-- =====================================================
CREATE TABLE IF NOT EXISTS breeding_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent1_id UUID NOT NULL REFERENCES player_collection(id),
  parent2_id UUID NOT NULL REFERENCES player_collection(id),
  offspring_id UUID NOT NULL REFERENCES player_collection(id),
  dna_cost INT NOT NULL,
  bred_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_breeding_user ON breeding_history(user_id);
CREATE INDEX IF NOT EXISTS idx_breeding_offspring ON breeding_history(offspring_id);

-- RLS
ALTER TABLE breeding_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY breeding_select ON breeding_history
  FOR SELECT USING (auth.uid() = user_id);

-- =====================================================
-- BREEDING FUNCTION (Server-Side Logic)
-- Atomic: validates, deducts DNA, creates offspring
-- =====================================================
CREATE OR REPLACE FUNCTION breed_snakes(
  p_user_id UUID,
  p_parent1_id UUID,
  p_parent2_id UUID
) RETURNS UUID AS $$
DECLARE
  v_parent1 RECORD;
  v_parent2 RECORD;
  v_dna_cost INT;
  v_offspring_gen INT;
  v_offspring_variant_id UUID;
  v_offspring_id UUID;
  v_user_dna INT;
BEGIN
  -- Fetch parent 1
  SELECT pc.*, sv.dynasty_id, sv.id as variant_id
  INTO v_parent1
  FROM player_collection pc
  JOIN snake_variants sv ON pc.variant_id = sv.id
  WHERE pc.id = p_parent1_id AND pc.user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent 1 not found or not owned';
  END IF;

  -- Fetch parent 2
  SELECT pc.*, sv.dynasty_id, sv.id as variant_id
  INTO v_parent2
  FROM player_collection pc
  JOIN snake_variants sv ON pc.variant_id = sv.id
  WHERE pc.id = p_parent2_id AND pc.user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent 2 not found or not owned';
  END IF;

  -- Validate same dynasty
  IF v_parent1.dynasty_id != v_parent2.dynasty_id THEN
    RAISE EXCEPTION 'Parents must be same dynasty';
  END IF;

  -- Validate not same snake
  IF p_parent1_id = p_parent2_id THEN
    RAISE EXCEPTION 'Cannot breed snake with itself';
  END IF;

  -- Calculate DNA cost
  v_dna_cost := 200 + ((v_parent1.generation + v_parent2.generation) / 2) * 100;

  -- Check DNA balance (assumes dna_balance in user_resources table)
  SELECT dna_balance INTO v_user_dna
  FROM user_resources
  WHERE user_id = p_user_id;

  IF v_user_dna < v_dna_cost THEN
    RAISE EXCEPTION 'Insufficient DNA: need %, have %', v_dna_cost, v_user_dna;
  END IF;

  -- Calculate offspring generation
  v_offspring_gen := GREATEST(v_parent1.generation, v_parent2.generation) + 1;

  -- Check max generation
  IF v_offspring_gen > 50 THEN
    RAISE EXCEPTION 'Maximum generation (50) reached';
  END IF;

  -- Determine offspring variant (50/50)
  IF random() < 0.5 THEN
    v_offspring_variant_id := v_parent1.variant_id;
  ELSE
    v_offspring_variant_id := v_parent2.variant_id;
  END IF;

  -- Deduct DNA
  UPDATE user_resources
  SET dna_balance = dna_balance - v_dna_cost
  WHERE user_id = p_user_id;

  -- Create offspring
  INSERT INTO player_collection (
    user_id, variant_id, generation, parent1_id, parent2_id, acquired_method
  ) VALUES (
    p_user_id, v_offspring_variant_id, v_offspring_gen, p_parent1_id, p_parent2_id, 'bred'
  )
  RETURNING id INTO v_offspring_id;

  -- Record breeding history
  INSERT INTO breeding_history (
    user_id, parent1_id, parent2_id, offspring_id, dna_cost
  ) VALUES (
    p_user_id, p_parent1_id, p_parent2_id, v_offspring_id, v_dna_cost
  );

  RETURN v_offspring_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 3.2 API Endpoints

| Endpoint | Method | Description | Request | Response |
|----------|--------|-------------|---------|----------|
| `/api/breeding/preview` | POST | Calculate cost without breeding | `{ parent1Id, parent2Id }` | `{ cost, offspringGen, possibleVariants }` |
| `/api/breeding/breed` | POST | Execute breeding | `{ parent1Id, parent2Id }` | `{ offspring: OwnedSnake, cost, history }` |
| `/api/breeding/history` | GET | Get breeding history | `?limit=20` | `{ breedings: BreedingRecord[] }` |

**TypeScript Types:**

```typescript
interface BreedingPreview {
  parent1: OwnedSnake;
  parent2: OwnedSnake;
  dnaCost: number;
  offspringGeneration: number;
  possibleVariants: SnakeVariant[];  // Usually 2 (or 1 if same variant)
  userDnaBalance: number;
  canAfford: boolean;
}

interface BreedingResult {
  offspring: OwnedSnake;
  cost: number;
  historyId: string;
}

interface BreedingRecord {
  id: string;
  parent1: OwnedSnake;
  parent2: OwnedSnake;
  offspring: OwnedSnake;
  dnaCost: number;
  bredAt: Date;
}
```

### 3.3 UI Components

```
app/lab/breed/page.tsx
├── components/breeding/
│   ├── BreedingScreen.tsx       # Main breeding interface
│   ├── ParentSlot.tsx           # Parent selection slot
│   ├── SnakePicker.tsx          # Modal to select from collection
│   ├── BreedingPreview.tsx      # Cost/outcome preview
│   ├── BreedButton.tsx          # Breed action button
│   ├── BreedingAnimation.tsx    # Offspring reveal animation
│   └── BreedingHistory.tsx      # Past breedings list
├── hooks/
│   └── useBreeding.ts           # Breeding logic and state
└── stores/
    └── breedingStore.ts         # Zustand breeding state
```

### 3.4 State Management

```typescript
// stores/breedingStore.ts

interface BreedingState {
  // Selection state
  parent1: OwnedSnake | null;
  parent2: OwnedSnake | null;

  // Preview state
  preview: BreedingPreview | null;
  isLoadingPreview: boolean;

  // Breeding state
  isBreeding: boolean;
  breedingResult: BreedingResult | null;
  breedingError: string | null;

  // History
  history: BreedingRecord[];
  isLoadingHistory: boolean;

  // Actions
  selectParent1: (snake: OwnedSnake) => void;
  selectParent2: (snake: OwnedSnake) => void;
  clearSelection: () => void;
  fetchPreview: () => Promise<void>;
  executeBreeding: () => Promise<BreedingResult>;
  fetchHistory: () => Promise<void>;

  // Computed
  canBreed: () => boolean;
  getValidParent2Options: (dynasty: string) => OwnedSnake[];
}
```

### 3.5 Breeding Animation Sequence

```typescript
// components/breeding/BreedingAnimation.tsx

const ANIMATION_SEQUENCE = [
  { phase: 'gather', duration: 500 },   // Parent cards move to center
  { phase: 'merge', duration: 600 },    // Cards overlap with particles
  { phase: 'flash', duration: 200 },    // Bright flash
  { phase: 'reveal', duration: 800 },   // Offspring card appears
  { phase: 'celebrate', duration: 1000 }, // Confetti if new variant
];

// Total duration: ~3.1 seconds
// User can skip after 'reveal' phase
```

---

## 4. Acceptance Criteria

### 4.1 MUST HAVE (Feature fails without these)

- [ ] **Parent selection works:** Can select 2 owned snakes
- [ ] **Same dynasty enforced:** Error if different dynasties
- [ ] **DNA cost calculated:** Shows correct cost based on formula
- [ ] **Breeding executes:** DNA deducted, offspring created
- [ ] **Generation correct:** Offspring is max(parents) + 1
- [ ] **Variant inheritance works:** Offspring is one of parent variants
- [ ] **Server-authoritative:** All validation on server (RPC function)
- [ ] **Offspring in collection:** New snake appears in collection immediately

### 4.2 SHOULD HAVE (Important but not blocking)

- [ ] **Preview before breed:** Cost/outcome shown before confirming
- [ ] **Breeding animation:** Visual feedback during breed
- [ ] **Insufficient DNA feedback:** Clear message with shortfall
- [ ] **Breeding history:** Can view past breedings
- [ ] **Dynasty filter on picker:** Parent 2 picker pre-filtered to dynasty

### 4.3 NICE TO HAVE (Defer if time-constrained)

- [ ] **Lineage viewer:** See parent chain of any snake
- [ ] **Breeding achievements:** "First breed", "Gen 10 reached"
- [ ] **Favorite marking:** Star a snake during breed
- [ ] **Skip animation:** Tap to skip reveal animation

---

## 5. Grading Logic

### 5.1 Deterministic Graders (Automated)

| Check | Command/Test | Pass Criteria |
|-------|--------------|---------------|
| TypeScript compilation | `npm run build` | 0 errors |
| Unit tests | `npm test -- --grep "Breeding"` | 100% pass |
| RPC function works | Supabase function test | Returns offspring ID |
| DNA deduction correct | Integration test | Balance reduced by cost |
| Generation calculation | Unit test | max(parents) + 1 |

**Unit Test Specifications:**

```typescript
// tests/breedingSystem.test.ts

describe('Breeding System', () => {
  describe('DNA Cost Calculation', () => {
    test('Gen 1 + Gen 1 costs 300 DNA', () => {
      const cost = calculateBreedingCost(1, 1);
      expect(cost).toBe(300); // 200 + (2/2)*100 = 300
    });

    test('Gen 3 + Gen 5 costs 600 DNA', () => {
      const cost = calculateBreedingCost(3, 5);
      expect(cost).toBe(600); // 200 + (8/2)*100 = 600
    });

    test('Gen 10 + Gen 10 costs 1200 DNA', () => {
      const cost = calculateBreedingCost(10, 10);
      expect(cost).toBe(1200); // 200 + (20/2)*100 = 1200
    });
  });

  describe('Offspring Generation', () => {
    test('Gen 1 + Gen 1 produces Gen 2', () => {
      expect(calculateOffspringGen(1, 1)).toBe(2);
    });

    test('Gen 2 + Gen 5 produces Gen 6', () => {
      expect(calculateOffspringGen(2, 5)).toBe(6);
    });

    test('Max generation is 50', () => {
      expect(calculateOffspringGen(49, 49)).toBe(50);
    });
  });

  describe('Validation', () => {
    test('rejects different dynasties', async () => {
      await expect(breedSnakes(cyberSnake, primalSnake))
        .rejects.toThrow('same dynasty');
    });

    test('rejects same snake', async () => {
      await expect(breedSnakes(cyberSnake, cyberSnake))
        .rejects.toThrow('itself');
    });

    test('rejects insufficient DNA', async () => {
      await setDnaBalance(userId, 100);
      await expect(breedSnakes(gen1Snake, gen1Snake))
        .rejects.toThrow('Insufficient DNA');
    });
  });

  describe('Offspring Creation', () => {
    test('creates offspring with correct generation', async () => {
      const offspring = await breedSnakes(gen3Snake, gen5Snake);
      expect(offspring.generation).toBe(6);
    });

    test('offspring variant is from parents', async () => {
      const offspring = await breedSnakes(sparkSnake, pulseSnake);
      expect(['CYBER SPARK', 'CYBER PULSE']).toContain(offspring.variant.name);
    });

    test('offspring appears in collection', async () => {
      const offspring = await breedSnakes(gen1Snake1, gen1Snake2);
      const collection = await getCollection(userId);
      expect(collection.some(s => s.id === offspring.id)).toBe(true);
    });
  });
});
```

### 5.2 LLM Grader Prompts

**UX Review (sub-agent: UX Reviewer):**
```yaml
UX_REVIEW_PROMPT: |
  Review the Breeding System UI for user experience quality.

  Context:
  - Feature purpose: Combine 2 snakes to create stronger offspring
  - Target users: Players who want progression beyond unlocking
  - Key constraint: CE-001 (breeding is core Lab engagement)

  Files to review:
  - app/lab/breed/page.tsx
  - components/breeding/BreedingScreen.tsx
  - components/breeding/ParentSlot.tsx
  - components/breeding/SnakePicker.tsx
  - components/breeding/BreedingAnimation.tsx

  Evaluation criteria (score each 1-10):

  1. **Flow Clarity (weight: 2x)**
     - Is the select → preview → breed flow obvious?
     - Can user understand what will happen before confirming?

  2. **Cost Transparency (weight: 2x)**
     - Is DNA cost clearly shown before breeding?
     - Is the cost formula understandable?

  3. **Feedback Quality (weight: 1x)**
     - Is the breeding animation satisfying?
     - Is success/failure clearly communicated?

  4. **Error Handling (weight: 1x)**
     - Are dynasty mismatch errors helpful?
     - Is insufficient DNA feedback actionable?

  5. **Mobile Usability (weight: 2x)**
     - Are selection targets easy to tap?
     - Does the flow work in portrait orientation?

  Score 1-10 with justification for each criterion.
  Overall weighted score must be >= 7.0 to pass.
```

**Balance Review (sub-agent: Balance Reviewer):**
```yaml
BALANCE_REVIEW_PROMPT: |
  Review the Breeding System for game balance.

  Context:
  - DNA cost formula: 200 + (avg_parent_gen × 100)
  - Generation scaling: +5% stats per generation
  - Max generation: 50

  Check:
  1. Is DNA cost balanced? (not too cheap, not too grindy)
     - First breed (Gen 1+1): 300 DNA = ~20-40 min gameplay
     - Mid-game breed (Gen 5+5): 700 DNA = ~50-90 min gameplay
  2. Is +5% per generation meaningful but not overpowered?
     - Gen 10 = +45% stats (significant but not game-breaking)
  3. Does cost scaling prevent power creep exploitation?
     - High-gen breeding is expensive, self-limiting
  4. Can F2P players breed reasonably? (BM-001)
     - 1 breed/day achievable with 300-500 DNA/day earnings
  5. Does breeding support 70/30 Lab focus? (CE-001)
     - Yes: breeding is reason to accumulate DNA in Lab

  Score 1-10 with justification for each criterion.
  Overall score must be >= 7 to pass.
```

**Code Quality Review (sub-agent: Code Quality Reviewer):**
```yaml
CODE_QUALITY_PROMPT: |
  Review the Breeding System code for maintainability.

  Files to review:
  - supabase/functions/breed_snakes.sql
  - app/api/breeding/route.ts
  - stores/breedingStore.ts
  - hooks/useBreeding.ts
  - components/breeding/*.tsx

  Check:
  1. Is server-side validation comprehensive?
  2. Is the RPC function atomic (all-or-nothing)?
  3. Are race conditions handled (double-spend prevention)?
  4. Is error handling consistent between client/server?
  5. Are TypeScript types explicit throughout?

  Score 1-10 with justification for each criterion.
  Overall score must be >= 7 to pass.
```

### 5.3 Human Verification

**Playtest Checklist:**

| Test | Steps | Expected Result | Pass? |
|------|-------|-----------------|-------|
| Select parents | Breed tab → select both parents | Both slots show selected snakes | |
| Dynasty filter | Select CYBER parent 1 → open parent 2 picker | Only CYBER snakes shown | |
| Cost preview | Select Gen 3 + Gen 5 parents | Shows 600 DNA cost | |
| Insufficient DNA | Have 100 DNA, try to breed | "Need 200 more DNA" shown | |
| Successful breed | Have 500 DNA, breed Gen 1 + Gen 1 | Offspring created, 300 DNA deducted | |
| Generation correct | Breed Gen 2 + Gen 4 | Offspring is Gen 5 | |
| Animation plays | Complete breeding | See merge + reveal animation | |
| Offspring in collection | After breed → go to collection | New snake visible | |
| History recorded | View breeding history | Recent breed shown | |
| Same snake rejected | Try to select same snake twice | Error message shown | |

**Calibration Notes:**
- [Track where LLM graders disagree with human judgment]

---

## 6. Implementation Tasks

### Task Breakdown

| Task | Deliverable | Dependencies |
|------|-------------|--------------|
| Create breeding tables | `breeding_history` table + indexes | Snake Data Model |
| Create RPC function | `breed_snakes()` PostgreSQL function | Breeding tables |
| Create API routes | `/api/breeding/*` endpoints | RPC function |
| Build BreedingScreen | Main breeding UI layout | Collection UI (picker) |
| Build ParentSlot | Parent selection component | None |
| Build SnakePicker | Snake selection modal | Collection store |
| Build BreedingPreview | Cost/outcome display | API routes |
| Build BreedingAnimation | Reveal animation | None |
| Create useBreeding hook | Breeding logic | Store + API |
| Write unit tests | `tests/breedingSystem.test.ts` | All code |

### Milestone Checkpoints

| Milestone | Criteria |
|-----------|----------|
| Schema Complete | Tables created, RPC function works |
| API Complete | Endpoints return correct data |
| UI Complete | Full breeding flow functional |
| Animation Complete | Visual feedback polished |
| Graders Pass | All deterministic + LLM graders >= 7/10 |

---

## 7. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| DNA economy broken by cheap breeding | Medium | High | Test cost formula with simulation |
| Animation lag on low-end devices | Medium | Medium | Provide skip option, simple fallback |
| Race condition on double-tap | Medium | High | Disable button during breed, server-side idempotency |
| Users confused by same-dynasty rule | Medium | Low | Clear error message, tutorial education |

### Rollback Plan

**If this feature needs to be disabled:**
1. Feature flag: `ENABLE_BREEDING` environment variable
2. UI change: Hide "Breed" tab in Lab
3. Data preserved: Existing offspring remain in collections
4. Fallback: Collection-only meta-game (unlocking variants)

---

## 8. Visual Design

### Breeding Screen Layout

```
┌─────────────────────────────────────────────────┐
│  Breeding Lab                       💎 2,450    │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌───────────────┐    +    ┌───────────────┐   │
│  │               │         │               │   │
│  │  [PARENT 1]   │         │  [PARENT 2]   │   │
│  │               │         │               │   │
│  │ CYBER SPARK   │         │ CYBER PULSE   │   │
│  │    Gen 3      │         │    Gen 5      │   │
│  │               │         │               │   │
│  │   [Change]    │         │   [Change]    │   │
│  └───────────────┘         └───────────────┘   │
│                                                 │
│  ════════════════════════════════════════════  │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │          OFFSPRING PREVIEW              │   │
│  │                                         │   │
│  │  Generation: 6                          │   │
│  │  Dynasty: CYBER (+5% speed)             │   │
│  │  Possible: CYBER SPARK or CYBER PULSE   │   │
│  │                                         │   │
│  │  Stats: SPD 12.6  SIZE 6.3  HP 125     │   │
│  │         (+25% from Gen 1)               │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │         DNA Cost: 600 💎                │   │
│  │         Your DNA: 2,450 💎              │   │
│  │         After: 1,850 💎                 │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│        ┌────────────────────────┐              │
│        │       🧬 BREED         │              │
│        └────────────────────────┘              │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │  Recent Breedings:                      │   │
│  │  • Gen 2 CYBER SPARK (2h ago)          │   │
│  │  • Gen 3 PRIMAL VINE (yesterday)       │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Animation States

| State | Visual |
|-------|--------|
| Gathering | Parent cards slide toward center |
| Merging | Cards overlap, dynasty-colored particles swirl |
| Flash | Bright white flash (0.2s) |
| Reveal | New card fades in with glow |
| Celebrate | Confetti burst (dynasty colors) |

---

## 9. Future Considerations (v0.2+)

**Deferred for v0.1:**
- Cross-dynasty breeding (CYBER + PRIMAL hybrids)
- Breeding cooldowns per snake
- Trait inheritance (special abilities)
- Breeding boosts (speed up, cost reduction)
- Breeding achievements

**Expansion path:**
- v0.2: Breeding history with lineage tree view
- v0.3: Special traits that can be inherited
- v0.5: Cross-dynasty breeding with hybrid outcomes
- v1.0: Breeding events (limited-time variant drops)

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-22 | Claude | Initial specification |

---

**Specification Status:**
- [x] All sections complete
- [ ] Reviewed by stakeholder
- [x] Graders defined and testable
- [ ] Ready for implementation (LOCK when ready)
