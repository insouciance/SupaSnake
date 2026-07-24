# SupaSnake AAA - Production Roadmap
## Vision → Reality: 36-Month Journey to $300M Franchise

> **Document role:** aspirational business and franchise planning. This is not
> the current shipped-scope, production-status, QA, legal, or release source of
> truth. Use `docs/README.md` to reach the authoritative product and operations
> documents.

**Document Version:** 1.0
**Created:** 2025-10-19
**Status:** Production Blueprint
**Horizon:** MVP (Month 3) → Global Launch (Month 12) → Franchise (Month 36)

---

## Executive Summary

This roadmap transforms SupaSnake from concept to $300M franchise value over 36 months with controlled investment of $2.96M, achieving 101× return on investment.

**Key Milestones:**
- **Month 3:** MVP validation (30% D1, 12% D7 retention)
- **Month 6:** Pre-launch beta (20% conversion, $3 ARPPU)
- **Month 12:** Global launch (1M MAU, $15M ARR)
- **Month 24:** Esports expansion (1.5M MAU, $35M ARR)
- **Month 36:** Franchise maturity (2.5M MAU, $60M ARR, $300M valuation)

**Investment Efficiency:**
- Year 1: $497k → $15M ARR (2,920% ROI)
- Year 2: $1.09M → $35M ARR (3,119% ROI)
- Year 3: $1.37M → $60M ARR (4,277% ROI)
- Cumulative: $2.96M → $110M revenue ($107M profit)

---

## 1. Version Milestones

### v0.1 MVP (Month 0-3): Retention Validation

**Timeline:** 3 months (Sprints 1-6)
**Goal:** Validate core loop retention before investing in content
**Launch:** Soft launch to 10,000 users (TestFlight + Google Play Beta)

**Scope:**

**Core Snake Gameplay:**
- 60fps physics engine (React Native + Three.js)
- 4 win conditions: DNA Collector, Survival, Score Attack, Perfect Run
- DNA wagering: 1× Normal, 2× Bold, 3× All-In
- Single-player only (no PvP, no guilds)

**Content:**
- 3 starter dynasties: CYBER, PRIMAL, COSMIC
- 81 total variants (27 per dynasty)
- Generation 1-10 breeding only (no evolution, no ascension)
- Basic gacha-free breeding (deterministic outcomes, no pity system)

**UI/UX:**
- Minimal functional UI (breeding lab, variant collection, game screen)
- No polish (placeholder art OK, focus on mechanics)
- No animations (static hatch reveals, instant breeding)

**Monetization:**
- NONE (F2P only for MVP validation)
- Track hypothetical conversion: "Would you pay $4.99?" survey at Day 7

**Success Criteria:**
- 30% D1 retention (Day 1 return rate)
- 12% D7 retention (Day 7 return rate)
- Average session: 15 minutes
- 3+ sessions per DAU (Daily Active User)
- NPS >40 (good product-market fit)

**Budget:** $124k
- Game Designer: $30k (3 months × $10k/month)
- Engineer: $35k (3 months × $11.7k/month)
- Community Manager: $10k (3 months × $3.3k/month part-time)
- QA: $8k (contract)
- AI Agents: $40k (81 variants × $500 placeholder art)
- Audio: $1k (CYBER dynasty theme + 50 SFX via Fiverr)

---

### v0.5 Pre-Launch (Month 3-6): Monetization Validation

**Timeline:** 3 months (Sprints 7-12)
**Goal:** Validate monetization metrics before global launch
**Launch:** Beta to 50,000 users (expanded TestFlight + Play Store Early Access)

**Added Features:**

**Fair Gacha Breeding:**
- Pity system (guaranteed epic at 10 hatches, legendary at 50)
- Transparent odds (display percentages on breed button)
- Visual rarity tiers (common, rare, epic, legendary with animated reveals)

**Battle Pass (Season 1):**
- $4.99 price point (28-day season)
- 30 tiers: DNA, breeding tickets, exclusive variant skins
- Free track (50% of rewards) + Premium track (100% of rewards)
- Instant unlock Tier 1-5 on purchase (gratification)

**Competitive Ladder:**
- Ranked modes: Bronze → Silver → Gold (no Diamond/Infinite yet)
- Weekly decay: Lose 10% rank if no games played
- Season rewards: Exclusive variants for Gold+ finishers

**Guild System (Basic):**
- Create/join guilds (50 members max)
- Guild chat only (no wars, no guild events yet)
- Shared guild DNA pool (1% of all member earnings)

**4th Dynasty:**
- VOID dynasty (27 variants, shadow/ethereal theme)
- Brings total to 108 variants (4 dynasties × 27 variants)
- Unique mechanics: Stealth snake (invisible for 1 second every 5 seconds)

**UI/UX Polish:**
- AAA UI overhaul (Figma designs → React Native implementation)
- Hatch animations (3-second egg-crack reveal with dynasty-specific VFX)
- Breeding lab upgrade (drag-and-drop parents, predicted offspring preview)

**Success Criteria:**
- 20% conversion rate (users who pay within 30 days)
- $3 ARPPU (Average Revenue Per Paying User)
- 15% D7 retention (maintain from MVP)
- 8% D30 retention (new metric)
- NPS >45

**Budget:** $155k
- Team: $90k (Designer $30k, Engineer $35k, CM $25k full-time from Month 4)
- QA: $8k
- AI Agents: $15k (27 VOID variants × $550 improved art quality)
- Audio: $3k (VOID dynasty theme + 30 SFX)
- Infrastructure: $2k (Supabase Pro, increased load testing)
- Marketing: $37k (App Store Optimization, influencer seeding)

---

### v1.0 Global Launch (Month 6-12): Scale to 1M MAU

**Timeline:** 6 months (Sprints 13-26)
**Goal:** Achieve product-market fit at scale, validate $15M ARR
**Launch:** Global release (App Store + Play Store, all regions)

**Added Features:**

**Guild Wars:**
- Weekly 96-hour events (Friday-Monday)
- 50v50 guild battles: Combined DNA earnings across all members
- Top 10 guilds: Exclusive legendary variants
- Guild leaderboard (global ranking)

**Full Competitive Ladder:**
- Add Diamond rank (top 5% of Gold players)
- Add Infinite rank (top 100 global players)
- Seasonal rewards expanded: Legendary variants for Diamond+
- MMR matchmaking (Elo-based, ±100 rating matching)

**Evolution System:**
- Stage 1-3 visual/stat upgrades for variants
- Costs: 1,000 DNA (Stage 1), 5,000 DNA (Stage 2), 25,000 DNA (Stage 3)
- Unlock at Gen 10 (prevents early-game dilution)

**Ascension Mechanics:**
- Gen 50 → Ascension 1 (reset to Gen 1 but keep 10% stat bonus)
- Max Ascension 5 (50% total stat bonus)
- Prestige cosmetics (glowing aura, animated nameplates)

**Dynasties 5-6:**
- INFERNO dynasty (27 variants, fire/lava theme)
- ABYSS dynasty (27 variants, deep-sea/Lovecraftian theme)
- Total: 162 variants (6 dynasties × 27 variants)
- Each with unique mechanics (INFERNO = speed boost on kill, ABYSS = HP regeneration)

**AAA Polish:**
- Dynasty-specific audio (6 themes, 300 total SFX)
- Full hatch animation suite (3-second eggs, 5-second legendary reveals)
- Particle effects (trail VFX for all 162 variants)
- Haptic feedback (vibration on DNA collect, hatch reveal, death)

**Live Ops:**
- Weekly events: Double DNA weekends, limited-time variants
- Seasonal content: Halloween (UMBRA variants), Winter (FROST variants)
- Daily challenges: 3 per day, rewards DNA + breeding tickets

**Success Criteria:**
- 1M MAU (Monthly Active Users)
- $15M ARR (Annual Recurring Revenue)
- 40% D1 retention
- 20% D7 retention
- 10% D30 retention
- 25% conversion rate (Supercell benchmark)
- $5.20 ARPPU
- NPS >50 (world-class)

**Budget:** $218k (remaining Year 1 budget after MVP + Pre-Launch)
- Team: $120k (Designer $40k, Engineer $47k, CM $33k)
- QA: $15k (expanded device testing)
- AI Agents: $35k (54 variants INFERNO/ABYSS × $650 high-quality art)
- Audio: $6k (2 dynasty themes + 100 SFX)
- Infrastructure: $10k (Supabase scaling, CDN for assets)
- Marketing: $32k (paid UA starts Month 10, $10k/month)

**Year 1 Total Budget:** $497k ($124k MVP + $155k Pre-Launch + $218k Launch)

---

### v2.0 Esports Expansion (Month 12-24): Legitimize Competitive Scene

**Timeline:** 12 months (Sprints 27-52)
**Goal:** Establish SupaSnake as esports-viable, grow to 1.5M MAU
**Launch:** Rolling feature releases (quarterly major updates)

**Added Features:**

**Esports Infrastructure:**
- Spectator mode (watch top-ranked games live)
- Replay system (download/share any game, scrubbing controls)
- Tournament bracket UI (single/double elimination, Swiss rounds)
- Match history (detailed stats: DNA/min, accuracy %, variant performance)

**Tournament System:**
- Weekly $5k tournaments (64-player single elimination, 2-hour Saturday events)
- Monthly $25k championships (256 players, Swiss → Top 8 bracket)
- Qualifier system (Bronze+ can enter, MMR seeding)
- Prize distribution: 1st = 40%, 2nd = 25%, 3rd-4th = 12.5%, 5th-8th = 2.5%

**Dynasties 7-8:**
- RADIANT dynasty (27 variants, holy/angelic theme)
- UMBRA dynasty (27 variants, shadow/nightmare theme)
- Total: 216 variants (8 dynasties × 27 variants)
- Unique mechanics: RADIANT = shield on DNA collect, UMBRA = teleport dash

**Transmedia Expansion:**
- Animated web series: 6 episodes × 8 minutes (YouTube/TikTok)
- Dynasty origin stories (lore-building, character development)
- Produced via AI + freelance animators ($50k total)

