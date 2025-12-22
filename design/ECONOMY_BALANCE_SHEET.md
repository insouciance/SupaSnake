# SupaSnake Economy Balance Sheet

**Version:** 1.0
**Last Updated:** 2025-12-19
**Status:** Pre-Launch Design Document

---

## Executive Summary

SupaSnake's economy is built around **DNA** (soft currency) with a F2P-sustainable model where casual players earn 1,000-1,500 DNA daily. The economy uses **Dynasty Pods** as the premium engagement system (300 DNA per pull) with pity mechanics ensuring fair progression. Breeding creates exponential DNA sinks (200 × Gen²) to prevent currency inflation.

**Key Health Metrics:**
- **Average Daily Surplus:** 500-800 DNA (F2P casual)
- **Time to Dynasty Set (Full):** 180-240 days (F2P)
- **Whale Acceleration:** 30-60 days (with IAP)
- **Sink/Source Ratio:** 1.2:1 (healthy deflation)

---

## 1. Currency Sources (DNA Income)

### 1.1 Core Gameplay Income

| Source | Amount (DNA) | Frequency | Daily Cap | Notes |
|--------|--------------|-----------|-----------|-------|
| **Game Completion** | 50-100 | Per game | Unlimited | Base: 50 DNA + skill bonus (0-50) |
| **Daily Streak** | 100 | Daily | 100 | Day 1: 100, Day 7: 700 (cumulative) |
| **Achievement** | 200-1,000 | One-time | N/A | 50 achievements × avg 400 DNA |
| **Daily Mission (Easy)** | 50 | Daily | 150 | 3 missions: Kill 10 snakes, Eat 50 food, Survive 5 min |
| **Daily Mission (Medium)** | 100 | Daily | 200 | 2 missions: Reach length 100, Kill boss |
| **Daily Mission (Hard)** | 200 | Daily | 200 | 1 mission: Top 3 leaderboard |
| **Clan Contribution** | 50-200 | Daily | 200 | Donate DNA, participate in clan wars |
| **Leaderboard Rewards** | 500-5,000 | Weekly | 5,000 | Top 1: 5,000 DNA, Top 10: 2,000 DNA, Top 100: 500 DNA |
| **Event Participation** | 100-500 | Per event | Varies | Weekend tournaments, seasonal events |
| **Login Bonus** | 50-500 | Daily | 500 | Days 1-6: 50-100 DNA, Day 7: 500 DNA |
| **Ad Watch** | 25 | Per ad | 200 | 8 ads/day maximum (200 DNA total) |
| **Referral Bonus** | 500 | Per referral | 5,000 | Friend reaches level 10 |

**Daily Income Breakdown (by Player Type):**

| Player Type | Daily DNA | Breakdown |
|-------------|-----------|-----------|
| **Casual F2P** | 1,000-1,500 | Game completion (300) + Missions (350) + Login (50-100) + Ads (200) + Streak (100) |
| **Hardcore F2P** | 2,500-3,500 | Casual + Leaderboard (500-2,000) + Events (500) + Clan (200) |
| **Whale (with IAP)** | 10,000+ | Hardcore + Direct DNA purchase (5,000-50,000) |

---

### 1.2 In-App Purchase Income (IAP)

| Package | DNA Amount | USD Price | DNA per $ | Notes |
|---------|------------|-----------|-----------|-------|
| **Starter Pack** | 1,000 DNA | $0.99 | 1,010 | One-time offer (first purchase bonus: +10%) |
| **Small Pack** | 2,500 DNA | $4.99 | 501 | Standard conversion |
| **Medium Pack** | 6,000 DNA | $9.99 | 601 | +20% bonus |
| **Large Pack** | 15,000 DNA | $19.99 | 750 | +50% bonus |
| **Mega Pack** | 40,000 DNA | $49.99 | 800 | +100% bonus |
| **Battle Pass** | 10,000 DNA | $9.99 | 1,001 | + Exclusive skins + 3 Legendary snakes |
| **Monthly VIP** | 3,000 DNA | $4.99 | 601 | + Daily 100 DNA (total 3,000/month) + No ads |

