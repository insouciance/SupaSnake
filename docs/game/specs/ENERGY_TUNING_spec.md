# Feature: Energy Tuning Specification v1.0
## Production-Ready Design

**Version:** 1.0
**Date:** 2025-01-22
**Status:** [ ] Draft | [x] Review | [ ] LOCKED
**Priority:** HIGH (P1)
**Sprint:** Sprint 3

---

## 1. Executive Summary

**One-Paragraph Description:**
Energy Tuning adjusts the existing energy system parameters to support the v0.1 meta-game economy. The energy system already exists and is server-authoritative; this spec defines the specific values for energy capacity, regeneration rate, DNA rewards, and optional ad-based refills that validate the 70/30 Lab/Snake hypothesis while maintaining F2P fairness. For v0.1 MVP, we're tuning for 3-5 gameplay sessions per day with meaningful progression.

### Core Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Energy Capacity** | 5 energy | Enough for a good session, creates return reason |
| **Regen Rate** | 1 energy per 20 minutes | 5 energy in 100 min, encourages 2-3 daily sessions |
| **DNA per Game** | 50-200 DNA (skill-based) | First breed (300) achievable in 2-4 games |
| **Ad Refill** | +1 energy per ad (3x/day max) | Opt-in monetization, not forced |
| **Bonus Energy** | Available via purchase | Can exceed cap with purchased energy |

### Constraints Addressed

| Constraint | How This Feature Supports It |
|------------|------------------------------|
| **BM-002** | Ads are opt-in (+1 energy), never forced |
| **BM-001** | F2P earns same DNA, just plays fewer games |
| **CE-001** | Energy gates Snake (30%), forces Lab time (70%) |
| **BA-002** | DNA economy balanced around 300-800 DNA/day |

### Dependencies

**Requires (must exist before this):**
- [x] Energy System - Status: Built (existing implementation)
- [x] DNA Resource System - Status: Built (existing implementation)
- [x] Supabase Backend - Status: Built

**Unblocks (enabled by this):**
- [ ] Balanced gameplay testing
- [ ] A/B testing energy parameters
- [ ] Monetization validation

---

## 2. Design Specification

### 2.1 Energy Parameters

**All values stored in `energy_config` database table for tunability:**

| Config Key | Value | Description |
|------------|-------|-------------|
| `max_energy` | 5 | Maximum energy from regeneration |
| `max_bonus_energy` | 20 | Additional from purchases/ads |
| `regen_interval_minutes` | 20 | 1 energy per this many minutes |
| `energy_per_game` | 1 | Each Snake game costs this much |
| `ad_energy_reward` | 1 | Watch ad gives this much energy |
| `ad_refills_per_day` | 3 | Max ads per day |
| `ad_cooldown_minutes` | 30 | Minutes between ads |
| `purchase_bonus_energy` | 10 | Starter pack gives this much |

### 2.2 DNA Reward Formula

**All DNA reward values stored in `energy_config` table:**

| Config Key | Value | Description |
|------------|-------|-------------|
| `base_dna_reward` | 50 | Minimum for playing |
| `dna_per_score_point` | 0.5 | Added per score point |
| `dna_per_survival_minute` | 10 | Time bonus per minute (max 3 min) |
| `dynasty_dna_bonus` | 0.05 | PRIMAL dynasty +5% |

**Calculation (server-side using config values):**
```
dna = config.base_dna_reward
dna += score * config.dna_per_score_point
dna += min(survival_minutes, 3) * config.dna_per_survival_minute
if dynasty == PRIMAL: dna *= (1 + config.dynasty_dna_bonus)
return floor(dna)
```

**Example outcomes:**
- Quick death (score 20, 30s): 50 + 10 + 5 = 65 DNA
- Average game (score 80, 90s): 50 + 40 + 15 = 105 DNA
- Good game (score 150, 180s): 50 + 75 + 30 = 155 DNA
- Great game (score 250, 180s+): 50 + 125 + 30 = 205 DNA

### 2.3 Daily Economy Model

