# FTUE Tutorial Script - SupaSnake

## Document Purpose

This document defines the First Time User Experience (FTUE) tutorial flow for SupaSnake, including:
- Step-by-step tutorial sequence with exact UI/dialogue
- Skip behavior and safety nets
- First win mechanics (guaranteed success <60s)
- Lab introduction flow (meta-game discovery)
- Success metrics and A/B test variants

**Design Philosophy:** Show-don't-tell, minimal text, mobile-first, immediate action.

---

## Success Metrics

### Primary KPIs
- **Tutorial Completion Rate:** ≥85% (reach first win)
- **Time to First Win:** ≤60 seconds (median)
- **Lab Discovery Rate:** ≥70% by 5-minute mark
- **D1 Retention:** ≥45% (tutorial completers)
- **Skip Rate:** ≤15% (early abandonment indicator)

### Secondary Metrics
- **Input Method Adoption:** Swipe vs Virtual D-Pad usage
- **Pause Menu Access:** % who discover pause before Lab
- **Tutorial Step Duration:** Time spent per screen (optimize slow steps)
- **Error Recovery:** % who die during tutorial vs complete

---

## Tutorial Sequence Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    FTUE FLOW (60-90s)                       │
└─────────────────────────────────────────────────────────────┘

Step 1: Welcome Splash (3s auto-advance)
   │
   ▼
Step 2: Control Tutorial (15s)
   │   - Swipe or D-Pad demo
   │   - Interactive practice (collect 1 orb)
   │
   ▼
Step 3: First Game (Assisted Mode) (25s)
   │   - Slower snake speed (0.75x)
   │   - Generous arena (no walls)
   │   - Guaranteed orbs near snake
   │   - Win at 5 orbs
   │
   ▼
Step 4: Victory Celebration (5s)
   │   - "You collected 5 DNA!"
   │   - Particle effects + haptics
   │
   ▼
Step 5: Lab Introduction (10s)
   │   - Pulsing "LAB" button appears
   │   - "New area unlocked!"
   │   - Tap to enter Lab
   │
   ▼
Step 6: Breeding Demo (15s)
   │   - Auto-select first snake
   │   - "Breed to create new snakes"
   │   - Tap breed button
   │   - Show dynasty unlock (EMBER)
   │
   ▼
Step 7: Return to Play (5s)
   │   - "Your new snake is ready!"
   │   - Return to game menu
   │
   ▼