**Pro League Beta:**
- 16 sponsored teams (8 NA, 8 EU)
- $100k total prize pool (season-long, monthly distributions)
- Team branding (custom guild banners, player jerseys)
- Twitch integration (drops for watching pro matches)

**Enhanced Live Ops:**
- Bi-weekly content updates (new variants, balance patches)
- Seasonal battle passes (8 seasons/year, $4.99 each)
- Limited-time game modes (2v2 team Snake, survival gauntlet)

**Success Criteria:**
- 1.5M MAU
- $35M ARR
- 100k+ concurrent tournament viewers (monthly championship)
- 500+ Twitch streamers (>1k followers each)
- 15% of players watch esports content monthly
- NPS >55

**Budget:** $1.09M (Year 2 total)
- Team: $600k (Designer $120k, Engineers $280k [2×], CMs $160k [2×], QA $40k)
- AI Agents: $65k (54 variants RADIANT/UMBRA + weekly content)
- Audio: $5k (2 dynasty themes + 100 SFX)
- Infrastructure: $50k (Supabase Enterprise, video streaming CDN)
- Esports: $150k ($100k prize pool + $50k production/casting)
- Transmedia: $50k (animated series)
- Marketing: $120k ($10k/month paid UA)
- Customer Support: $60k (part-time team, Discord/email)

---

### v3.0 Franchise Maturity (Month 24-36): $300M Valuation

**Timeline:** 12 months (Sprints 53-78)
**Goal:** Position for acquisition at $300M valuation (5× ARR multiple)
**Launch:** Platform expansion (PC/Console cross-play)

**Added Features:**

**Full Pro League:**
- 32 teams (16 NA, 16 EU, expanding to APAC/LATAM)
- $400k annual prize pool (monthly leagues + finals)
- Team franchising (permanent slots, $50k buy-in)
- Player salaries (top teams pay $30-50k/year per player)

**World Championship:**
- Annual event (December, Las Vegas convention center)
- $250k prize pool (1st = $100k)
- 500k+ live viewers target (Twitch/YouTube)
- In-person attendance (2,000-seat venue)
- Broadcast production (professional casting, instant replays, AR overlays)

**Dynasties 9-10:**
- NEXUS dynasty (27 variants, cyberpunk/Matrix theme)
- PRIME dynasty (27 variants, godlike/transcendent theme)
- Total: 270 variants (10 dynasties × 27 variants)
- Capstone mechanics: NEXUS = time slow (bullet time), PRIME = invincibility frames

**Platform Expansion:**
- PC release (Steam, Epic Games Store)
- Console ports (Nintendo Switch, Xbox, PlayStation)
- Cross-platform play (mobile vs PC with input balancing)
- Controller support (gamepad optimization)

**Multilingual Expansion:**
- Voice acting: 6 languages (EN, ES, FR, DE, JA, ZH)
- UI localization: 12 languages
- Regional servers (NA, EU, APAC latency optimization)

**Enhanced Transmedia:**
- Animated series Season 2 (6 more episodes)
- Mobile game soundtrack album (Spotify/Apple Music)
- Physical merchandise (plushies, apparel via Print-on-Demand)
- Comic book series (dynasty backstories, 4-issue runs)

**Success Criteria:**
- 2.5M MAU
- $60M ARR
- 500k+ World Championship viewers
- Top 50 grossing (USA App Store)
- 100M+ lifetime downloads
- NPS >60
- Acquisition offers >$250M

**Budget:** $1.37M (Year 3 total)
- Team: $870k (Designers $260k [2×], Engineers $430k [3×], CMs $160k [2×], QA $20k)
- AI Agents: $65k (54 variants NEXUS/PRIME + weekly content)
- Audio: $12k (2 dynasty themes + voice acting samples)
- Infrastructure: $100k (multi-region servers, console platform fees)
- Esports: $500k ($400k prize pool + $100k World Championship production)
- Transmedia: $80k (Season 2 animation + comics)
- Marketing: $180k ($15k/month paid UA)
- Customer Support: $330k (full-time 5-person team)
- Platform Ports: $200k (PC/console development contracts)

**3-Year Cumulative Budget:** $2.96M ($497k Y1 + $1.09M Y2 + $1.37M Y3)

---

## 2. Sprint Breakdown (First 12 Months, 26 Sprints)

### Month 0-3: MVP Development (Sprints 1-6)

#### Sprint 1 (Weeks 1-2): Core Snake Engine

**Goals:**
- 60fps Snake gameplay on iOS/Android
- 4 win conditions functional
- DNA collection mechanics

**AI Agent Tasks:**
- None (prototype phase, engineer builds from scratch)

**Human Tasks:**
- **Engineer:** Build React Native + Three.js Snake engine
  - Physics: Collision detection, snake growth, boundary wrapping
  - Camera: Isometric view, smooth following
  - Input: Touch controls (virtual joystick)
  - Performance: 60fps budget, particle limit (500 max)
- **Designer:** Define 4 win condition rules
  - DNA Collector: Collect 1,000 DNA before death
  - Survival: Survive 3 minutes
  - Score Attack: Highest score in 2 minutes
  - Perfect Run: Collect 500 DNA without hitting walls (0 collisions)
- **Designer:** Tune DNA spawn rates, collection radius

**Success Criteria:**
- 60fps on iPhone 11 / Galaxy S10 (mid-range devices)
- All 4 win conditions triggering correctly
- DNA collection feels satisfying (haptic feedback, particle burst)

**Deliverables:**
- Playable Snake prototype (TestFlight build)
- Design doc: Win condition tuning notes

---

#### Sprint 2 (Weeks 3-4): Snake Polish + DNA Wagering

**Goals:**
- Add DNA wagering system (1×, 2×, 3×)
- Polish Snake feel (haptics, particles, juice)
- Basic UI (game screen, post-game results)

**AI Agent Tasks:**
- **Audio Agent (Fiverr):** Generate CYBER dynasty theme music
  - Budget: $500 (1× 2-minute loop, electronic/synthwave style)
- **Audio Agent (Fiverr):** Generate 50 CYBER SFX
  - Budget: $500 (DNA collect, death, UI clicks, hatch reveal)

**Human Tasks:**
- **Engineer:** Implement wagering system
  - Pre-game screen: Choose 1× Normal / 2× Bold / 3× All-In
  - Post-game: Multiply DNA earned by wager multiplier
  - Loss penalty: Lose wagered DNA from wallet
- **Engineer:** Integrate audio (theme music loop, SFX triggers)
- **Engineer:** Add particle effects (DNA collect burst, death explosion)
- **Engineer:** Haptic feedback (vibrate on DNA collect, death, win)
- **Designer:** Tune wagering risk/reward (balance DNA economy)

**Success Criteria:**
- Wagering feels high-stakes (3× All-In is thrilling but risky)
- Audio enhances immersion (music loops seamlessly)
- Haptics feel satisfying (not excessive)

**Deliverables:**
- Polished Snake build (TestFlight update)
- Audio assets integrated (50 SFX, 1 theme)

---

#### Sprint 3 (Weeks 5-6): Breeding System Foundation

**Goals:**
- Build breeding lab UI (select 2 parents → hatch offspring)
- Implement deterministic genetics (no gacha yet, simple traits)
- Basic variant storage (collection screen)

**AI Agent Tasks:**
- **Art Agent (Midjourney):** Generate 27 CYBER variants
  - Budget: $13.5k (27 × $500 per variant)
  - Prompt: "Cyberpunk snake, neon circuits, holographic scales, [common/rare/epic/legendary] rarity"
  - Output: 1024×1024 PNGs (head sprite, body segment sprite)

**Human Tasks:**
- **Engineer:** Build breeding lab UI
  - Parent selection: Tap 2 variants from collection
  - Breeding cost: 100 DNA per breed
  - Hatch button: Instant reveal (no animation yet)
- **Engineer:** Implement genetics system
  - Trait inheritance: 50% Parent A, 50% Parent B
  - Rarity tiers: Common (60%), Rare (30%), Epic (9%), Legendary (1%)
  - Generation tracking: Gen 1 (starters) → Gen 10 (max for MVP)
- **Engineer:** Build collection screen (grid view, filters by dynasty/rarity)
- **Designer:** Define 27 CYBER variant traits (speed, size, special abilities)

**Success Criteria:**
- Breeding produces expected offspring (traits from parents)
- Collection screen displays all owned variants
- Variant art looks AAA-quality (Midjourney output)

**Deliverables:**
- Breeding lab functional (TestFlight)
- 27 CYBER variants in-game
- Design doc: Genetics rules, trait matrix

---

#### Sprint 4 (Weeks 7-8): PRIMAL Dynasty + Starter Flow

**Goals:**
- Add 27 PRIMAL variants
- Implement new player flow (choose 1 of 3 starter variants)
- Tutorial: Teach breeding, wagering, win conditions

**AI Agent Tasks:**
- **Art Agent (Midjourney):** Generate 27 PRIMAL variants
  - Budget: $13.5k (27 × $500)
  - Prompt: "Prehistoric snake, dinosaur scales, jungle camouflage, bone armor, [rarity]"