**F2P Player (no ads, no purchases):**
```
Natural energy: 5 energy at start + 72 energy/day (1 per 20 min x 24 hours)
Effective plays: ~10-12 games/day (accounting for sleep, natural regen)
DNA earned: 10 games x 100 avg = 1,000 DNA/day
Progression:
- Day 1: First breed (300 DNA) complete
- Day 2: Second breed (300 DNA) + unlock (500 DNA) complete
- Day 3-4: Gen 3 breeding (400 DNA) + more unlocks complete
```

**Ad-Watching Player (uses all ad refills):**
```
Base plays: 10-12 games/day
+ Ad refills: 3 energy x 3/day = +3 games
Total: 13-15 games/day
DNA earned: 13 games x 100 avg = 1,300 DNA/day
Progression: 30% faster than pure F2P
```

**Paying Player (purchases energy pack):**
```
Base plays: 10-12 games/day
+ Purchased energy: 10-20 bonus energy (one-time or daily)
Total: 20-30 games/day (if they want)
DNA earned: 25 games x 100 avg = 2,500 DNA/day
Progression: Can complete collection faster, but same snakes as F2P
```

### 2.4 Energy UI States

```
STATE: FULL ENERGY
  [Energy Bar] 5/5  [PLAY NOW!]
  Next energy in: --:--

STATE: PARTIAL ENERGY
  [Energy Bar] 3/5  [PLAY]
  Next energy in: 12:45

STATE: EMPTY ENERGY
  [Energy Bar] 0/5  [Watch Ad for +1]
  Next energy in: 18:30
  Need energy now? [Get Energy Pack]

STATE: BONUS ENERGY
  [Energy Bar] 5/5 + 3 bonus
  [PLAY NOW!]
  (Bonus energy used first)
```

### 2.5 Edge Cases

| Edge Case | Expected Behavior |
|-----------|-------------------|
| Energy at 0, no ads left | Show timer to next regen, offer purchase |
| Energy overflows (5/5 + regen) | Capped at 5 (natural), bonus adds separately |
| Mid-game app kill | Energy already consumed, game counts |
| Clock manipulation | Server-authoritative time, reject fake regen |
| Ad fails to load | "Ad unavailable, try again later" - no energy |

### 2.6 Business Rules

- **Rule 1:** Energy consumption is server-authoritative (validated before game start)
- **Rule 2:** Natural energy caps at max_energy config value, bonus energy uncapped up to max_bonus_energy
- **Rule 3:** Bonus energy is consumed before natural energy
- **Rule 4:** Ad refill limit resets at midnight UTC
- **Rule 5:** DNA rewards are calculated server-side (prevent cheating)
- **Rule 6:** Offline regen is calculated on reconnect (server time)

---

## 3. Technical Implementation

### 3.1 Database Schema Updates