Tutorial Complete → Full Game Unlocked
```

**Total Duration:** 60-90 seconds (median 70s)

---

## Step-by-Step Implementation

### Step 1: Welcome Splash
**Duration:** 3 seconds (auto-advance)
**Skippable:** Yes (tap anywhere)
**Screen:** Full-screen overlay

#### Visual Elements
```
┌─────────────────────────────────────┐
│                                     │
│         [SupaSnake Logo]            │
│          (animated glow)            │
│                                     │
│      "Eat. Evolve. Dominate."       │
│                                     │
│     [Tap anywhere to begin]         │
│         (fade in at 2s)             │
│                                     │
└─────────────────────────────────────┘
```

#### Implementation Details
- **File:** `src/components/game/WelcomeSplash.tsx`
- **Animation:** Logo scales 0.9x → 1.0x (ease-out, 2s)
- **Audio:** Subtle ambient hum (optional, respects mute)
- **Tracking:** `ftue_welcome_shown`, `ftue_welcome_skipped` (if <3s)

#### Skip Behavior
- Tap anywhere before 3s: Skip to Step 2 immediately
- No skip: Auto-advance to Step 2 at 3s
- **Analytics:** Record skip rate (target <20% for engagement)

---

### Step 2: Control Tutorial
**Duration:** 15 seconds (or until goal achieved)
**Skippable:** No (critical skill)
**Screen:** Simplified arena with interactive demo

#### Visual Elements
```
┌─────────────────────────────────────┐
│  [Progress: 0/1 orbs]      [Skip?]  │ ← Header
│                                     │
│         🐍 ← Snake (stationary)     │
│                                     │
│         🔵 ← Orb (pulsing)          │
│                                     │
│  ┌─────────────────────────────┐   │
│  │   [Swipe to move]           │   │ ← Instruction card
│  │   👆 Try it now!            │   │   (bottom overlay)
│  └─────────────────────────────┘   │
│                                     │
│  [Virtual D-Pad]  (if enabled)      │ ← Optional control
└─────────────────────────────────────┘
```

#### Interaction Flow
1. **Initial State:**
   - Snake stationary in center
   - Single orb 3 tiles away (guaranteed reachable)
   - Instruction card: "Swipe to move" (animated hand gesture)
   - Virtual D-Pad visible (semi-transparent)

2. **User Action:**
   - On first swipe/tap: Hide instruction card
   - Snake moves in swiped direction
   - Continue until orb collected

3. **Success:**
   - Orb collected: "Great! 1/1" (checkmark animation)
   - 1-second delay → auto-advance to Step 3
   - Haptic feedback (light impact)

4. **Error Handling:**
   - If 10s pass with no input: Show "Try swiping up!" (directional hint)
   - If 20s pass: Show both Swipe + D-Pad instructions
   - No failure state (retry until success)

#### Implementation Details
- **File:** `src/components/game/ControlTutorial.tsx`
- **Snake Speed:** 0.5x normal (very slow, forgiving)
- **Arena:** 10x10 grid (small, focused)
- **Controls:** Both swipe and D-Pad active (player choice)
- **Tracking:** `ftue_control_started`, `ftue_control_completed`, `ftue_control_input_method` (swipe/dpad)

#### A/B Test Variant (Step 2A)
**Variant:** "Two-Step Control"
- First orb: Teach swipe up only (fixed position above snake)
- Second orb: Teach directional change (left/right)
- Hypothesis: More gradual learning curve (but 5s slower)

---

### Step 3: First Game (Assisted Mode)
**Duration:** 25 seconds (median)
**Skippable:** Yes (but warned)
**Screen:** Full game arena with training wheels

#### Visual Elements
```
┌─────────────────────────────────────┐
│  Score: 3/5 DNA    [Pause]          │ ← Header (persistent)
│                                     │
│    🐍🐍🐍 ← Snake (length 3)        │
│                                     │
│         🔵 ← Orb (always visible)   │
│                                     │
│    [Progress bar: 60%]              │ ← Bottom UI
│    "Collect 2 more DNA!"            │   (non-intrusive)
│                                     │
└─────────────────────────────────────┘
```

#### Assisted Mode Mechanics
1. **Snake Speed:** 0.75x normal (slower, forgiving)
2. **Arena:** No walls (toroidal wrap-around)
3. **Orb Spawning:** Intelligent placement
   - Always within 5 tiles of snake head
   - Never directly behind snake (avoid instant collision)
   - Visual indicator (glow/arrow) if off-screen
4. **Collision:** Self-collision disabled for first 3 orbs
5. **Win Condition:** Collect 5 orbs (reduced from normal 10)

#### Interaction Flow
1. **Start:**
   - Snake spawns in center (length 1)
   - First orb spawns 4 tiles ahead
   - No countdown (immediate control)

2. **During Play:**
   - Each orb collected: +1 length, +1 score
   - Progress bar updates (visual feedback)
   - Haptic feedback on collection (medium impact)
   - Particle burst effect (matching snake color)

3. **Near Win (4/5 orbs):**
   - Last orb spawns close (guaranteed easy path)
   - Subtle screen shake on approach (excitement build)

4. **Win:**
   - 5th orb collected: Freeze game (no more input)
   - 0.5s delay → Step 4 (Victory Celebration)

#### Error Handling
- **Death (rare in assisted mode):**
  - "Try again!" message (encouraging tone)
  - Instant restart (no menu)
  - Progress resets to 0/5
  - Tracking: `ftue_first_game_death_count`

#### Skip Behavior
- Pause menu → "Skip Tutorial?" option
- Warning: "You'll miss your first DNA reward!"
- Confirm skip: Jump to Step 7 (Lab locked, normal game)
- **Analytics:** `ftue_first_game_skipped` (high-value signal)

#### Implementation Details
- **File:** `src/components/game/AssistedGameMode.tsx`
- **Config:** `FTUE_ASSISTED_MODE` flag in `src/shared/config/game.ts`
- **State:** `tutorialStep: 3` in game store
- **Tracking:** `ftue_first_game_started`, `ftue_first_game_completed`, `ftue_first_game_duration`

#### A/B Test Variant (Step 3A)
**Variant:** "Ghost Snake"
- Show semi-transparent "ghost" snake following optimal path
- Player can ignore or follow (optional guidance)
- Hypothesis: Reduces deaths (but may feel patronizing)

---

### Step 4: Victory Celebration
**Duration:** 5 seconds (auto-advance)
**Skippable:** No (reward moment)
**Screen:** Full-screen overlay with celebration

#### Visual Elements
```
┌─────────────────────────────────────┐
│                                     │
│         🎉 YOU DID IT! 🎉           │
│                                     │
│      [DNA Icon × 5]                 │
│      (burst animation)              │
│                                     │
│    "You collected 5 DNA!"           │
│    "DNA unlocks new snakes..."      │
│                                     │
│     (auto-continuing in 5s)         │
│                                     │
└─────────────────────────────────────┘
```

#### Animation Sequence
1. **0-1s:** Screen flashes white (brief, non-epileptic)
2. **1-3s:** DNA icons fly in from edges (staggered, bouncy)
3. **3-4s:** Text fades in ("You collected 5 DNA!")
4. **4-5s:** Hint text appears ("DNA unlocks new snakes...")
5. **5s:** Auto-advance to Step 5

#### Audio/Haptics
- **Sound:** Triumphant jingle (2s, respects mute)
- **Haptics:** Heavy impact at 0s, light taps during DNA animation
- **Particles:** Confetti burst (3D, matches snake dynasty colors)

#### Implementation Details
- **File:** `src/components/game/VictoryCelebration.tsx`
- **Reward:** 5 DNA added to player inventory (server-authoritative)
- **Tracking:** `ftue_victory_shown`, `ftue_reward_granted`

---

### Step 5: Lab Introduction
**Duration:** 10 seconds (or until user taps)
**Skippable:** No (critical meta-game discovery)
**Screen:** Game menu with pulsing Lab button

#### Visual Elements
```
┌─────────────────────────────────────┐
│         [SupaSnake]                 │
│                                     │
│    ┌─────────────────────┐         │
│    │   [PLAY AGAIN]      │         │ ← Normal button
│    └─────────────────────┘         │
│                                     │
│    ┌─────────────────────┐         │
│    │   [LAB] 🧬 NEW!     │         │ ← Pulsing glow
│    │   (glowing border)   │         │   (animated)
│    └─────────────────────┘         │
│                                     │
│    ┌─────────────────────────────┐ │
│    │ "New area unlocked!"        │ │ ← Tooltip
│    │ "Breed snakes with your DNA"│ │   (points to Lab)
│    └─────────────────────────────┘ │
│                                     │
│    [Leaderboard] [Settings]        │ ← Other buttons
│    (dimmed, non-interactive)       │   (disabled)
└─────────────────────────────────────┘
```

#### Interaction Flow
1. **Initial State:**
   - Lab button appears with fade-in + scale animation
   - Pulsing glow (0.9x → 1.1x scale, 1.5s loop)
   - "NEW!" badge in top-right corner
   - Tooltip auto-appears after 2s
   - All other buttons dimmed (disabled until Lab visited)

2. **User Action:**
   - Tap Lab button: Navigate to Lab (Step 6)
   - Tap other buttons: Shake animation + re-point to Lab
   - No timeout (wait until user taps Lab)

3. **Tracking:**
   - `ftue_lab_revealed`
   - `ftue_lab_time_to_tap` (seconds until user taps)

#### Implementation Details
- **File:** `src/components/game/GameMenu.tsx`
- **State:** `tutorialStep: 5` in store (disables other buttons)
- **Animation:** CSS keyframes for pulse + glow
- **Accessibility:** Screen reader: "Lab button. New area unlocked. Tap to breed snakes."

---

### Step 6: Breeding Demo
**Duration:** 15 seconds (guided interaction)
**Skippable:** No (core meta-game mechanic)
**Screen:** Lab interface with on-rails demo

#### Visual Elements (Initial)
```
┌─────────────────────────────────────┐
│  [< Back]    THE LAB    [DNA: 5]    │ ← Header
│                                     │
│  ┌─────────────────────────────┐   │
│  │  [Snake Card]               │   │ ← Auto-selected
│  │  "Default Snake"            │   │   (glowing)
│  │  Dynasty: EMBER 🔥          │   │
│  │  Stats: Speed 3, Length 1   │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ "This is your first snake." │   │ ← Tutorial card
│  │ "Breed it to unlock more!"  │   │   (overlay)
│  └─────────────────────────────┘   │
│                                     │
│       [BREED (Cost: 5 DNA)]         │ ← Pulsing button
│                                     │
└─────────────────────────────────────┘
```

#### Interaction Flow

**Phase 1: Introduction (0-5s)**
1. Lab opens with fade-in transition
2. Single snake card visible (player's starter snake)
3. Tutorial card appears: "This is your first snake."
4. Snake card auto-highlights (glowing border)
5. After 3s: Tutorial card updates: "Breed it to unlock more!"

**Phase 2: Breeding (5-10s)**
1. Breed button pulses (1.1x scale, matches Lab glow)
2. Tutorial arrow points to button: "Tap here!"
3. User taps Breed button:
   - Deduct 5 DNA (show animation: -5 floating up)
   - Show breeding animation (2s):
     - Snake card splits into two
     - Shimmer effect
     - DNA helix swirl
   - New snake card appears (slides in from right)

**Phase 3: Dynasty Unlock (10-15s)**
1. "Dynasty Unlocked!" overlay appears
2. EMBER dynasty badge (large, centered):
   ```
   ┌─────────────────────────────────┐
   │    🔥 EMBER DYNASTY 🔥          │
   │                                 │
   │   "Fire-type snakes"            │
   │   "Bonus: +10% speed"           │
   │                                 │
   │   [AWESOME!]                    │
   └─────────────────────────────────┘
   ```
3. User taps "Awesome!" button
4. Dynasty overlay dismisses
5. Lab now shows 2 snakes (original + new EMBER snake)
6. Tutorial card: "Your new snake is ready! Return to play."

**Phase 4: Exit (15s)**
1. Back button pulses (prompt to return)
2. User taps Back → Return to Game Menu (Step 7)

#### Error Handling
- **Insufficient DNA (should never happen):**
  - Tutorial grants 5 DNA (exact cost)
  - If somehow missing: Grant 5 DNA + log error
- **Network Error (breeding API fails):**
  - Retry automatically (silent, 3 attempts)
  - If all fail: Show "Try again" button (manual retry)
  - Track: `ftue_breeding_api_error`

#### Implementation Details
- **File:** `src/components/lab/BreedingTutorial.tsx`
- **API:** `POST /api/breeding/create` (server-authoritative)
- **State:** `tutorialStep: 6` (disables free exploration)
- **Breeding Logic:** Guaranteed EMBER dynasty (not random)
- **Tracking:** `ftue_breeding_started`, `ftue_breeding_completed`, `ftue_dynasty_unlocked`

#### A/B Test Variant (Step 6A)
**Variant:** "Choose Your Dynasty"
- Show 3 starter dynasties (EMBER, CRYSTAL, MECHA)
- Player chooses one (personalization)
- Same breeding flow, but selected dynasty
- Hypothesis: Increased ownership (but 10s slower)

---

### Step 7: Return to Play
**Duration:** 5 seconds (transition)
**Skippable:** No (final handoff)
**Screen:** Game menu with tutorial complete

#### Visual Elements
```
┌─────────────────────────────────────┐
│         [SupaSnake]                 │
│                                     │
│    ┌─────────────────────────────┐ │
│    │ "Tutorial Complete! ✓"      │ │ ← Success banner
│    │ "All features unlocked"     │ │   (fades after 5s)
│    └─────────────────────────────┘ │
│                                     │
│    ┌─────────────────────┐         │
│    │   [PLAY]            │         │ ← Now shows snake select
│    │   (EMBER snake)     │         │   (not "Play Again")
│    └─────────────────────┘         │
│                                     │
│    [Lab] [Leaderboard] [Settings]  │ ← All buttons active
│    (all unlocked now)               │   (no longer dimmed)
│                                     │
└─────────────────────────────────────┘
```

#### Implementation Details
1. **State Update:**
   - `tutorialComplete: true` in player profile
   - `tutorialStep: null` (clear tutorial state)
   - Persist to database (server-authoritative)

2. **Unlocks:**
   - Game Menu: All buttons active
   - Play: Shows snake selection (EMBER snake equipped)
   - Lab: Full access (breed, view dynasties)
   - Leaderboard: Visible (player ranked)
   - Settings: All options available

3. **Tracking:**
   - `ftue_completed` (success event)
   - `ftue_total_duration` (seconds from Step 1 to Step 7)
   - `ftue_completion_timestamp`

4. **Reward:**
   - Grant "First Blood" achievement
   - Add 10 bonus DNA (post-tutorial gift)
   - Show notification: "Bonus: +10 DNA for completing tutorial!"

---

## Skip Behavior Matrix

| Step | Skippable? | Skip Method | Consequence | Recovery |
|------|-----------|-------------|-------------|----------|
| 1. Welcome | ✅ Yes | Tap anywhere | Skip to Step 2 | None (benign) |
| 2. Controls | ❌ No | N/A | Must complete | N/A |
| 3. First Game | ✅ Yes | Pause → Skip | Skip to Step 7 (Lab locked) | Play normal game, Lab unlocks after first real win |
| 4. Victory | ❌ No | N/A | Auto-advance (5s) | N/A |
| 5. Lab Intro | ❌ No | N/A | Must tap Lab | N/A |
| 6. Breeding Demo | ❌ No | N/A | Must complete | N/A |
| 7. Return to Play | ❌ No | N/A | Auto-complete | N/A |

### Global Skip Option
- **Location:** Settings menu (always accessible via Pause)
- **Label:** "Skip Entire Tutorial"
- **Confirmation:** "Are you sure? You'll miss starter rewards."
- **Effect:**
  - Jump to Step 7 (all features unlocked)
  - Grant 0 DNA (no rewards)
  - Lab locked until first win
  - Track: `ftue_full_skip` (high-intent users, possibly returning players)

---

## First Win Mechanics

### Guaranteed Success Strategy
The tutorial uses "assisted mode" to ensure first win within 60 seconds:

#### 1. Reduced Difficulty
- **Snake Speed:** 0.75x normal (166ms per move vs 125ms)
- **Arena:** No walls (toroidal wrap-around, no death from edges)
- **Self-Collision:** Disabled until 3 orbs collected
- **Win Condition:** 5 orbs (vs normal 10)

#### 2. Intelligent Orb Placement
```typescript
// Orb spawning algorithm (pseudo-code)
function spawnTutorialOrb(snakePosition, orbsCollected) {
  const maxDistance = orbsCollected < 3 ? 5 : 8; // Closer early on
  const minDistance = 3; // Never too close (feels rigged)

  const validPositions = arena
    .filter(pos => !snake.occupies(pos))
    .filter(pos => distance(pos, snakePosition) <= maxDistance)
    .filter(pos => distance(pos, snakePosition) >= minDistance)
    .filter(pos => !isBehindSnake(pos, snakeDirection)); // Avoid instant collision

  return randomChoice(validPositions);
}
```

#### 3. Visual Guidance (Subtle)
- **Orb Glow:** Pulsing animation (easier to spot)
- **Off-Screen Indicator:** Arrow at screen edge if orb off-screen
- **Progress Bar:** "3/5 DNA" (clear goal)

#### 4. No Punishment
- **Death:** Instant restart (no "Game Over" screen)
- **Time Pressure:** None (no countdown, no rushing)
- **Leaderboard:** Not visible during tutorial (no comparison anxiety)

### Failure Fallback
If player dies 3+ times in Step 3:
1. Show "Struggling? Try this!" tooltip
2. Offer "Super Easy Mode":
   - Snake speed: 0.5x (ultra slow)
   - Self-collision: Always disabled
   - Orb distance: Max 4 tiles (always close)
3. Track: `ftue_super_easy_mode_activated` (struggle signal)

---

## Lab Introduction Strategy

### Timing
- **Trigger:** Immediately after first win (Step 4 → Step 5)
- **Why:** Reward moment (positive reinforcement)
- **Goal:** Establish core loop (Play → Lab → Play)

### Discovery Mechanics
1. **Visual Hook:** Pulsing Lab button (impossible to miss)
2. **Contextual Tooltip:** "New area unlocked! Breed snakes with your DNA"
3. **Forced Interaction:** Other buttons disabled until Lab visited
4. **Reward Tease:** "DNA: 5" visible in header (currency acquired)

### Breeding Tutorial (Step 6)
- **On-Rails:** Auto-select snake, guide to breed button
- **Instant Gratification:** 2s breeding animation (feels premium)
- **Dynasty Reveal:** "EMBER DYNASTY UNLOCKED" (epic moment)
- **Visual Wow:** Fire particles, glowing effects, haptics

### Why This Works
- **Completionists:** "New area to explore!"
- **Competitors:** "Stronger snakes = higher scores"
- **Expressionists:** "Cool fire snake unlocked!"

---

## Success Metrics & Targets

### Tutorial Funnel
```
Step 1 (Welcome):       100% (baseline)
  ↓ -5%
