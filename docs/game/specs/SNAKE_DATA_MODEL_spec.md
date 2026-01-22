# Feature: Snake Data Model Specification v1.0
## Production-Ready Design

**Version:** 1.0
**Date:** 2025-01-22
**Status:** [ ] Draft | [ ] Review | [x] LOCKED
**Priority:** CRITICAL (P0)
**Sprint:** Sprint 1

---

## 1. Executive Summary

**One-Paragraph Description:**
The Snake Data Model is the foundational data structure for all snake variants in SupaSnake. For v0.1 MVP, we're implementing 5 variants (1 starter + 4 breedable) across 3 dynasties to validate the core breeding hypothesis. This spec defines the database schema, variant selection, stat system, and data relationships that enable Collection UI, Breeding, and gameplay integration.

### Core Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Variant Count** | 5 variants for MVP | Minimum to test breeding loop (1 starter + 4 breedable) |
| **Dynasty Scope** | 3 dynasties (CYBER, PRIMAL, COSMIC) | Already locked in Dynasty spec |
| **Stat Model** | Base stats + Generation scaling | Simple, expandable, supports breeding progression |
| **Rarity for MVP** | Common only (500 DNA) | Reduce complexity, test loop before economy |
| **Data Location** | Supabase with local cache | Server authority, offline-friendly browsing |

### Constraints Addressed

| Constraint | How This Feature Supports It |
|------------|------------------------------|
| **BM-001** | All variants obtainable F2P via DNA earned in gameplay |
| **BM-003** | Core data model free, no paywall on variant access |
| **TE-003** | Server-authoritative data with cross-platform sync |
| **BA-002** | Balanced DNA costs across rarities |

### Dependencies

**Requires (must exist before this):**
- [x] Supabase Backend - Status: Built
- [x] Auth System - Status: Built
- [x] DNA Resource System - Status: Built

**Unblocks (enabled by this):**
- [ ] Collection UI
- [ ] Breeding System
- [ ] Snake Selection for Gameplay

---

## 2. Design Specification

### 2.1 The 5 MVP Variants

For v0.1, we select 5 variants strategically to test the breeding hypothesis:

| # | Variant Name | Dynasty | Rarity | DNA Cost | Role |
|---|--------------|---------|--------|----------|------|
| 1 | **CYBER SPARK** | CYBER | Common | 0 (starter) | Tutorial starter option |
| 2 | **PRIMAL SEED** | PRIMAL | Common | 0 (starter) | Tutorial starter option |
| 3 | **COSMIC SPARK** | COSMIC | Common | 0 (starter) | Tutorial starter option |
| 4 | **CYBER PULSE** | CYBER | Common | 500 DNA | Breedable unlock |
| 5 | **PRIMAL VINE** | PRIMAL | Common | 500 DNA | Breedable unlock |

**Starter Selection (Tutorial):**
- Player chooses ONE of the 3 starter variants (CYBER SPARK, PRIMAL SEED, or COSMIC SPARK)
- Other 2 starters become locked but visible in collection
- Creates immediate dynasty identity and first breeding constraint

**Why These 5:**
- 3 starters = one per dynasty, validates dynasty choice mechanic
- 2 unlockables = demonstrates DNA spending and collection growth
- All Common = simple economy for MVP, no rarity complexity
- Breeding test: CYBER SPARK + CYBER PULSE = Gen 2 offspring

### 2.2 Base Stats System

Each variant has base stats that scale with generation:

```typescript
interface SnakeStats {
  speed: number;      // Movement speed multiplier (base: 10)
  size: number;       // Snake body scaling (base: 5)
  hp: number;         // Hit points / collision tolerance (base: 100)
}

// Generation scaling: base_stat * (1 + (generation - 1) * 0.05)
// Gen 1: base × 1.00 (100%)
// Gen 2: base × 1.05 (105%)
// Gen 3: base × 1.10 (110%)
// Gen 10: base × 1.45 (145%)
```

**MVP Variant Stats:**

| Variant | Speed | Size | HP | Dynasty Bonus |
|---------|-------|------|----|---------------|
| CYBER SPARK | 10 | 5 | 100 | +5% speed |
| PRIMAL SEED | 10 | 5 | 100 | +5% DNA gen |
| COSMIC SPARK | 10 | 5 | 100 | +5% size |
| CYBER PULSE | 10 | 5 | 100 | +5% speed |
| PRIMAL VINE | 10 | 5 | 100 | +5% DNA gen |

