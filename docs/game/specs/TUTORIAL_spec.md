# Feature: Tutorial System Specification v1.0
## Production-Ready Design

**Version:** 1.0
**Date:** 2025-01-22
**Status:** [ ] Draft | [x] Review | [ ] LOCKED
**Priority:** HIGH (P1)
**Sprint:** Sprint 3

---

## 1. Executive Summary

**One-Paragraph Description:**
The Tutorial System guides first-time players through their first 5 minutes in SupaSnake, teaching core mechanics and establishing the meta-game hook. The tutorial covers: choosing a starter dynasty, understanding the Collection, playing their first Snake game, earning DNA, and their first breeding. For v0.1 MVP, this is a linear, non-skippable sequence that ensures all players understand the core loop before free play.

### Core Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Tutorial Length** | 5 minutes max | Mobile-friendly, respects player time |
| **Skippable** | No (v0.1) | Ensure all testers understand core loop |
| **Dynasty Choice** | Player selects 1 of 3 | Creates immediate identity/investment |
| **First Breed** | Forced with free 2nd snake | Teaches breeding without DNA barrier |
| **Completion Reward** | 500 DNA bonus | Momentum into first real unlock |

### Constraints Addressed

| Constraint | How This Feature Supports It |
|------------|------------------------------|
| **PR-001** | First 5 minutes create hook for return |
| **CE-004** | Tutorial optimized for D1 retention |
| **CE-001** | Establishes Lab-first mental model (70/30) |
| **BM-003** | Core mechanics free, no paywall in tutorial |

### Dependencies

**Requires (must exist before this):**
- [x] Snake Data Model - Status: Spec complete
- [x] Collection UI - Status: Spec complete
- [x] Breeding System - Status: Spec complete
- [x] Core Snake Game - Status: Built (existing)

**Unblocks (enabled by this):**
- [ ] Full free play (post-tutorial)
- [ ] Analytics tracking (measure tutorial completion)
- [ ] A/B testing (tutorial variants in v0.2)

---

## 2. Design Specification

### 2.1 Tutorial Sequence

```
STEP 1: Welcome (30s)
├── Splash screen: "Welcome to SupaSnake"
├── Brief intro: "Collect. Breed. Dominate."
└── Tap to continue

STEP 2: Dynasty Choice (60s)
├── "Choose your first snake dynasty"
├── Show 3 dynasty cards with descriptions
├── Player taps to select one
├── Confirmation: "You chose [DYNASTY]!"
└── Starter snake added to collection

STEP 3: Collection Introduction (45s)
├── "This is your Collection"
├── Highlight the starter snake
├── "You'll collect more snakes here"
├── Point to locked variants
└── "Unlock with DNA currency"

STEP 4: First Snake Game (90s)
├── "Time to play Snake and earn DNA!"
├── Quick controls tutorial overlay
├── Play one short game (60s or first death)
├── Show DNA earned
└── "DNA is how you grow your collection"

STEP 5: Meet Your Second Snake (30s)
├── "Here's a gift to get you started"
├── Award free second snake (same dynasty)
├── Show it in collection
└── "Now you can breed!"

STEP 6: First Breeding (60s)
├── "Let's breed your snakes"
├── Guide through parent selection
├── Highlight "Breed" button
├── Execute breeding (free - no DNA cost)
├── Offspring reveal with celebration
└── "You created a Gen 2 snake!"

STEP 7: Completion (30s)
├── "You're ready to go!"
├── Award 500 DNA completion bonus
├── Show next goals: "Unlock a new variant"
├── "Your collection is waiting..."
└── Transition to free Lab

TOTAL: ~5 minutes
```

### 2.2 Screen Flows

#### Step 2: Dynasty Choice

