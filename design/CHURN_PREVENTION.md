# Churn Prevention Strategy
## SupaSnake Player Retention & Win-Back Framework

**Version:** 1.0
**Last Updated:** 2025-12-19
**Owner:** Growth Team
**Status:** Production Implementation

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Retention Targets & Current State](#retention-targets--current-state)
3. [Churn Prediction Model](#churn-prediction-model)
4. [Intervention Triggers](#intervention-triggers)
5. [Prevention Strategies by Churn Cause](#prevention-strategies-by-churn-cause)
6. [Win-Back Campaigns](#win-back-campaigns)
7. [Monitoring Dashboard](#monitoring-dashboard)
8. [Implementation Roadmap](#implementation-roadmap)
9. [Success Metrics](#success-metrics)
10. [Appendix: Technical Integration](#appendix-technical-integration)

---

## Executive Summary

**The Problem:**
Mobile games typically lose 70-80% of players within the first 7 days. SupaSnake's energy-based mechanics, breeding timers, and social obligations create unique churn risks that require proactive intervention.

**Our Approach:**
- **Predictive:** Identify at-risk players before they churn using behavioral signals
- **Personalized:** Target interventions based on churn cause (frustration vs boredom vs social)
- **Graduated:** Escalating offers from low-cost nudges (push) to high-value win-backs (premium items)
- **Measurable:** Track intervention effectiveness by cohort and churn stage

**Success Criteria:**
- D1 Retention: >50% (industry avg: 40%)
- D7 Retention: >25% (industry avg: 20%)
- D30 Retention: >15% (industry avg: 10%)
- Win-back Rate (D7-D30): >5% of churned players return

---

## Retention Targets & Current State

### Target Retention Curve
```
Day 0:  100% (new installs)
Day 1:   50% (first session return)
Day 3:   35% (core loop established)
Day 7:   25% (habit formation)
Day 14:  20% (mid-term engagement)
Day 30:  15% (long-term player)
Day 60:  12% (super-engaged)
Day 90:  10% (retention floor)
```

### Known Churn Triggers

#### 1. **Breeding Timer Frustration (24h+ wait)**
- **Signal:** Player visits Lab, starts breeding, never returns
- **Impact:** 30% of D1 churners have pending eggs
- **Root Cause:** Expectation mismatch (instant gratification vs 24h wait)

#### 2. **Losing Streak Demoralization**
- **Signal:** 5+ consecutive deaths without progress
- **Impact:** 18% of D3 churners have <10% win rate
- **Root Cause:** Difficulty curve too steep for casual players

#### 3. **Forced Daily Play (FOMO)**
- **Signal:** Player completes daily quest streak, then stops
- **Impact:** 22% of D7-D14 churners broke a 5+ day streak
- **Root Cause:** Burnout from obligation (daily quests feel like chores)

#### 4. **Missing Exclusive Items**
- **Signal:** Player views limited-time shop, doesn't purchase, churns
- **Impact:** 12% of paying players churn after missing exclusive
- **Root Cause:** Regret + loss aversion (can never get this item again)

#### 5. **Clan Responsibility Burnout**
- **Signal:** Clan leader/officer stops logging in
- **Impact:** 25% of officers churn within 30 days
- **Root Cause:** Social obligation exceeds fun (managing 20+ members)

#### 6. **Energy Depletion (Session End)**
- **Signal:** Player exhausts energy, closes app mid-session
- **Impact:** 40% of sessions end on 0 energy (natural breakpoint)
- **Root Cause:** Not inherently bad, but needs re-engagement hook

---

## Churn Prediction Model

### Early Warning Signals

#### Behavioral Signals (Weighted Scoring)
```typescript
interface ChurnRiskSignals {
  // Session Patterns (40% weight)
  daysSinceLastLogin: number;           // 0-1 days = 0pts, 2 days = 3pts, 3+ = 10pts
  sessionLengthDecline: number;         // -50% from avg = 5pts, -75% = 10pts
  sessionsPerWeekDecline: number;       // Was 10/wk, now 3/wk = 7pts

  // Engagement Depth (30% weight)
  gameCompletionRate: number;           // <20% = 8pts, 20-40% = 4pts, >40% = 0pts
  featureEngagement: number;            // Using <2 features = 6pts (only playing, not breeding/clans)
  socialDisengagement: number;          // Left clan / no friends = 5pts

  // Monetization (20% weight)
  spendingDrop: number;                 // Was paying, stopped = 8pts
  abandonedCart: number;                // Viewed shop, didn't buy (3x) = 4pts

  // Progress Frustration (10% weight)
  losingStreak: number;                 // 5+ losses = 5pts, 10+ = 10pts
  stuckOnLevel: number;                 // Same high score 5+ sessions = 6pts
  unclaimedRewards: number;             // Rewards available but not claimed = 3pts
}
```

#### Risk Score Formula
```
Total Risk Score = Σ(signal_value × signal_weight)

Risk Tiers:
- 0-15 pts:  Healthy (green)
- 16-30 pts: At-Risk (yellow) → Monitor closely
- 31-50 pts: High Risk (orange) → Trigger intervention
- 51+ pts:   Critical (red) → Urgent win-back
```

### Cohort Analysis Approach

#### Segmentation Dimensions
1. **Install Cohort:** Group by install week (W1 2025, W2 2025, etc.)
2. **Source Cohort:** Organic vs Paid (by channel: TikTok, Meta, Google)
3. **Behavior Cohort:** Casual (<5 sessions/wk) vs Core (5-15) vs Hardcore (15+)
4. **Monetization Cohort:** Non-payer vs Minnow (<$10) vs Dolphin ($10-$100) vs Whale ($100+)

#### Retention Analysis by Cohort
```sql
-- Example: D7 retention by install cohort
SELECT
  DATE_TRUNC('week', created_at) as install_week,
  COUNT(DISTINCT user_id) as installs,
  COUNT(DISTINCT CASE
    WHEN last_login >= created_at + INTERVAL '7 days'
    THEN user_id
  END) as d7_retained,
  ROUND(100.0 * d7_retained / installs, 2) as d7_retention_pct
FROM users
GROUP BY install_week
ORDER BY install_week DESC;
```

#### Churn Reason Classification (Exit Survey + ML)
```
Churn Categories:
1. Technical (crashes, bugs, performance)      - 8% of churners
2. Difficulty (too hard, frustrating)          - 22% of churners
3. Boredom (repetitive, no new content)        - 18% of churners
4. Time Commitment (too demanding)             - 15% of churners
5. Social (no friends, toxic clan)             - 12% of churners
6. Monetization (too expensive, P2W)           - 10% of churners
7. Natural (completed content, moved on)       - 15% of churners
```

---

## Intervention Triggers

### Automated Intervention Ladder

#### **Day 1: First Session Dropout**
**Trigger:** User completes tutorial, doesn't return within 24h
**Risk Score:** 20 pts (yellow - at-risk)
**Action:**
```
Channel: Push Notification (if permissions granted)
Message: "Your snake is waiting! Come back for 50 free energy ⚡"
Deep Link: app://game (straight to gameplay)
Incentive: +50 energy (1 extra session)
Send Time: 24h after install, 6pm local time
```

#### **Day 2: No Login**
**Trigger:** User hasn't logged in for 48h
**Risk Score:** 35 pts (orange - high risk)
**Action:**
```
Channel: Push Notification + Email (if collected)
Push: "Don't lose your streak! Login now for a surprise gift"
Email Subject: "Your SupaSnake Adventure Awaits"
Deep Link: app://daily-reward
Incentive:
  - 100 energy (2 sessions)
  - 1 Rare Egg (accelerates breeding satisfaction)
  - Double XP for 1 hour
Send Time: 48h after last login, 11am local time
```

#### **Day 3: Your Snake Misses You Campaign**
**Trigger:** 72h no login, had >2 sessions initially
**Risk Score:** 45 pts (orange - critical)
**Action:**
```
Channel: Push + Email + In-App Inbox
Push: "🐍 Your snake is lonely! Come see your new surprise"
Email: Personalized with player's snake species + progress stats
  Subject: "[PlayerName], your {SnakeSpecies} misses you!"
  Body:
    - Show player's best score + rank
    - Preview new snake unlockable (1 win away)
    - Limited-time comeback bonus
Deep Link: app://comeback-bonus
Incentive:
  - 200 energy (full day of play)
  - 1 Epic Egg (high value breeding reward)
  - 24h Premium Trial (VIP features: no ads, +50% coins)
  - Difficulty Adjustment: First 3 games have -20% speed
Send Time: 72h after last login, 7pm local time (evening leisure)
```

#### **Day 7: Win-Back Offer**
**Trigger:** 7 days no login, was active >3 days prior
**Risk Score:** 55 pts (red - urgent)
**Action:**
```
Channel: Email + SMS (if collected) + Paid Re-targeting (Meta/TikTok)
Email Subject: "We Want You Back - Exclusive Offer Inside"
Email Body:
  - "We noticed you haven't played in a week..."
  - Personalized stats: "You were ranked #[Rank] with [Score] points"
  - Exclusive comeback package (visual showcase)
SMS: "SupaSnake: Your exclusive comeback offer expires in 24h - 500 free gems!"
Re-targeting Ad: Show player's snake + "Your snake needs you" CTA
Deep Link: app://winback-day7
Incentive:
  - 500 gems ($4.99 value)
  - 1 Legendary Egg (rare species)
  - 3-day Premium Pass
  - Exclusive "Comeback King" badge
  - One-time difficulty reset (restart progression curve)
Expiration: 48h limited offer (scarcity)
Send Time: Exactly 7 days after last login, 10am local time
```

#### **Day 14: Last Chance Re-Engagement**
**Trigger:** 14 days no login, was D7+ retained
**Risk Score:** 70 pts (red - lost player)
**Action:**
```
Channel: Email + Push (re-permission request)
Email Subject: "Final Offer: Come Back to SupaSnake (Huge Rewards)"
Email Body:
  - "It's been 2 weeks - we really miss you"
  - Show friend activity (if applicable): "5 friends still playing"
  - Maximum value offer (last attempt)
Deep Link: app://winback-day14
Incentive:
  - 1,000 gems ($9.99 value)
  - 3 Legendary Eggs
  - 7-day Premium Pass
  - Exclusive "Phoenix" snake skin (return from ashes theme)
  - Personal clan invite from top clan
  - Fast-track to current event (skip catch-up grind)
Expiration: 72h limited offer
Send Time: 14 days after last login, 9am local time
```

#### **Day 30+: Seasonal Win-Back**
**Trigger:** 30+ days no login, was previously engaged
**Risk Score:** 90 pts (red - dormant)
**Action:**
```
Channel: Email only (low cost, broad reach)
Frequency: Quarterly (avoid spam)
Email Subject: "New Season, New Snakes - Welcome Back!"
Email Body:
  - Highlight major updates since they left
  - New content: snakes, levels, features
  - Fresh start narrative (it's okay to return)
Deep Link: app://new-season
Incentive:
  - Season Pass (free, full progression rewards)
  - "Welcome Back" starter pack (energy, eggs, gems)
  - Level 1 restart option (for players who felt stuck)
  - VIP clan placement (skip social friction)
Send Time: Aligned with major content updates (patches, seasons)
```

---

## Prevention Strategies by Churn Cause

### 1. Frustration Churn (Difficulty/Losing Streaks)

#### Detection Signals
- Win rate <20% over last 10 games
- 5+ consecutive deaths
- Player skill rating declining
- Rage quits (close app mid-game)

#### Prevention Tactics

**A. Dynamic Difficulty Adjustment (DDA)**
```typescript
// Automatic difficulty scaling based on performance
interface DifficultyAdjustment {
  trigger: 'losing_streak' | 'skill_decline';
  adjustment: {
    gameSpeed: number;        // -10% speed per loss (max -30%)
    obstacleFrequency: number; // -15% obstacles
    powerUpBoost: number;      // +25% power-up spawn rate
  };
  duration: number;            // 3 games or until 1 win
  notification: "We've made the game a bit easier - you got this!";
}
```

**B. Consolation Rewards (Loss Mitigation)**
```
After 3 losses in a row:
  - Grant 50 coins (participation trophy)
  - "You're improving! +5% better than last game"
  - Show progress bar: "2 more tries to unlock [reward]"

After 5 losses:
  - Offer free continue (1-time)
  - Show tip overlay: "Try collecting blue power-ups first"
  - Unlock easier game mode (practice mode, no stakes)
```

**C. Skill-Based Tutorials**
```
If player struggles with specific mechanic:
  - Dodge timing poor? → Show "Swipe earlier" tip
  - Collecting few coins? → Highlight coin trails
  - Not using power-ups? → Force tutorial: "Tap to activate shield"
```

**D. Soft Progression Safety Net**
```
Prevent total loss of progress:
  - Always earn 10% of potential coins (even on death)
  - XP granted for distance traveled (not just wins)
  - Breeding progress never lost (time-based, not performance)
```

---

### 2. Boredom Churn (Content Exhaustion)

#### Detection Signals
- Completed all current content (max level, all snakes)
- Session length declining despite no difficulty issues
- Stopped exploring new features (only repeats same activity)
- High engagement, then sudden drop-off

#### Prevention Tactics

**A. Content Teaser System**
```typescript
interface ContentTeaser {
  trigger: 'content_80_percent_complete';
  delivery: 'in_game_popup' | 'push_notification';
  message: {
    title: "New Content Coming Soon!";
    preview: "5 new legendary snakes + Volcano world";
    countdown: "Unlocks in 3 days";
    earlyAccess: "Get Premium for instant access";
  };
  cta: "Notify Me" | "Get Early Access";
}
```

**B. Procedural Content (Infinite Variety)**
```
Implement roguelike elements:
  - Daily Challenge Runs (unique level layouts)
  - Random event modifiers ("Low Gravity Day", "Double Coins")
  - Community Challenges (global leaderboard resets weekly)
```

**C. Meta-Progression (Always Something to Work Toward)**
```
Long-term goals that survive session resets:
  - Collection completion (200 snake species)
  - Achievement hunting (1000+ achievements)
  - Clan reputation (prestige system, seasonal ranks)
  - Cosmetic customization (infinite combinations)
```

**D. Live Events (FOMO Prevention)**
```
Regular cadence prevents "nothing new" feeling:
  - Weekly Events: Themed challenges (Halloween snakes)
  - Monthly Seasons: New progression track
  - Quarterly Expansions: Major content drops
  - Daily Surprises: Random gifts, flash sales
```

---

### 3. Social Churn (Isolation/Toxicity)

#### Detection Signals
- No friends added after 7 days
- Left clan or was kicked
- Declining social interactions (messages, co-op)
- High social feature exposure but no engagement

#### Prevention Tactics

**A. Matchmaking & Friend Suggestions**
```typescript
interface SocialMatching {
  trigger: 'no_friends_day_3';
  algorithm: 'skill_based' | 'location_based' | 'playstyle';
  suggestion: {
    profiles: Player[];        // 5 similar players
    icebreaker: "You both love Venom snakes!";
    incentive: "Add 3 friends → 100 gems";
  };
  autoConnect: {
    enabled: true;
    consent: "Match me with players like me";
  };
}
```

**B. Clan Placement Assistance**
```
For players without clan after 5 days:
  - Auto-suggest 3 clans (skill-matched, active, friendly)
  - Show clan stats: "Avg age: 25-30, Playtime: Casual, Language: EN"
  - "Join Now" = instant acceptance (no wait)
  - Safety: "Leave anytime, no penalty"
```

**C. Toxicity Detection & Intervention**
```
Monitor clan chat for:
  - Harassment keywords → Auto-mute + alert moderator
  - Excessive pressure ("Donate more or get kicked")
  - Inactivity shaming ("Play daily or leave")

Auto-suggest clan transfer:
  "This clan might not be a good fit - try one of these instead"
```

**D. Solo-Friendly Social Features**
```
Reduce social obligation:
  - Spectator mode (watch friends without playing)
  - Asynchronous co-op (AI fills friend slots)
  - Opt-out social (all solo benefits without clan)
  - "Introverted" badge (signals preference, reduces invites)
```

---

### 4. Spending Regret Churn (Monetization Backlash)

#### Detection Signals
- Made first purchase, then stopped playing
- Purchased item, then requested refund
- High session time before purchase, low after
- Negative reviews mentioning "waste of money"

#### Prevention Tactics

**A. Purchase Reinforcement (Value Validation)**
```typescript
interface PostPurchaseFlow {
  timing: 'immediately_after_purchase';
  steps: [
    {
      screen: 'celebration_animation';
      message: "Amazing choice! Here's what you unlocked:";
      showcase: [itemVisual, stats, exclusivity];
    },
    {
      screen: 'usage_tutorial';
      message: "Let's try out your new {item}!";
      forcedUsage: true; // Ensure they experience value
    },
    {
      screen: 'social_showcase';
      message: "Show off to friends?";
      share: {cta: "I just got {item}!", image: screenshot};
    },
    {
      screen: 'next_goal_preview';
      message: "Next unlock: {nextItem} (50% progress)";
      incentive: "Keep going!";
    }
  ];
}
```

**B. Refund Prevention (Pre-Purchase Clarity)**
```
Before high-value purchases ($10+):
  - Video preview (see item in action)
  - Stats comparison (how much better than current)
  - Testimonials ("Top player review: 'Worth it!'")
  - Satisfaction guarantee ("95% of players love this")
  - Cooling-off period ("Offer valid for 24h, decide later")
```

**C. Regret Mitigation (Sunk Cost Support)**
```
For players who bought but stopped using:
  - Personalized tip: "You haven't used your {item} - here's how"
  - Exclusive mission: "Use {item} 3 times → 200 gems"
  - Buff notification: "Your {item} just got +20% stronger (patch)"
  - Sunk cost reminder: "You're 80% to unlocking {synergy item}"
```

**D. Slower Monetization Curve**
```
Avoid aggressive early monetization:
  - No IAP prompts in first 3 sessions
  - Earn premium currency through play (build trust)
  - First purchase = small ($0.99), low-risk
  - Upsell only after value demonstrated (D7+)
```

---

### 5. Obligation Churn (Forced Daily Play)

#### Detection Signals
- Completed daily quests for 7+ days, then stopped abruptly
- Logged in only for dailies (3min sessions)
- Missed 1 daily, never returned
- Exit survey: "Felt like a chore"

#### Prevention Tactics

**A. Flexible Daily Systems**
```typescript
interface FlexibleDailies {
  forgiveness: {
    missedDays: 2;              // Can miss 2 days/week without penalty
    makeUp: true;               // Complete yesterday's quests today
    streakInsurance: 1;         // 1 free skip per month (preserve streak)
  };

  stackingRewards: {
    enabled: true;
    maxStack: 3;                // Accumulate up to 3 days of rewards
    notification: "3 days of rewards waiting!";
  };

  optOut: {
    available: true;
    alternative: "Weekly Challenges (same rewards, less pressure)";
  };
}
```

**B. Meaningful vs Arbitrary Tasks**
```
Bad Daily: "Login 7 days in a row" (pure obligation)
Good Daily: "Try a new snake species" (encourages exploration)

Bad: "Play 10 games" (grindy)
Good: "Beat your high score" (skill-based, 1 game possible)

Bad: "Spend 100 gems" (forces spending)
Good: "Upgrade any snake" (natural progression)
```

**C. Burnout Detection & Intervention**
```
If player completes dailies for 14+ days straight:
  - Popup: "You're on fire! Want to take a break?"
  - Suggestion: "Skip tomorrow guilt-free (streak protected)"
  - Alternative: "Switch to weekly challenges?"
  - Reward break: "Take 2 days off, earn 'Well Rested' bonus"
```

**D. Async Progression (Works While Offline)**
```
Reduce need for daily logins:
  - Breeding completes while offline (claim anytime)
  - Passive income (clan bonuses accumulate)
  - Energy refills even when not playing
  - Event progress from friends (team events)
```

---

### 6. Clan Officer Burnout

#### Detection Signals
- Clan leader/officer role
- Declining login frequency
- Stopped recruiting/managing members
- High clan activity (20+ members) with low officer engagement

#### Prevention Tactics

**A. Officer Workload Reduction**
```typescript
interface ClanManagementAutomation {
  autoModeration: {
    inactiveKicks: true;        // Auto-remove 14d inactive (configurable)
    applicationFilters: true;   // Skill/level requirements
    chatModeration: true;       // Mute toxic members automatically
  };

  delegatedPermissions: {
    coOfficers: 5;              // Spread workload across 5 officers
    memberVoting: true;         // Members vote on new applicants
    scheduledEvents: true;      // Auto-schedule weekly clan wars
  };

  officerPerks: {
    extraRewards: "+50% clan currency";
    exclusiveCosmetics: "Officer badge, unique skins";
    priority: "Direct line to support team";
  };
}
```

**B. Officer Rotation System**
```
Prevent single-person burnout:
  - Suggest co-leadership (share duties)
  - Term limits (3-month officer terms, elections)
  - Sabbatical mode (temporary leave, auto-promote replacement)
  - Mentorship (train 2 backup officers)
```

**C. Clan Size Recommendations**
```
Warn when clan exceeds manageable size:
  - "Your clan has 30 members - consider splitting into 2 clans"
  - "Top clans have 15-20 members (quality > quantity)"
  - Provide clan split tool (auto-divide, preserve relationships)
```

---

## Win-Back Campaigns

### Campaign Architecture

```
Win-Back Timeline:
Day 7:   First Win-Back (Low Cost, High Volume)
Day 14:  Second Attempt (Medium Value)
Day 30:  Premium Win-Back (High Value, Targeted)
Day 60:  Seasonal Re-Engagement (Content-Focused)
Day 90+: Dormant Reactivation (Max Incentive)
```

---

### Day 7 Win-Back Campaign

#### **Target Audience**
- Players who were active for 3+ days, then churned
- Completed tutorial, engaged with core loop
- No login for exactly 7 days

#### **Offer Ladder (A/B Test Variants)**

**Variant A: Premium Trial (Conversion Focus)**
```
Subject: "Your Free Premium Trial is Waiting"
Body:
  "We noticed you haven't played in a week, so we're offering
   a 3-day Premium trial - completely free, no credit card needed."

Incentive:
  - 3-day Premium Pass (no ads, +50% coins, exclusive snakes)
  - 200 energy (catch-up mechanism)
  - 1 Epic Egg

Deep Link: app://premium-trial
CTA: "Activate Free Trial"
Goal: Convert to paying user (trial → subscription)
```

**Variant B: Exclusive Content (FOMO Focus)**
```
Subject: "Limited-Time Exclusive: Phantom Snake"
Body:
  "This legendary snake is only available for returning players.
   Claim yours before it's gone forever."

Incentive:
  - Phantom Snake (unique, can't be obtained otherwise)
  - Exclusive "Ghostly" cosmetic set
  - 500 gems

Deep Link: app://exclusive-phantom
CTA: "Claim Exclusive Snake"
Goal: Leverage loss aversion (fear of missing out)
```

**Variant C: Social Proof (Community Focus)**
```
Subject: "[FriendName] is Playing - Join Them!"
Body:
  "Your friend [FriendName] just beat your high score!
   Think you can reclaim your crown?"

Incentive:
  - Direct challenge link (1v1 match)
  - "Rivalry" badge if you win
  - Double rewards for friend matches (48h)

Deep Link: app://friend-challenge/[friend_id]
CTA: "Accept Challenge"
Goal: Social re-engagement (friend retention)
```

#### **Measurement & Optimization**
```sql
-- Track win-back performance by variant
SELECT
  campaign_variant,
  COUNT(DISTINCT user_id) as sent,
  COUNT(DISTINCT CASE WHEN returned THEN user_id END) as returned,
  ROUND(100.0 * returned / sent, 2) as return_rate,
  SUM(revenue_7d) as incremental_revenue
FROM winback_campaigns
WHERE campaign_day = 7
GROUP BY campaign_variant
ORDER BY return_rate DESC;
```

**Success Criteria:**
- Open Rate: >30% (email/push)
- Click-through Rate: >15%
- Return Rate: >8% (8% of churned players return)
- D7 Re-retention: >40% (of returners stay 7 more days)

---

### Day 14 Win-Back Campaign

#### **Target Audience**
- Players who were D7+ retained before churning
- Moderate engagement (10+ sessions total)
- Ignored Day 7 win-back attempt

#### **Escalated Offer**

**Subject:** "We Really Miss You - Exclusive Comeback Package"

**Body:**
```
Hi [PlayerName],

It's been 2 weeks since we've seen you in SupaSnake. We wanted to
reach out personally because you were one of our most engaged players.

We've prepared an exclusive comeback package just for you:

✓ 1,000 Gems ($9.99 value) - Free
✓ 3 Legendary Eggs (guaranteed rare snakes)
✓ 7-Day Premium Pass
✓ Exclusive "Phoenix" Skin (return from the ashes)
✓ VIP Clan Invite (join top-ranked clan instantly)

This offer expires in 48 hours - we hope to see you back soon!

[CTA Button: Claim My Comeback Package]
```

**Deep Link:** app://winback-day14
**Expiration:** 48h (scarcity)
**Notification:** Email + Push (if re-permitted)

#### **Personalization Variables**
```typescript
interface PersonalizedWinback {
  playerName: string;
  bestScore: number;
  rank: number;                    // "You were ranked #1,234"
  favoriteSnake: string;           // "Your Venom snake misses you"
  friendsActive: number;           // "5 friends are still playing"
  clanName?: string;               // "Your clan [ClanName] needs you"
  lastAchievement: string;         // "You were 1 win from unlocking..."

  dynamicIncentive: {
    // Adjust offer based on past spending
    spender: 'high' ? '2,000 gems' : '1,000 gems';
    // Adjust based on engagement level
    hardcore: true ? 'Season Pass' : 'Premium Trial';
  };
}
```

**Success Criteria:**
- Return Rate: >5% (harder to win back than D7)
- Offer Claim Rate: >60% (of returners claim package)
- D7 Re-retention: >30%
- Incremental LTV: >$2 per returned player

---

### Day 30 Win-Back Campaign

#### **Target Audience**
- Previously monetized players (any spend amount)
- OR high engagement before churn (D14+ retained)
- High predicted lifetime value (LTV model)

#### **Premium Offer (High Value, Targeted)**

**Subject:** "Final Offer: Your Account Deserves This"

**Body:**
```
[PlayerName],

You invested time (and some money) into SupaSnake. We don't want
that to go to waste.

Here's what's happened since you left:
✓ 15 new legendary snakes added
✓ New Volcano world (hardest yet)
✓ Clan Wars 2.0 (massive rewards)
✓ Breeding 2.0 (faster, more strategic)

Your account is valuable - we're offering our best comeback deal ever:

💎 2,000 Gems (enough for 4 legendary eggs)
🐍 Season Pass (instant unlock 50 tiers of rewards)
👑 30-Day Premium Membership
🎨 Exclusive "Founder" Badge + Skin (never available again)
🏆 Fast-Track Event Entry (skip grind, join current event)

This is a one-time offer, expires in 72 hours.

[CTA: Claim Maximum Value Package]
```

**Deep Link:** app://winback-day30
**Channel:** Email only (cost-effective for 30d churners)
**Frequency:** Once per quarter (avoid spam)

#### **Segmented Offers**

```typescript
interface SegmentedWinback {
  segment: 'whale' | 'dolphin' | 'minnow' | 'non_payer';

  whale: {  // Spent $100+
    gems: 5000;
    premium: '60-day pass';
    exclusive: 'Custom clan badge design';
    personal: 'Direct message from dev team';
  };

  dolphin: {  // Spent $10-$100
    gems: 2000;
    premium: '30-day pass';
    exclusive: 'Founder badge + skin';
    boost: 'Season Pass';
  };

  minnow: {  // Spent $1-$10
    gems: 1000;
    premium: '14-day pass';
    exclusive: 'Comeback King badge';
    boost: '3 Legendary Eggs';
  };

  non_payer: {  // $0 spent, but high engagement
    gems: 500;
    premium: '7-day trial';
    exclusive: 'Exclusive skin';
    boost: 'Epic Egg';
  };
}
```

**Success Criteria:**
- Return Rate: >3% (very hard to win back at 30d)
- Monetization Rate: >20% (convert returners to payers)
- Incremental LTV: >$5 per returned player
- ROI: >200% (campaign cost vs revenue)

---

### Day 60+ Seasonal Win-Back

#### **Target Audience**
- Dormant players (60-180 days no login)
- Broad reach, low cost per contact
- Tied to major content updates

#### **Content-Focused Messaging**

**Subject:** "New Season: Everything You Missed in SupaSnake"

**Body:**
```
It's been a while, [PlayerName].

A lot has changed in SupaSnake since you last played. Here's the
quick version:

🌋 NEW WORLD: Volcano Valley (lava mechanics, fire snakes)
🐍 50+ NEW SNAKES: Ice, Electric, Shadow, Cosmic types
⚔️ CLAN WARS 2.0: Real-time battles, huge rewards
🎮 NEW MODES: Speed Run, Endless, Boss Rush
🏆 EVENTS: Weekly challenges, monthly seasons

We've saved a "Welcome Back" package for you:

✓ Free Season Pass (unlock all tiers instantly)
✓ Starter Pack: 500 gems, 3 eggs, 7-day premium
✓ Fresh Start Option (restart at level 1 with bonuses)
✓ VIP Clan Placement (skip the grind, join top clan)

No pressure - just wanted you to know the door's open.

[CTA: See What's New]
```

**Deep Link:** app://whats-new
**Frequency:** Quarterly (aligned with major updates)
**Channel:** Email (low cost, broad reach)

**Success Criteria:**
- Open Rate: >20% (lower engagement)
- Return Rate: >1% (very low, but volume is high)
- Cost per Return: <$0.50 (email is cheap)
- Incremental Installs: >1,000 per campaign

---

### Campaign Performance Dashboard

#### **Key Metrics to Track**

```typescript
interface WinbackMetrics {
  // Campaign Reach
  targetAudience: number;          // Eligible churned players
  sent: number;                    // Emails/pushes delivered
  deliveryRate: number;            // sent / target (>95% target)

  // Engagement
  opened: number;                  // Email opens
  openRate: number;                // opened / sent (>25% target)
  clicked: number;                 // CTA clicks
  clickRate: number;               // clicked / opened (>15% target)

  // Conversion
  returned: number;                // Players who logged back in
  returnRate: number;              // returned / sent (>5% target)
  claimed: number;                 // Claimed win-back offer
  claimRate: number;               // claimed / returned (>50% target)

  // Retention
  d1Retained: number;              // Still playing 1 day later
  d7Retained: number;              // Still playing 7 days later
  d30Retained: number;             // Long-term re-retention

  // Monetization
  monetized: number;               // Made purchase after return
  monetizationRate: number;        // monetized / returned
  revenue: number;                 // Total $ from returners
  incrementalLTV: number;          // revenue / returned

  // ROI
  campaignCost: number;            // Email/push/ad spend
  roi: number;                     // (revenue - cost) / cost
}
```

#### **A/B Test Framework**

```typescript
interface WinbackABTest {
  hypothesis: string;
  variants: [
    {
      name: 'control';
      subject: 'We miss you';
      incentive: '500 gems';
      cta: 'Come back';
    },
    {
      name: 'high_value';
      subject: 'Exclusive offer inside';
      incentive: '1000 gems + premium';
      cta: 'Claim offer';
    },
    {
      name: 'social_proof';
      subject: 'Your friends are playing';
      incentive: 'Friend challenge + rewards';
      cta: 'Join friends';
    },
    {
      name: 'fomo';
      subject: 'Limited time: Exclusive snake';
      incentive: 'Unique snake (expires 24h)';
      cta: 'Claim before it\'s gone';
    }
  ];

  sampleSize: number;              // Players per variant
  duration: string;                // '7 days'
  primaryMetric: 'return_rate';
  secondaryMetrics: ['d7_retention', 'roi'];
}
```

---

## Monitoring Dashboard

### Daily Churn Monitoring

#### **Real-Time Metrics (Update Hourly)**

```typescript
interface ChurnDashboard {
  // Top-Level KPIs
  dau: number;                     // Daily Active Users
  mau: number;                     // Monthly Active Users
  dau_mau_ratio: number;           // Stickiness (>20% healthy)

  // Retention Cohorts (Today's Numbers)
  d1_retention: number;            // Yesterday's installs who returned
  d7_retention: number;            // Last week's installs still active
  d30_retention: number;           // Last month's installs still active

  // Churn Risk (Players Likely to Churn)
  at_risk_players: number;         // Risk score 31-50 (yellow/orange)
  critical_risk: number;           // Risk score 51+ (red)
  intervention_triggered: number;  // Auto-interventions sent today

  // Churn Attribution (Why Are They Leaving?)
  churn_reasons: {
    frustration: number;           // % churning due to difficulty
    boredom: number;               // % churning due to content exhaustion
    social: number;                // % churning due to social issues
    monetization: number;          // % churning due to IAP regret
    obligation: number;            // % churning due to daily pressure
    technical: number;             // % churning due to bugs/crashes
    unknown: number;               // % no clear signal
  };

  // Win-Back Performance
  winback_sent_today: number;      // Campaigns sent
  winback_returned_today: number;  // Players who came back
  winback_roi: number;             // Revenue vs cost
}
```

---

### Alert Thresholds (Auto-Notify Team)

```typescript
interface ChurnAlerts {
  // Critical Alerts (Immediate Action)
  critical: [
    {
      metric: 'd1_retention';
      threshold: '<40%';           // Below target
      action: 'Page on-call engineer + PM';
      investigation: 'Check for: bugs, server issues, bad update';
    },
    {
      metric: 'dau_drop';
      threshold: '>20% decline vs yesterday';
      action: 'Emergency meeting (could be outage)';
      investigation: 'Server logs, crash reports, social media';
    },
    {
      metric: 'critical_risk_players';
      threshold: '>500 players';
      action: 'Trigger mass win-back campaign';
      investigation: 'What changed? New event? Update?';
    }
  ];

  // Warning Alerts (Monitor Closely)
  warnings: [
    {
      metric: 'd7_retention';
      threshold: '<22%';           // Below target (25%)
      action: 'Daily standup agenda item';
      investigation: 'Cohort analysis, exit surveys';
    },
    {
      metric: 'frustration_churn';
      threshold: '>25%';           // Difficulty too high
      action: 'Review game balance, consider DDA';
      investigation: 'Which levels? What mechanics?';
    },
    {
      metric: 'winback_roi';
      threshold: '<150%';          // Campaigns not profitable
      action: 'Pause low-performing variants';
      investigation: 'A/B test results, optimize offers';
    }
  ];

  // Info Alerts (Weekly Review)
  info: [
    {
      metric: 'd30_retention';
      threshold: '<13%';           // Slightly below target
      action: 'Include in weekly metrics review';
      investigation: 'Long-term engagement trends';
    }
  ];
}
```

---

### Weekly Churn Report Template

```markdown
# Weekly Churn Report
**Week of:** [Date Range]
**Prepared by:** Growth Team
**Distribution:** Exec Team, Product, Engineering

---

## Executive Summary

**Overall Health:** 🟢 Green / 🟡 Yellow / 🔴 Red
**Key Metric:** D7 Retention = 26.3% (↑1.2% vs last week)
**Top Concern:** Frustration churn up 5% (difficulty spike in Level 15)
**Top Win:** Day 7 win-back campaign ROI = 320% (best ever)

---

## Retention Performance

| Metric | This Week | Last Week | Target | Status |
|--------|-----------|-----------|--------|--------|
| D1 Retention | 52.1% | 51.8% | >50% | 🟢 |
| D3 Retention | 36.4% | 35.9% | >35% | 🟢 |
| D7 Retention | 26.3% | 25.1% | >25% | 🟢 |
| D14 Retention | 21.0% | 20.5% | >20% | 🟢 |
| D30 Retention | 14.2% | 15.1% | >15% | 🟡 |

**Analysis:**
- D7 retention improved due to new tutorial flow (shipped Monday)
- D30 retention declining - possibly content exhaustion (investigate)

---

## Churn Attribution

| Reason | % of Churners | Change vs Last Week | Action |
|--------|---------------|---------------------|--------|
| Frustration | 27% | +5% | ⚠️ Fix Level 15 difficulty |
| Boredom | 16% | -2% | ✅ New content helped |
| Social | 13% | +1% | Monitor |
| Obligation | 18% | -3% | ✅ Flexible dailies working |
| Monetization | 9% | 0% | Stable |
| Technical | 11% | -1% | ✅ Crash fixes deployed |
| Unknown | 6% | 0% | N/A |

**Key Insight:**
Level 15 introduced last week has 35% higher death rate than other levels.
Recommendation: Reduce obstacle density by 15% (hotfix this week).

---

## Win-Back Campaign Performance

| Campaign | Sent | Returned | Return Rate | Revenue | ROI |
|----------|------|----------|-------------|---------|-----|
| Day 7 - Variant A (Premium) | 1,243 | 112 | 9.0% | $447 | 320% |
| Day 7 - Variant B (Exclusive) | 1,198 | 95 | 7.9% | $380 | 285% |
| Day 14 - Comeback Package | 892 | 48 | 5.4% | $312 | 210% |
| Day 30 - Seasonal | 4,521 | 67 | 1.5% | $201 | 180% |

**Winner:** Day 7 Variant A (Premium Trial) - becomes new control
**Action:** Allocate 100% of Day 7 traffic to Premium Trial offer

---

## At-Risk Player Interventions

| Risk Tier | Players | Interventions | Success Rate |
|-----------|---------|---------------|--------------|
| Yellow (At-Risk) | 3,214 | 2,890 | 18% returned |
| Orange (High Risk) | 1,456 | 1,456 | 12% returned |
| Red (Critical) | 623 | 623 | 6% returned |

**Total Saved:** 412 players (would have churned without intervention)
**Estimated LTV Saved:** $1,648 (avg $4 LTV per saved player)

---

## Action Items

### Immediate (This Week)
- [ ] **HOT FIX:** Reduce Level 15 difficulty (Engineering - 2h)
- [ ] **CAMPAIGN:** Switch Day 7 win-back to Variant A only (Growth - 30min)
- [ ] **INVESTIGATION:** Why is D30 retention declining? (Analytics - 4h)

### Short-Term (Next 2 Weeks)
- [ ] **FEATURE:** Implement DDA for frustration churn (Engineering - 1 week)
- [ ] **CONTENT:** Ship 5 new legendary snakes (Design + Eng - 1.5 weeks)
- [ ] **TEST:** A/B test Day 14 offer (500 gems vs 1000 gems) (Growth - ongoing)

### Long-Term (Next Month)
- [ ] **STRATEGY:** Redesign daily quest system (less obligation) (Product - 3 weeks)
- [ ] **ANALYTICS:** Build ML churn prediction model (Data Science - 4 weeks)
- [ ] **PROCESS:** Automate weekly churn reports (Engineering - 1 week)

---

## Appendix: Cohort Deep Dive

[Detailed cohort retention curves]
[Churn reason breakdown by segment]
[Geographic churn analysis]
[Device/OS churn patterns]
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

#### **Data Infrastructure**
```
Tasks:
1. Implement churn risk scoring system
   - Create risk_score calculation in analytics pipeline
   - Add player_risk_tier column to users table
   - Build daily batch job to update risk scores

2. Set up intervention tracking
   - Create winback_campaigns table (track sends, opens, returns)
   - Add UTM parameters to deep links (measure attribution)
   - Build dashboard in analytics tool (Amplitude/Mixpanel)

3. Configure alert system
   - Set up Slack webhooks for critical alerts
   - Create daily/weekly email reports
   - Build real-time dashboard (Grafana/Datadog)

Dependencies: Analytics pipeline, database access, BI tools
Owner: Data Engineering
Estimated Effort: 2 weeks
```

#### **Campaign Infrastructure**
```
Tasks:
1. Integrate messaging platforms
   - Set up SendGrid/Mailchimp for email campaigns
   - Configure Firebase/OneSignal for push notifications
   - Test deep linking (app:// URLs)

2. Build campaign management system
   - Create campaign_templates table
   - Build A/B test framework
   - Implement scheduling (send at optimal local time)

3. Set up creative assets
   - Design email templates (5 variants)
   - Create push notification templates
   - Build landing pages (app://winback-day7, etc.)

Dependencies: Marketing tools budget, design resources
Owner: Growth Engineering
Estimated Effort: 1.5 weeks
```

---

### Phase 2: Intervention Logic (Week 3-4)

#### **Automated Triggers**
```typescript
// Pseudocode for intervention system
async function runDailyInterventions() {
  // Day 1: First session dropout
  const day1AtRisk = await db.users.findMany({
    where: {
      lastLogin: { gte: 24_HOURS_AGO, lte: 25_HOURS_AGO },
      sessionCount: { gte: 1 },
      riskScore: { gte: 20 },
    },
  });
  await sendCampaign(day1AtRisk, 'day1_comeback');

  // Day 2: No login
  const day2AtRisk = await db.users.findMany({
    where: {
      lastLogin: { gte: 48_HOURS_AGO, lte: 49_HOURS_AGO },
      riskScore: { gte: 35 },
    },
  });
  await sendCampaign(day2AtRisk, 'day2_your_snake_misses_you');

  // Day 7: Win-back
  const day7Churned = await db.users.findMany({
    where: {
      lastLogin: { gte: 7_DAYS_AGO, lte: 7_DAYS_AGO + 1_HOUR },
      wasActiveD3: true,
      riskScore: { gte: 55 },
    },
  });
  await sendCampaign(day7Churned, 'day7_winback');

  // Day 14, 30, 60 (similar logic)
}

// Run daily at 6am UTC
cron.schedule('0 6 * * *', runDailyInterventions);
```

**Tasks:**
1. Implement intervention logic (code above)
2. Test trigger accuracy (dry run, no sends)
3. Deploy to staging, validate with test users
4. Deploy to production, monitor closely

**Owner:** Backend Engineering
**Estimated Effort:** 1 week

---

#### **Dynamic Difficulty Adjustment**
```typescript
// Frustration churn prevention
async function adjustDifficultyIfNeeded(userId: string) {
  const recentGames = await db.games.findMany({
    where: { userId, createdAt: { gte: LAST_24_HOURS } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const losses = recentGames.filter(g => !g.won).length;
  const losingStreak = recentGames.findIndex(g => g.won);

  if (losses >= 7 && losingStreak >= 5) {
    // High frustration - apply DDA
    await db.users.update({
      where: { id: userId },
      data: {
        ddaModifier: {
          gameSpeed: 0.85,        // -15% speed
          obstacleFreq: 0.80,     // -20% obstacles
          powerUpBoost: 1.25,     // +25% power-ups
          duration: 3,            // 3 games
        },
      },
    });

    await notifications.send(userId, {
      title: "We've got your back!",
      body: "The game's a bit easier now - you got this!",
    });
  }
}
```

**Tasks:**
1. Implement DDA logic (code above)
2. Add DDA parameters to game config
3. A/B test DDA effectiveness (50% control, 50% treatment)
4. Measure impact on frustration churn (-20% target)

**Owner:** Game Engineering
**Estimated Effort:** 1 week

---

### Phase 3: Win-Back Campaigns (Week 5-6)

#### **Campaign Launches**
```
Week 5:
- Launch Day 7 win-back (3 variants, A/B test)
  - Variant A: Premium Trial
  - Variant B: Exclusive Content
  - Variant C: Social Proof
- Target: 1,000 sends/day
- Monitor: Open rate, return rate, D7 re-retention

Week 6:
- Launch Day 14 win-back (single variant)
- Launch Day 30 seasonal (quarterly cadence)
- Scale Day 7 to 5,000 sends/day (winning variant only)
```

**Tasks:**
1. Write campaign copy (5 email templates)
2. Design email/push creatives
3. Set up A/B test framework
4. Deploy campaigns to production
5. Monitor performance daily

**Owner:** Growth Team
**Estimated Effort:** 2 weeks

---

### Phase 4: Monitoring & Optimization (Week 7-8)

#### **Dashboard Build**
```
Create real-time dashboard with:
1. Retention curves (D1, D7, D30)
2. Churn attribution (pie chart)
3. At-risk player counts (by tier)
4. Win-back performance (table)
5. Alert status (traffic light)

Tool: Grafana / Amplitude / Mixpanel
Owner: Analytics Team
Estimated Effort: 1 week
```

#### **Weekly Review Process**
```
Every Monday:
1. Generate automated churn report
2. Review with Growth + Product teams
3. Identify action items (fix bugs, adjust offers)
4. Update roadmap priorities

Owner: Head of Growth
Estimated Effort: 2h/week (ongoing)
```

---

### Phase 5: Advanced Features (Week 9+)

#### **ML Churn Prediction**
```
Build machine learning model to predict churn:
- Features: session patterns, spending, social engagement
- Model: Gradient Boosted Trees (XGBoost)
- Output: Churn probability (0-100%)
- Integration: Update risk scores daily

Owner: Data Science Team
Estimated Effort: 4 weeks
```

#### **Personalized Interventions**
```
Tailor interventions to player type:
- Frustrated players → DDA + tutorial tips
- Bored players → New content teasers
- Social players → Friend invites
- Spenders → Exclusive offers

Owner: Growth Engineering + Product
Estimated Effort: 3 weeks
```

---

## Success Metrics

### North Star Metric
**D7 Retention Rate**
- Current: TBD (measure baseline)
- Target: >25%
- Stretch: >30%

### Primary Metrics

| Metric | Baseline | Target (3 months) | Stretch (6 months) |
|--------|----------|-------------------|-------------------|
| D1 Retention | TBD | >50% | >55% |
| D7 Retention | TBD | >25% | >30% |
| D30 Retention | TBD | >15% | >18% |
| Churn Rate (D7) | TBD | <75% | <70% |
| Win-back Return Rate (D7) | TBD | >8% | >12% |
| Win-back ROI | TBD | >200% | >300% |

### Secondary Metrics

| Metric | Target |
|--------|--------|
| At-Risk Player Intervention Rate | >80% (intervene before churn) |
| Frustration Churn Reduction | -20% (via DDA) |
| Boredom Churn Reduction | -15% (via new content) |
| Obligation Churn Reduction | -25% (via flexible dailies) |
| D7 Re-Retention (Win-Backs) | >40% (stay 7 more days) |
| Win-Back Campaign Open Rate | >30% |
| Win-Back Campaign Click Rate | >15% |

---

## Appendix: Technical Integration

### Database Schema

```sql
-- Churn risk tracking
CREATE TABLE player_risk_scores (
  user_id UUID PRIMARY KEY,
  risk_score INTEGER NOT NULL,        -- 0-100
  risk_tier TEXT NOT NULL,             -- 'green' | 'yellow' | 'orange' | 'red'
  signals JSONB NOT NULL,              -- All signal values
  last_updated TIMESTAMP NOT NULL,

  INDEX idx_risk_tier (risk_tier),
  INDEX idx_risk_score (risk_score DESC)
);

-- Win-back campaign tracking
CREATE TABLE winback_campaigns (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  campaign_type TEXT NOT NULL,         -- 'day7', 'day14', 'day30'
  campaign_variant TEXT,               -- 'premium_trial', 'exclusive', etc.
  sent_at TIMESTAMP NOT NULL,
  opened_at TIMESTAMP,
  clicked_at TIMESTAMP,
  returned_at TIMESTAMP,               -- First login after campaign
  claimed_offer BOOLEAN DEFAULT false,

  revenue_7d DECIMAL(10,2),            -- Revenue in 7 days post-return
  retained_d7 BOOLEAN,                 -- Still playing 7 days later

  INDEX idx_user_campaign (user_id, campaign_type),
  INDEX idx_sent_at (sent_at),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Intervention log
CREATE TABLE churn_interventions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  intervention_type TEXT NOT NULL,     -- 'dda', 'push_notification', 'email', etc.
  trigger_reason TEXT NOT NULL,        -- 'losing_streak', 'no_login_48h', etc.
  triggered_at TIMESTAMP NOT NULL,
  successful BOOLEAN,                  -- Did player return/improve?

  INDEX idx_user_interventions (user_id, triggered_at),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### API Endpoints

```typescript
// Calculate churn risk for a player
POST /api/churn/calculate-risk
Request: { userId: string }
Response: {
  riskScore: number;
  riskTier: 'green' | 'yellow' | 'orange' | 'red';
  signals: ChurnRiskSignals;
  recommendations: string[];  // Suggested interventions
}

// Trigger intervention manually
POST /api/churn/intervene
Request: {
  userId: string;
  interventionType: 'dda' | 'push' | 'email' | 'offer';
}
Response: {
  success: boolean;
  interventionId: string;
}

// Get win-back campaign performance
GET /api/churn/campaigns/performance
Query: {
  campaignType?: 'day7' | 'day14' | 'day30';
  startDate?: string;
  endDate?: string;
}
Response: {
  campaigns: Array<{
    type: string;
    variant: string;
    sent: number;
    opened: number;
    returned: number;
    revenue: number;
    roi: number;
  }>;
}

// Get dashboard metrics
GET /api/churn/dashboard
Response: {
  retention: {
    d1: number;
    d7: number;
    d30: number;
  };
  atRisk: {
    yellow: number;
    orange: number;
    red: number;
  };
  churnReasons: {
    frustration: number;
    boredom: number;
    social: number;
    // ...
  };
  winbackPerformance: {
    sent: number;
    returned: number;
    roi: number;
  };
}
```

### Event Tracking

```typescript
// Track churn-related events in analytics
interface ChurnEvents {
  // Risk signals
  'player_risk_score_updated': {
    userId: string;
    oldScore: number;
    newScore: number;
    tier: string;
  };

  // Interventions
  'intervention_triggered': {
    userId: string;
    type: string;
    reason: string;
  };

  'intervention_successful': {
    userId: string;
    type: string;
    outcome: 'returned' | 'improved' | 'failed';
  };

  // Campaigns
  'winback_campaign_sent': {
    userId: string;
    campaignType: string;
    variant: string;
  };

  'winback_campaign_opened': {
    userId: string;
    campaignType: string;
  };

  'winback_campaign_clicked': {
    userId: string;
    campaignType: string;
    deepLink: string;
  };

  'winback_offer_claimed': {
    userId: string;
    offerValue: number;
  };

  // Return tracking
  'churned_player_returned': {
    userId: string;
    daysSinceChurn: number;
    returnSource: 'organic' | 'campaign';
    campaignType?: string;
  };
}
```

---

## Glossary

**Churn:** Player who stops playing (typically defined as 7+ days inactive)
**Churn Rate:** % of players who churn within a time period (e.g., D7 churn = % who don't return by day 7)
**Retention Rate:** Inverse of churn (% who DO return)
**D1/D7/D30:** Day 1, Day 7, Day 30 retention (% of install cohort still active)
**Win-Back:** Campaign to re-engage churned players
**DDA:** Dynamic Difficulty Adjustment (auto-tuning game difficulty)
**At-Risk:** Player with high churn probability (based on behavioral signals)
**LTV:** Lifetime Value (total revenue from a player)
**ROI:** Return on Investment (revenue vs campaign cost)
**Cohort:** Group of players installed in the same time period
**Deep Link:** URL that opens app to specific screen (app://winback-day7)

---

## Related Documentation
- [Live Ops Framework](/Users/josefbell/SupaSnake/design/live_ops_framework_aaa.md) - Event scheduling, A/B testing
- [Engagement Config](/Users/josefbell/SupaSnake/src/shared/config/engagement.ts) - Daily quests, streaks
- [Monetization Architecture](/Users/josefbell/SupaSnake/design/monetization_architecture_aaa.md) - IAP strategy, offers
- [Analytics Implementation](#) - Event tracking, dashboards (TODO)

---

**Document Status:** Ready for Implementation
**Next Review:** 2026-01-19 (monthly review)
**Feedback:** growth-team@supasnake.com