```sql
-- ENERGY SYSTEM ENHANCEMENTS
-- Assumes user_resources table exists with energy fields

-- Add bonus energy tracking
ALTER TABLE user_resources
ADD COLUMN IF NOT EXISTS bonus_energy INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS ad_refills_today INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS ad_refills_reset_date DATE DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS last_energy_update TIMESTAMPTZ DEFAULT NOW();

-- Energy config table (for easy tuning - AAA architecture)
CREATE TABLE IF NOT EXISTS energy_config (
  key TEXT PRIMARY KEY,
  value FLOAT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed config values (all game balance in DB, not code)
INSERT INTO energy_config (key, value, description) VALUES
('max_energy', 5, 'Maximum natural energy capacity'),
('max_bonus_energy', 20, 'Maximum bonus energy from purchases'),
('regen_interval_minutes', 20, 'Minutes per 1 energy regeneration'),
('energy_per_game', 1, 'Energy cost to play one game'),
('ad_energy_reward', 1, 'Energy gained from watching ad'),
('ad_refills_per_day', 3, 'Maximum ad refills per day'),
('ad_cooldown_minutes', 30, 'Cooldown between ad watches'),
('base_dna_reward', 50, 'Minimum DNA for completing a game'),
('dna_per_score_point', 0.5, 'DNA per score point'),
('dna_per_survival_minute', 10, 'DNA bonus per minute survived'),
('dynasty_dna_bonus', 0.05, 'PRIMAL dynasty DNA generation bonus')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ENERGY FUNCTIONS

-- Calculate current energy (with offline regen)
CREATE OR REPLACE FUNCTION get_current_energy(p_user_id UUID)
RETURNS TABLE(natural_energy INT, bonus_energy INT, next_regen_at TIMESTAMPTZ) AS $$
DECLARE
  v_user user_resources;
  v_max_energy INT;
  v_regen_interval INT;
  v_minutes_elapsed INT;
  v_energy_gained INT;
  v_new_energy INT;
BEGIN
  -- Get user data
  SELECT * INTO v_user FROM user_resources WHERE user_id = p_user_id;

  -- Get config from DB
  SELECT value INTO v_max_energy FROM energy_config WHERE key = 'max_energy';
  SELECT value INTO v_regen_interval FROM energy_config WHERE key = 'regen_interval_minutes';

  -- Calculate offline regen
  v_minutes_elapsed := EXTRACT(EPOCH FROM (NOW() - v_user.last_energy_update)) / 60;
  v_energy_gained := FLOOR(v_minutes_elapsed / v_regen_interval);
  v_new_energy := LEAST(v_user.energy_balance + v_energy_gained, v_max_energy);

  -- Update if energy changed
  IF v_new_energy > v_user.energy_balance THEN
    UPDATE user_resources
    SET energy_balance = v_new_energy,
        last_energy_update = NOW() - ((v_minutes_elapsed % v_regen_interval) * INTERVAL '1 minute')
    WHERE user_id = p_user_id;
  END IF;

  RETURN QUERY SELECT
    v_new_energy as natural_energy,
    v_user.bonus_energy as bonus_energy,
    (v_user.last_energy_update + (v_regen_interval * INTERVAL '1 minute')) as next_regen_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Consume energy for game
CREATE OR REPLACE FUNCTION consume_energy(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_energy RECORD;
  v_cost INT;
BEGIN
  -- Get config from DB
  SELECT value INTO v_cost FROM energy_config WHERE key = 'energy_per_game';

  -- Get current energy (with regen calculation)
  SELECT * INTO v_energy FROM get_current_energy(p_user_id);

  -- Check total energy
  IF (v_energy.natural_energy + v_energy.bonus_energy) < v_cost THEN
    RETURN FALSE;
  END IF;

  -- Consume bonus first, then natural
  IF v_energy.bonus_energy >= v_cost THEN
    UPDATE user_resources SET bonus_energy = bonus_energy - v_cost WHERE user_id = p_user_id;
  ELSE
    UPDATE user_resources
    SET
      bonus_energy = 0,
      energy_balance = energy_balance - (v_cost - bonus_energy)
    WHERE user_id = p_user_id;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add energy from ad watch
CREATE OR REPLACE FUNCTION watch_ad_for_energy(p_user_id UUID)
RETURNS TABLE(success BOOLEAN, new_bonus INT, refills_remaining INT) AS $$
DECLARE
  v_user user_resources;
  v_max_refills INT;
  v_reward INT;
  v_max_bonus INT;
BEGIN
  -- Get user and reset daily counter if needed
  SELECT * INTO v_user FROM user_resources WHERE user_id = p_user_id;

  IF v_user.ad_refills_reset_date < CURRENT_DATE THEN
    UPDATE user_resources
    SET ad_refills_today = 0, ad_refills_reset_date = CURRENT_DATE
    WHERE user_id = p_user_id;
    v_user.ad_refills_today := 0;
  END IF;

  -- Get config from DB
  SELECT value INTO v_max_refills FROM energy_config WHERE key = 'ad_refills_per_day';
  SELECT value INTO v_reward FROM energy_config WHERE key = 'ad_energy_reward';
  SELECT value INTO v_max_bonus FROM energy_config WHERE key = 'max_bonus_energy';

  -- Check limit
  IF v_user.ad_refills_today >= v_max_refills THEN
    RETURN QUERY SELECT FALSE, v_user.bonus_energy, 0;
    RETURN;
  END IF;

  -- Grant energy
  UPDATE user_resources
  SET
    bonus_energy = LEAST(bonus_energy + v_reward, v_max_bonus),
    ad_refills_today = ad_refills_today + 1
  WHERE user_id = p_user_id
  RETURNING bonus_energy INTO v_user.bonus_energy;

  RETURN QUERY SELECT
    TRUE,
    v_user.bonus_energy,
    v_max_refills - (v_user.ad_refills_today + 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Calculate DNA reward (all values from config)
CREATE OR REPLACE FUNCTION calculate_dna_reward(
  p_score INT,
  p_survival_seconds INT,
  p_dynasty_type TEXT
) RETURNS INT AS $$
DECLARE
  v_base_dna FLOAT;
  v_per_score FLOAT;
  v_per_minute FLOAT;
  v_dynasty_bonus FLOAT;
  v_total_dna FLOAT;
  v_survival_minutes FLOAT;
BEGIN
  -- All values from config table (AAA architecture - no hardcoded values)
  SELECT value INTO v_base_dna FROM energy_config WHERE key = 'base_dna_reward';
  SELECT value INTO v_per_score FROM energy_config WHERE key = 'dna_per_score_point';
  SELECT value INTO v_per_minute FROM energy_config WHERE key = 'dna_per_survival_minute';
  SELECT value INTO v_dynasty_bonus FROM energy_config WHERE key = 'dynasty_dna_bonus';

  v_survival_minutes := LEAST(p_survival_seconds / 60.0, 3);
  v_total_dna := v_base_dna + (p_score * v_per_score) + (v_survival_minutes * v_per_minute);

  IF p_dynasty_type = 'dna_generation' THEN
    v_total_dna := v_total_dna * (1 + v_dynasty_bonus);
  END IF;

  RETURN FLOOR(v_total_dna);
END;
$$ LANGUAGE plpgsql;
```

