# SupaSnake Constraint Lattice
## Non-Negotiable Game Design Rules

**Version:** 1.0
**Last Updated:** 2025-10-14
**Purpose:** This document defines the immutable constraints that govern all SupaSnake game design decisions.

---

## Introduction

The Constraint Lattice is the foundational architecture of SupaSnake. Every game system, feature, and mechanic must respect these constraints. Think of them as the laws of physics for our game universe - they can be worked within creatively, but they cannot be broken.

This document serves as:
- **Design Authority:** Final arbiter for feature decisions
- **Quality Gate:** Validation checklist before any feature ships
- **Communication Tool:** Clear boundaries for the entire team
- **Onboarding Resource:** New team members understand core principles immediately

**Constraint Philosophy:** Constraints enable creativity by defining clear boundaries. Within these boundaries, infinite innovation is possible.

---

## 1. Business Model Constraints

### BM-001: Pay for Convenience, Not Power
**Rule:** All content and progression must be achievable by F2P players. Paying players may progress FASTER or with LESS EFFORT, but they cannot achieve outcomes impossible for F2P players.

**Rationale:** Fair monetization builds long-term player trust and community health. Pay-to-win creates toxic communities and accelerates churn. Our monetization is "pay to save time" - respecting both free and paying players equally.

**Validation:**
- Any new paid item: Can F2P player achieve equivalent outcome? (Must be YES)
- Time delta test: Paying player saves X hours, but F2P achieves same result
- Power ceiling test: Max stats identical for F2P and payer

**Examples:**
- ✅ COMPLIANT: Energy bundle lets player do 5 more runs today (F2P does same runs tomorrow)
- ✅ COMPLIANT: Breeding accelerator saves 2 hours waiting (F2P waits, gets same snake)
- ❌ NON-COMPLIANT: Premium-only dynasty with +20% stats
- ❌ NON-COMPLIANT: Exclusive evolution path only accessible via purchase

### BM-002: No Forced Ad Viewing
**Rule:** Players may NEVER be required to watch ads to access core gameplay or progression. Ads must always be opt-in for bonus rewards.

**Rationale:** Forced ads create resentment and signal predatory monetization. Opt-in ads with clear value exchange (watch ad → get bonus energy) feel fair and maintain player agency.

**Validation:**
- Energy recharge: Works without ads (check)
- Core features: All accessible without ad viewing (check)
- Bonus calculation: Ad bonus clearly labeled as "extra" not "base"

**Examples:**
- ✅ COMPLIANT: "Watch ad for +1 bonus energy" (opt-in)
- ✅ COMPLIANT: Daily free refill without ads
- ❌ NON-COMPLIANT: "Watch ad to unlock breeding slot"
- ❌ NON-COMPLIANT: Energy recharge requires ad view

### BM-003: No Paywalling Basic Features
**Rule:** Core gameplay loop (Play Snake → Collect DNA → Breed → Evolve) must be fully functional without any purchase.

**Rationale:** Players must experience complete core loop before monetization appears. Paywalling basics signals low-quality F2P trap.

**Validation:**
- Can new player complete full loop without purchase prompt? (Must be YES)
- Tutorial completion: Zero purchase gates
- First breeding: Fully functional with starter resources

**Examples:**
- ✅ COMPLIANT: 3 breeding slots free, 2 more via premium
- ✅ COMPLIANT: Basic dynasties unlockable via play
- ❌ NON-COMPLIANT: First breeding requires premium currency
- ❌ NON-COMPLIANT: Lab access locked behind paywall

### BM-004: Starter Bundle Timing
**Rule:** First purchase offer (starter bundle) must appear AFTER player has demonstrated engagement, NOT during tutorial or first session.

**Rationale:** Aggressive monetization in first 48 hours signals predatory design. Players must first love the game, then choose to support it.

**Validation:**
- Starter bundle trigger: After lab discovery AND first breeding (Day 2-3)
- Tutorial: Zero purchase prompts
- Session 1: No store UI forced

**Examples:**
- ✅ COMPLIANT: Bundle appears Day 3 after 3+ sessions
- ✅ COMPLIANT: Store accessible but not promoted in Session 1
- ❌ NON-COMPLIANT: "80% OFF!" popup during tutorial
- ❌ NON-COMPLIANT: Energy depleted → immediate purchase prompt in first session

---

## 2. Core Engagement Constraints