**Estimated Monthly IAP Revenue (per paying user):**
- **Minnow:** $5-10/month (1 Small Pack)
- **Dolphin:** $20-50/month (2 Medium Packs + Battle Pass)
- **Whale:** $100-500/month (Multiple Mega Packs + VIP + Battle Pass)

---

## 2. Currency Sinks (DNA Spending)

### 2.1 Breeding System Costs

| Action | DNA Cost | Formula | Notes |
|--------|----------|---------|-------|
| **Gen 1 → Gen 2** | 200 DNA | 200 × (1²) | Base breeding cost |
| **Gen 2 → Gen 3** | 800 DNA | 200 × (2²) | Exponential growth |
| **Gen 3 → Gen 4** | 1,800 DNA | 200 × (3²) | |
| **Gen 4 → Gen 5** | 3,200 DNA | 200 × (4²) | |
| **Gen 5 → Gen 6** | 5,000 DNA | 200 × (5²) | |
| **Gen 10 (Max)** | 20,000 DNA | 200 × (10²) | Endgame breeding |

**Total DNA to Max Out Single Snake (Gen 1 → Gen 10):**
- Formula: Σ(200 × n²) for n = 1 to 10
- **Total: 77,000 DNA**

**Breeding Cooldowns (Optional Sink):**
- **Skip 1 Hour:** 50 DNA
- **Skip 6 Hours:** 200 DNA
- **Skip 24 Hours:** 500 DNA

---

### 2.2 DNA Pod System (Gacha)

| Pod Type | DNA Cost | Drop Rates | Expected Value |
|----------|----------|------------|----------------|
| **Basic Pod** | 50 DNA | 80% Common, 15% Rare, 5% Epic | 1.25 commons per pull |
| **Advanced Pod** | 150 DNA | 60% Common, 25% Rare, 12% Epic, 3% Legendary | 0.6 commons, 0.25 rare per pull |
| **Dynasty Pod** | 300 DNA | 60% Common, 25% Rare, 10% Epic, 4% Legendary, 1% Mythic | Premium gacha |

**Dynasty Pod Pity System:**
- **Epic Pity:** Guaranteed epic every 5 pulls (1,500 DNA)
- **Legendary Pity:** Guaranteed legendary every 100 pulls (30,000 DNA)
- **Mythic Pity:** Guaranteed mythic every 250 pulls (75,000 DNA)

**Expected DNA Cost per Rarity (Dynasty Pod):**

| Rarity | Drop Rate | Expected Cost | With Pity |
|--------|-----------|---------------|-----------|
| Common | 60% | 500 DNA | 500 DNA |
| Rare | 25% | 1,200 DNA | 1,200 DNA |
| Epic | 10% | 3,000 DNA | 1,500 DNA (pity at 5 pulls) |
| Legendary | 4% | 7,500 DNA | 7,500 DNA (avg before pity) |
| Mythic | 1% | 30,000 DNA | 25,000 DNA (avg before pity) |

---

### 2.3 Other DNA Sinks

| Sink | DNA Cost | Frequency | Notes |
|------|----------|-----------|-------|
| **Cosmetic Skins** | 500-5,000 | One-time | Common: 500, Rare: 1,500, Epic: 3,000, Legendary: 5,000 |
| **Arena Entry (Premium)** | 100 | Per entry | High-stakes competitive mode |
| **Clan Creation** | 1,000 | One-time | Create private clan |
| **Clan Upgrades** | 500-10,000 | Per tier | Clan level 1→10 (total: 50,000 DNA) |
| **Inventory Expansion** | 200 | Per 10 slots | Max 200 slots (4,000 DNA total) |
| **Revive in Game** | 100 | Per revive | Continue after death (max 3/game) |
| **Energy Refill** | 50 | Per refill | Instant energy restore (if energy system active) |
| **Name Change** | 500 | Per change | Vanity sink |