**Human Tasks:**
- **Engineer:** Build new player flow
  - Splash screen → Choose dynasty (CYBER or PRIMAL)
  - Choose starter: 1 of 3 common variants (fixed options)
  - Tutorial: Play 1 DNA Collector game (guided, can't lose)
- **Engineer:** Add PRIMAL variants to breeding/collection systems
- **Designer:** Design tutorial script (5 steps, <2 minutes)
  - Step 1: Collect DNA (arrow points to DNA orb)
  - Step 2: Complete win condition
  - Step 3: Breed your starter with itself (Gen 2 offspring)
  - Step 4: Play with Gen 2 offspring
  - Step 5: Tutorial complete, unlock full game

**Success Criteria:**
- New players understand core loop within 5 minutes
- 90%+ tutorial completion rate (very few drop off)
- PRIMAL variants feel distinct from CYBER (different art style)

**Deliverables:**
- 27 PRIMAL variants in-game
- Tutorial functional
- New player flow complete

---

#### Sprint 5 (Weeks 9-10): COSMIC Dynasty + Gen 1-10 Breeding

**Goals:**
- Add 27 COSMIC variants (completes 81 total for MVP)
- Implement Gen 1-10 breeding progression
- Add breeding costs (scales with generation)

**AI Agent Tasks:**
- **Art Agent (Midjourney):** Generate 27 COSMIC variants
  - Budget: $13.5k (27 × $500)
  - Prompt: "Cosmic snake, galaxy scales, nebula patterns, star dust trail, [rarity]"

**Human Tasks:**
- **Engineer:** Implement generation progression
  - Gen 1-10 tracking (display on variant card)
  - Breeding cost formula: 100 × Gen^1.5 DNA
    - Gen 1: 100 DNA
    - Gen 5: 1,118 DNA
    - Gen 10: 3,162 DNA
  - Max Gen 10 for MVP (unlock higher gens in v0.5)
- **Engineer:** Add COSMIC variants to systems
- **Designer:** Balance DNA economy (earning rates vs breeding costs)
  - Average game: 500 DNA earned (DNA Collector win)
  - Casual player: 5 games/day = 2,500 DNA/day
  - Can afford 1-2 breeds/day (Gen 5-7 range)

**Success Criteria:**
- 81 total variants in game (3 dynasties × 27 variants)
- Breeding feels rewarding but not trivial (scarcity maintained)
- Gen 10 feels like achievement (unlock after ~5 days for active players)

**Deliverables:**
- 27 COSMIC variants in-game
- Gen 1-10 breeding functional
- Economy tuning doc (DNA earning/spending rates)

---

#### Sprint 6 (Weeks 11-12): MVP Polish + Soft Launch

**Goals:**
- Bug fixes, performance optimization
- Soft launch to 10,000 TestFlight/Play Store Beta users
- Implement analytics (track retention, session length, DNA earning)

**AI Agent Tasks:**
- None (polish phase)

**Human Tasks:**
- **Engineer:** Bug fixing (crash fixes, edge cases)
- **Engineer:** Performance optimization
  - Reduce memory usage (lazy load variant sprites)
  - Optimize particle system (pool particles, max 500 on-screen)
  - Frame rate stability (60fps on 95% of devices)
- **Engineer:** Integrate analytics (Firebase/Amplitude)
  - Track: D1/D7 retention, session length, DNA earned, breeds/day
- **Community Manager:** Recruit beta testers
  - 10,000 users via /r/AndroidGaming, /r/iOSGaming, Discord servers
  - Survey at Day 7: "Would you pay $4.99 for premium content?"
- **QA:** Device testing (20 devices, iOS 14-17, Android 10-14)

**Success Criteria:**
- 30% D1 retention (3,000 of 10,000 return Day 1)
- 12% D7 retention (1,200 of 10,000 return Day 7)
- Average session: 15 minutes
- 60%+ would pay $4.99 (indicates monetization readiness)
- <1% crash rate

**Deliverables:**
- Soft launch live (TestFlight + Play Store Beta)
- Analytics dashboard (track KPIs daily)
- Retention report (share with team/investors)

**Go/No-Go Decision (End of Sprint 6):**
- **GO if:** D1 ≥30%, D7 ≥12%, NPS ≥40 → Proceed to v0.5 (monetization)
- **NO-GO if:** D1 <30% or D7 <12% → Iterate core loop, extend MVP phase

---

### Month 3-6: Pre-Launch Beta (Sprints 7-12)

#### Sprint 7 (Weeks 13-14): Fair Gacha Foundation

**Goals:**
- Implement gacha breeding (random rarity outcomes)
- Add pity system (guaranteed epic at 10, legendary at 50)
- Display odds transparently (comply with App Store guidelines)

**AI Agent Tasks:**
- None (systems engineering sprint)

**Human Tasks:**
- **Engineer:** Build gacha breeding system
  - Random rarity roll (weighted probabilities)
    - Common: 60%
    - Rare: 30%
    - Epic: 9%
    - Legendary: 1%
  - Pity counter: Track breeds since last epic/legendary
    - 10 breeds without epic → next breed guaranteed epic
    - 50 breeds without legendary → next breed guaranteed legendary
  - Reset counter on epic/legendary hatch
- **Engineer:** Display odds on breed button
  - UI: "60% Common, 30% Rare, 9% Epic, 1% Legendary"
  - Pity status: "8/10 breeds until guaranteed Epic"
- **Designer:** Tune pity system (balance generosity vs monetization)

**Success Criteria:**
- Gacha feels fair (pity system prevents bad luck streaks)
- Odds transparency builds trust (no hidden mechanics)
- Players understand pity system (tooltips, tutorial)

**Deliverables:**
- Gacha breeding functional
- Pity system tested (simulate 10,000 breeds, verify guarantees)

---

#### Sprint 8 (Weeks 15-16): Battle Pass Season 1

**Goals:**
- Implement battle pass system (30 tiers, free + premium tracks)
- $4.99 IAP (in-app purchase)
- Season 1 rewards (DNA, breeding tickets, exclusive skins)

**AI Agent Tasks:**
- **Copywriting Agent (GPT-4):** Generate battle pass reward descriptions
  - Budget: $50 (30 tier descriptions × $1.50 each)
  - Example: "Tier 5: Unlock CYBER Neon Viper skin - Electric blue scales with pulsing circuit patterns"

**Human Tasks:**
- **Engineer:** Build battle pass UI
  - 30-tier progress bar (XP-based, earn XP per game)
  - Free track: Tiers 1, 3, 5, 7... (odd tiers, 15 total rewards)
  - Premium track: All 30 tiers (unlock with $4.99 purchase)
  - Instant unlock Tiers 1-5 on purchase (gratification)
- **Engineer:** Implement IAP (StoreKit for iOS, Google Play Billing for Android)
  - Product ID: "battle_pass_season_1"
  - Price: $4.99 USD (localized pricing)
  - Receipt validation (server-side, prevent fraud)
- **Designer:** Design 30 tier rewards
  - Tiers 1-10: DNA (500-2,000 per tier)
  - Tiers 11-20: Breeding tickets (skip breeding cost)
  - Tiers 21-30: Exclusive skins (CYBER Neon Viper, PRIMAL Bone Crusher, COSMIC Stardust)
- **Community Manager:** Announce Season 1 (Discord, social media)

**Success Criteria:**
- 20% conversion rate (2,000 of 10,000 beta users buy battle pass)
- $3 ARPPU (Average Revenue Per Paying User = $4.99 × 20% × safety margin)
- 80%+ premium users reach Tier 30 (indicates good XP pacing)

**Deliverables:**
- Battle pass live in beta
- IAP functional (test purchases verified)
- Season 1 rewards spreadsheet

---

#### Sprint 9 (Weeks 17-18): Ranked Ladder (Bronze-Gold)

**Goals:**
- Add ranked modes (Bronze → Silver → Gold)
- MMR matchmaking (Elo-based)
- Weekly decay (10% rank loss if inactive)

**AI Agent Tasks:**
- None (systems sprint)

**Human Tasks:**
- **Engineer:** Build ranked ladder system
  - 3 ranks: Bronze (0-999 MMR), Silver (1000-1999 MMR), Gold (2000+ MMR)
  - MMR calculation: Elo formula (±25 per win/loss)
  - Matchmaking: ±100 MMR range (Bronze 500 can match Bronze 400-600)
- **Engineer:** Weekly decay system
  - If 0 ranked games in 7 days → lose 10% MMR
  - Notification: "Play ranked to avoid decay!"
- **Engineer:** Ranked rewards (end-of-season)
  - Bronze: 1,000 DNA
  - Silver: 3,000 DNA + rare variant
  - Gold: 10,000 DNA + epic variant
- **Designer:** Balance MMR matchmaking (queue times vs fair matches)

**Success Criteria:**
- 30%+ of players try ranked mode
- Average queue time <30 seconds (enough players at all ranks)
- MMR distribution: 50% Bronze, 35% Silver, 15% Gold (healthy pyramid)

**Deliverables:**
- Ranked ladder live
- MMR tracking functional
- Season 1 ranked rewards configured

---

#### Sprint 10 (Weeks 19-20): Guild System (Basic)

**Goals:**
- Create/join guilds (50 members max)
- Guild chat (text-based, moderation tools)
- Shared guild DNA pool (1% of member earnings)

**AI Agent Tasks:**
- None (social features sprint)

**Human Tasks:**
- **Engineer:** Build guild system
  - Create guild: Name, icon (choose from 20 presets), description
  - Join guild: Search by name, join request, guild leader approves
  - Guild roster: View 50 members, kick/promote members
- **Engineer:** Guild chat (real-time messaging via Supabase Realtime)
  - Text messages only (no images/links to avoid moderation cost)
  - Profanity filter (basic word blacklist)
  - Report button (flags messages for manual review)
- **Engineer:** Shared DNA pool
  - 1% of all member DNA earnings → guild bank
  - Guild leader can distribute DNA to members (rewards active players)
- **Designer:** Design guild progression (future: guild wars unlock at Guild Level 5)

**Success Criteria:**
- 50%+ of players join a guild
- 20%+ of guilds have 10+ active members (healthy guild density)
- Guild chat has 100+ messages/day (engagement indicator)

**Deliverables:**
- Guild system live
- Guild chat functional
- DNA pool tracking

---

#### Sprint 11 (Weeks 21-22): VOID Dynasty + UI Overhaul

**Goals:**
- Add 27 VOID variants (shadow/ethereal theme)
- AAA UI redesign (Figma → React Native)
- Hatch animations (3-second egg-crack reveals)

**AI Agent Tasks:**
- **Art Agent (Midjourney):** Generate 27 VOID variants
  - Budget: $14.85k (27 × $550, improved quality)
  - Prompt: "Shadow snake, ethereal wisps, void energy, translucent scales, [rarity]"
- **Audio Agent (Upwork):** Generate VOID dynasty theme music
  - Budget: $1,000 (1× 2-minute loop, dark ambient/ethereal style)
- **Audio Agent (Fiverr):** Generate 30 VOID SFX
  - Budget: $500 (stealth activation, void dash, ethereal hiss)

**Human Tasks:**
- **Engineer:** Implement VOID variants
  - Unique mechanic: Stealth (snake invisible for 1 second every 5 seconds)
  - Visual: Translucent sprite, particle trail fades during stealth
- **Engineer:** AAA UI redesign
  - Figma designs provided by designer → React Native implementation
  - Screens: Home, breeding lab, collection, game screen, post-game
- **Engineer:** Hatch animations
  - 3-second egg-crack animation (dynasty-specific VFX)
  - Legendary hatch: 5-second animation (golden glow, particle burst)
- **Designer:** Create Figma mockups (10 screens, AAA polish)

**Success Criteria:**
- VOID variants feel unique (stealth mechanic is fun, not overpowered)
- UI looks AAA-quality (clean, intuitive, no placeholder art)
- Hatch animations feel satisfying (anticipation → reveal → gratification)

**Deliverables:**
- 27 VOID variants in-game (108 total variants)
- AAA UI live
- Hatch animations functional

---

#### Sprint 12 (Weeks 23-24): Pre-Launch Beta Testing + ASO

**Goals:**
- Expand beta to 50,000 users
- App Store Optimization (ASO): Keywords, screenshots, video trailer
- Influencer seeding (send beta codes to 50 YouTubers/streamers)

**AI Agent Tasks:**
- **Copywriting Agent (GPT-4):** Generate App Store description
  - Budget: $100 (optimize for keywords: "snake game", "breeding", "strategy")
  - Output: 500-word description + 10 keyword variations

**Human Tasks:**
- **Engineer:** Bug fixes (address beta feedback from Sprints 7-11)
- **Engineer:** Performance optimization (60fps on 98% of devices)
- **Community Manager:** Recruit 40,000 additional beta testers
  - Channels: Reddit (/r/AndroidGaming, /r/iOSGaming), Discord, Twitter
  - Goal: 50,000 total beta users by end of Sprint 12
- **Community Manager:** Influencer outreach
  - Contact 50 YouTubers/streamers (10k-100k subscribers)
  - Send beta codes, request honest reviews
  - Goal: 10+ influencer videos (combined 500k views)
- **Community Manager:** ASO (App Store Optimization)
  - Write App Store/Play Store descriptions
  - Create 5 screenshots (show breeding, variants, ranked ladder)
  - Record 30-second video trailer (Snake gameplay + hatch reveal)
- **QA:** Final testing (30 devices, all OS versions)

**Success Criteria:**
- 50,000 beta users (5× growth from Sprint 6)
- 20% conversion rate (10,000 paying users)
- $3 ARPPU ($30k total revenue in beta)
- 15% D7 retention (maintained from MVP)
- 8% D30 retention (new long-term metric)
- NPS ≥45 (beta feedback survey)
- 10+ influencer videos published

**Deliverables:**
- Beta at 50,000 users
- ASO complete (App Store/Play Store listings optimized)
- Influencer campaign results (views, sentiment)

**Go/No-Go Decision (End of Sprint 12):**
- **GO if:** Conversion ≥20%, ARPPU ≥$3, D7 ≥15% → Global launch v1.0
- **NO-GO if:** Conversion <20% or ARPPU <$3 → Iterate monetization, extend beta

---

### Month 6-12: Global Launch (Sprints 13-26)

**Note:** Sprints 13-26 are summarized at high level (detailed sprint plans available upon request).

#### Sprints 13-16 (Weeks 25-32): Guild Wars + Competitive Ladder

**Goals:**
- Launch Guild Wars (weekly 96-hour events)
- Add Diamond + Infinite ranks
- MMR matchmaking refinement

**Key Deliverables:**
- Guild Wars live (50v50 battles, leaderboards)
- Diamond rank (top 5% of Gold)
- Infinite rank (top 100 global)
- MMR-based matchmaking (±50 rating for faster queues)

**Budget:** $55k (team salaries, infrastructure scaling, QA)

---

#### Sprints 17-20 (Weeks 33-40): Evolution + Ascension

**Goals:**
- Add Evolution system (Stage 1-3 visual upgrades)
- Add Ascension mechanics (Gen 50 → Ascension 1)
- Unlock at Gen 10 (prevents early-game dilution)

**AI Agent Tasks:**
- Generate evolved variant art (81 variants × 3 stages = 243 new sprites, $121.5k)
  - Note: Spread over 6 months to manage budget

**Key Deliverables:**
- Evolution system live (Stage 1-3 upgrades)
- Ascension system live (Gen 50 → reset with stat bonus)
- Prestige cosmetics (glowing auras, animated nameplates)

**Budget:** $60k (team, AI art amortized, infrastructure)

---

#### Sprints 21-24 (Weeks 41-48): INFERNO + ABYSS Dynasties

**Goals:**
- Add INFERNO dynasty (27 variants, fire/lava theme)
- Add ABYSS dynasty (27 variants, deep-sea/Lovecraftian theme)
- Total: 162 variants (6 dynasties)

**AI Agent Tasks:**
- Art Agent: 54 variants (27 INFERNO + 27 ABYSS) × $650 = $35.1k
- Audio Agent: 2 dynasty themes + 100 SFX = $3k

**Key Deliverables:**
- INFERNO dynasty live (speed boost on kill mechanic)
- ABYSS dynasty live (HP regeneration mechanic)
- 162 total variants in-game

**Budget:** $55k (team, AI art/audio, infrastructure)

---

#### Sprints 25-26 (Weeks 49-52): Live Ops + Year 1 Review

**Goals:**
- Launch weekly events (Double DNA weekends)
- Seasonal content (Halloween UMBRA variants, Winter FROST variants)
- Year 1 KPI review (prepare Year 2 roadmap)

**Key Deliverables:**
- Weekly events live (automated event scheduling)
- Seasonal variants (limited-time UMBRA/FROST)
- Year 1 KPI dashboard (1M MAU, $15M ARR, 40% D1, 20% D7, 10% D30)

**Budget:** $48k (team, limited seasonal content, marketing)

---

## 3. AI Agent Task Assignments (3-Year Plan)

### Art Generation Agents (Midjourney/Stable Diffusion)

**Year 1 (MVP → v1.0 Launch):**
- Sprint 3: 27 CYBER variants ($13.5k)
- Sprint 4: 27 PRIMAL variants ($13.5k)
- Sprint 5: 27 COSMIC variants ($13.5k)
- Sprint 11: 27 VOID variants ($14.85k)
- Sprints 21-24: 54 INFERNO/ABYSS variants ($35.1k)
- **Subtotal:** 162 variants, $90.45k

**Year 2 (v1.0 → v2.0 Esports):**
- Sprints 27-30: 54 RADIANT/UMBRA variants ($37.8k)
- Evolved variants (81 × 3 stages = 243 sprites, amortized $30k/year for quality)
- Weekly content (1 variant/week × 52 = 52 variants, $36.4k)
- **Subtotal:** $104.2k

**Year 3 (v2.0 → v3.0 Franchise):**
- Sprints 53-56: 54 NEXUS/PRIME variants ($40.5k)
- Weekly content (52 variants, $39k)
- Platform-specific assets (PC/console high-res textures, $10k)
- **Subtotal:** $89.5k

**3-Year Art Total:** $284.15k

---

### Balance Simulation Agents (Python Scripts)

**Year 1:**
- Sprint 10-12: Simulate 10,000 games for variant balance
  - Output: Win rate by variant, identify overpowered/underpowered
  - Cost: AWS EC2 compute ($200)
- Sprint 20-24: Simulate gacha pity system economics
  - Output: Average DNA cost to get legendary, pity trigger frequency
  - Cost: Compute time ($100)

**Year 2:**
- Sprint 40-45: Simulate competitive ladder MMR matchmaking
  - Output: Queue times by rank, balance distribution
  - Cost: Compute time ($200)
- Weekly: Balance simulations after each patch
  - Cost: $50/week × 52 = $2.6k/year

**Year 3:**
- Ongoing: Weekly balance + tournament bracket simulations
  - Cost: $100/week × 52 = $5.2k/year

**3-Year Balance Total:** $8.3k

---

### Copywriting Agents (GPT-4)

**Year 1:**
- Sprint 8: Battle pass reward descriptions (30 tiers × $1.50 = $45)
- Sprint 12: App Store description optimization ($100)
- Sprints 13-26: Patch notes, event copy ($50/sprint × 14 = $700)

**Year 2:**
- Weekly patch notes (52 × $20 = $1,040)
- Seasonal narratives (4 seasons × $200 = $800)
- Dynasty lore (2 dynasties × $300 = $600)

**Year 3:**
- Weekly content (52 × $25 = $1,300)
- Transmedia scripts (animated series, comic books, $2,000)
- Voice acting scripts (6 languages × $500 = $3,000)

**3-Year Copywriting Total:** $9.585k

---

### Sentiment Analysis Agents (GPT-4 + Web Scraping)

**Year 1:**
- Post-launch only (Sprints 13+, Month 6+)
- Weekly sentiment reports (Discord, Reddit, Twitter)
- Cost: $100/week × 26 weeks = $2.6k

**Year 2:**
- Weekly sentiment reports (52 × $100 = $5.2k)

**Year 3:**
- Weekly sentiment + esports community analysis (52 × $150 = $7.8k)

**3-Year Sentiment Total:** $15.6k

---

### Total AI Agent Budget (3 Years)

| Category | Year 1 | Year 2 | Year 3 | Total |
|----------|--------|--------|--------|-------|
| Art Generation | $90.45k | $104.2k | $89.5k | $284.15k |
| Balance Simulation | $0.3k | $2.8k | $5.2k | $8.3k |
| Copywriting | $0.845k | $2.44k | $6.3k | $9.585k |
| Sentiment Analysis | $2.6k | $5.2k | $7.8k | $15.6k |
| **Total** | **$94.2k** | **$114.64k** | **$108.8k** | **$317.64k** |

**AI Agent Budget = 10.7% of total 3-year budget ($317.64k / $2.96M)**

---

## 4. Human Team Structure

### Year 1: Founding Team (MVP → v1.0 Launch)

**Game Designer (Lead)** - $120k/year
- Responsibilities:
  - Define all game systems (breeding, progression, economy)
  - Balance tuning (DNA earning rates, breeding costs, variant stats)
  - Feature specifications (write design docs for each sprint)
  - Playtesting (daily internal tests, iterate based on feedback)
- Time allocation:
  - 40% systems design
  - 30% balance/economy tuning
  - 20% documentation
  - 10% playtesting

**Engineer (Full-Stack)** - $140k/year
- Responsibilities:
  - Build React Native + Three.js game engine
  - Implement all features (breeding, UI, multiplayer, IAP)
  - Backend (Supabase setup, database schema, serverless functions)
  - Performance optimization (60fps on 95% devices)
- Time allocation:
  - 50% frontend (UI, game engine)
  - 30% backend (Supabase, APIs)
  - 20% performance/debugging

**Community Manager (Part-Time → Full-Time)** - $40k → $80k/year
- Responsibilities:
  - Recruit beta testers (Reddit, Discord, social media)
  - Manage Discord server (moderate, engage, gather feedback)
  - Influencer outreach (seed beta codes, track coverage)
  - ASO (App Store Optimization, write descriptions/screenshots)
- Time allocation:
  - 40% Discord moderation/engagement
  - 30% beta recruitment
  - 20% influencer outreach
  - 10% ASO/marketing

**Contractors:**
- **QA Tester** - $31k/year (part-time)
  - Device testing (30 devices, iOS/Android)
  - Bug reporting (use TestRail or Jira)
  - Regression testing after each sprint
- **Audio Designer** - $10k one-time (Year 1)
  - 6 dynasty themes (2 minutes each)
  - 300 SFX (DNA collect, death, UI, hatches)
  - Outsource to Fiverr/Upwork freelancers
- **Customer Support** - $0 (Year 1), $390k (post-launch Year 2-3)
  - Year 1: Community Manager handles support (low volume)
  - Year 2-3: Hire 5-person support team ($78k/year each)

**Year 1 Total Team Cost:** $391k
- Game Designer: $120k
- Engineer: $140k
- Community Manager: $60k (average of $40k + $80k)
- QA: $31k
- Audio: $10k
- Customer Support: $30k (Month 10-12 only, ramp-up)

---

### Year 2: Scaling Team (v1.0 → v2.0 Esports)

**Add:**
- **Engineer (Mobile Specialist)** - $140k/year
  - Focus: Performance optimization, device compatibility
  - Handle: 60fps on 99% of devices (including low-end Android)
- **Community Manager #2** - $80k/year
  - Focus: Esports community (tournament organization, pro team relations)
  - Handle: Discord esports channels, Twitch integration

**Maintain:**
- Game Designer (Lead): $120k
- Engineer (Full-Stack): $140k
- Community Manager #1: $80k
- QA: $40k (full-time now)
- Audio: $5k (seasonal content only)
- Customer Support: $390k (5-person team, handle 10k tickets/month)

**Year 2 Total Team Cost:** $995k
- Core team: $600k (Designer $120k, Engineers $280k, CMs $160k, QA $40k)
- Audio: $5k
- Customer Support: $390k

---

### Year 3: Franchise Team (v2.0 → v3.0 Maturity)

**Add:**
- **Game Designer (Senior)** - $140k/year
  - Focus: Esports balance, live ops strategy
  - Handle: Weekly balance patches, tournament rule design
- **Engineer (Backend Specialist)** - $150k/year
  - Focus: Scalability (2.5M MAU), multi-region servers
  - Handle: Database optimization, cross-platform infrastructure

**Maintain:**
- Game Designer (Lead): $120k
- Engineers: $280k (2× Mobile + Full-Stack)
- Community Managers: $160k (2×)
- QA: $20k (reduced, automated testing coverage)
- Audio: $12k (voice acting, multilingual expansion)
- Customer Support: $330k (same 5-person team, improved efficiency via AI chatbots)
- Platform Ports: $200k (contract PC/console developers)

**Year 3 Total Team Cost:** $1.412M
- Core team: $870k (Designers $260k, Engineers $430k, CMs $160k, QA $20k)
- Audio: $12k
- Customer Support: $330k
- Platform Ports: $200k

---

### 3-Year Cumulative Team Cost

| Year | Core Team | Contractors | AI Agents | Infrastructure | Marketing | Esports | Transmedia | Total |
|------|-----------|-------------|-----------|----------------|-----------|---------|------------|-------|
| 1 | $391k | $31k (QA) | $94.2k | $12k | $32k | $0 | $0 | $560k |
| 2 | $600k | $40k (QA) | $114.64k | $50k | $120k | $150k | $50k | $1.125M |
| 3 | $870k | $20k (QA) | $108.8k | $100k | $180k | $500k | $80k | $1.859M |
| **Total** | **$1.861M** | **$91k** | **$317.64k** | **$162k** | **$332k** | **$650k** | **$130k** | **$3.544M** |

**Note:** Previous $2.96M estimate was conservative. Updated total: **$3.544M** (includes platform ports, transmedia).

---

## 5. Revenue Projections vs Budget

### Year 1: MVP → Global Launch

**Revenue Model:**
- MAU: 0 → 1M (Month 12)
- Conversion rate: 25% (Supercell benchmark)
- Paying users: 250k
- ARPPU: $5.20/month (battle pass $4.99 + occasional DNA bundles)
- Monthly revenue (Month 12): $1.3M
- ARR: $15M (assuming Month 12 revenue sustains)

**Budget:**
- Total: $560k

**Profit:**
- $15M - $560k = **$14.44M profit**
- ROI: 2,579%

---

### Year 2: v1.0 → v2.0 Esports

**Revenue Model:**
- MAU: 1M → 1.5M (Month 24)
- Conversion rate: 28% (improved retention + live ops)
- Paying users: 420k
- ARPPU: $6.94/month (battle pass + DNA bundles + tournament entries)
- Monthly revenue (Month 24): $2.91M
- ARR: $35M

**Budget:**
- Total: $1.125M

**Profit:**
- $35M - $1.125M = **$33.875M profit**
- ROI: 3,011%

---

### Year 3: v2.0 → v3.0 Franchise

**Revenue Model:**
- MAU: 1.5M → 2.5M (Month 36)
- Conversion rate: 30% (mature product, loyal base)
- Paying users: 750k
- ARPPU: $8.00/month (battle pass + DNA bundles + esports cosmetics + PC/console sales)
- Monthly revenue (Month 36): $6M
- ARR: $60M (adjusted for seasonality)

**Budget:**
- Total: $1.859M

**Profit:**
- $60M - $1.859M = **$58.14M profit**
- ROI: 3,128%

---

### 3-Year Cumulative

**Total Revenue:** $110M ($15M + $35M + $60M)
**Total Budget:** $3.544M
**Total Profit:** $106.456M
**Cumulative ROI:** 3,003%

**Exit Valuation:**
- $60M ARR × 5× SaaS multiple = **$300M acquisition offer**
- Return on investment: **$300M / $3.544M = 84.6× return**

---

## 6. Risk Mitigation

### Technical Risks

#### Risk 1: 60fps Not Achievable on Low-End Devices

**Likelihood:** Medium (30%)
**Impact:** High (retention killer if laggy)

**Mitigation Strategies:**
1. **Performance budget:** Max 500 particles on-screen, LOD (level-of-detail) system
2. **Extensive device testing:** Test on 30 devices (iPhone 8, Galaxy S8, budget Androids)
3. **Adaptive quality:** Auto-detect device capability, reduce VFX on <iPhone 11
4. **Profiling:** Use React Native Profiler, Three.js stats to identify bottlenecks

**Contingency Plan:**
- If <60fps on target devices (iPhone 11, Galaxy S10), reduce VFX complexity:
  - Max 200 particles (down from 500)
  - Disable trail VFX on low-end devices
  - Reduce shadow quality
- Target: 60fps on 95% of devices, 45fps acceptable on oldest 5%

---

#### Risk 2: Supabase Scaling Issues (>1M MAU)

**Likelihood:** Low (15%)
**Impact:** High (downtime = revenue loss)

**Mitigation Strategies:**
1. **Supabase Enterprise plan:** Dedicated resources, SLA guarantee
2. **Database optimization:** Index frequently queried tables (user_variants, breeding_history)
3. **Caching layer:** Use Redis for leaderboards, guild rosters (reduce DB load)
4. **Load testing:** Simulate 1M concurrent users (Months 10-11, before launch)

**Contingency Plan:**
- If Supabase can't scale, migrate to AWS RDS + custom backend:
  - Cost: $50k migration (1 month engineering)
  - Timeline: Month 11 (before global launch)
  - Benefit: Full control, better scalability

---

### Monetization Risks

#### Risk 3: Conversion Rate Below 25%

**Likelihood:** Medium (35%)
**Impact:** High (revenue miss, delays profitability)

**Mitigation Strategies:**
1. **A/B test battle pass price:** $4.99 vs $9.99 (Month 6 beta)
2. **Generous F2P:** Daily DNA rewards (500 DNA/day), daily free hatch
3. **First-time buyer bonus:** Double rewards on first battle pass purchase
4. **Social proof:** Show "50,000 players bought this season's pass!"

**Contingency Plan:**
- If conversion <15% after Month 6 beta:
  - Increase F2P generosity (1,000 DNA/day, 2 free hatches)
  - Lower battle pass price to $2.99 (test in select regions)
  - Add cheaper IAP ($0.99 starter pack)
  - Goal: Boost conversion to 20%+, even if ARPPU drops to $4

---

#### Risk 4: ARPPU Below $5

**Likelihood:** Medium (30%)
**Impact:** Medium (need more paying users to hit revenue target)

**Mitigation Strategies:**
1. **DNA bundle pricing:** Offer high-value bundles ($9.99 = 10,000 DNA, 2× value)
2. **Limited-time offers:** Flash sales (24-hour 50% off DNA bundles)
3. **VIP system:** Monthly subscription ($14.99/month = daily DNA + exclusive variants)
4. **Cosmetics:** Sell skins, trails, nameplates (doesn't affect balance)

**Contingency Plan:**
- If ARPPU <$5 after Month 12:
  - Introduce VIP tier ($14.99/month, targets whales)
  - Add cosmetic shop (skins $2.99-$9.99 each)
  - Goal: Whales spend $50+/month, F2P casuals spend $5/month (average $8 ARPPU)

---

### Retention Risks

#### Risk 5: D1 Retention Below 40%

**Likelihood:** High (50%, industry average is 25%)
**Impact:** High (low retention = low LTV = unprofitable UA)

**Mitigation Strategies:**
1. **Daily challenges unlock early:** Level 3 (15 minutes play), not Level 10 (3 hours)
2. **Guaranteed rare on first hatch:** Immediate gratification, feels generous
3. **Streaks:** Daily login rewards (DNA increases per consecutive day)
4. **Push notifications:** "Your egg is ready to hatch!" (if breeding takes time)

**Contingency Plan:**
- If D1 <30% after soft launch:
  - Add instant-gratification mechanics:
    - First 3 breeds are instant (no wait time)
    - Starter pack: 3 epic variants unlocked at Level 1
  - Reduce friction:
    - Skip tutorial if returning user (don't force replay)
    - Faster onboarding (2 minutes vs 5 minutes)
  - Goal: Boost D1 to 35%+

---

#### Risk 6: D7 Retention Below 20%

**Likelihood:** Medium (40%)
**Impact:** High (low D7 = high churn = low LTV)

**Mitigation Strategies:**
1. **Week 1 progression rewards:** Day 3 = rare variant, Day 7 = epic variant
2. **Social hooks:** Invite friends for DNA bonus (500 DNA per referral)
3. **Guild benefits:** Joining guild gives 1,000 DNA welcome bonus
4. **Content cadence:** New variants every week (keeps collection fresh)

**Contingency Plan:**
- If D7 <15% after soft launch:
  - Add D7 comeback bonus: "You've been gone 7 days, here's 5,000 DNA + legendary hatch!"
  - Improve mid-game loop (Gen 5-10 feels grindy, reduce breeding costs 30%)
  - Goal: Boost D7 to 18%+

---

### Competitive Risks

#### Risk 7: SNAP or Supercell Clone SupaSnake

**Likelihood:** Low (20%, niche concept)
**Impact:** High (market saturation, price war)

**Mitigation Strategies:**
1. **Speed to market:** 12-month launch (vs 18-24 months for AAA studios)
2. **Defensible IP:** Dynasty lore, Snake gameplay (hard to clone exactly)
3. **Community moat:** Build loyal Discord community (100k members by Month 12)
4. **Network effects:** Guilds, ranked ladder (switching cost for players)

**Contingency Plan:**
- If major competitor launches similar game:
  - Pivot to niche: "The hardcore Snake experience" (skill-based, no pay-to-win)
  - Double down on esports (can't clone esports community easily)
  - Aggressive retention tactics (more generous F2P, exclusive content for loyal players)
  - Goal: Coexist by serving different audience (hardcore vs casual)

---

### Esports Risks

#### Risk 8: Low Tournament Viewership (<100k)

**Likelihood:** Medium (30%)
**Impact:** Medium (esports ROI questionable, but doesn't hurt core game)

**Mitigation Strategies:**
1. **Influencer partnerships:** Pay top streamers ($5k/month) to stream SupaSnake tournaments
2. **Twitch drops:** Watch 1 hour = free legendary variant (drives viewership)
3. **Professional production:** Hire casters, use instant replays, AR overlays
4. **Prize pools:** $25k monthly championships (attracts competitive players)

**Contingency Plan:**
- If viewership <50k after 6 months of esports push:
  - Scale back esports investment (reduce to $50k/year, grassroots only)
  - Focus on core game retention/monetization instead
  - Goal: Don't force esports if community doesn't want it

---

## 7. Go/No-Go Decision Points

### Decision Point 1: End of Sprint 6 (Month 3, MVP Complete)

**Date:** End of Week 12

**Criteria for GO:**
- D1 retention ≥30% (3,000 of 10,000 soft launch users return Day 1)
- D7 retention ≥12% (1,200 of 10,000 return Day 7)
- Average session length ≥15 minutes
- NPS ≥40 (survey at Day 7)
- "Would pay $4.99" survey ≥60% yes

**GO Decision:**
- Proceed to v0.5 (Sprints 7-12: Add monetization, VOID dynasty, ranked ladder)
- Budget: Allocate $155k for Pre-Launch Beta phase
- Timeline: 3 months (Sprints 7-12)

**NO-GO Decision:**
- If D1 <30% OR D7 <12%:
  - **Pivot:** Fix core loop retention issues before adding monetization
  - **Actions:**
    - Analyze drop-off points (where do players quit?)
    - A/B test onboarding (faster tutorial, different starter variants)
    - Improve mid-game loop (Gen 5-10 progression feels grindy, reduce costs)
  - **Timeline:** Extend MVP phase by 1 month (Sprint 6.5), re-test with 10k new users
  - **Budget:** Add $40k (1 month team salaries)
  - **Re-evaluate:** If still <30% D1 after fixes, consider pivot to different genre or cancel project

---

### Decision Point 2: End of Sprint 12 (Month 6, Pre-Launch Beta Complete)

**Date:** End of Week 24

**Criteria for GO:**
- Conversion rate ≥20% (10,000 of 50,000 beta users pay)
- ARPPU ≥$3 (average paying user spends $3+ in 30 days)
- D7 retention ≥15% (maintained from MVP)
- D30 retention ≥8% (new long-term metric)
- NPS ≥45
- Total beta revenue ≥$30k (validates monetization)

**GO Decision:**
- Proceed to v1.0 Global Launch (Sprints 13-26)
- Budget: Allocate $218k for Global Launch phase
- Timeline: 6 months (Sprints 13-26)
- Marketing: Begin paid UA (User Acquisition) at $10k/month starting Month 10

**NO-GO Decision:**
- If conversion <20% OR ARPPU <$3:
  - **Extend Beta:** Add 1-2 months to iterate monetization
  - **Actions:**
    - A/B test battle pass pricing ($4.99 vs $2.99 vs $9.99)
    - Add DNA bundles (test different price points)
    - Improve first-time buyer experience (double rewards, instant gratification)
  - **Timeline:** Extend beta to Month 8, re-test with 50k new users
  - **Budget:** Add $60k (2 months team salaries)
  - **Re-evaluate:** If still <20% conversion, lower revenue targets OR reduce team size to extend runway

---

### Decision Point 3: End of Sprint 26 (Month 12, v1.0 Global Launch)

**Date:** End of Week 52 (1 year anniversary)

**Criteria for GO to v2.0:**
- MAU ≥1M (Monthly Active Users)
- ARR ≥$15M (Annual Recurring Revenue)
- D1 retention ≥40%
- D7 retention ≥20%
- D30 retention ≥10%
- Conversion rate ≥25%
- ARPPU ≥$5.20
- NPS ≥50
- Top 100 grossing (USA App Store)

**GO Decision:**
- Proceed to v2.0 Esports Expansion (Sprints 27-52)
- Budget: Allocate $1.125M for Year 2
- Hiring: Add Engineer (Mobile Specialist), Community Manager #2, 5-person Customer Support team
- Timeline: 12 months (Year 2)
- Esports investment: $150k (tournaments, infrastructure)

**NO-GO Decision:**
- If ARR <$15M OR MAU <800k:
  - **Focus on Retention:** Pause new feature development, optimize existing features
  - **Actions:**
    - Analyze churn (why do players quit?)
    - Improve live ops (more frequent events, better rewards)
    - Reduce friction (faster breeding, easier progression)
  - **Timeline:** Extend v1.0 phase by 6 months, iterate on retention
  - **Budget:** Maintain Year 1 team size ($391k), no new hires
  - **Re-evaluate at Month 18:** If still <$15M ARR, consider:
    - Selling company at lower valuation ($50-100M)
    - Pivoting to sustainable $10M ARR with smaller team
    - Shutting down if unprofitable

---

### Decision Point 4: End of Sprint 52 (Month 24, v2.0 Esports Complete)

**Date:** End of Month 24 (2-year anniversary)

**Criteria for GO to v3.0:**
- MAU ≥1.5M
- ARR ≥$35M
- Tournament viewership ≥100k concurrent (monthly championships)
- Twitch streamers ≥500 (>1k followers each)
- Esports engagement ≥15% of players (watch monthly)
- NPS ≥55
- Top 50 grossing (USA App Store)

**GO Decision:**
- Proceed to v3.0 Franchise Maturity (Sprints 53-78)
- Budget: Allocate $1.859M for Year 3
- Hiring: Add Game Designer (Senior), Engineer (Backend Specialist)
- Timeline: 12 months (Year 3)
- Esports investment: $500k (Pro League, World Championship)
- Platform expansion: PC/Console ports ($200k)
- **Begin acquisition conversations:** Target $300M valuation (5× $60M ARR)

**NO-GO Decision:**
- If ARR <$35M OR viewership <50k:
  - **Maintain v2.0:** Don't invest heavily in esports if community doesn't care
  - **Actions:**
    - Scale back esports to grassroots ($50k/year)
    - Focus on live ops, seasonal content (proven revenue drivers)
    - Maintain current team size (no new hires)
  - **Timeline:** Operate v2.0 indefinitely as sustainable $35M ARR business
  - **Budget:** Year 3 budget reduced to $800k (core team only, no esports/transmedia)
  - **Outcome:** Profitable business, lower valuation ($150-200M at 5× ARR)

---

## 8. Success Metrics Dashboard

### Weekly Metrics (Track Every Monday)

**User Acquisition:**
- New installs (organic + paid)
- Install-to-registration rate (target: 85%+)
- Registration-to-tutorial-complete (target: 70%+)
- CAC (Customer Acquisition Cost, paid UA only): Target <$5 organic, <$15 paid

**Engagement:**
- DAU (Daily Active Users)
- MAU (Monthly Active Users)
- DAU/MAU ratio (target: 25%, indicates healthy engagement)
- Average session length (target: 15-20 minutes)
- Sessions per DAU (target: 3+ per day)

**Retention:**
- D1 retention (target: 40%)
- D7 retention (target: 20%)
- D30 retention (target: 10%)
- Monthly churn rate (target: <10%)

**Monetization:**
- Conversion rate (target: 25-30%)
- ARPPU (target: $5.20 Y1 → $8.00 Y3)
- ARPU (Average Revenue Per User, all users): $1.30 Y1 → $2.40 Y3
- Daily revenue
- MRR (Monthly Recurring Revenue)
- ARR (Annual Recurring Revenue, projected from MRR × 12)

**Gameplay:**
- Games played per DAU (target: 5+)
- Average game duration (target: 3-5 minutes)
- Win rate by win condition (DNA Collector 40%, Survival 30%, Score 20%, Perfect 10%)
- DNA earned per game (target: 500 average)
- Breeds per DAU (target: 1-2 per day)

---

### Monthly Metrics (Track First Week of Month)

**Financials:**
- MRR (Monthly Recurring Revenue)
- ARR (projected, MRR × 12)
- Gross profit (revenue - infrastructure/support costs)
- Burn rate (monthly expenses)
- Runway (months of cash remaining)

**Product:**
- Feature adoption (% of users who tried new feature within 30 days)
- NPS (Net Promoter Score, survey 1,000 random users monthly): Target >50
- App Store rating (target: >4.5 stars)
- Top grossing rank (USA): Target Top 100 Y1, Top 50 Y3
- Crash rate (target: <1%)

**Content:**
- Variants collected per user (average, target: 20 by Month 3)
- Breeding frequency (breeds per user per month, target: 30+)
- Generation progression (% of users at Gen 10+, target: 20% by Month 6)
- Evolution adoption (% of users who evolved a variant, target: 50% by Month 12)

**Social:**
- Guild membership (% of users in guilds, target: 50%+)
- Guild activity (messages per guild per day, target: 10+)
- Referrals (users invited per active user, target: 0.5+)

**Competitive:**
- Ranked participation (% of users who played ranked, target: 30%+)
- Rank distribution (Bronze 50%, Silver 35%, Gold 15%)
- MMR inflation/deflation (track average MMR over time, should stabilize)
- Guild War participation (% of guilds competing, target: 60%+)

---

### Quarterly Metrics (Track First Week of Quarter)

**Strategic:**
- LTV (Lifetime Value, cohort-based): Target $25 F2P casual → $500 whale
- LTV:CAC ratio (target: >3:1 for healthy unit economics)
- Payback period (days to recoup CAC via revenue, target: <90 days)
- Market share (% of Snake/breeding genre, industry reports)

**Esports (Year 2+):**
- Tournament viewership (concurrent, target: 100k+ by Year 2)
- Twitch streamers (count >1k followers, target: 500+ by Year 2)
- Pro team count (target: 32 by Year 3)
- Prize pool distributed (total, target: $400k/year by Year 3)

**Transmedia (Year 2+):**
- Animated series views (YouTube/TikTok, target: 5M+ total)
- Merchandise sales (if applicable, POD revenue)
- Social media followers (Twitter, Instagram, TikTok combined, target: 500k+ by Year 3)

**Platform (Year 3):**
- PC/Console installs (target: 500k+ by Year 3)
- Cross-platform sessions (% of games with mobile vs PC players, target: 20%)
- Platform revenue split (mobile 70%, PC 20%, console 10%)

---

### Annual Metrics (Track January 1st)

**Company Health:**
- ARR (target: $15M Y1, $35M Y2, $60M Y3)
- Profitability (revenue - total expenses, target: profitable by Month 6)
- Team size (headcount)
- Valuation (last fundraise or acquisition offer)

**Product Maturity:**
- Total variants (target: 162 Y1, 216 Y2, 270 Y3)
- Feature completeness (% of roadmap shipped, target: 90%+)
- Technical debt (engineering estimate, target: <20% of codebase)

**User Base:**
- MAU (target: 1M Y1, 1.5M Y2, 2.5M Y3)
- Lifetime downloads (cumulative, target: 10M Y1, 30M Y2, 100M Y3)
- Geographic split (USA 40%, EU 30%, APAC 20%, LATAM 10%)

**Competitive Position:**
- Top grossing rank (USA, target: Top 100 Y1, Top 50 Y3)
- App Store rating (target: >4.5 stars, >50k reviews by Y3)
- Industry awards (nominations, wins)

---

## 9. Timeline Visualization (Gantt Chart Description)

**Note:** Full Gantt chart should be created in project management tool (Asana, Monday.com, Jira). Below is textual description.

### Month 0-3: MVP Development (Red)
- Sprint 1-2: Core Snake engine + DNA wagering
- Sprint 3-4: Breeding system + PRIMAL dynasty
- Sprint 5-6: COSMIC dynasty + soft launch

### Month 3-6: Pre-Launch Beta (Orange)
- Sprint 7-8: Fair gacha + battle pass
- Sprint 9-10: Ranked ladder + guilds
- Sprint 11-12: VOID dynasty + UI overhaul + ASO

### Month 6-12: v1.0 Global Launch (Yellow)
- Sprint 13-16: Guild Wars + Diamond/Infinite ranks
- Sprint 17-20: Evolution + Ascension
- Sprint 21-24: INFERNO + ABYSS dynasties
- Sprint 25-26: Live ops + Year 1 review

### Month 12-18: v2.0 Development (Green)
- Sprint 27-30: RADIANT + UMBRA dynasties
- Sprint 31-36: Esports infrastructure (spectator, replay, tournaments)
- Sprint 37-40: Transmedia (animated series production)

### Month 18-24: v2.0 Esports Expansion (Blue)
- Sprint 41-46: Pro League beta (16 teams, $100k prize pool)
- Sprint 47-52: Tournament system live, monthly $25k championships

### Month 24-30: v3.0 Development (Purple)
- Sprint 53-56: NEXUS + PRIME dynasties
- Sprint 57-62: Platform expansion (PC/console ports)
- Sprint 63-68: Multilingual expansion (6 languages)

### Month 30-36: v3.0 Franchise Maturity (Pink)
- Sprint 69-74: Full Pro League (32 teams, $400k prize pool)
- Sprint 75-78: World Championship (December, $250k, 500k+ viewers)
- **Acquisition negotiations:** Target $300M valuation

---

## 10. Next Steps (Immediately After This Roadmap)

### Step 1: Hire Founding Team (Weeks 1-4)

**Game Designer (Lead):**
- **Sourcing:** AngelList, LinkedIn, indie game dev communities
- **Requirements:**
  - 5+ years game design experience (mobile preferred)
  - Shipped 2+ games (bonus: F2P/live ops experience)
  - Portfolio: Show systems design docs, balance spreadsheets
- **Interview process:**
  - Round 1: Phone screen (30 min, culture fit + experience)
  - Round 2: Design challenge (48 hours: "Design a breeding system for Snake game")
  - Round 3: Final interview (1 hour, discuss challenge + roadmap alignment)
- **Timeline:** Hire by Week 4
- **Salary:** $120k/year

**Engineer (Full-Stack):**
- **Sourcing:** AngelList, Stack Overflow Jobs, React Native communities
- **Requirements:**
  - 5+ years full-stack experience (React Native + backend)
  - Shipped 2+ mobile games or apps (bonus: Three.js/WebGL)
  - Portfolio: Show GitHub, App Store/Play Store links
- **Interview process:**
  - Round 1: Phone screen (30 min, technical background)
  - Round 2: Coding challenge (4 hours: "Build simple Snake game in React Native")
  - Round 3: System design (1 hour: "Design backend for 1M MAU game")
- **Timeline:** Hire by Week 4
- **Salary:** $140k/year

**Community Manager (Part-Time):**
- **Sourcing:** Remote work boards, Discord server communities
- **Requirements:**
  - 2+ years community management (gaming preferred)
  - Experience: Discord moderation, Reddit engagement, influencer outreach
  - Portfolio: Show community growth metrics, engagement examples
- **Interview process:**
  - Round 1: Phone screen (20 min, experience + culture fit)
  - Round 2: Challenge (24 hours: "Write ASO description + recruit 100 Discord members")
- **Timeline:** Hire by Week 3
- **Salary:** $40k/year part-time (20 hours/week)

---

### Step 2: Set Up Development Environment (Weeks 1-2)

**Tools & Infrastructure:**

**Code Repository:**
- GitHub (private repo, team plan $4/user/month)
- Branching strategy: main (production), develop (staging), feature/* (sprints)

**Project Management:**
- Asana or Monday.com ($10/user/month)
- Sprint boards (26 sprints × 2 weeks each)
- Task tracking (user stories, bugs, design docs)

**Design:**
- Figma (team plan, $12/user/month)
- Shared design library (UI components, variant sprites, icons)

**Backend:**
- Supabase (Pro plan, $25/month → scales to Enterprise at 1M MAU)
- Database schema: users, variants, breeding_history, guilds, leaderboards
- Serverless functions: breeding logic, MMR calculation, daily rewards

**Frontend:**
- React Native (Expo managed workflow)
- Three.js (3D rendering for Snake game)
- Libraries: React Navigation, React Native Reanimated, Expo Haptics

**Testing:**
- Jest (unit tests)
- Detox (E2E tests for React Native)
- TestFlight (iOS beta), Google Play Beta (Android)

**Analytics:**
- Firebase Analytics (free tier, 500 events/day)
- Amplitude (growth plan, $49/month)
- Track: D1/D7/D30 retention, session length, revenue

**Communication:**
- Discord (team server, free)
- Slack (optional, if team prefers, $7/user/month)
- Weekly sprint reviews (Fridays, 1 hour)

---

### Step 3: Sprint 1 Kickoff (Week 3)

**Sprint Planning Meeting (2 hours):**
- **Attendees:** Game Designer, Engineer, Community Manager, Founder
- **Agenda:**
  1. Review roadmap (this document)
  2. Assign Sprint 1 tasks:
     - Engineer: Build React Native + Three.js Snake engine
     - Designer: Define 4 win conditions, tune DNA economy
     - Community Manager: Set up Discord server, recruit first 100 members
  3. Set Sprint 1 goals:
     - 60fps Snake on iPhone 11 / Galaxy S10
     - 4 win conditions functional
     - DNA collection feels satisfying
  4. Daily standup schedule (async Slack check-ins, 9am daily)

**Sprint 1 Deliverables (End of Week 4):**
- Playable Snake prototype (TestFlight build)
- Design doc: Win condition tuning, DNA economy
- Discord server live (100+ members)

---

### Step 4: Weekly Sprint Reviews (Every 2 Weeks)

**Format (1 hour, Fridays 3pm):**
1. **Demo (30 min):** Engineer shows what shipped this sprint
   - Live playtest (team plays new features)
   - Bug reports (QA feedback, team testing)
2. **Retrospective (15 min):** What went well, what to improve
   - Designer: "Breeding costs feel too high, reduce by 20%"
   - Engineer: "Three.js performance issues on Android, need optimization"
3. **Sprint planning (15 min):** Review next sprint tasks
   - Assign user stories from backlog
   - Estimate hours (designer 80 hours, engineer 80 hours per sprint)

**Attendees:**
- Core team (Designer, Engineer, CM)
- Founder (optional, every 4 sprints for major milestones)

---

### Step 5: Month 3 Go/No-Go (End of Sprint 6)

**Preparation (Week 11):**
- Finalize soft launch (10,000 TestFlight/Play Store Beta users)
- Run Day 7 survey: NPS, "Would you pay $4.99?", feedback
- Analyze retention data (Firebase Analytics dashboard)

**Go/No-Go Meeting (Week 12, 2 hours):**
- **Attendees:** Founder, Game Designer, Engineer, Community Manager
- **Review metrics:**
  - D1 retention: X% (target: ≥30%)
  - D7 retention: X% (target: ≥12%)
  - NPS: X (target: ≥40)
  - "Would pay" survey: X% (target: ≥60%)
- **Decision:**
  - **GO:** Metrics met → Proceed to v0.5 (allocate $155k, hire CM full-time)
  - **NO-GO:** Metrics missed → Extend MVP, iterate core loop (add 1 month, $40k budget)

---

## Appendix A: Sprint Task Breakdown (Year 1 Detail)

**Note:** Full task breakdown for all 26 sprints available in separate document. Sample below.

### Sprint 1 Task List

**Engineer:**
1. Set up React Native project (Expo managed workflow) - 4 hours
2. Integrate Three.js (react-three-fiber) - 6 hours
3. Build Snake physics (collision detection, growth, boundary) - 20 hours
4. Implement camera (isometric view, smooth following) - 8 hours
5. Add touch controls (virtual joystick) - 8 hours
6. Optimize for 60fps (particle budget, profiling) - 12 hours
7. Create TestFlight build - 2 hours
**Total:** 60 hours

**Game Designer:**
1. Define 4 win conditions (rules, balancing) - 8 hours
2. Tune DNA spawn rates (frequency, value, placement) - 6 hours
3. Tune collection radius (playtest, iterate) - 4 hours
4. Write design doc (win conditions + economy) - 6 hours
5. Playtest Snake prototype (20 games, notes) - 6 hours
**Total:** 30 hours

**Community Manager:**
1. Set up Discord server (channels, roles, bots) - 4 hours
2. Write Discord welcome message + rules - 2 hours
3. Recruit 100 Discord members (Reddit posts, invites) - 14 hours
**Total:** 20 hours (part-time)

---

## Appendix B: Financial Model (3-Year P&L)

### Year 1 Profit & Loss

| Line Item | Amount |
|-----------|--------|
| **Revenue** | |
| Battle Pass Sales (Months 6-12) | $420k |
| DNA Bundles (Months 6-12) | $80k |
| Total Revenue | $500k |
| **Expenses** | |
| Salaries (Core Team) | $391k |
| AI Agents (Art, Audio, Copy) | $94.2k |
| Infrastructure (Supabase, CDN) | $12k |
| Marketing (ASO, Influencers) | $32k |
| QA | $31k |
| **Total Expenses** | **$560.2k** |
| **Net Profit (Loss)** | **($60.2k)** |

**Note:** Year 1 shows small loss due to MVP investment. Revenue ramps in Months 10-12 (projected $1.3M/month by Month 12 = $15M ARR).

---

### Year 2 Profit & Loss

| Line Item | Amount |
|-----------|--------|
| **Revenue** | |
| Monthly Avg Revenue | $2.91M |
| Annual Revenue | $35M |
| **Expenses** | |
| Salaries (Expanded Team) | $600k |
| AI Agents | $114.64k |
| Infrastructure | $50k |
| Marketing | $120k |
| Esports (Tournaments, Production) | $150k |
| Transmedia (Animated Series) | $50k |
| Customer Support | $60k |
| QA | $40k |
| **Total Expenses** | **$1.185M** |
| **Net Profit** | **$33.815M** |
| **Margin** | **96.6%** |

---

### Year 3 Profit & Loss

| Line Item | Amount |
|-----------|--------|
| **Revenue** | |
| Monthly Avg Revenue | $6M |
| Annual Revenue | $60M |
| **Expenses** | |
| Salaries (Franchise Team) | $870k |
| AI Agents | $108.8k |
| Infrastructure (Multi-Region) | $100k |
| Marketing | $180k |
| Esports (Pro League, Worlds) | $500k |
| Transmedia (Season 2, Comics) | $80k |
| Customer Support | $330k |
| Platform Ports (PC/Console) | $200k |
| QA | $20k |
| **Total Expenses** | **$2.389M** |
| **Net Profit** | **$57.611M** |
| **Margin** | **96.0%** |

---

### 3-Year Summary

| Metric | Year 1 | Year 2 | Year 3 | Total |
|--------|--------|--------|--------|-------|
| Revenue | $0.5M | $35M | $60M | $95.5M |
| Expenses | $560k | $1.185M | $2.389M | $4.134M |
| Profit | ($60k) | $33.815M | $57.611M | $91.366M |
| Margin | (12%) | 96.6% | 96.0% | 95.7% |

**Exit Valuation:** $300M (5× Year 3 ARR of $60M)
**Return on Investment:** $300M / $4.134M = **72.6× return**

---

## Appendix C: Key Assumptions

**User Acquisition:**
- Organic install rate: 50k/month (Year 1), 100k/month (Year 2), 150k/month (Year 3)
- Paid UA starts Month 10 at $10/month (CAC $5-15)
- Referral rate: 0.5 invites per active user

**Retention:**
- D1: 40% (industry best: Supercell 45-50%)
- D7: 20% (industry avg: 15%)
- D30: 10% (industry avg: 5%)
- Monthly churn: 10% (90% of Month 1 users remain active in Month 2)

**Monetization:**
- Conversion rate: 25% Y1 → 30% Y3 (Supercell benchmark: 25-30%)
- ARPPU: $5.20 Y1 → $8.00 Y3 (battle pass + bundles + cosmetics)
- Whale spend: Top 1% spend $500+ LTV (Pareto principle: 20% of revenue from top 5%)

**Content Velocity:**
- 27 variants per dynasty (9 common, 9 rare, 6 epic, 3 legendary)
- 1 new dynasty every 6 months post-launch (sustainable AI art pipeline)
- Weekly content: 1 variant/week (52/year, seasonal/event variants)

**Competitive Balance:**
- No pay-to-win (all variants balanced, cosmetic differences only)
- Skill-based matchmaking (Elo MMR, ±100 rating)
- Regular balance patches (every 2 weeks, based on win rate data)

**Technical Performance:**
- 60fps on 95% of devices (iPhone 8+, Galaxy S8+)
- Crash rate <1%
- Average session length: 15-20 minutes (5× 3-minute games)
- Backend uptime: 99.9% (Supabase SLA)

---

## Conclusion

This Production Roadmap transforms SupaSnake AAA from vision to $300M franchise over 36 months with disciplined execution and controlled investment.

**Key Success Factors:**
1. **Retention-first:** Validate 40% D1 / 20% D7 before monetizing
2. **Fair monetization:** Transparent gacha, generous F2P, no pay-to-win
3. **Content velocity:** AI art pipeline delivers 1 variant/week sustainably
4. **Esports legitimacy:** $400k prize pools, professional production, 500k+ viewers
5. **Team discipline:** Small team (3-8 people), high autonomy, clear metrics

**Risk Management:**
- Go/No-Go gates at Months 3, 6, 12, 24 (data-driven decisions)
- Contingency plans for retention, monetization, competitive threats
- Flexible esports investment (scale back if viewership underperforms)

**Financial Discipline:**
- $3.544M total investment over 3 years
- Profitable by Month 6 (battle pass monetization)
- 96% profit margin by Year 2-3 (software scales efficiently)
- 72.6× ROI on $300M exit

**Next Steps:**
1. Hire founding team (Designer, Engineer, CM) - Weeks 1-4
2. Sprint 1 kickoff (Core Snake gameplay) - Week 3
3. Month 3 go/no-go (MVP retention validation) - Week 12

**This roadmap is the blueprint. Now we build.**

---

**Document End**
**Total Word Count:** 7,347 words
**Version:** 1.0
**Status:** Ready for Execution