**Why Identical Base Stats:**
- For MVP, all Commons have same base
- Dynasty bonus provides differentiation
- Rarity tiers (Rare, Epic, Legendary) will have higher bases in v0.2

### 2.3 Data Relationships

```
┌──────────────┐
│  dynasties   │ ← 3 records (CYBER, PRIMAL, COSMIC)
└──────┬───────┘
       │ 1:N
       ▼
┌──────────────┐
│snake_variants│ ← 5 records (MVP variants)
└──────┬───────┘
       │ 1:N
       ▼
┌──────────────────┐
│player_collection │ ← N records per player (owned snakes)
└──────────────────┘
       │ N:1
       ▼
┌──────────────┐
│    users     │
└──────────────┘
```

### 2.4 Edge Cases

| Edge Case | Expected Behavior |
|-----------|-------------------|
| Player has 0 snakes | Force tutorial flow, cannot access Collection |
| Variant deleted from DB | Soft-delete only (is_active=false), existing ownership preserved |
| Same variant multiple generations | Allowed - unique constraint on (user_id, variant_id, generation) |
| Offline unlock attempt | Queue mutation, sync on reconnect |
| Duplicate unlock request | No-op, return existing ownership record |

### 2.5 Business Rules

- **Rule 1:** Players must own at least 1 snake at all times (starter cannot be deleted)
- **Rule 2:** Variant unlock is permanent (no refunds, no "selling" snakes)
- **Rule 3:** Generation is immutable once created (no leveling down)
- **Rule 4:** Dynasty bonus is additive with generation scaling
- **Rule 5:** Equipped snake must be owned (server validates on game start)

---

## 3. Technical Implementation

### 3.1 Database Schema