### 3.2 API Endpoints

| Endpoint | Method | Description | Request | Response |
|----------|--------|-------------|---------|----------|
| `/api/energy/status` | GET | Get current energy state | - | `{ natural, bonus, nextRegen, adRefillsLeft }` |
| `/api/energy/consume` | POST | Start game (use energy) | - | `{ success, remaining }` |
| `/api/energy/ad-refill` | POST | Watch ad for energy | - | `{ success, bonus, refillsLeft }` |
| `/api/game/complete` | POST | End game, grant DNA | `{ score, timeSeconds }` | `{ dna, breakdown }` |

### 3.3 UI Components

```
components/energy/
  EnergyDisplay.tsx       # Main energy bar + count
  EnergyTimer.tsx         # Countdown to next regen
  AdRefillButton.tsx      # Watch ad button
  EnergyPurchaseModal.tsx # Buy energy popup
  EnergyEmpty.tsx         # Out of energy state
```

### 3.4 State Management

```typescript
// stores/energyStore.ts
// All values fetched from server (which reads from config table)

interface EnergyState {
  // Current state (from server)
  naturalEnergy: number;
  bonusEnergy: number;
  maxNatural: number;      // From config
  maxBonus: number;        // From config
  nextRegenAt: Date | null;
  adRefillsRemaining: number;

  // Loading
  isLoading: boolean;
  isConsuming: boolean;
  isWatchingAd: boolean;

  // Actions
  fetchStatus: () => Promise<void>;
  consumeEnergy: () => Promise<boolean>;
  watchAdForEnergy: () => Promise<boolean>;
  addBonusEnergy: (amount: number) => void;

  // Computed
  totalEnergy: () => number;
  canPlay: () => boolean;
  canWatchAd: () => boolean;
  timeToNextRegen: () => number;
}
```

---

## 4. Acceptance Criteria

### 4.1 MUST HAVE (Feature fails without these)