Step 2 (Controls):       95% (5% abandon)
  ↓ -8%
Step 3 (First Game):     87% (8% skip/abandon)
  ↓ -2%
Step 4 (Victory):        85% (2% quit before seeing)
  ↓ 0%
Step 5 (Lab Intro):      85% (forced interaction)
  ↓ 0%
Step 6 (Breeding):       85% (forced interaction)
  ↓ 0%
Step 7 (Complete):       85% (target: ≥85%)
```

### Time Benchmarks
- **P50 (Median):** 70 seconds
- **P75:** 90 seconds
- **P90:** 120 seconds
- **P99:** 180 seconds (strugglers)

**If P50 > 90s:** Tutorial too slow (reduce text, speed up animations)
**If P90 > 180s:** Add skip option or super easy mode

### Engagement Signals
| Metric | Good | Warning | Critical |
|--------|------|---------|----------|
| Completion Rate | ≥85% | 70-85% | <70% |
| Time to First Win | ≤60s | 60-90s | >90s |
| Death Count (Step 3) | 0-1 | 2-3 | ≥4 |
| Skip Rate (Step 3) | ≤10% | 10-20% | >20% |
| Lab Discovery | ≥85% | 70-85% | <70% |

### A/B Test Success Criteria
- **Variant wins if:**
  - Completion rate +5% vs control
  - OR Time to first win -10s vs control
  - OR D1 retention +3% vs control
- **Minimum sample:** 1,000 users per variant
- **Statistical significance:** p < 0.05

---

## A/B Test Variants

### Variant A: "Extended Control Tutorial" (Control Group)
**Changes:** None (baseline described above)

**Hypothesis:** Current flow is optimal (60-70s, 85% completion)

---

### Variant B: "Ghost Snake Guide"
**Changes to Step 3 (First Game):**

Add semi-transparent "ghost snake" that demonstrates optimal path:
- Ghost appears ahead of player snake
- Shows ideal movement (collect orbs efficiently)
- Player can follow or ignore (not forced)
- Ghost disappears after 3 orbs collected (training wheels removed)

**Visual:**
```
┌─────────────────────────────────────┐
│  Score: 1/5 DNA    [Pause]          │
│                                     │
│    👻👻👻 ← Ghost snake (50% opacity)│
│                                     │
│    🐍 ← Player snake                │
│                                     │
│         🔵 ← Orb                    │
│                                     │
│  "Follow the ghost to learn!"       │ ← Tooltip (dismissable)
└─────────────────────────────────────┘
```

**Hypothesis:**
- **Pro:** Reduces deaths (visual learning), faster completion
- **Con:** May feel patronizing, reduces agency
- **Target:** Death count < 0.5 per user (vs 1.2 in control)

**Tracking:**
- `ftue_variant: ghost_snake`
- `ftue_ghost_followed_percentage` (% of time player near ghost)
- `ftue_ghost_dismissed_early` (tapped X to hide)

---

### Variant C: "Choose Your Starter Dynasty"
**Changes to Step 6 (Breeding Demo):**

Instead of auto-breeding EMBER snake, let player choose:

**Visual (Step 6 - Phase 1):**
```
┌─────────────────────────────────────┐
│  [< Back]    THE LAB    [DNA: 5]    │
│                                     │
│  "Choose your starter dynasty!"     │ ← New prompt
│                                     │
│  ┌───────┐  ┌───────┐  ┌───────┐   │
│  │ 🔥    │  │ 💎    │  │ 🤖    │   │ ← Dynasty cards
│  │EMBER  │  │CRYSTAL│  │ MECHA │   │   (tap to select)
│  │+Speed │  │+Defense│ │+Length│   │
│  └───────┘  └───────┘  └───────┘   │
│                                     │
│  [BREED SELECTED (Cost: 5 DNA)]     │ ← Breed chosen one
└─────────────────────────────────────┘
```

**Interaction:**
1. Player taps dynasty card (highlights)
2. Tap Breed button
3. Same breeding animation as control
4. Unlock chosen dynasty (EMBER, CRYSTAL, or MECHA)

**Hypothesis:**
- **Pro:** Increased ownership (player choice), personalization
- **Pro:** Higher D1 retention (player invested in choice)
- **Con:** 10-15s slower (choice paralysis), may confuse
- **Target:** D1 retention +5% vs control (45% → 50%)

**Tracking:**
- `ftue_variant: choose_dynasty`
- `ftue_dynasty_choice` (EMBER/CRYSTAL/MECHA distribution)
- `ftue_choice_time` (seconds to decide)

---

### Variant D: "No Tutorial" (Veteran Mode)
**Changes:** Skip all tutorial steps, unlock everything

**Entry Point:**
- On first app open, show: "New to SupaSnake?" → Yes/No
- If "No": Jump to full game (no tutorial)
- If "Yes": Run normal tutorial

**Hypothesis:**
- **Pro:** Respects veteran players (alt accounts, returning users)
- **Pro:** Identifies high-intent users (skip rate = confidence)
- **Con:** True new users may choose "No" and get lost
- **Target:** Identify <10% of users as veterans

**Tracking:**
- `ftue_variant: veteran_mode`
- `ftue_self_identified_veteran` (chose "No" on prompt)
- `ftue_veteran_performance` (first game score, Lab discovery time)

---

## Implementation Checklist

### Phase 1: Core Tutorial (Week 1-2)
- [ ] Step 1: Welcome Splash component
- [ ] Step 2: Control Tutorial component
- [ ] Step 3: Assisted Game Mode (0.75x speed, no walls)
- [ ] Step 4: Victory Celebration component
- [ ] Step 5: Lab Introduction (pulsing button, disabled menu)
- [ ] Step 6: Breeding Tutorial (on-rails, auto-EMBER)
- [ ] Step 7: Tutorial Complete state (unlocks, rewards)
- [ ] Database: `tutorial_step`, `tutorial_completed` fields
- [ ] Analytics: Track all FTUE events (13 events total)

### Phase 2: Skip Behavior (Week 2)
- [ ] Welcome Splash: Tap-to-skip
- [ ] First Game: Pause → Skip option (with warning)
- [ ] Global Skip: Settings → Skip Tutorial (full escape hatch)
- [ ] Skip tracking: Record skip points, reasons

### Phase 3: Error Handling (Week 3)
- [ ] Control Tutorial: Timeout hints (10s, 20s)
- [ ] First Game: Death recovery (instant restart)
- [ ] First Game: 3-death fallback (Super Easy Mode)
- [ ] Breeding: API error retry (3 attempts)
- [ ] Breeding: Network timeout handling

### Phase 4: A/B Test Infrastructure (Week 4)
- [ ] Variant assignment: Random 25% per variant
- [ ] Variant persistence: Store in player profile
- [ ] Variant B: Ghost Snake component
- [ ] Variant C: Dynasty Selection component
- [ ] Variant D: Veteran Mode prompt
- [ ] Analytics: Variant-specific event tracking

### Phase 5: Monitoring & Iteration (Week 5+)
- [ ] Dashboard: FTUE funnel visualization
- [ ] Alerts: Completion rate <80%, P50 time >90s
- [ ] Heatmaps: User input patterns (swipe vs D-Pad)
- [ ] Session recordings: Watch failed attempts (privacy-compliant)
- [ ] Monthly review: Adjust tutorial based on data

---

## Technical Implementation Notes

### File Structure
```
src/
├── components/
│   ├── game/
│   │   ├── WelcomeSplash.tsx           # Step 1
│   │   ├── ControlTutorial.tsx         # Step 2
│   │   ├── AssistedGameMode.tsx        # Step 3
│   │   ├── VictoryCelebration.tsx      # Step 4
│   │   └── GameMenu.tsx                # Step 5 (modified)
│   ├── lab/
│   │   └── BreedingTutorial.tsx        # Step 6
│   └── ftue/
│       ├── TutorialManager.tsx         # Orchestrator
│       ├── GhostSnake.tsx              # Variant B
│       ├── DynastySelector.tsx         # Variant C
│       └── VeteranPrompt.tsx           # Variant D
├── lib/
│   └── ftue/
│       ├── tutorial-state.ts           # Zustand store
│       ├── assisted-mode.ts            # Orb spawning logic
│       └── analytics.ts                # Event tracking
└── shared/
    └── config/
        └── ftue.ts                     # Constants, variant config