```sql
-- =====================================================
-- DYNASTIES TABLE
-- Static reference data for dynasty themes
-- =====================================================
CREATE TABLE IF NOT EXISTS dynasties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,           -- "CYBER", "PRIMAL", "COSMIC"
  display_name TEXT NOT NULL,          -- "Cyber Dynasty"
  description TEXT,                    -- Lore description
  color_primary TEXT NOT NULL,         -- "#00FFFF" (UI theming)
  color_secondary TEXT NOT NULL,       -- "#FF00FF"
  stat_bonus_type TEXT NOT NULL,       -- "speed", "dna_generation", "size"
  stat_bonus_value FLOAT NOT NULL DEFAULT 0.05,  -- 0.05 = 5%
  sort_order INT NOT NULL,             -- Display order (1, 2, 3)
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed MVP dynasties
INSERT INTO dynasties (name, display_name, description, color_primary, color_secondary, stat_bonus_type, stat_bonus_value, sort_order) VALUES
('CYBER', 'Cyber Dynasty', 'Born from electric storms, masters of digital precision', '#00FFFF', '#FF00FF', 'speed', 0.05, 1),
('PRIMAL', 'Primal Dynasty', 'Ancient guardians of nature, masters of organic evolution', '#2d5016', '#8b4513', 'dna_generation', 0.05, 2),
('COSMIC', 'Cosmic Dynasty', 'Born from collapsing stars, masters of celestial energy', '#4a0e4e', '#ffd700', 'size', 0.05, 3);

-- =====================================================
-- SNAKE VARIANTS TABLE
-- All possible snake variants (MVP: 5)
-- =====================================================
CREATE TABLE IF NOT EXISTS snake_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dynasty_id UUID NOT NULL REFERENCES dynasties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                  -- "CYBER SPARK", "PRIMAL SEED"
  rarity TEXT NOT NULL DEFAULT 'common',  -- "common", "uncommon", "rare", "epic", "legendary"
  lore_text TEXT,                      -- Flavor text for collection
  art_url TEXT,                        -- Supabase Storage URL
  base_stats JSONB NOT NULL DEFAULT '{"speed": 10, "size": 5, "hp": 100}'::jsonb,
  unlock_cost_dna INT NOT NULL DEFAULT 0,  -- 0 for starters
  is_starter BOOLEAN DEFAULT false,    -- Can be chosen in tutorial
  sort_order INT NOT NULL,             -- Order within dynasty
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(dynasty_id, name)
);

-- Seed MVP variants (5 total)
INSERT INTO snake_variants (dynasty_id, name, rarity, lore_text, base_stats, unlock_cost_dna, is_starter, sort_order) VALUES
-- CYBER Dynasty
((SELECT id FROM dynasties WHERE name = 'CYBER'),
 'CYBER SPARK', 'common',
 'The first light of digital awakening. CYBER SPARK embodies the nascent energy of a consciousness being born.',
 '{"speed": 10, "size": 5, "hp": 100}'::jsonb, 0, true, 1),
((SELECT id FROM dynasties WHERE name = 'CYBER'),
 'CYBER PULSE', 'common',
 'Rhythmic data flows through circuitry. The heartbeat of the network made flesh.',
 '{"speed": 10, "size": 5, "hp": 100}'::jsonb, 500, false, 2),
-- PRIMAL Dynasty
((SELECT id FROM dynasties WHERE name = 'PRIMAL'),
 'PRIMAL SEED', 'common',
 'The first sprout of life. From this tiny beginning, entire forests will grow.',
 '{"speed": 10, "size": 5, "hp": 100}'::jsonb, 0, true, 1),
((SELECT id FROM dynasties WHERE name = 'PRIMAL'),
 'PRIMAL VINE', 'common',
 'Winding tendrils of organic power reach toward the light, unstoppable in their growth.',
 '{"speed": 10, "size": 5, "hp": 100}'::jsonb, 500, false, 2),
-- COSMIC Dynasty
((SELECT id FROM dynasties WHERE name = 'COSMIC'),
 'COSMIC SPARK', 'common',
 'The first light of a new star. A point of infinite potential in the cosmic void.',
 '{"speed": 10, "size": 5, "hp": 100}'::jsonb, 0, true, 1);

-- =====================================================
-- PLAYER COLLECTION TABLE
-- Tracks which snakes each player owns
-- =====================================================
CREATE TABLE IF NOT EXISTS player_collection (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES snake_variants(id) ON DELETE CASCADE,
  generation INT NOT NULL DEFAULT 1,   -- Gen 1, Gen 2, etc.
  parent1_id UUID REFERENCES player_collection(id),  -- NULL if unlocked (not bred)
  parent2_id UUID REFERENCES player_collection(id),  -- NULL if unlocked (not bred)
  acquired_at TIMESTAMPTZ DEFAULT NOW(),
  acquired_method TEXT DEFAULT 'unlock',  -- "tutorial", "unlock", "bred"
  is_equipped BOOLEAN DEFAULT false,   -- Currently selected for gameplay
  is_favorited BOOLEAN DEFAULT false,
  UNIQUE(user_id, variant_id, generation)  -- Can have same variant at different gens
);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_variants_dynasty ON snake_variants(dynasty_id);
CREATE INDEX IF NOT EXISTS idx_variants_rarity ON snake_variants(rarity);
CREATE INDEX IF NOT EXISTS idx_collection_user ON player_collection(user_id);
CREATE INDEX IF NOT EXISTS idx_collection_variant ON player_collection(variant_id);
CREATE INDEX IF NOT EXISTS idx_collection_equipped ON player_collection(user_id, is_equipped) WHERE is_equipped = true;

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

-- Dynasties: Public read for all authenticated users
ALTER TABLE dynasties ENABLE ROW LEVEL SECURITY;
CREATE POLICY dynasties_select ON dynasties
  FOR SELECT TO authenticated USING (true);

-- Variants: Public read for all authenticated users
ALTER TABLE snake_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY variants_select ON snake_variants
  FOR SELECT TO authenticated USING (true);

-- Collection: Users can only see their own
ALTER TABLE player_collection ENABLE ROW LEVEL SECURITY;
CREATE POLICY collection_select ON player_collection
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY collection_insert ON player_collection
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY collection_update ON player_collection
  FOR UPDATE USING (auth.uid() = user_id);
```

### 3.2 API Endpoints

| Endpoint | Method | Description | Request | Response |
|----------|--------|-------------|---------|----------|
| `/api/dynasties` | GET | List all active dynasties | - | `{ dynasties: Dynasty[] }` |
| `/api/dynasties/:id/variants` | GET | List variants in dynasty | - | `{ variants: Variant[] }` |
| `/api/variants` | GET | List all variants | `?dynasty=CYBER` | `{ variants: Variant[] }` |
| `/api/variants/:id` | GET | Get single variant | - | `{ variant: Variant }` |
| `/api/collection` | GET | Get player's collection | - | `{ snakes: OwnedSnake[] }` |
| `/api/collection/unlock` | POST | Unlock a variant | `{ variantId: UUID }` | `{ snake: OwnedSnake }` |
| `/api/collection/equip` | POST | Equip a snake | `{ snakeId: UUID }` | `{ success: boolean }` |