---

## 3. Daily Balance Analysis

### 3.1 Player Personas

#### **Persona A: Casual F2P (60% of player base)**
**Daily Play:** 30-60 minutes
**Daily Income:** 1,200 DNA
**Daily Spending:** 300-600 DNA
**Net Surplus:** +600-900 DNA/day

**Income Sources:**
- Game completion: 300 DNA (6 games × 50 DNA)
- Daily missions: 350 DNA (Easy + Medium)
- Login bonus: 100 DNA
- Ads: 200 DNA (8 ads)
- Streak: 100 DNA
- **Total: 1,050 DNA**

**Spending Habits:**
- 1 Dynasty Pod every 3 days (300 DNA)
- 1 Breeding event per week (200 DNA avg)
- **Daily avg: 200 DNA**

**Net: +850 DNA/day**

---

#### **Persona B: Hardcore F2P (30% of player base)**
**Daily Play:** 2-4 hours
**Daily Income:** 3,000 DNA
**Daily Spending:** 1,500-2,000 DNA
**Net Surplus:** +1,000-1,500 DNA/day

**Income Sources:**
- Casual income: 1,050 DNA
- Leaderboard (weekly avg): 1,000 DNA/day (Top 100)
- Clan contributions: 200 DNA
- Events: 500 DNA
- **Total: 2,750 DNA**

**Spending Habits:**
- 3 Dynasty Pods/day (900 DNA)
- Breeding (Gen 3-5): 600 DNA/day avg
- Arena entries: 200 DNA
- **Daily avg: 1,700 DNA**

**Net: +1,050 DNA/day**

---

#### **Persona C: Whale (5% of player base)**
**Daily Play:** 1-6 hours
**Daily Income:** 10,000+ DNA (includes IAP)
**Daily Spending:** 5,000-10,000 DNA
**Net Surplus:** Unlimited (IAP)

**Income Sources:**
- Hardcore income: 2,750 DNA
- IAP (monthly avg): 15,000 DNA ($50 Mega Pack/week)
- **Total: ~7,000 DNA/day avg**

**Spending Habits:**
- 10+ Dynasty Pods/day (3,000 DNA)
- Aggressive breeding (Gen 5-10): 2,000 DNA/day
- Cosmetics: 1,000 DNA/day
- Clan upgrades: 500 DNA/day
- **Daily avg: 6,500 DNA**

**Net: +500 DNA/day (hoards for collection completion)**

---

### 3.2 Surplus Accumulation Over Time

| Player Type | Day 7 | Day 30 | Day 90 | Day 180 |
|-------------|-------|--------|--------|---------|
| **Casual F2P** | 5,950 | 25,500 | 76,500 | 153,000 |
| **Hardcore F2P** | 7,350 | 31,500 | 94,500 | 189,000 |
| **Whale** | 3,500 + IAP | 15,000 + IAP | 45,000 + IAP | 90,000 + IAP |

**Note:** Assumes steady spending habits. Actual accumulation varies based on events (spending spikes during limited-time offers).

---

## 4. Time-to-Goal Calculations

### 4.1 Collection Goals

#### **Goal 1: Complete Full Dynasty Set (All Mythics)**
**Total Mythics:** 10 (estimated)
**Expected Cost per Mythic:** 25,000 DNA (avg with pity)
**Total DNA Required:** 250,000 DNA

**Time to Complete (F2P Casual):**
- Daily surplus: 850 DNA
- **Days required: 294 days (~10 months)**

**Time to Complete (F2P Hardcore):**
- Daily surplus: 1,050 DNA
- **Days required: 238 days (~8 months)**