### CE-001: Meta-Game Time Allocation (70/30 Rule)
**Rule:** Players must spend 70% of session time in Snake Lab (meta-game) and 30% playing Snake (core gameplay).

**Rationale:** The paradigm shift from "Snake game with meta" to "genetic empire that uses Snake as resource collection" requires Lab to be the primary engagement. If players spend more time in Snake, we've failed to make Lab compelling.

**Validation:**
- Telemetry check: Lab time / Total session time >= 0.70
- Session flow: Every Snake run followed by Lab activity
- Tutorial: Lab introduced within 5 minutes, given equal emphasis to Snake

**Examples:**
- ✅ COMPLIANT: 10-minute session = 7min Lab, 3min Snake
- ✅ COMPLIANT: Energy system encourages Lab time between runs
- ❌ NON-COMPLIANT: Players farming Classic mode endlessly
- ❌ NON-COMPLIANT: Lab feels like "between games" feature

### CE-002: Session Frequency Target
**Rule:** Game systems must encourage 3+ sessions daily, naturally spaced throughout the day.

**Rationale:** Single long sessions create burnout. Multiple short sessions build habitual engagement and respect player's real-life schedule.

**Validation:**
- Energy regeneration: Creates return triggers (every 20min charge)
- Breeding timers: Complete at varied intervals (not all same time)
- Daily events: Spread across morning/afternoon/evening

**Examples:**
- ✅ COMPLIANT: Morning check → Lunchtime breed → Evening clan war
- ✅ COMPLIANT: Push notification at 20min energy full (opt-in)
- ❌ NON-COMPLIANT: All daily content available in one sitting
- ❌ NON-COMPLIANT: Energy cap so high no need to return

### CE-003: Session Length Target
**Rule:** Average session length must be 15+ minutes, but individual sessions can range from 3-45 minutes based on mode and player goals.