```

### State Management
```typescript
// src/lib/ftue/tutorial-state.ts
import { create } from 'zustand';

interface TutorialState {
  step: number | null;           // Current step (1-7, null if complete)
  variant: 'control' | 'ghost_snake' | 'choose_dynasty' | 'veteran_mode';
  completed: boolean;
  startTime: number;             // Unix timestamp
  stepDurations: number[];       // Time spent per step
  deathCount: number;            // Deaths during Step 3
  skipped: boolean;

  // Actions
  startTutorial: (variant: string) => void;
  advanceStep: () => void;
  skipTutorial: () => void;
  recordDeath: () => void;
  completeTutorial: () => void;
}

export const useTutorialStore = create<TutorialState>((set, get) => ({
  step: null,
  variant: 'control',
  completed: false,
  startTime: 0,
  stepDurations: [],
  deathCount: 0,
  skipped: false,

  startTutorial: (variant) => {
    set({
      step: 1,
      variant: variant as any,
      startTime: Date.now(),
      completed: false
    });
  },

  advanceStep: () => {
    const current = get();
    const stepTime = Date.now() - current.startTime;
    set({
      step: current.step! + 1,
      stepDurations: [...current.stepDurations, stepTime],
      startTime: Date.now()
    });
  },

  skipTutorial: () => {
    set({
      step: null,
      completed: false,
      skipped: true
    });
  },

  recordDeath: () => {
    set({ deathCount: get().deathCount + 1 });
  },

  completeTutorial: () => {
    const current = get();
    set({
      step: null,
      completed: true,
      stepDurations: [...current.stepDurations, Date.now() - current.startTime]
    });

    // Persist to database
    fetch('/api/player/tutorial-complete', {
      method: 'POST',
      body: JSON.stringify({
        variant: current.variant,
        totalDuration: current.stepDurations.reduce((a, b) => a + b, 0),
        deathCount: current.deathCount,
        stepDurations: current.stepDurations
      })
    });
  }
}));
```

### Assisted Mode Config
```typescript
// src/shared/config/ftue.ts
export const FTUE_CONFIG = {
  // Step 3: First Game
  ASSISTED_MODE: {
    SNAKE_SPEED_MULTIPLIER: 0.75,    // 75% of normal speed
    ARENA_HAS_WALLS: false,          // Toroidal wrap-around
    SELF_COLLISION_DISABLED_UNTIL: 3, // First 3 orbs safe
    WIN_CONDITION_ORBS: 5,           // Reduced from 10
    ORB_MAX_DISTANCE: 5,             // Always nearby
    ORB_MIN_DISTANCE: 3,             // Not too close
    DEATH_RESTART_DELAY: 500,        // Instant restart (ms)
  },

  // Variant Assignment (A/B test split)
  VARIANT_WEIGHTS: {
    control: 0.40,           // 40%
    ghost_snake: 0.30,       // 30%
    choose_dynasty: 0.20,    // 20%
    veteran_mode: 0.10,      // 10%
  },

  // Tracking Events
  EVENTS: {
    WELCOME_SHOWN: 'ftue_welcome_shown',
    WELCOME_SKIPPED: 'ftue_welcome_skipped',
    CONTROL_STARTED: 'ftue_control_started',
    CONTROL_COMPLETED: 'ftue_control_completed',
    FIRST_GAME_STARTED: 'ftue_first_game_started',
    FIRST_GAME_DEATH: 'ftue_first_game_death',
    FIRST_GAME_COMPLETED: 'ftue_first_game_completed',
    VICTORY_SHOWN: 'ftue_victory_shown',
    LAB_REVEALED: 'ftue_lab_revealed',
    LAB_TAPPED: 'ftue_lab_tapped',
    BREEDING_STARTED: 'ftue_breeding_started',
    BREEDING_COMPLETED: 'ftue_breeding_completed',
    TUTORIAL_COMPLETED: 'ftue_completed',
    TUTORIAL_SKIPPED: 'ftue_skipped',
  }
} as const;
```

### Analytics Integration
```typescript
// src/lib/ftue/analytics.ts
import { trackEvent } from '@/lib/analytics';
import { FTUE_CONFIG } from '@/shared/config/ftue';