**TypeScript Types:**

```typescript
// Types derived from database schema

interface Dynasty {
  id: string;
  name: string;
  displayName: string;
  description: string;
  colorPrimary: string;
  colorSecondary: string;
  statBonusType: 'speed' | 'dna_generation' | 'size';
  statBonusValue: number;
  sortOrder: number;
}

interface SnakeVariant {
  id: string;
  dynastyId: string;
  name: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  loreText: string;
  artUrl: string | null;
  baseStats: SnakeStats;
  unlockCostDna: number;
  isStarter: boolean;
  sortOrder: number;
}

interface SnakeStats {
  speed: number;
  size: number;
  hp: number;
}

interface OwnedSnake {
  id: string;
  userId: string;
  variantId: string;
  variant: SnakeVariant;        // Joined
  dynasty: Dynasty;             // Joined
  generation: number;
  parent1Id: string | null;
  parent2Id: string | null;
  acquiredAt: Date;
  acquiredMethod: 'tutorial' | 'unlock' | 'bred';
  isEquipped: boolean;
  isFavorited: boolean;
  // Computed
  effectiveStats: SnakeStats;   // Base * generation scaling * dynasty bonus
}

// Computed stats helper
function computeEffectiveStats(
  baseStats: SnakeStats,
  generation: number,
  dynasty: Dynasty
): SnakeStats {
  const genMultiplier = 1 + (generation - 1) * 0.05;
  const stats = {
    speed: baseStats.speed * genMultiplier,
    size: baseStats.size * genMultiplier,
    hp: baseStats.hp * genMultiplier,
  };

  // Apply dynasty bonus
  if (dynasty.statBonusType === 'speed') {
    stats.speed *= (1 + dynasty.statBonusValue);
  } else if (dynasty.statBonusType === 'size') {
    stats.size *= (1 + dynasty.statBonusValue);
  }
  // dna_generation bonus applies to rewards, not stats

  return stats;
}
```

### 3.3 UI Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `SnakeCard` | `components/collection/SnakeCard.tsx` | Display single snake in grid |
| `VariantDetails` | `components/collection/VariantDetails.tsx` | Full-screen variant view |
| `StatDisplay` | `components/shared/StatDisplay.tsx` | Show speed/size/hp stats |
| `DynastyBadge` | `components/shared/DynastyBadge.tsx` | Dynasty name with color |

### 3.4 State Management

```typescript
// stores/collectionStore.ts (Zustand)

interface CollectionState {
  // Data
  dynasties: Dynasty[];
  variants: SnakeVariant[];
  ownedSnakes: OwnedSnake[];
  equippedSnakeId: string | null;

  // Loading states
  isLoadingDynasties: boolean;
  isLoadingVariants: boolean;
  isLoadingCollection: boolean;

  // Actions
  fetchDynasties: () => Promise<void>;
  fetchVariants: () => Promise<void>;
  fetchCollection: () => Promise<void>;
  unlockVariant: (variantId: string) => Promise<OwnedSnake>;
  equipSnake: (snakeId: string) => Promise<void>;
  toggleFavorite: (snakeId: string) => Promise<void>;

  // Selectors
  getVariantsByDynasty: (dynastyId: string) => SnakeVariant[];
  getOwnedByDynasty: (dynastyId: string) => OwnedSnake[];
  isVariantOwned: (variantId: string) => boolean;
  getEquippedSnake: () => OwnedSnake | null;
}
```

---

## 4. Acceptance Criteria

### 4.1 MUST HAVE (Feature fails without these)

- [ ] **Database schema deployed:** All 3 tables created with RLS policies
- [ ] **5 variants seeded:** All MVP variants exist in database
- [ ] **Dynasties queryable:** API returns 3 dynasties with colors and bonuses
- [ ] **Variants queryable:** API returns variants filtered by dynasty
- [ ] **Collection queryable:** API returns player's owned snakes
- [ ] **Unlock works:** POST /collection/unlock deducts DNA and adds snake
- [ ] **Equip works:** POST /collection/equip marks snake as equipped
- [ ] **Server-authoritative:** All mutations validated server-side

### 4.2 SHOULD HAVE (Important but not blocking)

- [ ] **Effective stats computed:** Generation scaling applied correctly
- [ ] **Dynasty bonus applied:** Stat bonuses reflect dynasty type
- [ ] **Offline cache:** Collection viewable without network
- [ ] **Art URLs populated:** Placeholder or real art URLs in database