**Rationale:** Sessions must be meaningful (not 30-second check-ins) but flexible (respect player's available time).

**Validation:**
- Classic Mode: 5-minute run + Lab activities = 8-12min session
- Tower Mode: 15-45 minute challenge + rewards processing
- Lab-only session: Breeding management, collection browsing = 10-20min

**Examples:**
- ✅ COMPLIANT: Player does 2 Classic runs + breeding = 15min
- ✅ COMPLIANT: Tower challenge = 30min focused session
- ❌ NON-COMPLIANT: Player opens app, collects, closes (2min)
- ❌ NON-COMPLIANT: Energy depleted in 60 seconds

### CE-004: Retention Targets
**Rule:** Design decisions must support these retention benchmarks:
- D1 retention: 50%+
- D7 retention: 25%+
- D30 retention: 15%+ (20% aspirational - 2x industry standard)

**Rationale:** These metrics indicate healthy engagement funnel. Below these thresholds indicates fundamental gameplay issues.

**Validation:**
- New feature impact: A/B test must not decrease retention
- Tutorial changes: Must improve D1 retention
- Monetization changes: Must not harm D7/D30 retention

**Examples:**
- ✅ COMPLIANT: Energy system encourages D1 return
- ✅ COMPLIANT: Breeding timers create D7 habit
- ❌ NON-COMPLIANT: Aggressive monetization tanks D7
- ❌ NON-COMPLIANT: Grind wall at Day 10 kills D30

### CE-005: Energy as Engagement Gate
**Rule:** Energy system must create session value and strategic resource management. Energy is NOT a hard paywall - free daily refills and clan bonuses must exist.

**Rationale:** Energy transforms Snake from unlimited casual play to meaningful sessions. However, energy must feel like strategic pacing, not frustrating restriction.

**Validation:**
- Free refill: Once daily, no ads required
- Clan bonus: Regular free energy from social play
- Energy cap: Expandable through progression (not just purchases)
- Ad bonus: Opt-in, not required

**Examples:**
- ✅ COMPLIANT: Energy depleted → Lab activities OR wait 20min
- ✅ COMPLIANT: Daily free refill during player's hot streak
- ❌ NON-COMPLIANT: Energy depleted → only option is purchase
- ❌ NON-COMPLIANT: Energy cap never increases for F2P

---

## 3. Progression Constraints

### PR-001: Infinite Progression (No Ceiling)
**Rule:** Snake generations, collection depth, and mastery systems must have NO MAXIMUM. Players can always progress further.

**Rationale:** Hard caps create "endgame emptiness" and churn. Infinite progression (even if slow at high levels) maintains long-term engagement. Players must always have "next goal."

**Validation:**
- Generation system: Gen 1 → Gen 2 → Gen 3 → ... Gen 100+ (no cap)
- Collection: New dynasties added monthly (expanding content)
- Mastery: 200+ levels per variant (soft cap, but expandable)
- Prestige: Can prestige infinite times

**Examples:**
- ✅ COMPLIANT: Gen 50 snake requires enormous resources but is possible
- ✅ COMPLIANT: Monthly content drops add new collection targets
- ❌ NON-COMPLIANT: "Max level 100 - you've beaten the game"
- ❌ NON-COMPLIANT: All dynasties unlockable in finite time

### PR-002: Prestige with Permanent Bonuses
**Rule:** Prestige systems must reset SOME progress (collection, generation) but grant PERMANENT account-wide bonuses. Prestige must feel like strategic acceleration, not punishment.

**Rationale:** Prestige maintains long-term engagement by resetting the "new player excitement" while rewarding veteran players. Permanent bonuses ensure prestige feels like progress, not loss.

**Validation:**
- What resets: Collection progress, snake generations
- What persists: Permanent stat bonuses, mastery levels, exclusive variants
- Net benefit: Post-prestige progression is faster than first playthrough

**Examples:**
- ✅ COMPLIANT: Prestige → Reset collection, gain +5% DNA bonus permanently
- ✅ COMPLIANT: Prestige unlocks exclusive "Reborn" dynasty
- ❌ NON-COMPLIANT: Prestige loses everything with no compensation
- ❌ NON-COMPLIANT: Prestige bonuses insignificant (0.1% bonus)

### PR-003: Collection Depth by Day 30
**Rule:** Average engaged player must have 20+ variants in collection by Day 30.

**Rationale:** Collection breadth creates attachment and investment. Too few variants = shallow experience. This target ensures satisfying progression pace.

**Validation:**
- Telemetry: Median D30 player collection size >= 20 variants
- Tuning: Drop rates and energy balance to hit target
- A/B test: Changes that decrease D30 collection must be rejected

**Examples:**
- ✅ COMPLIANT: Player has 23 variants spanning 3 dynasties
- ✅ COMPLIANT: Mix of common, uncommon, rare variants collected
- ❌ NON-COMPLIANT: Player only has 8 variants after 30 days
- ❌ NON-COMPLIANT: Progression so slow, collection feels empty

### PR-004: Generation Progress by Day 30
**Rule:** Engaged player must reach Gen 5+ snakes by Day 30.

**Rationale:** Generation progression is core identity. Gen 5+ signals meaningful investment and mastery. Below Gen 5 indicates grind is too slow.

**Validation:**
- Telemetry: Median D30 engaged player has Gen 5+ snake
- Breeding timers: Balanced to enable 5 generations in 30 days
- Resource economy: Sufficient DNA drops to support evolution

**Examples:**
- ✅ COMPLIANT: Player's main dynasty at Gen 6 on Day 30
- ✅ COMPLIANT: Multiple Gen 3-5 snakes across dynasties
- ❌ NON-COMPLIANT: Still stuck at Gen 2 after 30 days
- ❌ NON-COMPLIANT: Evolution costs so high, progress stalled

### PR-005: Lab Investment Requirement
**Rule:** Players must complete 100+ upgrades/experiments in Lab by Day 30 to demonstrate deep meta-game engagement.

**Rationale:** Lab investment indicates player has discovered the "real game." 100+ interactions shows Lab is primary activity, not afterthought.

**Validation:**
- Telemetry: Count unique Lab interactions (breeds, evolutions, upgrades)
- Median D30 player: >= 100 Lab actions
- Tutorial: Lab emphasized as core game, not side feature

**Examples:**
- ✅ COMPLIANT: 50 breedings + 30 evolutions + 20 Lab upgrades
- ✅ COMPLIANT: Player spends 70% time managing Lab
- ❌ NON-COMPLIANT: Only 20 Lab interactions in 30 days
- ❌ NON-COMPLIANT: Lab feels optional, not central

---

## 4. Balance Constraints

### BA-001: Skill-Based Competitive Fairness
**Rule:** Competitive modes (tournaments, leaderboards) must have skill-based matchmaking or brackets to prevent pay-to-win perception.

**Rationale:** Even though paying players don't have power advantage (BM-001), PERCEPTION of fairness matters. Skill-based competition ensures new/F2P players can compete meaningfully.

**Validation:**
- Tournament brackets: Separate Gen 1-5, Gen 6-10, Gen 11+ (example)
- Leaderboard filters: Regional, friend, clan, global
- Tower Mode: Skill-based difficulty scaling, not stat checks

**Examples:**
- ✅ COMPLIANT: "Beginner Tournament" for Gen 1-3 snakes
- ✅ COMPLIANT: Friend leaderboard for social competition
- ❌ NON-COMPLIANT: Single global leaderboard dominated by Gen 50 whales
- ❌ NON-COMPLIANT: Tournaments allow any generation, creating imbalance

### BA-002: Resource Economy Balance
**Rule:** DNA and material drop rates must be tuned so:
- Classic Mode: Predictable base income (steady progress)
- Tower Mode: High-risk/high-reward (rare materials)
- Clan Wars: Bonus energy + exclusive items (social incentive)

**Rationale:** Each mode must have clear economic role. Classic is reliable income, Tower is lottery jackpot, Clans are social bonus. No mode should obsolete others.

**Validation:**
- DNA per energy spent: Classic = 100%, Tower = 80-150% (variance), Clan = 120% (bonus)
- Material rarity: Common (Classic), Rare (Tower), Exclusive (Clan)
- Player behavior: 50% Classic, 30% Tower, 20% Clan (balanced engagement)

**Examples:**
- ✅ COMPLIANT: Classic guarantees 50 DNA per run
- ✅ COMPLIANT: Tower drops Prismatic Scales (Tower-exclusive)
- ❌ NON-COMPLIANT: Tower always better than Classic (obsoletes mode)
- ❌ NON-COMPLIANT: Clan Wars give no unique incentive

### BA-003: Power Curve Tuning
**Rule:** Snake power progression must be exponential in cost but linear in output. Going from Gen 5 → Gen 10 should cost 10x resources but provide ~2x power, maintaining challenge.

**Rationale:** Exponential power creates trivial low-level content and removes challenge. Linear power with exponential cost creates satisfying long-term progression.

**Validation:**
- Gen 1 base stats: 100 HP, 10 ATK
- Gen 5 stats: 200 HP, 20 ATK (2x power)
- Gen 10 stats: 400 HP, 40 ATK (4x power)
- Resource cost: Gen 1→5 = 1,000 DNA, Gen 5→10 = 10,000 DNA (10x cost)

**Examples:**
- ✅ COMPLIANT: Gen 20 snake still finds Gen 1 content challenging
- ✅ COMPLIANT: Power scales 2x per 5 generations
- ❌ NON-COMPLIANT: Gen 10 snake one-shots all early content
- ❌ NON-COMPLIANT: Linear cost scaling makes high gens too easy to reach

### BA-004: No Inventory Management Tedium
**Rule:** Players must never face "inventory full" frustration or spend time micromanaging storage. Auto-sort, unlimited space (or effectively unlimited), and smart filters required.

**Rationale:** Inventory management is anti-fun. This is a Snake game, not a survival sim. Players should focus on breeding and playing, not organizing.

**Validation:**
- Collection: Unlimited snake storage
- Materials: High caps or auto-convert excess to currency
- Filters: Dynasty, generation, rarity sorting instant
- No trash cleanup: System handles it

**Examples:**
- ✅ COMPLIANT: 500+ snakes stored, organized by dynasty
- ✅ COMPLIANT: Excess common DNA auto-converts to premium DNA
- ❌ NON-COMPLIANT: "Snake storage full - purchase slots"
- ❌ NON-COMPLIANT: Player must manually delete snakes to make room

---

## 5. Social Constraints

### SO-001: Clan Participation Target
**Rule:** 40% of DAU must be in clans (corps) by Day 30.

**Rationale:** Social features drive retention and community bonds. 40% threshold indicates healthy social ecosystem without feeling mandatory.

**Validation:**
- Telemetry: % DAU in clans >= 40% by D30
- Clan benefits: Energy bonuses, exclusive variants (incentive)
- Solo viable: Can achieve all progression solo (not mandatory)

**Examples:**
- ✅ COMPLIANT: 42% of DAU actively participate in clan wars
- ✅ COMPLIANT: Solo players can still prestige and collect
- ❌ NON-COMPLIANT: Only 15% join clans (poor incentives)
- ❌ NON-COMPLIANT: Clans mandatory for progression (too aggressive)

### SO-002: No Daily Clan Requirements
**Rule:** Clan participation must NEVER require daily play. Players must be able to miss days without penalty or letting team down.

**Rationale:** Daily requirements create guilt, burnout, and resentment. Clans should enhance experience, not create obligations. Real life happens.

**Validation:**
- Clan war format: 48-hour asynchronous battles (can play anytime)
- Contribution: Weekly aggregate, not daily check-ins
- No punishment: Missing days doesn't hurt clan score

**Examples:**
- ✅ COMPLIANT: Clan war over 48 hours - contribute when convenient
- ✅ COMPLIANT: Weekly clan goals, not daily quests
- ❌ NON-COMPLIANT: "Daily clan donation required"
- ❌ NON-COMPLIANT: Miss a day → clan loses territory

### SO-003: Trading Economy with Corp Basis
**Rule:** If trading exists, it must be clan-based (corp marketplace) to prevent gold farming and black markets. Individual P2P trading is prohibited.

**Rationale:** Open trading creates real-money markets, bots, and economic exploitation. Corp-based trading maintains economy control while enabling social exchange.

**Validation:**
- Trading: Only within clan/corp
- Trade limits: Daily/weekly caps per player
- Exclusive items: Corp-earned, not transferable outside corp
- No cash trading: Design prevents RMT

**Examples:**
- ✅ COMPLIANT: Corp marketplace for DNA/material exchange
- ✅ COMPLIANT: Corp-exclusive dynasty earned collectively
- ❌ NON-COMPLIANT: Global auction house (bot paradise)
- ❌ NON-COMPLIANT: Player-to-player snake transfers

### SO-004: Social Discovery by Day 2-3
**Rule:** Players must encounter social features (leaderboards, clan invites, friend snakes) by Day 2-3, not hidden until late game.

**Rationale:** Early social exposure drives retention and community building. Late discovery means players already formed solo habits.

**Validation:**
- Tutorial: Friend leaderboard shown in Session 2
- Clan invites: Appear Day 2-3 after lab discovery
- Gallery: Other players' snakes visible early

**Examples:**
- ✅ COMPLIANT: "Your friend has a NEBULA snake!" shown Day 2
- ✅ COMPLIANT: Clan invite after first breeding
- ❌ NON-COMPLIANT: Clans hidden until level 20
- ❌ NON-COMPLIANT: Social features not mentioned in tutorial

---

## 6. Technical Constraints

### TE-001: Performance Targets
**Rule:** Game must maintain 60fps on mid-range mobile devices (iPhone 12, Samsung Galaxy S21 equivalent).

**Rationale:** Smooth gameplay is non-negotiable for premium experience. Performance issues signal low quality and drive uninstalls.

**Validation:**
- Frame rate: Sustained 60fps during Snake gameplay
- Load times: <3 seconds app start, <1 second mode transition
- Memory: <300MB RAM usage on target devices
- Battery: <5% drain per 30-minute session

**Examples:**
- ✅ COMPLIANT: iPhone 12 maintains 60fps in Tower Mode
- ✅ COMPLIANT: App launches in 2.5 seconds cold start
- ❌ NON-COMPLIANT: Drops to 45fps during particle effects
- ❌ NON-COMPLIANT: 5-second load between Snake and Lab

### TE-002: Offline Capability
**Rule:** Core Snake gameplay and breeding timers must function offline. Only multiplayer features (clan wars, leaderboards) require connection.

**Rationale:** Mobile players experience spotty connections. Offline play ensures uninterrupted experience and reduces frustration.

**Validation:**
- Offline mode: Can play Classic Mode without connection
- Sync: Progress syncs when connection restored
- Breeding: Timers progress offline
- Online-only: Clan wars, tournaments (acceptable)

**Examples:**
- ✅ COMPLIANT: Subway player completes 3 runs offline
- ✅ COMPLIANT: Breeding completes during flight mode
- ❌ NON-COMPLIANT: "Connection required" for solo Snake play
- ❌ NON-COMPLIANT: Breeding paused when offline

### TE-003: Cross-Platform Progression
**Rule:** Player accounts must sync across iOS, Android, and Web (if web version exists). No platform-exclusive content.

**Rationale:** Players expect to continue progress on any device. Platform lock-in creates frustration and limits growth.

**Validation:**
- Cloud save: Account syncs across platforms
- No exclusives: All content available on all platforms
- Purchase sync: Premium purchases carry across platforms

**Examples:**
- ✅ COMPLIANT: iPhone → Android tablet, all progress intact
- ✅ COMPLIANT: Starter bundle purchased on iOS works on Android
- ❌ NON-COMPLIANT: "iOS-exclusive dynasty"
- ❌ NON-COMPLIANT: Progress doesn't sync between devices

### TE-004: Scalability - 10k Concurrent Users
**Rule:** Backend infrastructure must handle 10,000 concurrent users at launch, scalable to 100k+ with standard cloud autoscaling.

**Rationale:** Viral growth can spike users overnight. Infrastructure failure during growth kills momentum.

**Validation:**
- Load test: 10k simulated concurrent users
- Autoscale: Cloud infrastructure configured for 10x surge
- Database: Sharding strategy for 1M+ player accounts
- API response: <200ms p99 latency under load

**Examples:**
- ✅ COMPLIANT: Launch day spike to 15k users, no downtime
- ✅ COMPLIANT: Leaderboard queries <150ms at 10k users
- ❌ NON-COMPLIANT: Crashes at 5k concurrent users
- ❌ NON-COMPLIANT: Clan war matchmaking times out under load

---

## 7. Content Constraints

### CO-001: Collection Size - 500+ Variants
**Rule:** Game must support 500+ snake variants across 5 rarity tiers at launch (or within 6 months post-launch).

**Rationale:** Collection depth creates long-term goals and self-expression. 500+ ensures years of content pursuit.

**Validation:**
- Variant count: >= 500 unique snakes
- Rarity tiers: Common, Uncommon, Rare, Epic, Legendary
- Dynasty distribution: 10+ dynasties with 50+ variants each

**Examples:**
- ✅ COMPLIANT: 8 dynasties × 65 variants = 520 total
- ✅ COMPLIANT: New dynasty added monthly post-launch
- ❌ NON-COMPLIANT: Only 150 variants at 6-month mark
- ❌ NON-COMPLIANT: All variants unlockable in 2 months

### CO-002: Localization - 5 Languages at Launch
**Rule:** Game text must support English, Spanish, French, German, Portuguese at minimum. UI must accommodate text expansion (Spanish +30%, German +40%).

**Rationale:** Mobile gaming is global. English-only limits addressable market by 70%. UI must not break with longer translations.

**Validation:**
- Languages: EN, ES, FR, DE, PT (minimum)
- UI: Tested with longest translations (German typically)
- String management: Centralized localization files
- Cultural: No region-specific offensive content

**Examples:**
- ✅ COMPLIANT: All game text translated, UI scales gracefully
- ✅ COMPLIANT: Dynasty names culturally neutral
- ❌ NON-COMPLIANT: English-only at launch
- ❌ NON-COMPLIANT: German text overflows UI buttons

### CO-003: Accessibility - WCAG 2.1 AA Compliance
**Rule:** Game must meet WCAG 2.1 AA standards for color contrast, text size, and screen reader support (where applicable).

**Rationale:** Accessibility is ethical imperative and legal requirement in many markets. 15% of players benefit from accessibility features.

**Validation:**
- Color contrast: 4.5:1 minimum for text
- Text size: Scalable UI, minimum 14pt
- Colorblind modes: Deuteranopia, Protanopia support
- Audio cues: Visual alternatives for sound effects

**Examples:**
- ✅ COMPLIANT: Colorblind mode changes DNA strand colors
- ✅ COMPLIANT: Text size slider in settings
- ❌ NON-COMPLIANT: Red/green indicators only (colorblind issue)
- ❌ NON-COMPLIANT: Critical info conveyed by sound only

### CO-004: Monthly Content Drops
**Rule:** Post-launch, new content (dynasties, events, modes) must be added monthly to maintain engagement.

**Rationale:** Live service games require fresh content to retain players. Monthly cadence balances development load with player expectations.

**Validation:**
- Content calendar: 12 months planned at launch
- Dynasty release: 1 new dynasty per month minimum
- Events: 2-4 limited-time events monthly
- Modes: 1 new mode or variant every quarter

**Examples:**
- ✅ COMPLIANT: December: FROST dynasty + holiday event
- ✅ COMPLIANT: Q1: Tower Mode hard variant unlocked
- ❌ NON-COMPLIANT: No new content for 3 months post-launch
- ❌ NON-COMPLIANT: Events are just re-skins, no new mechanics

---

## Constraint Dependencies

### Dependency Map

**Business Model → Balance**
- BM-001 (No P2W) REQUIRES BA-001 (Skill-based competition)
- BM-001 (No P2W) REQUIRES BA-003 (Linear power curve)

**Engagement → Progression**
- CE-001 (70/30 time split) REQUIRES PR-005 (Lab investment)
- CE-002 (3+ sessions) REQUIRES CE-005 (Energy system)

**Progression → Social**
- PR-003 (Collection depth) ENABLES SO-004 (Social discovery)
- PR-001 (Infinite progression) REQUIRES SO-001 (Clan participation)

**Technical → All Categories**
- TE-001 (Performance) ENABLES CE-003 (Session length)
- TE-002 (Offline play) SUPPORTS CE-002 (Session frequency)

**Content → Progression**
- CO-001 (500+ variants) SUPPORTS PR-001 (Infinite progression)
- CO-004 (Monthly drops) MAINTAINS PR-001 (Infinite progression)

### Critical Paths

**Monetization Integrity:**
BM-001 → BA-001 → SO-003
(No P2W → Skill brackets → Corp trading only)

**Engagement Funnel:**
CE-001 → PR-005 → SO-001 → CE-004
(Lab time → Lab investment → Clans → Retention)

**Content Flywheel:**
CO-001 → PR-001 → CO-004 → PR-003
(Large collection → Infinite progression → Monthly drops → Collection depth)

---

## Validation Checklist

Use this checklist before shipping ANY feature:

### Business Model Validation
- [ ] Can F2P player achieve same outcome as payer? (BM-001)
- [ ] Are ads purely opt-in for bonuses? (BM-002)
- [ ] Core loop fully functional without purchase? (BM-003)
- [ ] First purchase offer delayed until engagement? (BM-004)

### Engagement Validation
- [ ] Does feature support 70% Lab / 30% Snake split? (CE-001)
- [ ] Does feature encourage 3+ daily sessions? (CE-002)
- [ ] Average session length 15+ minutes? (CE-003)
- [ ] Feature improves or maintains retention targets? (CE-004)
- [ ] Energy system has free refill + clan bonuses? (CE-005)

### Progression Validation
- [ ] Does feature support infinite progression? (PR-001)
- [ ] Prestige grants permanent bonuses? (PR-002)
- [ ] Does feature help reach 20+ variants by D30? (PR-003)
- [ ] Does feature help reach Gen 5+ by D30? (PR-004)
- [ ] Does feature drive 100+ Lab interactions by D30? (PR-005)

### Balance Validation
- [ ] Competitive modes skill-based? (BA-001)
- [ ] Resource economy balanced across modes? (BA-002)
- [ ] Power curve exponential cost, linear output? (BA-003)
- [ ] No inventory management tedium? (BA-004)

### Social Validation
- [ ] Does feature support 40% clan participation? (SO-001)
- [ ] No daily clan requirements? (SO-002)
- [ ] Trading corp-based, not P2P? (SO-003)
- [ ] Social features discoverable Day 2-3? (SO-004)

### Technical Validation
- [ ] 60fps on mid-range devices? (TE-001)
- [ ] Core gameplay works offline? (TE-002)
- [ ] Cross-platform sync working? (TE-003)
- [ ] Load tested for 10k concurrent users? (TE-004)

### Content Validation
- [ ] Feature scales to 500+ variant collection? (CO-001)
- [ ] Localized for 5 languages? (CO-002)
- [ ] WCAG 2.1 AA accessible? (CO-003)
- [ ] Supports monthly content cadence? (CO-004)

---

## Usage Guidelines

### For Designers
Before designing a feature:
1. Read relevant constraint categories
2. Identify which constraints apply
3. Design within constraints
4. If constraint seems wrong → escalate, don't break it

### For Engineers
During implementation:
1. Check technical constraints (Section 6)
2. Validate performance targets
3. Run validation checklist before PR
4. If constraint impossible → escalate immediately

### For Product Managers
When evaluating features:
1. Run full validation checklist
2. Identify constraint conflicts early
3. Use constraints to settle design debates
4. Update constraints only with team consensus

### For QA
During testing:
1. Use validation checklist as test cases
2. Verify constraint compliance in each build
3. Flag violations as critical bugs
4. Regression test constraint compliance

### Constraint Evolution
Constraints can change, but require:
1. Written proposal with rationale
2. Team review and consensus
3. Impact analysis on existing features
4. Update to this document with version bump

**Principle:** Constraints should be stable. Frequent changes indicate poor initial design.

---

## Appendix A: Constraint Severity Classification

**Purpose:** For Feature Impact Assessments, constraints are classified by severity to guide Go/No-Go decisions.

### Severity Definitions

| Severity | Meaning | Action if Violated |
|----------|---------|-------------------|
| **HARD** | Cannot ship if violated | Block feature, no exceptions |
| **SOFT** | Needs justification | Document mitigation, get approval |
| **WATCH** | Monitor in testing | Track metrics, iterate post-launch |

### Classification by Constraint

#### HARD Constraints (Violation = Cannot Ship)

**Business Model:**
- BM-001: Pay for Convenience, Not Power
- BM-002: No Forced Ad Viewing
- BM-003: No Paywalling Basic Features

**Technical:**
- TE-001: 60fps on Mid-Range Devices
- TE-002: Offline Capability
- TE-003: Cross-Platform Progression
- TE-004: 10k Concurrent Users

#### SOFT Constraints (Violation = Needs Justification)

**Core Engagement:**
- CE-001: 70/30 Lab/Snake Time Split
- CE-002: 3+ Sessions Daily
- CE-003: 15+ Min Session Length
- CE-004: Retention Targets (D1/D7/D30)
- CE-005: Energy as Engagement Gate

**Progression:**
- PR-001: Infinite Progression
- PR-002: Prestige with Permanent Bonuses
- PR-003: 20+ Variants by D30 (adjusted for v0.1: 5 variants)
- PR-004: Gen 5+ by D30
- PR-005: 100+ Lab Interactions by D30

**Balance:**
- BA-001: Skill-Based Competitive Fairness
- BA-002: Resource Economy Balance
- BA-003: Exponential Cost, Linear Power
- BA-004: No Inventory Management Tedium

**Business Model:**
- BM-004: Starter Bundle Timing

#### WATCH Constraints (v0.1 Flexible - Track for v0.2)

**Social:**
- SO-001: 40% Clan Participation by D30
- SO-002: No Daily Clan Requirements
- SO-003: Corp-Based Trading Only
- SO-004: Social Discovery Day 2-3

**Content:**
- CO-001: 500+ Variants (v0.1: 5 variants)
- CO-002: 5 Languages at Launch (v0.1: English only)
- CO-003: WCAG 2.1 AA Accessibility (v0.1: Best effort)
- CO-004: Monthly Content Drops (Post-launch)

### Using Severity in Feature Assessments

1. Complete Feature Impact Template (state/plan_templates/feature_impact_template.md)
2. Mark affected constraints with severity level
3. Decision rules:
   - **Any HARD violation** → NO-GO (fix before proceeding)
   - **SOFT violations** → GO WITH CONDITIONS (document mitigation)
   - **WATCH items** → GO (monitor in testing)

---

## Conclusion

The Constraint Lattice defines what SupaSnake IS and ISN'T. These 28 constraints create the boundaries within which infinite creativity thrives.

**Key Insights:**
- Business constraints protect player trust (fair monetization)
- Engagement constraints create habit formation (Lab-first design)
- Progression constraints enable endless pursuit (infinite collection)
- Balance constraints maintain fairness (skill > stats)
- Social constraints build community (40% clan participation)
- Technical constraints ensure quality (60fps, offline play)
- Content constraints sustain longevity (500+ variants, monthly drops)

**The Lattice Philosophy:**
Freedom exists within structure. By defining what we WON'T do, we clarify what we CAN do. These constraints aren't limitations - they're the foundation of our competitive advantage.

Every successful game has constraints. The difference is that we've made ours explicit.

---

**Document Status:** ACTIVE
**Version:** 1.0
**Next Review:** After MVP launch + 3 months
**Owner:** Design Lead + Product Lead

**Questions?** If any constraint seems unclear, contradictory, or limiting in unexpected ways, raise it immediately. This document succeeds only if it's crystal clear to the entire team.

**Remember:** Constraints enable creativity. Work within them, and SupaSnake will be extraordinary.