**Time to Complete (Whale with $200 IAP):**
- IAP DNA: 80,000 DNA (2× $49.99 Mega Packs)
- Remaining: 170,000 DNA
- Daily surplus: 1,050 DNA + IAP
- **Days required: 60 days (~2 months)**

---

#### **Goal 2: Max Out Single Snake (Gen 10)**
**Total DNA Required:** 77,000 DNA (breeding only)

**Time to Complete (F2P Casual):**
- Daily surplus: 850 DNA
- **Days required: 91 days (~3 months)**

**Time to Complete (F2P Hardcore):**
- Daily surplus: 1,050 DNA
- **Days required: 73 days (~2.5 months)**

**Time to Complete (Whale):**
- Direct purchase: $49.99 Mega Pack (40,000 DNA) + 37,000 DNA farmed
- **Days required: 7-14 days**

---

#### **Goal 3: Unlock All Cosmetic Skins (50 skins)**
**Total DNA Required:** 100,000 DNA (avg 2,000 DNA per skin)

**Time to Complete (F2P Casual):**
- Daily surplus: 850 DNA
- **Days required: 118 days (~4 months)**

**Time to Complete (F2P Hardcore):**
- Daily surplus: 1,050 DNA
- **Days required: 95 days (~3 months)**

---

### 4.2 Weekly Goals (Engagement Targets)

| Goal | DNA Required | F2P Casual (days) | F2P Hardcore (days) |
|------|--------------|-------------------|---------------------|
| **10 Dynasty Pods** | 3,000 DNA | 3.5 days | 2.9 days |
| **1 Legendary Snake** | 7,500 DNA | 8.8 days | 7.1 days |
| **Gen 5 Snake** | 6,200 DNA | 7.3 days | 5.9 days |
| **Epic Skin** | 3,000 DNA | 3.5 days | 2.9 days |

**Insight:** Weekly goals are achievable within 3-9 days for F2P players, maintaining engagement loop without frustration.

---

## 5. Sensitivity Analysis

### 5.1 Drop Rate Variations (Dynasty Pod)

#### **Scenario 1: +5% Legendary Rate (4% → 9%)**

| Rarity | Old Rate | New Rate | Old Expected Cost | New Expected Cost | Change |
|--------|----------|----------|-------------------|-------------------|--------|
| Legendary | 4% | 9% | 7,500 DNA | 3,333 DNA | **-56%** |
| Mythic | 1% | 1% | 30,000 DNA | 30,000 DNA | 0% |

**Impact:**
- **Time to Full Dynasty Set:** 294 days → 180 days (F2P Casual)
- **Whale Conversion Risk:** High (less incentive to pay if legendaries too easy)
- **Player Satisfaction:** +15% (more frequent dopamine hits)

**Recommendation:** Do NOT increase legendary rate above 5%. Maintain scarcity for monetization.

---

#### **Scenario 2: -5% Legendary Rate (4% → 1%)**

| Rarity | Old Rate | New Rate | Old Expected Cost | New Expected Cost | Change |
|--------|----------|----------|-------------------|-------------------|--------|
| Legendary | 4% | 1% | 7,500 DNA | 30,000 DNA | **+300%** |

**Impact:**
- **Time to Full Dynasty Set:** 294 days → 800+ days (F2P Casual)
- **Player Frustration:** Critical (F2P feels impossible)
- **Whale Revenue:** +20% (more pressure to pay)
- **Retention Risk:** -30% (players quit due to unfairness)

**Recommendation:** NEVER drop legendary below 3%. Risk of player exodus.

---

#### **Scenario 3: +5% Mythic Rate (1% → 6%)**

| Rarity | Old Rate | New Rate | Old Expected Cost | New Expected Cost | Change |
|--------|----------|----------|-------------------|-------------------|--------|
| Mythic | 1% | 6% | 30,000 DNA | 5,000 DNA | **-83%** |