- [ ] **Energy display accurate:** Shows correct natural + bonus energy
- [ ] **Regen timer works:** Countdown shows time to next energy
- [ ] **Consume before game:** Energy deducted when starting Snake
- [ ] **Insufficient energy blocked:** Cannot play with 0 energy
- [ ] **DNA rewards granted:** Correct DNA based on score/time
- [ ] **Server-authoritative:** All energy changes validated server-side
- [ ] **Offline regen calculated:** Returning players get accumulated energy
- [ ] **Config-driven:** All values from database, not hardcoded

### 4.2 SHOULD HAVE (Important but not blocking)

- [ ] **Ad refill works:** Watch ad -> +1 energy
- [ ] **Ad limit enforced:** 3 ads/day maximum
- [ ] **Bonus energy separate:** Shows natural vs bonus
- [ ] **DNA breakdown shown:** See base + score + time bonuses
- [ ] **Config is tunable:** Values in database, hot-reloadable

### 4.3 NICE TO HAVE (Defer if time-constrained)

- [ ] **Push notification:** "Energy full!" notification
- [ ] **Energy purchase flow:** IAP integration
- [ ] **A/B test framework:** Different energy params per cohort
- [ ] **Analytics dashboard:** Track energy consumption patterns

---

## 5. Grading Logic

### 5.1 Deterministic Graders (Automated)

| Check | Command/Test | Pass Criteria |
|-------|--------------|---------------|
| TypeScript compilation | `npm run build` | 0 errors |
| Energy tests | `npm test -- --grep "Energy"` | 100% pass |
| DNA calculation tests | Unit tests for formula | All cases correct |
| Regen accuracy | Integration test | Within 1 minute accuracy |
| Config loading | Function test | All values retrieved from DB |
| No hardcoded values | Code review | All balance values from config |

**Test Specifications:**

```typescript
// tests/energyTuning.test.ts

describe('Energy System', () => {
  describe('Energy Regeneration', () => {
    test('regenerates based on config interval', async () => {
      await setEnergy(userId, 3);
      const interval = await getConfig('regen_interval_minutes');
      await advanceTime(interval);
      const energy = await getEnergy(userId);
      expect(energy.natural).toBe(4);
    });

    test('caps at max_energy config value', async () => {
      const maxEnergy = await getConfig('max_energy');
      await setEnergy(userId, maxEnergy);
      await advanceTime(60);
      const energy = await getEnergy(userId);
      expect(energy.natural).toBe(maxEnergy);
    });
  });

  describe('DNA Rewards (config-driven)', () => {
    test('grants base_dna_reward config value minimum', async () => {
      const baseDna = await getConfig('base_dna_reward');
      const dna = await calculateDnaReward(0, 5);
      expect(dna).toBe(baseDna);
    });

    test('uses dna_per_score_point from config', async () => {
      const baseDna = await getConfig('base_dna_reward');
      const perScore = await getConfig('dna_per_score_point');
      const dna = await calculateDnaReward(100, 0);
      expect(dna).toBe(baseDna + Math.floor(100 * perScore));
    });
  });
});
```

### 5.2 LLM Grader Prompts

**Balance Review (sub-agent: Balance Reviewer):**
```yaml
BALANCE_REVIEW_PROMPT: |
  Review the Energy Tuning for game balance and economy health.

  Context (all from config table):
  - max_energy: 5
  - regen_interval_minutes: 20
  - base_dna_reward: 50
  - dna_per_score_point: 0.5
  - dna_per_survival_minute: 10
  - ad_refills_per_day: 3

  Check:
  1. Is daily progression reasonable for F2P? (BM-001)
  2. Is the 70/30 Lab/Snake split achievable? (CE-001)
  3. Are ads opt-in, not forced? (BM-002)
  4. Is paying advantage reasonable? (convenience, not power)
  5. Is economy sustainable long-term?

  Score 1-10 with justification for each criterion.
  Overall score must be >= 7 to pass.
```