### 4.3 NICE TO HAVE (Defer if time-constrained)

- [ ] **Lore text for all variants:** Flavor text complete
- [ ] **Sort options:** Collection sortable by dynasty, generation, date
- [ ] **Search/filter:** Find snakes by name or trait

---

## 5. Grading Logic

### 5.1 Deterministic Graders (Automated)

| Check | Command/Test | Pass Criteria |
|-------|--------------|---------------|
| TypeScript compilation | `npm run build` | 0 errors |
| Unit tests | `npm test -- --grep "SnakeData"` | 100% pass |
| Database migration | `supabase db push` | No errors |
| API smoke test | `curl /api/dynasties` | 200 OK, 3 dynasties |
| RLS validation | Query as user A, ensure no user B data | Pass |

**Unit Test Specifications:**

```typescript
// tests/snakeDataModel.test.ts

describe('Snake Data Model', () => {
  describe('Database Schema', () => {
    test('dynasties table has 3 records', async () => {
      const { data } = await supabase.from('dynasties').select('*');
      expect(data).toHaveLength(3);
    });

    test('snake_variants table has 5 MVP records', async () => {
      const { data } = await supabase.from('snake_variants').select('*');
      expect(data).toHaveLength(5);
    });

    test('all variants have valid dynasty reference', async () => {
      const { data } = await supabase
        .from('snake_variants')
        .select('*, dynasties(name)');
      data.forEach(v => expect(v.dynasties).toBeTruthy());
    });
  });

  describe('Stats Computation', () => {
    test('Gen 1 stats equal base stats', () => {
      const base = { speed: 10, size: 5, hp: 100 };
      const result = computeEffectiveStats(base, 1, mockCyberDynasty);
      expect(result.speed).toBeCloseTo(10.5); // 10 * 1.05 dynasty bonus
    });

    test('Gen 5 stats are 20% higher than base', () => {
      const base = { speed: 10, size: 5, hp: 100 };
      const result = computeEffectiveStats(base, 5, mockPrimalDynasty);
      // Gen 5 = 1.20 multiplier, no stat bonus for PRIMAL (dna gen)
      expect(result.speed).toBeCloseTo(12);
    });
  });

  describe('Collection API', () => {
    test('unlock variant deducts DNA', async () => {
      const beforeDna = await getDnaBalance(testUserId);
      await unlockVariant(testUserId, cyberPulseId);
      const afterDna = await getDnaBalance(testUserId);
      expect(afterDna).toBe(beforeDna - 500);
    });

    test('cannot unlock with insufficient DNA', async () => {
      await setDnaBalance(testUserId, 100);
      await expect(unlockVariant(testUserId, cyberPulseId))
        .rejects.toThrow('Insufficient DNA');
    });

    test('cannot unlock already owned variant', async () => {
      await unlockVariant(testUserId, cyberPulseId);
      await expect(unlockVariant(testUserId, cyberPulseId))
        .rejects.toThrow('Already owned');
    });
  });
});
```

### 5.2 LLM Grader Prompts

**Code Quality Review (sub-agent: Code Quality Reviewer):**
```yaml
CODE_QUALITY_PROMPT: |
  Review the Snake Data Model implementation for maintainability.

  Files to review:
  - supabase/migrations/[snake_data_model].sql
  - lib/database.types.ts (generated types)
  - stores/collectionStore.ts
  - app/api/dynasties/route.ts
  - app/api/collection/route.ts

  Check:
  1. TypeScript types are explicit (no 'any')
  2. Database schema follows Supabase best practices
  3. RLS policies are correct and secure
  4. API routes have proper error handling
  5. Zustand store is properly typed

  Score 1-10 with justification for each criterion.
  Overall score must be >= 7 to pass.
```

**Balance Review (sub-agent: Balance Reviewer):**
```yaml
BALANCE_REVIEW_PROMPT: |
  Review the Snake Data Model for game balance.

  Context:
  - This feature defines the 5 MVP variants and their stats
  - Dynasty bonuses: CYBER +5% speed, PRIMAL +5% DNA, COSMIC +5% size
  - Generation scaling: +5% per gen

  Check:
  1. Are all variants achievable F2P? (BM-001) - starters are free, 500 DNA unlocks
  2. Is DNA cost balanced? 500 DNA = ~30-60 min gameplay
  3. Is dynasty bonus meaningful but not overpowered? 5% is noticeable
  4. Does generation scaling reward breeding without breaking balance?
  5. Is the 5-variant selection sufficient to test breeding loop?

  Score 1-10 with justification for each criterion.
  Overall score must be >= 7 to pass.
```