**Impact:**
- **Time to Full Dynasty Set:** 294 days → 60 days (F2P Casual)
- **Collection Value:** Destroyed (everyone has mythics)
- **Revenue Impact:** -60% (no reason to pay)
- **Prestige System:** Broken (mythics no longer special)

**Recommendation:** CRITICAL RISK. Mythic rate must stay 0.5%-2% maximum.

---

### 5.2 Daily Income Variations

#### **Scenario 4: Daily Income +20% (1,200 → 1,440 DNA)**

**Impact:**
- **Daily Surplus:** 850 → 1,090 DNA (+28%)
- **Time to Dynasty Set:** 294 → 229 days (-22%)
- **Player Satisfaction:** +10% (faster progression)
- **Monetization Risk:** -5% (less pressure to pay)

**Use Case:** Temporary event boost, seasonal generosity, retention recovery.

---

#### **Scenario 5: Daily Income -20% (1,200 → 960 DNA)**

**Impact:**
- **Daily Surplus:** 850 → 610 DNA (-28%)
- **Time to Dynasty Set:** 294 → 410 days (+39%)
- **Player Frustration:** High (progression too slow)
- **Churn Risk:** +15%

**Recommendation:** AVOID. Only acceptable during economy rebalance with compensation package.

---

### 5.3 Breeding Cost Variations

#### **Scenario 6: Breeding Cost -50% (200 × Gen² → 100 × Gen²)**

**Impact:**
- **Max Out Gen 10:** 77,000 DNA → 38,500 DNA (-50%)
- **Time to Max (F2P Casual):** 91 days → 45 days (-50%)
- **Inflation Risk:** HIGH (players hoard DNA, no sink)
- **Breeding Engagement:** +30% (more experimentation)

**Recommendation:** Acceptable during "Breeding Festival" event (limited time).

---

## 6. Economy Health Metrics (Post-Launch)

### 6.1 Monitoring Dashboard (Weekly KPIs)

| Metric | Target | Warning Threshold | Critical Threshold | Action |
|--------|--------|-------------------|-------------------|--------|
| **Average DNA Balance (All Users)** | 5,000-10,000 | >15,000 | >25,000 | Introduce new sinks (cosmetics, events) |
| **Average DNA Balance (F2P)** | 3,000-8,000 | >12,000 | >20,000 | Reduce daily income sources |
| **Average DNA Balance (Whale)** | 10,000-50,000 | >100,000 | >200,000 | Create prestige sinks (clan upgrades, rare cosmetics) |
| **% Players with 0 DNA** | <5% | 5-10% | >10% | Increase daily income (emergency generosity) |
| **Daily DNA Earned (Median)** | 1,200 | <800 | <600 | Buff missions, events |
| **Daily DNA Spent (Median)** | 400-800 | <200 | <100 | Spending too low (add urgency, limited offers) |
| **Sink/Source Ratio** | 1.0-1.2 | 0.8-0.9 | <0.8 | Hyperinflation risk (emergency sinks) |
| **Dynasty Pod Pulls per Day (Median)** | 1-2 | <0.5 | <0.2 | Players not engaging with gacha |
| **% Players Pulling Dynasty Pods Weekly** | 70-80% | 50-60% | <50% | Gacha engagement dead (increase drop rates temporarily) |
| **Average Breeding Events per Day** | 0.5-1.5 | <0.3 | <0.1 | Breeding disengagement (reduce costs, add event) |

---

### 6.2 Cohort Analysis (by Install Week)

Track DNA balance trajectory by cohort:

| Cohort | Day 7 Avg DNA | Day 30 Avg DNA | Day 90 Avg DNA | Health Status |
|--------|---------------|----------------|----------------|---------------|
| **Week 1** | 6,000 | 26,000 | 78,000 | Healthy (within predicted range) |
| **Week 2** | 7,500 | 32,000 | 96,000 | Warning (hoarding, need sinks) |
| **Week 3** | 3,000 | 12,000 | 36,000 | Concerning (too much spending, check if frustrated) |