**Code Quality Review (sub-agent: Code Quality Reviewer):**
```yaml
CODE_QUALITY_PROMPT: |
  Review the Energy Tuning implementation for maintainability.

  Files to review:
  - supabase/migrations/energy_config.sql
  - stores/energyStore.ts
  - app/api/energy/*.ts
  - components/energy/*.tsx

  Check:
  1. Are ALL game balance values in config table (no hardcoded)?
  2. Is server-side validation comprehensive?
  3. Are time calculations timezone-safe (UTC)?
  4. Is the regen calculation deterministic?
  5. Are edge cases handled (negative time, overflow)?

  Score 1-10 with justification for each criterion.
  Overall score must be >= 7 to pass.
```

### 5.3 Human Verification

**Playtest Checklist:**

| Test | Steps | Expected Result | Pass? |
|------|-------|-----------------|-------|
| View energy | Open game | See "5/5" energy display | |
| Regen timer | Use 1 energy, view timer | Shows ~20:00 countdown | |
| Play game | Tap Play with 3 energy | Game starts, energy now 2 | |
| Cannot play at 0 | Drain energy to 0 | Play button disabled | |
| DNA reward shown | Complete game (score 100) | See ~100 DNA earned | |
| Ad refill | Tap "Watch Ad" at 0 energy | +1 bonus energy after ad | |
| Ad limit | Use all 3 ad refills | "No more ads today" shown | |
| Offline regen | Close app 1 hour, reopen | Energy increased by ~3 | |
| Bonus display | Have bonus energy | Shows "3/5 + 2 bonus" | |
| Config change | Change config in DB | New values apply (after refresh) | |

---

## 6. Implementation Tasks

### Task Breakdown

| Task | Deliverable | Dependencies |
|------|-------------|--------------|
| Add DB columns | bonus_energy, ad_refills fields | Existing schema |
| Create energy_config | Config table + seed values | None |
| Create energy functions | get_current, consume, ad_refill RPCs | Config table |
| Update API routes | /api/energy/* endpoints | RPC functions |
| Update energyStore | Bonus energy, ad refills support | API routes |
| Update EnergyDisplay | Show bonus, timer, ad button | Store |
| Create DNA calculator | Server-side reward function | Config table |
| Write tests | tests/energyTuning.test.ts | All code |

### Milestone Checkpoints

| Milestone | Criteria |
|-----------|----------|
| Config Complete | All values in database, retrievable |
| Regen Works | Offline regen calculates correctly |
| Consumption Works | Energy deducts, blocks at 0 |
| DNA Rewards Work | Correct DNA granted after game |
| Ad Refill Works | Bonus energy from ads |
| Graders Pass | All graders >= 7/10 |

---

## 7. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Economy too generous | Medium | High | Start conservative, tune via config |
| Economy too stingy | Medium | High | Monitor D1/D7 retention, tune via config |
| Clock manipulation cheats | Medium | Medium | Server-authoritative time |
| Ad provider issues | Low | Medium | Graceful degradation |

### Rollback Plan

**If this feature needs to be disabled:**
1. Config change: Set max_energy to 100 in DB
2. Fallback: Essentially unlimited plays
3. Data preserved: Energy balances remain

---

## 8. Visual Design

### Energy Bar Variants

```
FULL:     [Battery Icon] 5/5 (green)
PARTIAL:  [Battery Icon] 3/5 (yellow) Timer: 12:45
EMPTY:    [Battery Icon] 0/5 (red) Timer: 18:30
BONUS:    [Battery Icon] 5/5 + Star 3 bonus (gold)
```

### DNA Reward Breakdown

```
GAME COMPLETE!
Score: 125
Time: 2:15

DNA EARNED: 140

  Base reward:     50  (from config)
  Score bonus:    +62  (125 x 0.5)
  Time bonus:     +22  (2.25 min x 10)
  PRIMAL bonus:    +6  (5% dynasty)
  -----------------------
  Total:         140
```

---

## 9. Future Considerations (v0.2+)

**Deferred for v0.1:**
- A/B test different energy parameters via config
- Push notifications for full energy
- Energy purchase IAP flow
- Daily login bonus energy
- Energy boost items

**Expansion path:**
- v0.2: Analytics dashboard for economy health
- v0.3: A/B testing framework using config variants
- v0.5: Special event energy bonuses
- v1.0: Season pass with daily energy rewards

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