```
┌─────────────────────────────────────────────────┐
│                                                 │
│         Choose Your Dynasty                     │
│                                                 │
│   "Your snakes carry the power of their        │
│    dynasty. Each has unique strengths."        │
│                                                 │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │  CYBER  │  │ PRIMAL  │  │ COSMIC  │        │
│  │   🔵    │  │   🟢    │  │   🟣    │        │
│  │         │  │         │  │         │        │
│  │ +5% spd │  │+5% DNA  │  │+5% size │        │
│  │         │  │         │  │         │        │
│  │ digital │  │ nature  │  │  space  │        │
│  │precision│  │ growth  │  │ power   │        │
│  └─────────┘  └─────────┘  └─────────┘        │
│                                                 │
│        Tap a dynasty to learn more             │
│                                                 │
└─────────────────────────────────────────────────┘
```

#### Step 4: Snake Game Overlay

```
┌─────────────────────────────────────────────────┐
│  ┌─────────────────────────────────────────┐   │
│  │         SWIPE TO MOVE                    │   │
│  │                                          │   │
│  │         👆 = Up                          │   │
│  │    👈 = Left    👉 = Right               │   │
│  │         👇 = Down                        │   │
│  │                                          │   │
│  │    Eat food 🍎 to grow and earn DNA     │   │
│  │                                          │   │
│  │         [GOT IT!]                        │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│         (Game preview visible behind)          │
│                                                 │
└─────────────────────────────────────────────────┘
```

#### Step 6: Guided Breeding

```
┌─────────────────────────────────────────────────┐
│  ┌─────────────────────────────────────────┐   │
│  │  ➡️ Tap to select your first parent     │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌───────────────┐    +    ┌───────────────┐   │
│  │               │         │               │   │
│  │  [PARENT 1]   │◀────────│  [EMPTY]      │   │
│  │               │  pulse   │               │   │
│  │  CYBER SPARK  │ highlight│  Tap here    │   │
│  │    Gen 1      │         │    next       │   │
│  └───────────────┘         └───────────────┘   │
│                                                 │
│  (Coach marks guide each tap)                  │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 2.3 Tutorial State Machine

```typescript
enum TutorialStep {
  NOT_STARTED = 'not_started',
  WELCOME = 'welcome',
  DYNASTY_CHOICE = 'dynasty_choice',
  COLLECTION_INTRO = 'collection_intro',
  FIRST_GAME = 'first_game',
  SECOND_SNAKE = 'second_snake',
  FIRST_BREED = 'first_breed',
  COMPLETION = 'completion',
  COMPLETED = 'completed',
}