**Analysis Questions:**
- Are older cohorts hoarding DNA (inflation risk)?
- Are newer cohorts spending too fast (frustration risk)?
- Do whale cohorts maintain engagement (retention)?

---

### 6.3 A/B Test Framework

**Test:** Dynasty Pod drop rate 4% legendary vs 5% legendary

| Metric | Control (4%) | Variant (5%) | Winner |
|--------|--------------|--------------|--------|
| **7-Day Retention** | 45% | 48% | Variant (+3% retention) |
| **Average DNA Balance (Day 30)** | 26,000 | 22,000 | Control (less inflation) |
| **IAP Revenue per User** | $3.20 | $2.80 | Control (-12% revenue) |
| **Player Satisfaction (Survey)** | 7.2/10 | 7.8/10 | Variant (+0.6 satisfaction) |

**Decision:** Launch with 4% (control) but run seasonal events with 5% boost during retention pushes.

---

## 7. Inflation Prevention Strategies

### 7.1 Dynamic DNA Sinks

**Problem:** Long-term players accumulate 100,000+ DNA with nothing to spend on.

**Solutions:**

#### **Sink 1: Prestige System (Endgame Sink)**
- **Cost:** 50,000 DNA per prestige level
- **Benefit:** Exclusive cosmetics, clan perks, leaderboard badges
- **Target:** Players with >50,000 DNA (top 10%)
- **Estimated Monthly Sink:** 200,000 DNA per whale

#### **Sink 2: Clan Territory Wars**
- **Cost:** 10,000 DNA clan buy-in (500 DNA per member × 20 members)
- **Benefit:** Winning clan gets exclusive snakes, territory on map
- **Frequency:** Monthly
- **Estimated Participation:** 30% of active clans (150 clans × 10,000 DNA = 1.5M DNA monthly)

#### **Sink 3: Limited-Time Cosmetics (FOMO)**
- **Cost:** 5,000-10,000 DNA
- **Availability:** 48-hour flash sales
- **Frequency:** Weekly
- **Target:** Completionists, collectors
- **Estimated Weekly Sink:** 500,000 DNA (10,000 players × 50 DNA avg)

#### **Sink 4: DNA Lottery**
- **Cost:** 1,000 DNA per ticket
- **Prize:** 1 Mythic snake (random)
- **Draw:** Weekly
- **Odds:** 1 in 500
- **Expected Value:** -800 DNA per ticket (house edge)
- **Appeal:** Whales gambling for specific mythics

#### **Sink 5: Breeding Re-Rolls**
- **Cost:** 500 DNA per re-roll
- **Benefit:** Re-randomize offspring traits
- **Use Case:** Hunting perfect IV snakes
- **Target:** Hardcore breeders (top 20%)

---

### 7.2 Seasonal DNA Drains (Events)

| Event | Duration | DNA Sink | Frequency | Target Audience |
|-------|----------|----------|-----------|-----------------|
| **Breeding Festival** | 7 days | 50% off breeding (increases volume) | Quarterly | All players |
| **Dynasty Deluge** | 3 days | 2× Dynasty Pod rewards (encourages pulling) | Monthly | F2P + Dolphins |
| **Collector's Auction** | 48 hours | Rare cosmetics (5,000-20,000 DNA) | Monthly | Whales |
| **Clan Championship** | 14 days | Clan entry fees (10,000 DNA) | Quarterly | Competitive players |
| **Prestige Rush** | 30 days | Double prestige XP (encourages spending) | Seasonal | Endgame players |

**Total Seasonal Sink (per quarter):** 5-10M DNA across player base.

---

### 7.3 Emergency Deflation Mechanisms

**Scenario:** Average DNA balance exceeds 20,000 (inflation alert).

**Response Plan:**

