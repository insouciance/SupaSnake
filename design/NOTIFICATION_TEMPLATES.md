# SupaSnake - Notification Templates

## Document Overview

**Purpose:** Complete notification template library for SupaSnake push notifications
**Audience:** Product managers, growth team, engineering
**Last Updated:** 2025-12-19
**Version:** 1.0

**Guiding Principles:**
- Dynasty-themed, playful tone
- Urgent but not pushy
- Personalized with player/snake data
- Clear call-to-action
- Respects frequency caps (max 3/day)

---

## Table of Contents

1. [Notification Categories](#notification-categories)
2. [Template Library](#template-library)
3. [Timing Strategy](#timing-strategy)
4. [Personalization Tokens](#personalization-tokens)
5. [A/B Test Variants](#ab-test-variants)
6. [Frequency Caps](#frequency-caps)
7. [Deep Links](#deep-links)
8. [Localization Guidelines](#localization-guidelines)
9. [Implementation Checklist](#implementation-checklist)

---

## Notification Categories

### 1. Transactional (High Priority)
**Purpose:** Confirm player-initiated actions
**Frequency:** Unlimited (not counted toward daily cap)
**Examples:** Breeding complete, purchase confirmation, achievement unlocked

### 2. Engagement (Medium Priority)
**Purpose:** Drive daily active use
**Frequency:** Max 2/day
**Examples:** Energy refill, streak warning, tournament reminder

### 3. Reactivation (Medium Priority)
**Purpose:** Win back lapsed players
**Frequency:** Day 3, Day 7, Day 14, Day 30 (then stop)
**Examples:** "Your snake misses you", progress reminder, new content alert

### 4. Promotional (Low Priority)
**Purpose:** Drive monetization and special events
**Frequency:** Max 1/day
**Examples:** Sale notifications, new variant launch, limited-time offer

---

## Template Library

### Transactional Notifications

#### T-01: Breeding Complete (Basic)
```
Title: Breeding Complete!
Body: Your new Gen {generation} {variant} is ready to hatch
Tokens: {generation}, {variant}
Deep Link: supasnake://lab/hatchery
Priority: High
Sound: breeding_complete.wav
```

**A/B Variants:**
- A: "Breeding Complete!"
- B: "Your Dynasty Grows!"

#### T-02: Breeding Complete (Rare Variant)
```
Title: RARE Breeding Success!
Body: A legendary {variant} has hatched! Gen {generation}
Tokens: {variant}, {generation}
Deep Link: supasnake://lab/hatchery?highlight=true
Priority: High
Sound: rare_hatch.wav
```

#### T-03: Achievement Unlocked
```
Title: Achievement Unlocked!
Body: "{achievement_name}" - You earned {reward_amount} gems
Tokens: {achievement_name}, {reward_amount}
Deep Link: supasnake://profile/achievements
Priority: High
Sound: achievement.wav
```

#### T-04: Purchase Confirmed
```
Title: Purchase Complete
Body: {item_name} added to your inventory
Tokens: {item_name}
Deep Link: supasnake://inventory
Priority: High
Sound: purchase.wav
```

#### T-05: Tournament Registration Confirmed
```
Title: You're In!
Body: Tournament starts in {hours}h - prepare your best snake
Tokens: {hours}
Deep Link: supasnake://tournament/lobby
Priority: High
Sound: tournament_join.wav
```

---

### Engagement Notifications

#### E-01: Energy Full (Morning)
```
Title: Energy Refilled!
Body: Your snake is ready to hunt. Start your streak now!
Tokens: None
Deep Link: supasnake://game/play
Priority: Medium
Sound: energy_full.wav
Timing: 9:00 AM local
```

**A/B Variants:**
- A: "Your snake is ready to hunt"
- B: "Time to feed your dynasty"
- C: "Full energy - let's go hunting!"

#### E-02: Energy Full (Evening)
```
Title: Energy Recharged
Body: Perfect time for a quick hunt before bed
Tokens: None
Deep Link: supasnake://game/play
Priority: Medium
Sound: energy_full.wav
Timing: 8:00 PM local
```

#### E-03: Streak Warning (3h Before Midnight)
```
Title: Don't Break Your Streak!
Body: {streak_days}-day streak ends in 3 hours. Play now!
Tokens: {streak_days}
Deep Link: supasnake://game/play
Priority: High
Sound: streak_warning.wav
Timing: 9:00 PM local
```

**A/B Variants:**
- A: "Don't Break Your Streak!"
- B: "Your Dynasty Depends On You!"
- C: "{streak_days} Days - Keep It Alive!"

#### E-04: Streak Warning (1h Before Midnight)
```
Title: URGENT: Streak Ending Soon!
Body: Only 1 hour left to save your {streak_days}-day streak!
Tokens: {streak_days}
Deep Link: supasnake://game/play
Priority: High
Sound: streak_urgent.wav
Timing: 11:00 PM local
```

#### E-05: Tournament Starting Soon
```
Title: Tournament Starts in 1 Hour!
Body: {tournament_name} - {prize_pool} gems up for grabs
Tokens: {tournament_name}, {prize_pool}
Deep Link: supasnake://tournament/lobby
Priority: Medium
Sound: tournament_soon.wav
Timing: 1h before tournament
```

#### E-06: Tournament Ending Soon (Top 50)
```
Title: You're in Prize Zone!
Body: Rank #{current_rank} - Tournament ends in 2h. Defend your position!
Tokens: {current_rank}
Deep Link: supasnake://tournament/leaderboard
Priority: High
Sound: tournament_urgent.wav
Timing: 2h before tournament ends
```

#### E-07: Tournament Ending Soon (Below Prize Zone)
```
Title: Final Push to Top 100!
Body: Rank #{current_rank} - {games_needed} wins needed for prizes
Tokens: {current_rank}, {games_needed}
Deep Link: supasnake://tournament/lobby
Priority: Medium
Sound: tournament_urgent.wav
Timing: 2h before tournament ends
```

#### E-08: Tournament Results (Winner)
```
Title: CHAMPION!
Body: You finished #{final_rank} - {prize_gems} gems + {prize_item}
Tokens: {final_rank}, {prize_gems}, {prize_item}
Deep Link: supasnake://tournament/results
Priority: High
Sound: victory.wav
Timing: Tournament end + 5 min
```

#### E-09: Tournament Results (Top 100)
```
Title: Tournament Complete!
Body: Rank #{final_rank} - You earned {prize_gems} gems
Tokens: {final_rank}, {prize_gems}
Deep Link: supasnake://tournament/results
Priority: Medium
Sound: tournament_end.wav
Timing: Tournament end + 5 min
```

#### E-10: Clan Event Contribution Needed
```
Title: Your Clan Needs You!
Body: {clan_name} is {percent}% to goal - contribute now
Tokens: {clan_name}, {percent}
Deep Link: supasnake://clan/event
Priority: Medium
Sound: clan_alert.wav
Timing: Event midpoint
```

#### E-11: Clan Chest Ready
```
Title: Clan Chest Unlocked!
Body: {clan_name} completed the event - claim your rewards
Tokens: {clan_name}
Deep Link: supasnake://clan/rewards
Priority: High
Sound: clan_victory.wav
Timing: Event completion
```

---

### Reactivation Notifications

#### R-01: Day 3 Absent (Soft)
```
Title: Your Snake Misses You!
Body: {player_name}, your {highest_generation} Gen dynasty awaits
Tokens: {player_name}, {highest_generation}
Deep Link: supasnake://home
Priority: Medium
Sound: default.wav
Timing: 72h after last session, 6:00 PM local
```

**A/B Variants:**
- A: "Your Snake Misses You!"
- B: "Your Dynasty is Waiting..."
- C: "Come Back to Your Snakes!"

#### R-02: Day 7 Absent (Progress Reminder)
```
Title: You're So Close!
Body: Your dynasty is Gen {highest_generation} - keep building your legacy
Tokens: {highest_generation}
Deep Link: supasnake://lab/family-tree
Priority: Medium
Sound: default.wav
Timing: 168h after last session, 12:00 PM local
```

#### R-03: Day 7 Absent (New Content)
```
Title: New Variants Released!
Body: Tuesday drop: {new_variant_1} and {new_variant_2} are here
Tokens: {new_variant_1}, {new_variant_2}
Deep Link: supasnake://lab/variants
Priority: Medium
Sound: default.wav
Timing: If Tuesday occurred during absence
```

#### R-04: Day 14 Absent (Streak Lost)
```
Title: Start Fresh Today
Body: Your {streak_days}-day streak ended, but your dynasty lives on
Tokens: {streak_days}
Deep Link: supasnake://game/play
Priority: Low
Sound: default.wav
Timing: 336h after last session, 10:00 AM local
```

#### R-05: Day 30 Absent (Final Attempt)
```
Title: We Miss You, {player_name}
Body: Your snakes are hibernating. Wake them up?
Tokens: {player_name}
Deep Link: supasnake://home
Priority: Low
Sound: default.wav
Timing: 720h after last session, 3:00 PM local
```

**Note:** After Day 30, no further reactivation notifications are sent unless player re-engages.

---

### Promotional Notifications

#### P-01: New Variant Launch (Tuesday)
```
Title: New Variants Just Dropped!
Body: {variant_name} is here - start breeding now
Tokens: {variant_name}
Deep Link: supasnake://lab/variants?new=true
Priority: Medium
Sound: variant_launch.wav
Timing: Tuesday, 10:00 AM local
```

**A/B Variants:**
- A: "New Variants Just Dropped!"
- B: "TUESDAY DROP: {variant_name}"
- C: "Fresh Genetics Available!"

#### P-02: Flash Sale (24h)
```
Title: 50% Off Premium Variants!
Body: 24 hours only - rare genetics on sale
Tokens: None
Deep Link: supasnake://shop?sale=true
Priority: Low
Sound: sale.wav
Timing: Sale start + 0h
```

#### P-03: Flash Sale Ending Soon
```
Title: Sale Ends in 3 Hours!
Body: Last chance for 50% off premium variants
Tokens: None
Deep Link: supasnake://shop?sale=true
Priority: Medium
Sound: sale_urgent.wav
Timing: Sale end - 3h
```

#### P-04: Weekend Tournament Announcement
```
Title: MEGA Tournament This Weekend!
Body: {prize_pool} gems + exclusive {prize_variant} variant
Tokens: {prize_pool}, {prize_variant}
Deep Link: supasnake://tournament/info
Priority: Medium
Sound: tournament_announce.wav
Timing: Friday, 5:00 PM local
```

#### P-05: Season Pass Available
```
Title: New Season - New Rewards!
Body: Season {season_number} Pass includes {top_reward}
Tokens: {season_number}, {top_reward}
Deep Link: supasnake://shop/season-pass
Priority: Low
Sound: season_launch.wav
Timing: Season launch day, 12:00 PM local
```

#### P-06: Season Ending Soon
```
Title: Season Ends in 3 Days!
Body: Reach Tier {next_tier} to unlock {reward}
Tokens: {next_tier}, {reward}
Deep Link: supasnake://season/progress
Priority: Medium
Sound: season_urgent.wav
Timing: Season end - 72h, 7:00 PM local
```

#### P-07: Starter Pack Offer (New Players)
```
Title: Welcome Gift!
Body: Special offer: 5000 gems + rare EMBER variant for $4.99
Tokens: None
Deep Link: supasnake://shop/starter-pack
Priority: Low
Sound: offer.wav
Timing: 24h after first session
```

#### P-08: Return Player Offer
```
Title: Welcome Back Gift!
Body: We missed you - here's 1000 free gems + energy refill
Tokens: None
Deep Link: supasnake://claim-gift
Priority: Medium
Sound: gift.wav
Timing: First session after 7+ day absence
```

---

## Timing Strategy

### Best Send Times by Category

#### Transactional (Immediate)
- **Breeding Complete:** Send immediately when process finishes
- **Achievement:** Send immediately on unlock
- **Purchase:** Send within 5 seconds of transaction

#### Engagement (Scheduled)

**Weekday Schedule:**
```
09:00 AM - Energy Full (morning commute)
12:30 PM - Tournament reminders (lunch break)
06:00 PM - Energy Full (evening session)
08:00 PM - Clan events (prime gaming time)
09:00 PM - Streak warning (3h before midnight)
11:00 PM - Urgent streak warning (1h before midnight)
```

**Weekend Schedule:**
```
10:00 AM - Energy Full (later wake-up)
02:00 PM - Tournament announcements
07:00 PM - Energy Full (evening session)
10:00 PM - Streak warning
```

**Tuesday (Variant Release Day):**
```
10:00 AM - New variant announcement (consistent release time)
```

#### Reactivation (Targeted)

**Day 3:** 6:00 PM local (after work/school)
**Day 7:** 12:00 PM local (lunch break)
**Day 14:** 10:00 AM local (weekend morning)
**Day 30:** 3:00 PM local (afternoon)

### Timezone Considerations

**Respect Local Time:**
- All notifications use player's device timezone
- Avoid sending between 12:00 AM - 8:00 AM local
- Exception: Urgent streak warnings (11:00 PM acceptable)

**Global Event Timing:**
- Tournaments: Start at noon UTC (covers most timezones)
- Variant releases: Tuesday 10:00 AM local (staggered globally)
- Flash sales: Start at 9:00 AM local (maximize visibility)

---

## Personalization Tokens

### Player Data Tokens

```typescript
{player_name}          // "Alex"
{player_level}         // "42"
{total_games}          // "1,247"
{highest_score}        // "8,950"
{streak_days}          // "23"
{total_snakes}         // "156"
{clan_name}            // "Viper Squad"
{clan_rank}            // "Elder"
```

### Snake Data Tokens

```typescript
{snake_name}           // "Ember" (player's current snake)
{variant}              // "EMBER", "FROST", "VOLT"
{generation}           // "3", "12", "45"
{highest_generation}   // "67" (player's best)
{rarity}               // "Common", "Rare", "Legendary"
{parent_1}             // "Ember" (breeding)
{parent_2}             // "Frost" (breeding)
```

### Event Data Tokens

```typescript
{tournament_name}      // "Weekend Warriors"
{prize_pool}           // "50,000"
{current_rank}         // "47"
{final_rank}           // "12"
{prize_gems}           // "2,500"
{prize_item}           // "Legendary Skin"
{games_needed}         // "3" (to reach prize zone)
{time_remaining}       // "2h 15m"
```

### Promotional Tokens

```typescript
{new_variant_1}        // "SHADOW"
{new_variant_2}        // "CRYSTAL"
{variant_name}         // "PLASMA"
{sale_discount}        // "50%"
{season_number}        // "3"
{next_tier}            // "Gold"
{reward}               // "Exclusive VOID variant"
{top_reward}           // "Legendary OMEGA skin"
```

### Time-Based Tokens

```typescript
{hours}                // "2" (hours until event)
{days}                 // "7" (days streak)
{percent}              // "85" (clan event progress)
```

### Usage Guidelines

**Token Safety:**
- Always provide fallback values (e.g., "Player" if {player_name} empty)
- Validate token data exists before sending notification
- Truncate long values (e.g., clan names > 20 chars)

**Example Implementation:**
```typescript
const title = playerName
  ? `Your Snake Misses You, ${playerName}!`
  : `Your Snake Misses You!`;

const body = highestGeneration
  ? `Your Gen ${highestGeneration} dynasty awaits`
  : `Your dynasty awaits`;
```

---

## A/B Test Variants

### Recommended Tests (Priority Order)

#### Test 1: Streak Warning Urgency
**Goal:** Maximize streak save rate
**Traffic Split:** 33% / 33% / 34%

```
A (Control): "Don't Break Your Streak!"
B (Urgency):  "URGENT: {streak_days} Days at Risk!"
C (Loss):     "You're About to Lose {streak_days} Days!"
```

**Success Metric:** % of recipients who play within 1 hour

---

#### Test 2: Energy Full CTA
**Goal:** Increase session starts from notifications
**Traffic Split:** 33% / 33% / 34%

```
A (Control):  "Your snake is ready to hunt"
B (Dynasty):  "Time to grow your dynasty"
C (Action):   "Let's go hunting!"
```

**Success Metric:** % of recipients who start game within 30 min

---

#### Test 3: Reactivation Day 3 Tone
**Goal:** Maximize re-engagement rate
**Traffic Split:** 50% / 50%

```
A (Emotional): "Your Snake Misses You!"
B (Progress):  "Your Gen {highest_generation} Dynasty Awaits"
```

**Success Metric:** % of recipients who return within 24 hours

---

#### Test 4: Tournament Reminder Incentive
**Goal:** Drive tournament participation
**Traffic Split:** 50% / 50%

```
A (Prize):    "{prize_pool} gems up for grabs"
B (Rank):     "Climb the leaderboard now"
```

**Success Metric:** % of recipients who join tournament

---

#### Test 5: New Variant Launch Format
**Goal:** Maximize variant discovery
**Traffic Split:** 33% / 33% / 34%

```
A (Announce): "New Variants Just Dropped!"
B (Urgency):  "TUESDAY DROP: {variant_name}"
C (Action):   "Start Breeding {variant_name} Now"
```

**Success Metric:** % of recipients who view variant details

---

### A/B Testing Framework

**Test Duration:** 7 days minimum (capture full week behavior)
**Sample Size:** 10,000+ players per variant (statistical significance)
**Winner Declaration:** 95% confidence, 5% improvement minimum

**Implementation:**
```typescript
// Assign variant based on user ID hash
const variant = (userId % 3); // 0, 1, or 2
const notificationBody = [
  "Your snake is ready to hunt",      // A
  "Time to grow your dynasty",        // B
  "Let's go hunting!"                 // C
][variant];
```

**Tracking:**
```typescript
analytics.track('notification_sent', {
  notification_id: 'E-01',
  variant: 'A',
  player_id: userId,
  sent_at: timestamp
});

analytics.track('notification_clicked', {
  notification_id: 'E-01',
  variant: 'A',
  player_id: userId,
  clicked_at: timestamp,
  time_to_click: seconds
});
```

---

## Frequency Caps

### Global Rules

**Daily Maximum:** 3 push notifications per player per day
**Weekly Maximum:** 15 push notifications per player per week
**Reactivation Maximum:** 1 per day for lapsed players

**Exceptions (Don't Count Toward Cap):**
- Transactional notifications (breeding complete, purchase confirmed)
- Critical streak warnings (within 1h of midnight)
- Tournament results (if player participated)

---

### Priority System

When player reaches daily cap, prioritize by:

1. **High Priority (Always Send):**
   - Breeding complete
   - Achievement unlocked
   - Streak warning (< 1h remaining)
   - Tournament ending (player in prize zone)

2. **Medium Priority (Send if < 3 today):**
   - Energy full
   - Tournament reminders
   - Clan events
   - Reactivation messages

3. **Low Priority (Send if < 2 today):**
   - Promotional offers
   - Sale announcements
   - Season reminders

---

### Notification Cadence Rules

**Minimum Time Between Notifications:** 2 hours
**Exception:** Transactional notifications can send anytime

**Suppress If:**
- Player currently in active session (playing game)
- Player opened app within last 30 minutes
- Identical notification sent within 24 hours

**Smart Timing:**
- If player has consistent play pattern, send before typical session time
- Example: Player usually plays at 7 PM → send energy notification at 6:45 PM

---

### Implementation Example

```typescript
interface NotificationQueue {
  playerId: string;
  notifications: Notification[];
  sentToday: number;
  lastSentAt: Date;
}

async function canSendNotification(
  playerId: string,
  priority: 'high' | 'medium' | 'low'
): Promise<boolean> {
  const queue = await getPlayerQueue(playerId);

  // Check daily cap
  if (queue.sentToday >= 3 && priority !== 'high') {
    return false;
  }

  // Check minimum time between notifications
  const hoursSinceLastNotification =
    (Date.now() - queue.lastSentAt.getTime()) / (1000 * 60 * 60);

  if (hoursSinceLastNotification < 2) {
    return false;
  }

  // Check active session
  const isActive = await isPlayerActive(playerId);
  if (isActive) {
    return false;
  }

  return true;
}

async function sendNotificationWithCapCheck(
  playerId: string,
  notification: Notification
): Promise<void> {
  const canSend = await canSendNotification(playerId, notification.priority);

  if (!canSend) {
    console.log(`Notification suppressed for player ${playerId}`);
    await logSuppression(playerId, notification.id, 'frequency_cap');
    return;
  }

  await sendPushNotification(playerId, notification);
  await incrementDailyCount(playerId);

  analytics.track('notification_sent', {
    player_id: playerId,
    notification_id: notification.id,
    priority: notification.priority
  });
}
```

---

## Deep Links

### Deep Link Format

```
supasnake://[screen]/[subscreen]?[parameters]
```

### Screen Map

#### Game
```
supasnake://game/play
supasnake://game/play?energy_boost=true
supasnake://game/results?score={score}
```

#### Lab (Breeding)
```
supasnake://lab/hatchery
supasnake://lab/hatchery?highlight=true
supasnake://lab/variants
supasnake://lab/variants?new=true
supasnake://lab/family-tree
supasnake://lab/breeding?parent1={id}&parent2={id}
```

#### Tournament
```
supasnake://tournament/lobby
supasnake://tournament/leaderboard
supasnake://tournament/results
supasnake://tournament/info?id={tournament_id}
```

#### Clan
```
supasnake://clan/home
supasnake://clan/event
supasnake://clan/rewards
supasnake://clan/leaderboard
```

#### Shop
```
supasnake://shop
supasnake://shop?sale=true
supasnake://shop/starter-pack
supasnake://shop/season-pass
supasnake://shop/gems
```

#### Profile
```
supasnake://profile
supasnake://profile/achievements
supasnake://profile/stats
supasnake://profile/settings
```

#### Special
```
supasnake://home
supasnake://claim-gift?type=return_bonus
supasnake://inventory
supasnake://settings/notifications
```

---

### Deep Link Implementation

```typescript
// Deep link handler
async function handleDeepLink(url: string): Promise<void> {
  const parsed = parseDeepLink(url);

  switch (parsed.screen) {
    case 'game':
      if (parsed.subscreen === 'play') {
        const energyBoost = parsed.params.energy_boost === 'true';
        await navigateToGame({ energyBoost });
      }
      break;

    case 'lab':
      if (parsed.subscreen === 'hatchery') {
        const highlight = parsed.params.highlight === 'true';
        await navigateToHatchery({ highlight });
      }
      break;

    case 'tournament':
      await navigateToTournament(parsed.subscreen);
      break;

    default:
      await navigateToHome();
  }
}

// Track deep link navigation
analytics.track('deep_link_opened', {
  url: url,
  screen: parsed.screen,
  source: 'push_notification'
});
```

---

### Testing Deep Links

**iOS:**
```bash
xcrun simctl openurl booted "supasnake://lab/hatchery?highlight=true"
```

**Android:**
```bash
adb shell am start -W -a android.intent.action.VIEW -d "supasnake://lab/hatchery?highlight=true"
```

**Validation Checklist:**
- [ ] Deep link opens correct screen
- [ ] Parameters applied correctly (highlight, filters, etc.)
- [ ] Fallback to home if screen unavailable
- [ ] Analytics event fires on navigation
- [ ] Works when app is closed, backgrounded, or active

---

## Localization Guidelines

### Supported Languages (Launch)

**Phase 1:**
- English (US) - Primary
- Spanish (ES) - 15% of player base
- Portuguese (BR) - 8% of player base

**Phase 2 (Post-Launch):**
- French (FR)
- German (DE)
- Japanese (JP)
- Korean (KR)

---

### Character Limits by Platform

**iOS:**
- Title: 50 characters (truncates with "...")
- Body: 178 characters (truncates with "...")

**Android:**
- Title: 65 characters (truncates with "...")
- Body: 240 characters (varies by device)

**Best Practice:** Design for shortest limit (iOS title = 50 chars)

---

### Translation Guidelines

#### Preserve Tokens
```
English:  "Your Gen {generation} {variant} is ready"
Spanish:  "Tu {variant} Gen {generation} está listo"
```

**Note:** Token order may change per language grammar.

---

#### Dynasty Terminology

**Keep Consistent:**
- Dynasty → Dinastía (ES), Dinastia (PT)
- Variant → Variante (ES/PT)
- Generation → Generación (ES), Geração (PT)

**Never Translate:**
- Variant names: EMBER, FROST, VOLT (brand terms)
- Game UI terms: "Gen 3", "Rank #47" (universal)

---

#### Urgency Levels

**English → Spanish:**
- "Don't Break Your Streak!" → "¡No Pierdas Tu Racha!"
- "URGENT" → "URGENTE"
- "Last Chance" → "Última Oportunidad"

**English → Portuguese:**
- "Don't Break Your Streak!" → "Não Quebre Sua Sequência!"
- "URGENT" → "URGENTE"
- "Last Chance" → "Última Chance"

---

#### Cultural Considerations

**Emoji Usage:**
- Universal: 🏆 (trophy), 💎 (gems), ⚡ (energy)
- Caution: 🐍 (snake) may have negative connotations in some cultures
- Avoid: Country flags (political sensitivity)

**Tone Adjustments:**
- Spanish (ES): More formal than English
- Portuguese (BR): More casual, friendly tone acceptable
- Avoid slang or idioms that don't translate

**Time Formats:**
- Use 24-hour format for non-US locales
- Example: "8:00 PM" → "20:00" (ES/PT)

---

#### Testing Localization

**Validation Checklist:**
- [ ] All tokens replaced correctly
- [ ] Character limits respected
- [ ] Grammar correct (gender, plurals)
- [ ] Culturally appropriate tone
- [ ] Deep links work across languages
- [ ] Notification renders correctly on device

**Tools:**
- Google Translate (initial draft only)
- Professional translator (final review)
- Native speaker QA (validation)

---

## Implementation Checklist

### Development Setup

#### 1. Push Notification Service
- [ ] Configure Firebase Cloud Messaging (Android)
- [ ] Configure Apple Push Notification Service (iOS)
- [ ] Set up notification server (Supabase Edge Functions)
- [ ] Generate device tokens on app install

#### 2. Database Schema
```sql
CREATE TABLE notification_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID REFERENCES players(id),
  notification_id TEXT NOT NULL, -- e.g., 'E-01'
  priority TEXT NOT NULL, -- 'high', 'medium', 'low'
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  deep_link TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'clicked', 'failed'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notification_caps (
  player_id UUID PRIMARY KEY REFERENCES players(id),
  daily_count INTEGER DEFAULT 0,
  weekly_count INTEGER DEFAULT 0,
  last_sent_at TIMESTAMPTZ,
  last_reset_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notification_preferences (
  player_id UUID PRIMARY KEY REFERENCES players(id),
  transactional BOOLEAN DEFAULT TRUE,
  engagement BOOLEAN DEFAULT TRUE,
  reactivation BOOLEAN DEFAULT TRUE,
  promotional BOOLEAN DEFAULT FALSE, -- Opt-in required
  timezone TEXT DEFAULT 'UTC',
  quiet_hours_start TIME DEFAULT '00:00',
  quiet_hours_end TIME DEFAULT '08:00',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 3. TypeScript Types
```typescript
// File: src/lib/notifications/types.ts

export type NotificationCategory =
  | 'transactional'
  | 'engagement'
  | 'reactivation'
  | 'promotional';

export type NotificationPriority = 'high' | 'medium' | 'low';

export interface NotificationTemplate {
  id: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  body: string;
  deepLink: string;
  sound?: string;
  tokens: string[];
}

export interface NotificationPayload {
  playerId: string;
  templateId: string;
  tokenValues: Record<string, string>;
  scheduledAt: Date;
  override?: {
    title?: string;
    body?: string;
    deepLink?: string;
  };
}

export interface NotificationPreferences {
  playerId: string;
  transactional: boolean;
  engagement: boolean;
  reactivation: boolean;
  promotional: boolean;
  timezone: string;
  quietHoursStart: string;
  quietHoursEnd: string;
}
```

#### 4. Template Registry
```typescript
// File: src/lib/notifications/templates.ts

export const NOTIFICATION_TEMPLATES: Record<string, NotificationTemplate> = {
  'T-01': {
    id: 'T-01',
    category: 'transactional',
    priority: 'high',
    title: 'Breeding Complete!',
    body: 'Your new Gen {generation} {variant} is ready to hatch',
    deepLink: 'supasnake://lab/hatchery',
    sound: 'breeding_complete.wav',
    tokens: ['generation', 'variant']
  },

  'E-01': {
    id: 'E-01',
    category: 'engagement',
    priority: 'medium',
    title: 'Energy Refilled!',
    body: 'Your snake is ready to hunt. Start your streak now!',
    deepLink: 'supasnake://game/play',
    sound: 'energy_full.wav',
    tokens: []
  },

  // ... all other templates
};
```

#### 5. Notification Scheduler
```typescript
// File: src/lib/notifications/scheduler.ts

export async function scheduleNotification(
  payload: NotificationPayload
): Promise<void> {
  const template = NOTIFICATION_TEMPLATES[payload.templateId];
  if (!template) {
    throw new Error(`Template ${payload.templateId} not found`);
  }

  // Check if player can receive notification
  const canSend = await canSendNotification(
    payload.playerId,
    template.priority,
    template.category
  );

  if (!canSend) {
    console.log(`Notification ${payload.templateId} suppressed for player ${payload.playerId}`);
    return;
  }

  // Replace tokens in title and body
  const title = replaceTokens(template.title, payload.tokenValues);
  const body = replaceTokens(template.body, payload.tokenValues);

  // Insert into queue
  await supabase.from('notification_queue').insert({
    player_id: payload.playerId,
    notification_id: payload.templateId,
    priority: template.priority,
    title: payload.override?.title || title,
    body: payload.override?.body || body,
    deep_link: payload.override?.deepLink || template.deepLink,
    scheduled_at: payload.scheduledAt
  });
}

function replaceTokens(text: string, values: Record<string, string>): string {
  return text.replace(/{(\w+)}/g, (match, token) => {
    return values[token] || match;
  });
}
```

#### 6. Frequency Cap Enforcement
```typescript
// File: src/lib/notifications/frequency-caps.ts

export async function canSendNotification(
  playerId: string,
  priority: NotificationPriority,
  category: NotificationCategory
): Promise<boolean> {
  // Get player preferences
  const preferences = await getNotificationPreferences(playerId);

  // Check if category enabled
  if (!preferences[category]) {
    return false;
  }

  // Transactional always send
  if (category === 'transactional') {
    return true;
  }

  // Check daily cap
  const caps = await getNotificationCaps(playerId);

  if (caps.daily_count >= 3 && priority !== 'high') {
    return false;
  }

  // Check minimum time between notifications
  if (caps.last_sent_at) {
    const hoursSince =
      (Date.now() - caps.last_sent_at.getTime()) / (1000 * 60 * 60);

    if (hoursSince < 2) {
      return false;
    }
  }

  // Check quiet hours
  const now = new Date();
  const currentTime = `${now.getHours()}:${now.getMinutes()}`;

  if (isInQuietHours(currentTime, preferences)) {
    return false;
  }

  // Check active session
  const isActive = await isPlayerActive(playerId);
  if (isActive) {
    return false;
  }

  return true;
}

async function getNotificationCaps(playerId: string) {
  const { data } = await supabase
    .from('notification_caps')
    .select('*')
    .eq('player_id', playerId)
    .single();

  if (!data) {
    // Create default caps
    await supabase.from('notification_caps').insert({
      player_id: playerId,
      daily_count: 0,
      weekly_count: 0
    });

    return { daily_count: 0, weekly_count: 0, last_sent_at: null };
  }

  // Reset daily count at midnight
  const lastReset = new Date(data.last_reset_at);
  const now = new Date();

  if (now.getDate() !== lastReset.getDate()) {
    await supabase
      .from('notification_caps')
      .update({
        daily_count: 0,
        last_reset_at: now
      })
      .eq('player_id', playerId);

    return { ...data, daily_count: 0 };
  }

  return data;
}
```

#### 7. Notification Sender (Supabase Edge Function)
```typescript
// File: supabase/functions/send-notifications/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Fetch pending notifications
  const { data: notifications } = await supabase
    .from('notification_queue')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .limit(100);

  if (!notifications || notifications.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  }

  let sentCount = 0;

  for (const notification of notifications) {
    try {
      // Get player's device token
      const { data: player } = await supabase
        .from('players')
        .select('device_token, platform')
        .eq('id', notification.player_id)
        .single();

      if (!player || !player.device_token) {
        await markNotificationFailed(notification.id, 'no_device_token');
        continue;
      }

      // Send push notification
      if (player.platform === 'ios') {
        await sendAPNS(player.device_token, notification);
      } else {
        await sendFCM(player.device_token, notification);
      }

      // Update notification status
      await supabase
        .from('notification_queue')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString()
        })
        .eq('id', notification.id);

      // Increment player's daily count
      await incrementDailyCount(notification.player_id);

      sentCount++;
    } catch (error) {
      console.error(`Failed to send notification ${notification.id}:`, error);
      await markNotificationFailed(notification.id, error.message);
    }
  }

  return new Response(JSON.stringify({ sent: sentCount }), { status: 200 });
});

async function sendAPNS(deviceToken: string, notification: any) {
  // Apple Push Notification Service integration
  const apnsPayload = {
    aps: {
      alert: {
        title: notification.title,
        body: notification.body
      },
      sound: notification.sound || 'default',
      badge: 1
    },
    deepLink: notification.deep_link
  };

  // Use apn library or HTTP/2 API
  // Implementation depends on your setup
}

async function sendFCM(deviceToken: string, notification: any) {
  // Firebase Cloud Messaging integration
  const fcmPayload = {
    token: deviceToken,
    notification: {
      title: notification.title,
      body: notification.body
    },
    data: {
      deepLink: notification.deep_link
    },
    android: {
      priority: 'high',
      notification: {
        sound: notification.sound || 'default'
      }
    }
  };

  const response = await fetch('https://fcm.googleapis.com/v1/projects/YOUR_PROJECT/messages:send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('FCM_SERVER_KEY')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message: fcmPayload })
  });

  if (!response.ok) {
    throw new Error(`FCM error: ${response.statusText}`);
  }
}
```

---

### Testing Checklist

#### Unit Tests
- [ ] Token replacement works correctly
- [ ] Frequency cap logic enforces limits
- [ ] Quiet hours respected
- [ ] Priority system works as expected

#### Integration Tests
- [ ] Notifications sent to correct players
- [ ] Deep links navigate to correct screens
- [ ] Analytics events tracked
- [ ] Database state updates correctly

#### Manual Testing
- [ ] Send test notification to iOS device
- [ ] Send test notification to Android device
- [ ] Verify notification appearance (title, body, icon)
- [ ] Click notification and verify deep link
- [ ] Test with app closed, backgrounded, active
- [ ] Verify frequency cap prevents spam
- [ ] Test localized notifications (ES, PT)

---

### Monitoring & Analytics

#### Key Metrics

**Delivery Metrics:**
- Sent count (by template, by day)
- Failed count (by reason: no_token, network_error, etc.)
- Delivery rate (sent / attempted)

**Engagement Metrics:**
- Click-through rate (CTR) = clicks / sent
- Time to click (median, p95)
- Conversion rate (action completed / clicked)

**Frequency Metrics:**
- Average notifications per player per day
- Players hitting daily cap (%)
- Suppression rate (by reason)

**A/B Test Metrics:**
- CTR by variant
- Conversion rate by variant
- Statistical significance

#### Dashboards

**Real-Time Dashboard:**
- Notifications sent (last hour)
- Current failure rate
- Active A/B tests

**Daily Dashboard:**
- Sent by template
- CTR by template
- Top performing variants

**Player Dashboard:**
- Notification preferences enabled (%)
- Average notifications per player
- Opt-out rate over time

---

### Rollout Plan

#### Phase 1: Transactional Only (Week 1)
- Enable breeding complete notifications
- Enable achievement notifications
- Monitor delivery rate and CTR
- **Goal:** Validate infrastructure

#### Phase 2: Engagement (Week 2)
- Enable energy full notifications
- Enable streak warnings
- Start A/B testing CTA variants
- **Goal:** Drive daily active use

#### Phase 3: Tournament (Week 3)
- Enable tournament reminders
- Enable tournament ending notifications
- Enable tournament results
- **Goal:** Increase tournament participation

#### Phase 4: Reactivation (Week 4)
- Enable Day 3 reactivation
- Enable Day 7 reactivation
- Monitor re-engagement rate
- **Goal:** Win back lapsed players

#### Phase 5: Promotional (Week 5+)
- Enable new variant announcements (Tuesdays)
- Enable flash sales (limited frequency)
- Enable season pass reminders
- **Goal:** Drive monetization

---

## Quick Reference

### Template Index

**Transactional:**
- T-01: Breeding Complete (Basic)
- T-02: Breeding Complete (Rare)
- T-03: Achievement Unlocked
- T-04: Purchase Confirmed
- T-05: Tournament Registration

**Engagement:**
- E-01: Energy Full (Morning)
- E-02: Energy Full (Evening)
- E-03: Streak Warning (3h)
- E-04: Streak Warning (1h)
- E-05: Tournament Starting Soon
- E-06: Tournament Ending (Top 50)
- E-07: Tournament Ending (Below Prize)
- E-08: Tournament Results (Winner)
- E-09: Tournament Results (Top 100)
- E-10: Clan Event Contribution
- E-11: Clan Chest Ready

**Reactivation:**
- R-01: Day 3 Absent (Soft)
- R-02: Day 7 Absent (Progress)
- R-03: Day 7 Absent (New Content)
- R-04: Day 14 Absent (Streak Lost)
- R-05: Day 30 Absent (Final)

**Promotional:**
- P-01: New Variant Launch
- P-02: Flash Sale Start
- P-03: Flash Sale Ending
- P-04: Weekend Tournament
- P-05: Season Pass Available
- P-06: Season Ending Soon
- P-07: Starter Pack (New Players)
- P-08: Return Player Offer

---

### Daily Send Schedule

```
09:00 AM - E-01 (Energy Full Morning)
10:00 AM - P-01 (New Variant - Tuesdays only)
12:30 PM - E-05 (Tournament Starting Soon)
06:00 PM - E-02 (Energy Full Evening) + R-01 (Day 3 Reactivation)
08:00 PM - E-10 (Clan Events)
09:00 PM - E-03 (Streak Warning 3h)
11:00 PM - E-04 (Streak Warning 1h)
```

---

### Emergency Shutoff

**If notification spam detected:**
```sql
-- Pause all non-transactional notifications
UPDATE notification_queue
SET status = 'paused'
WHERE status = 'pending'
  AND notification_id NOT LIKE 'T-%';

-- Reset all daily caps
UPDATE notification_caps SET daily_count = 0;
```

**If specific template causing issues:**
```sql
-- Pause specific template
UPDATE notification_queue
SET status = 'paused'
WHERE notification_id = 'E-03'
  AND status = 'pending';
```

---

## Next Steps

**After completing notification system:**
1. Set up monitoring dashboards (Amplitude, Supabase)
2. Create notification content calendar (4 weeks ahead)
3. Run initial A/B tests (streak warning, energy full)
4. Collect player feedback on notification quality
5. Implement smart send time optimization (ML-based)
6. Add rich notifications (images, action buttons)
7. Implement notification inbox (in-app archive)

---

## Related Documentation

- [Live Ops Framework (AAA)](./LIVE_OPS_FRAMEWORK_AAA.md) - Overall engagement strategy
- [Analytics Events](./ANALYTICS_EVENTS.md) - Tracking notification performance
- [Player Lifecycle](./PLAYER_LIFECYCLE.md) - Retention and reactivation
- [A/B Testing Guide](./AB_TESTING_GUIDE.md) - Experimentation framework

---

**Document Version:** 1.0
**Last Updated:** 2025-12-19
**Owner:** Product Team
**Reviewers:** Engineering, Growth, Legal