// Transitions
const TUTORIAL_FLOW: Record<TutorialStep, TutorialStep | null> = {
  [TutorialStep.NOT_STARTED]: TutorialStep.WELCOME,
  [TutorialStep.WELCOME]: TutorialStep.DYNASTY_CHOICE,
  [TutorialStep.DYNASTY_CHOICE]: TutorialStep.COLLECTION_INTRO,
  [TutorialStep.COLLECTION_INTRO]: TutorialStep.FIRST_GAME,
  [TutorialStep.FIRST_GAME]: TutorialStep.SECOND_SNAKE,
  [TutorialStep.SECOND_SNAKE]: TutorialStep.FIRST_BREED,
  [TutorialStep.FIRST_BREED]: TutorialStep.COMPLETION,
  [TutorialStep.COMPLETION]: TutorialStep.COMPLETED,
  [TutorialStep.COMPLETED]: null, // End state
};
```

### 2.4 Edge Cases

| Edge Case | Expected Behavior |
|-----------|-------------------|
| App killed mid-tutorial | Resume at last saved step on relaunch |
| Player dies instantly in Snake | Encourage retry, no penalty, still earn some DNA |
| Network error during breeding | Retry with stored data, offline-capable |
| Returning player (tutorial done) | Skip directly to Lab |
| Tutorial data corrupted | Reset to step 1, re-grant starter |

### 2.5 Business Rules

- **Rule 1:** Tutorial must be completed before accessing free play
- **Rule 2:** Tutorial progress persisted server-side (survives reinstall)
- **Rule 3:** Starter snake is free and permanent (cannot be deleted)
- **Rule 4:** First breeding is free (DNA cost waived)
- **Rule 5:** 500 DNA completion bonus is one-time only
- **Rule 6:** Dynasty choice is permanent (no changing starter dynasty)

---

## 3. Technical Implementation

### 3.1 Database Schema

```sql
-- =====================================================
-- TUTORIAL PROGRESS TABLE
-- Tracks each player's tutorial state
-- =====================================================
CREATE TABLE IF NOT EXISTS tutorial_progress (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_step TEXT NOT NULL DEFAULT 'not_started',
  chosen_dynasty_id UUID REFERENCES dynasties(id),
  starter_snake_id UUID REFERENCES player_collection(id),
  second_snake_id UUID REFERENCES player_collection(id),
  first_breed_offspring_id UUID REFERENCES player_collection(id),
  first_game_dna_earned INT DEFAULT 0,
  completion_bonus_claimed BOOLEAN DEFAULT false,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE tutorial_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY tutorial_own ON tutorial_progress
  FOR ALL USING (auth.uid() = user_id);

-- =====================================================
-- TUTORIAL FUNCTIONS
-- =====================================================

-- Initialize tutorial for new user
CREATE OR REPLACE FUNCTION init_tutorial()
RETURNS void AS $$
BEGIN
  INSERT INTO tutorial_progress (user_id, current_step, started_at)
  VALUES (auth.uid(), 'welcome', NOW())
  ON CONFLICT (user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Advance tutorial step
CREATE OR REPLACE FUNCTION advance_tutorial(
  p_next_step TEXT,
  p_data JSONB DEFAULT '{}'::jsonb
) RETURNS tutorial_progress AS $$
DECLARE
  v_progress tutorial_progress;
BEGIN
  UPDATE tutorial_progress
  SET
    current_step = p_next_step,
    chosen_dynasty_id = COALESCE((p_data->>'dynasty_id')::uuid, chosen_dynasty_id),
    starter_snake_id = COALESCE((p_data->>'starter_snake_id')::uuid, starter_snake_id),
    second_snake_id = COALESCE((p_data->>'second_snake_id')::uuid, second_snake_id),
    first_breed_offspring_id = COALESCE((p_data->>'offspring_id')::uuid, first_breed_offspring_id),
    first_game_dna_earned = COALESCE((p_data->>'dna_earned')::int, first_game_dna_earned),
    completed_at = CASE WHEN p_next_step = 'completed' THEN NOW() ELSE completed_at END,
    updated_at = NOW()
  WHERE user_id = auth.uid()
  RETURNING * INTO v_progress;

  -- Grant completion bonus if completing
  IF p_next_step = 'completed' AND NOT v_progress.completion_bonus_claimed THEN
    UPDATE user_resources SET dna_balance = dna_balance + 500 WHERE user_id = auth.uid();
    UPDATE tutorial_progress SET completion_bonus_claimed = true WHERE user_id = auth.uid();
  END IF;

  RETURN v_progress;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 3.2 API Endpoints

| Endpoint | Method | Description | Request | Response |
|----------|--------|-------------|---------|----------|
| `/api/tutorial/status` | GET | Get current tutorial state | - | `{ step, data }` |
| `/api/tutorial/advance` | POST | Move to next step | `{ step, data }` | `{ progress }` |
| `/api/tutorial/choose-dynasty` | POST | Select starter dynasty | `{ dynastyId }` | `{ starterSnake }` |
| `/api/tutorial/grant-second` | POST | Give free second snake | - | `{ secondSnake }` |
| `/api/tutorial/free-breed` | POST | Execute free first breed | `{ parent1Id, parent2Id }` | `{ offspring }` |
| `/api/tutorial/complete` | POST | Mark tutorial done, grant bonus | - | `{ bonus: 500 }` |

### 3.3 UI Components

```
app/tutorial/
├── page.tsx                    # Tutorial router by step
├── components/
│   ├── TutorialWrapper.tsx     # Progress tracking, navigation
│   ├── WelcomeStep.tsx         # Step 1: Welcome
│   ├── DynastyChoiceStep.tsx   # Step 2: Choose dynasty
│   ├── CollectionIntroStep.tsx # Step 3: Collection tour
│   ├── FirstGameStep.tsx       # Step 4: Play Snake
│   ├── SecondSnakeStep.tsx     # Step 5: Gift snake
│   ├── FirstBreedStep.tsx      # Step 6: Guided breeding
│   ├── CompletionStep.tsx      # Step 7: Done!
│   ├── CoachMark.tsx           # Highlight/tooltip component
│   └── ProgressIndicator.tsx   # Step dots at bottom
├── hooks/
│   └── useTutorial.ts          # Tutorial state management
└── stores/
    └── tutorialStore.ts        # Zustand tutorial state
```

### 3.4 State Management

```typescript
// stores/tutorialStore.ts

interface TutorialState {
  // State
  currentStep: TutorialStep;
  chosenDynastyId: string | null;
  starterSnake: OwnedSnake | null;
  secondSnake: OwnedSnake | null;
  offspringSnake: OwnedSnake | null;
  firstGameDnaEarned: number;
  isCompleted: boolean;

  // Loading
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchStatus: () => Promise<void>;
  chooseDynasty: (dynastyId: string) => Promise<OwnedSnake>;
  completeFirstGame: (dnaEarned: number) => Promise<void>;
  grantSecondSnake: () => Promise<OwnedSnake>;
  executeFirstBreed: (parent1Id: string, parent2Id: string) => Promise<OwnedSnake>;
  completeTutorial: () => Promise<void>;
  advanceStep: () => void;
}
```

### 3.5 Coach Mark System

```typescript
// components/tutorial/CoachMark.tsx

interface CoachMarkProps {
  target: string;          // CSS selector for element to highlight
  message: string;         // Instruction text
  position: 'top' | 'bottom' | 'left' | 'right';
  showPulse: boolean;      // Pulsing animation on target
  onDismiss?: () => void;  // Optional dismiss callback
}

// Usage in tutorial steps:
<CoachMark
  target="#breed-button"
  message="Tap here to breed your snakes!"
  position="top"
  showPulse={true}
  onDismiss={handleBreedTapped}
/>
```

---

## 4. Acceptance Criteria

### 4.1 MUST HAVE (Feature fails without these)

- [ ] **Tutorial starts on first launch:** New user sees welcome screen
- [ ] **Dynasty selection works:** Player can choose 1 of 3 dynasties
- [ ] **Starter snake granted:** Chosen dynasty's starter added to collection
- [ ] **First game playable:** Can play Snake and earn DNA
- [ ] **Second snake gifted:** Free second snake same dynasty
- [ ] **Free breeding works:** Can breed without DNA cost
- [ ] **Completion bonus granted:** 500 DNA on completion
- [ ] **Progress persisted:** Resume at correct step after app restart

### 4.2 SHOULD HAVE (Important but not blocking)

- [ ] **Coach marks guide interactions:** Highlights and tooltips
- [ ] **Progress indicator:** Shows which step of 7
- [ ] **Smooth transitions:** Animated step changes
- [ ] **Dynasty preview:** Can tap to see dynasty details before choosing
- [ ] **Celebration effects:** Confetti on offspring reveal and completion

### 4.3 NICE TO HAVE (Defer if time-constrained)

- [ ] **Skip option:** For returning testers (debug only)
- [ ] **Voiceover/narration:** Audio guidance
- [ ] **Contextual help:** "?" button for each step
- [ ] **Tutorial replay:** Option to replay from settings

---

## 5. Grading Logic

### 5.1 Deterministic Graders (Automated)

| Check | Command/Test | Pass Criteria |
|-------|--------------|---------------|
| TypeScript compilation | `npm run build` | 0 errors |
| Component tests | `npm test -- --grep "Tutorial"` | 100% pass |
| Flow completion test | E2E test | All steps completable in order |
| Data persistence | Integration test | Progress survives app restart |
| Timing test | Manual test | Total tutorial < 6 minutes |

**Test Specifications:**

```typescript
// tests/tutorialSystem.test.ts

describe('Tutorial System', () => {
  describe('Flow', () => {
    test('new user starts at welcome step', async () => {
      const progress = await getTutorialStatus(newUserId);
      expect(progress.currentStep).toBe('welcome');
    });

    test('can advance through all steps in order', async () => {
      for (const step of TUTORIAL_STEPS) {
        await advanceTutorial(userId, step);
        const progress = await getTutorialStatus(userId);
        expect(progress.currentStep).toBe(step);
      }
    });

    test('cannot skip steps', async () => {
      await expect(advanceTutorial(userId, 'completion'))
        .rejects.toThrow('Invalid step transition');
    });
  });

  describe('Dynasty Choice', () => {
    test('grants starter snake on dynasty selection', async () => {
      const snake = await chooseDynasty(userId, cyberDynastyId);
      expect(snake.variant.name).toBe('CYBER SPARK');
      expect(snake.generation).toBe(1);
    });

    test('starter snake is marked as tutorial acquisition', async () => {
      const snake = await chooseDynasty(userId, primalDynastyId);
      expect(snake.acquiredMethod).toBe('tutorial');
    });
  });

  describe('Free Breeding', () => {
    test('first breed has no DNA cost', async () => {
      const beforeDna = await getDnaBalance(userId);
      await executeFirstBreed(userId, parent1Id, parent2Id);
      const afterDna = await getDnaBalance(userId);
      expect(afterDna).toBe(beforeDna); // No change
    });

    test('subsequent breeds cost DNA normally', async () => {
      await completeTutorial(userId);
      const beforeDna = await getDnaBalance(userId);
      await breedSnakes(userId, parent1Id, parent2Id);
      expect(await getDnaBalance(userId)).toBeLessThan(beforeDna);
    });
  });

  describe('Completion', () => {
    test('grants 500 DNA bonus on completion', async () => {
      const beforeDna = await getDnaBalance(userId);
      await completeTutorial(userId);
      const afterDna = await getDnaBalance(userId);
      expect(afterDna).toBe(beforeDna + 500);
    });

    test('bonus is one-time only', async () => {
      await completeTutorial(userId);
      const dna1 = await getDnaBalance(userId);
      // Try to complete again (should be no-op)
      await completeTutorial(userId);
      const dna2 = await getDnaBalance(userId);
      expect(dna2).toBe(dna1);
    });
  });
});
```

### 5.2 LLM Grader Prompts

**UX Review (sub-agent: UX Reviewer):**
```yaml
UX_REVIEW_PROMPT: |
  Review the Tutorial System for user experience quality.

  Context:
  - Purpose: Teach core mechanics in first 5 minutes
  - Target: New players, casual mobile gamers
  - Constraint: PR-001 (create return hook), CE-004 (D1 retention)

  Files to review:
  - app/tutorial/*.tsx
  - components/tutorial/*.tsx
  - hooks/useTutorial.ts

  Evaluation criteria (score each 1-10):

  1. **Clarity (weight: 2x)**
     - Is each step's purpose obvious?
     - Are instructions clear and concise?

  2. **Pacing (weight: 2x)**
     - Does the tutorial feel too slow or rushed?
     - Are transitions smooth?

  3. **Engagement (weight: 1x)**
     - Does the tutorial create excitement for the game?
     - Is the dynasty choice meaningful and fun?

  4. **Coach Marks (weight: 1x)**
     - Are highlights helpful, not annoying?
     - Do tooltips explain without blocking?

  5. **Completion Feel (weight: 2x)**
     - Does completing feel rewarding?
     - Is the player motivated to continue?

  Score 1-10 with justification for each criterion.
  Overall weighted score must be >= 7.0 to pass.
```

### 5.3 Human Verification

**Playtest Checklist:**

| Test | Steps | Expected Result | Pass? |
|------|-------|-----------------|-------|
| Fresh start | Create new account | Tutorial starts automatically | |
| Dynasty choice | Select CYBER | CYBER SPARK added to collection | |
| Collection intro | Watch/tap through | Understand what collection is | |
| First game | Play Snake game | Earn DNA, understand controls | |
| Second snake gift | Receive gift | Second snake appears in collection | |
| First breed | Follow guided breeding | Gen 2 offspring created (free) | |
| Completion bonus | Finish tutorial | 500 DNA added to balance | |
| Post-tutorial | After completion | Access to full Lab, no more tutorial | |
| Persistence | Kill app mid-tutorial, relaunch | Resumes at correct step | |
| Timer check | Time full tutorial | Completes in < 6 minutes | |

---

## 6. Implementation Tasks

### Task Breakdown

| Task | Deliverable | Dependencies |
|------|-------------|--------------|
| Create tutorial tables | `tutorial_progress` table | Auth system |
| Create tutorial RPCs | Status, advance, complete functions | Table |
| Build TutorialWrapper | Progress tracking component | RPC |
| Build WelcomeStep | Welcome screen | Wrapper |
| Build DynastyChoiceStep | Dynasty selection | Collection UI |
| Build CollectionIntroStep | Collection tour | Collection UI |
| Build FirstGameStep | Snake game integration | Core game |
| Build SecondSnakeStep | Gift reveal | Data model |
| Build FirstBreedStep | Guided breeding | Breeding system |
| Build CompletionStep | Celebration + bonus | DNA system |
| Build CoachMark | Highlight system | None |
| Write tests | `tests/tutorialSystem.test.ts` | All |

### Milestone Checkpoints

| Milestone | Criteria |
|-----------|----------|
| Flow Complete | Can navigate through all 7 steps |
| Data Integrated | Dynasty choice grants real snake |
| Game Integrated | First Snake game works |
| Breeding Integrated | Free breed executes |
| Polish Complete | Coach marks, animations done |
| Graders Pass | All graders >= 7/10 |

---

## 7. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Tutorial too long | Medium | High | Test with real users, target < 5 min |
| Players stuck on Snake game | Medium | Medium | Allow "skip" after 30s, award minimum DNA |
| Coach marks annoying | Medium | Medium | Subtle highlights, not blocking |
| Network issues interrupt flow | Low | High | Offline-first state machine |

### Rollback Plan

**If this feature needs to be disabled:**
1. Feature flag: `ENABLE_TUTORIAL` environment variable
2. Fallback: Grant default starter + DNA, skip to Lab
3. Data preserved: Tutorial progress table remains for analytics

---

## 8. Visual Design

### Progress Indicator

```
Step 1 of 7
○ ○ ○ ○ ○ ○ ○   (all empty at start)
● ○ ○ ○ ○ ○ ○   (step 1 active)
● ● ● ● ○ ○ ○   (step 4 active, 1-3 complete)
● ● ● ● ● ● ●   (all complete)
```

### Coach Mark Style

```
┌────────────────────────────┐
│  ← Tap here to select      │
│     your first parent      │
│                            │
│        ▼ (arrow points to target)
└────────────────────────────┘

Target element has:
- Pulsing glow (dynasty color)
- Increased z-index
- Rest of screen dimmed
```

---

## 9. Future Considerations (v0.2+)

**Deferred for v0.1:**
- Skip tutorial option (for testers)
- Tutorial analytics (funnel tracking)
- A/B test different tutorial flows
- Re-tutorial option in settings
- Contextual tutorial for new features

**Expansion path:**
- v0.2: Add tutorial for Evolution system
- v0.3: Contextual tips for returning players
- v0.5: Achievement-linked tutorial badges
- v1.0: Premium tutorial rewards (special starter skin)

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