1. **Week 1: Soft Measures**
   - Launch limited-time cosmetics (5,000-10,000 DNA)
   - Announce upcoming prestige system (create anticipation to hoard)
   - Increase breeding event frequency (+50% DNA spent)

2. **Week 2: Medium Measures**
   - Flash sale: "Spend 10,000 DNA, get exclusive Mythic egg"
   - Clan tournament with 10,000 DNA buy-in
   - Introduce DNA → Cosmetic conversion (permanent sink)

3. **Week 3: Hard Measures**
   - DNA decay mechanic (lose 1% DNA per week if >50,000 balance)
   - Forced spending event: "Spend 5,000 DNA to unlock next season content"
   - Emergency IAP discount (convert DNA hoarders to spenders)

**Goal:** Reduce average balance to 12,000-15,000 within 3 weeks.

---

### 7.4 Anti-Inflation Design Principles

1. **Exponential Costs:** Breeding scales with Gen² (prevents unlimited progression)
2. **Cosmetic Tiers:** Rare skins cost 10× common skins (whales spend more)
3. **Limited Inventory:** Cap snake collection at 200 (forces strategic breeding)
4. **Time-Gated Events:** Clan wars every month (creates urgency to spend)
5. **No DNA Trading:** Prevent player-to-player transfers (kills black market economy)

---

## 8. Revenue Projections (Conservative)

### 8.1 Monthly Revenue Estimate (10,000 Active Players)

| Player Segment | % of Base | Players | ARPU (monthly) | Revenue |
|----------------|-----------|---------|----------------|---------|
| **F2P (Non-Payers)** | 85% | 8,500 | $0 | $0 |
| **Minnow** | 10% | 1,000 | $7 | $7,000 |
| **Dolphin** | 4% | 400 | $35 | $14,000 |
| **Whale** | 1% | 100 | $200 | $20,000 |
| **Total** | 100% | 10,000 | **$4.10** | **$41,000/month** |

**Annual Revenue:** $492,000/year (10K MAU)

**Scaling:**
- **100K MAU:** $4.92M/year
- **1M MAU:** $49.2M/year (optimistic, assumes retention holds)

---

### 8.2 LTV (Lifetime Value) by Segment

| Segment | Avg Lifespan (months) | Monthly ARPU | LTV |
|---------|----------------------|--------------|-----|
| **F2P** | 6 months | $0 | $0 |
| **Minnow** | 8 months | $7 | $56 |
| **Dolphin** | 12 months | $35 | $420 |
| **Whale** | 18 months | $200 | $3,600 |

**Blended LTV (across all users):** $48 (15% payers × $320 avg LTV)

**CPI Target (break-even):** $20-30 (need 60-70% margin for profitability)

---

## 9. Balancing Recommendations

### 9.1 Launch Settings (Day 1)

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **Daily F2P Income** | 1,200 DNA | Allows 1 Dynasty Pod every 3 days (sustainable) |
| **Dynasty Pod Cost** | 300 DNA | Premium feel, not too expensive |
| **Legendary Drop Rate** | 4% | Rare but achievable (pity at 100 pulls = 30,000 DNA) |
| **Mythic Drop Rate** | 1% | Ultra-rare (pity at 250 pulls = 75,000 DNA) |
| **Breeding Base Cost** | 200 DNA × Gen² | Exponential sink prevents inflation |
| **Pity (Epic)** | 5 pulls | Frequent enough to prevent frustration |
| **Pity (Legendary)** | 100 pulls | Achievable in 3-4 months F2P |

---

### 9.2 Post-Launch Tuning (Month 1-3)

**Monitor:**
- If >15% players quit within 7 days → Increase daily income +20%
- If average DNA balance >15,000 → Introduce prestige sink
- If <50% players pull Dynasty Pods weekly → Reduce cost to 250 DNA or increase drop rates
- If IAP conversion <5% → Add starter pack ($0.99 for 2,000 DNA + Legendary)

---

### 9.3 Seasonal Adjustments (Quarters)