export function trackFTUEEvent(
  eventName: keyof typeof FTUE_CONFIG.EVENTS,
  properties?: Record<string, any>
) {
  const event = FTUE_CONFIG.EVENTS[eventName];

  trackEvent({
    event_type: event,
    properties: {
      ...properties,
      tutorial_variant: useTutorialStore.getState().variant,
      tutorial_step: useTutorialStore.getState().step,
      timestamp: Date.now(),
    }
  });
}

// Usage:
trackFTUEEvent('FIRST_GAME_STARTED', {
  deathCount: 0
});

trackFTUEEvent('TUTORIAL_COMPLETED', {
  totalDuration: 72500, // ms
  stepDurations: [3000, 18000, 28000, 5000, 12000, 15000, 3500]
});
```

---

## Accessibility Considerations

### Screen Reader Support
- **All steps:** Descriptive labels (e.g., "Control tutorial. Swipe to move snake.")
- **Buttons:** Announce state ("Lab button. New area. Tap to open.")
- **Progress:** Announce updates ("3 out of 5 DNA collected")

### Input Methods
- **Touch:** Swipe gestures (primary)
- **Virtual D-Pad:** Always visible (fallback)
- **Keyboard:** Arrow keys (web version)
- **Gamepad:** D-pad/joystick (if connected)

### Visual Impairments
- **High Contrast:** WCAG AAA compliant (4.5:1 text, 3:1 UI)
- **Large Text:** Scales with OS settings (up to 200%)
- **Colorblind:** Dynasty colors distinguishable (not red/green only)

### Cognitive Load
- **One Task at a Time:** Single instruction per screen
- **Clear Goals:** "Collect 5 DNA" (not vague "play the game")
- **Immediate Feedback:** Haptics + particles on every action

---

## Localization Notes

### Text Volume
- **Total words:** ~150 words across all steps
- **Longest message:** "DNA unlocks new snakes in the Lab" (7 words)
- **Average message:** 3-4 words

### Translation Keys
```json
{
  "ftue.welcome.tagline": "Eat. Evolve. Dominate.",
  "ftue.welcome.tap": "Tap anywhere to begin",
  "ftue.control.instruction": "Swipe to move",
  "ftue.control.try": "Try it now!",
  "ftue.game.collect": "Collect {count} more DNA!",
  "ftue.victory.title": "YOU DID IT!",
  "ftue.victory.reward": "You collected {count} DNA!",
  "ftue.victory.hint": "DNA unlocks new snakes...",
  "ftue.lab.new": "NEW!",
  "ftue.lab.unlocked": "New area unlocked!",
  "ftue.lab.breed": "Breed snakes with your DNA",
  "ftue.breeding.first": "This is your first snake.",
  "ftue.breeding.action": "Breed it to unlock more!",
  "ftue.dynasty.unlocked": "Dynasty Unlocked!",
  "ftue.dynasty.ember": "Fire-type snakes",
  "ftue.dynasty.bonus": "Bonus: +10% speed",
  "ftue.complete.title": "Tutorial Complete!",
  "ftue.complete.subtitle": "All features unlocked"
}
```

### RTL Language Support
- **Layout:** Flip horizontal layouts (Lab button on right → left)
- **Animations:** Mirror slide-in directions
- **Text:** Right-align Arabic, Hebrew, Farsi

---

## Performance Optimization

### Asset Loading
- **Preload:** All tutorial assets during app init (avoid mid-tutorial delays)
- **Bundle:** Tutorial-specific assets in separate chunk (code-splitting)
- **Lazy Load:** Variant-specific components (only load active variant)

### Animation Performance
- **GPU-Accelerated:** Use `transform` + `opacity` (not `top`/`left`)
- **RequestAnimationFrame:** Smooth 60fps animations
- **Reduce Motion:** Respect OS setting (disable particles if preferred)

### Memory Management
- **Cleanup:** Remove event listeners after each step
- **Asset Unloading:** Unload tutorial assets after Step 7
- **State Reset:** Clear tutorial state from memory when complete

---

## Legal/Compliance

### Age Gating
- **COPPA:** Tutorial must not collect PII from <13 users
- **Implementation:** Age gate before Step 1 (not during tutorial)
- **Anonymous:** Tutorial works without account (guest mode)

### Privacy
- **Analytics:** Collect only necessary data (no PII)
- **Consent:** Respect opt-out (disable analytics if user declined)
- **Data Retention:** Tutorial data deleted after 90 days (GDPR)

### Accessibility
- **ADA Compliance:** Screen reader support, keyboard navigation
- **WCAG 2.1 AA:** Contrast ratios, focus indicators, error handling

---

## Change Log

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-01-19 | Initial FTUE script | Claude (Technical Writer) |

---

## Next Steps

1. **Week 1-2:** Implement core tutorial (Steps 1-7)
2. **Week 3:** Add skip behavior and error handling
3. **Week 4:** Build A/B test variants (Ghost Snake, Dynasty Choice)
4. **Week 5:** Deploy to 10% of users (gradual rollout)
5. **Week 6:** Analyze data, iterate on winning variant
6. **Week 7:** Full rollout (100% of users)

**Success Criteria:** 85% completion rate, 70s median time, 45% D1 retention

---

**Document Owner:** Product Team
**Last Updated:** 2025-01-19
**Status:** Draft (Pending Implementation)