### 5.3 Human Verification

**Playtest Checklist:**

| Test | Steps | Expected Result | Pass? |
|------|-------|-----------------|-------|
| View dynasties | Open Supabase dashboard → dynasties table | 3 records visible | |
| View variants | Query snake_variants | 5 records, correct dynasty refs | |
| Tutorial unlock | New user → complete tutorial → select CYBER SPARK | Snake added to collection | |
| DNA unlock | Have 500+ DNA → unlock CYBER PULSE | DNA deducted, snake owned | |
| Insufficient DNA | Have <500 DNA → try unlock | Error shown, no deduction | |
| Equip snake | Collection → tap snake → equip | is_equipped = true in DB | |
| RLS test | User A queries → ensure no User B data | Only own collection visible | |

**Calibration Notes:**
- [Track where LLM graders disagree with human judgment]

---

## 6. Implementation Tasks

### Task Breakdown

| Task | Deliverable | Dependencies |
|------|-------------|--------------|
| Create migration file | `supabase/migrations/20250122_snake_data_model.sql` | None |
| Run migration | Tables created in Supabase | Migration file |
| Generate types | `lib/database.types.ts` updated | Migration run |
| Create API routes | `/api/dynasties`, `/api/variants`, `/api/collection` | Types generated |
| Create Zustand store | `stores/collectionStore.ts` | API routes |
| Write unit tests | `tests/snakeDataModel.test.ts` | Store + API |
| Run deterministic graders | Build, test, lint pass | All code |

### Milestone Checkpoints

| Milestone | Criteria |
|-----------|----------|
| Schema Complete | Migration runs, tables exist, seed data present |
| API Complete | All endpoints return correct data |
| Store Complete | Zustand store fetches and caches data |
| Graders Pass | All deterministic + LLM graders >= 7/10 |

---

## 7. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| 5 variants too few for breeding test | Medium | Medium | Can add 2 more variants mid-sprint if needed |
| Stats computation bugs | Low | High | Comprehensive unit tests for edge cases |
| RLS policy misconfigured | Medium | High | Test with multiple users before shipping |
| Art not ready in time | Medium | Low | Use placeholder colors/shapes for MVP |

### Rollback Plan

**If this feature needs to be disabled:**
1. Feature flag: `ENABLE_COLLECTION` environment variable
2. Database rollback: Keep tables but add `is_active=false` to variants
3. Fallback behavior: Default snake for all players (no collection)

---

## 8. Visual Design

### Variant Card Preview (ASCII)

```
┌─────────────────────┐
│ ┌─────────────────┐ │
│ │                 │ │
│ │   [SNAKE ART]   │ │
│ │                 │ │
│ └─────────────────┘ │
│                     │
│ CYBER SPARK         │
│ ────────────────    │
│ Gen 1  |  Common    │
│                     │
│ SPD: 10.5  SZ: 5.0  │
│ HP: 100             │
│                     │
│ [⚡ CYBER +5% spd]  │
└─────────────────────┘
```

### Dynasty Color Scheme

| Dynasty | Primary | Secondary | Usage |
|---------|---------|-----------|-------|
| CYBER | #00FFFF (Cyan) | #FF00FF (Magenta) | Card borders, badges |
| PRIMAL | #2d5016 (Forest) | #8b4513 (Brown) | Card borders, badges |
| COSMIC | #4a0e4e (Purple) | #ffd700 (Gold) | Card borders, badges |

---

## 9. Future Considerations (v0.2+)

**Deferred for v0.1:**
- Additional variants (10 per dynasty = 30 total)
- Uncommon, Rare, Epic, Legendary rarities
- Art asset integration (Midjourney cards)
- Set bonuses (+10% DNA per complete dynasty)

**Expansion path:**
- v0.2: Expand to 30 variants (10 per dynasty)
- v0.3: Add rarity tiers with higher base stats
- v0.5: Cross-dynasty breeding mechanics
- v1.0: 50+ variants, monthly dynasty additions

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-22 | Claude | Initial specification |

---

**Specification Status:**
- [x] All sections complete
- [x] Reviewed by stakeholder
- [x] Graders defined and testable
- [x] Ready for implementation (LOCKED)