| Quarter | Economy Change | Goal |
|---------|---------------|------|
| **Q1 (Launch)** | Conservative income (1,200 DNA/day) | Build scarcity, establish value |
| **Q2** | +10% income (events, bonuses) | Retention boost for early adopters |
| **Q3** | Introduce prestige sink | Drain accumulated DNA from Q1-Q2 players |
| **Q4** | Limited-time Mythic rate boost (1% → 2%) | Holiday generosity, re-engage churned users |

---

## 10. Appendix: Formulas & Calculations

### 10.1 Expected DNA Cost per Rarity

**Formula:**
```
Expected Cost = Pod Cost / Drop Rate
```

**Example (Dynasty Pod Legendary):**
```
Expected Cost = 300 DNA / 0.04 = 7,500 DNA
```

**With Pity (Legendary every 100 pulls):**
```
Average Cost = (Expected Cost + Pity Cost) / 2
Average Cost = (7,500 + 30,000) / 2 = 18,750 DNA (no pity)
Average Cost = 7,500 DNA (before pity triggers on average)
```

---

### 10.2 Breeding Total Cost (Gen 1 → Gen N)

**Formula:**
```
Total Cost = Σ(200 × n²) for n = 1 to N
```

**Example (Gen 1 → Gen 10):**
```
Total = 200×(1² + 2² + 3² + 4² + 5² + 6² + 7² + 8² + 9² + 10²)
Total = 200×(1 + 4 + 9 + 16 + 25 + 36 + 49 + 64 + 81 + 100)
Total = 200 × 385 = 77,000 DNA
```

---

### 10.3 Time to Goal (F2P)

**Formula:**
```
Days = Total DNA Required / Daily Surplus
```

**Example (Full Dynasty Set, F2P Casual):**
```
Days = 250,000 DNA / 850 DNA per day = 294 days
```

---

### 10.4 Sink/Source Ratio

**Formula:**
```
Ratio = Total Daily DNA Spent / Total Daily DNA Earned
```

**Healthy Range:** 1.0-1.2 (slight deflation, currency maintains value)

**Example (F2P Casual):**
```
Daily Earned: 1,200 DNA
Daily Spent: 400 DNA
Ratio = 400 / 1,200 = 0.33 (low spending, risk of hoarding)
```

**Corrective Action:** Introduce limited-time offers to increase spending to 600-800 DNA/day (ratio → 0.5-0.67).

---

## 11. Conclusion

SupaSnake's economy is designed for **sustainable F2P progression** (1,000-1,500 DNA daily) with **exponential sinks** (breeding) to prevent inflation. Dynasty Pods at 300 DNA with 4% legendary drop rate balance **player satisfaction** (achievable goals) with **monetization pressure** (whales accelerate progress).

**Key Success Factors:**
1. **Pity System:** Guarantees legendaries within 100 pulls (prevents rage-quit)
2. **Exponential Breeding:** Gen 10 costs 20,000 DNA (endgame sink)
3. **Seasonal Events:** Temporary DNA boosts + sinks maintain engagement
4. **Monitoring:** Weekly KPI dashboard prevents hyperinflation

**Risk Mitigation:**
- Never drop legendary rate below 3% (retention killer)
- Always maintain 500-1,000 DNA daily surplus for F2P (feels rewarding)
- Introduce prestige sinks before average balance hits 20,000 DNA

**Next Steps:**
1. Implement monitoring dashboard (track KPIs in Supabase)
2. A/B test Dynasty Pod pricing (300 vs 250 DNA)
3. Design prestige system (50,000 DNA sink for endgame)
4. Launch with conservative settings, tune monthly based on data

---

**Document Maintenance:**
- Update after each major economy change
- Review quarterly based on live data
- Archive old versions in `/design/archive/`

**Last Reviewed:** 2025-12-19
**Next Review:** 2026-01-19 (post-launch data analysis)
