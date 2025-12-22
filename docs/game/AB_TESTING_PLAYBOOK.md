# A/B Testing Playbook - SupaSnake

**Version:** 1.0
**Last Updated:** 2025-12-19
**Owner:** Growth Team
**Status:** Active

---

## Table of Contents

1. [Platform Architecture](#1-platform-architecture)
2. [Experiment Methodology](#2-experiment-methodology)
3. [Sample Size Calculator](#3-sample-size-calculator)
4. [Statistical Rigor](#4-statistical-rigor)
5. [Rollout Gates](#5-rollout-gates)
6. [Experiment Catalog Template](#6-experiment-catalog-template)
7. [Guardrail Metrics](#7-guardrail-metrics)
8. [First 10 Experiments](#8-first-10-experiments)
9. [Common Pitfalls](#9-common-pitfalls)
10. [Quick Reference](#10-quick-reference)

---

## 1. Platform Architecture

### How Amplitude + Statsig Work Together

```
┌─────────────────────────────────────────────────────────┐
│                     User Session                         │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│                  Statsig SDK                             │
│  • Assigns user to test variant (A/B/C)                  │
│  • Evaluates feature flags                               │
│  • Logs exposure events                                  │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│              Application Logic                           │
│  • Renders UI based on variant                           │
│  • Applies game config changes                           │
│  • Triggers user events                                  │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│                 Amplitude SDK                            │
│  • Tracks user events with variant metadata              │
│  • Sends to Amplitude for analysis                       │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│            Analytics Pipeline                            │
│  Statsig: Exposure logs → automatic analysis             │
│  Amplitude: Event data → custom analysis                 │
└─────────────────────────────────────────────────────────┘
```

### Current Setup

**Statsig Configuration:**
- Environment Variable: `NEXT_PUBLIC_STATSIG_CLIENT_KEY`
- Purpose: Feature flags, A/B test assignment, dynamic config
- Implementation Location: `/src/lib/statsig/client.ts` (to be created)

**Amplitude Configuration:**
- Environment Variable: `NEXT_PUBLIC_AMPLITUDE_API_KEY`
- Purpose: Event tracking, funnel analysis, retention metrics
- Implementation Location: `/src/lib/analytics/amplitude.ts`

**Integration Pattern:**
```typescript
// 1. Get variant from Statsig
const variant = statsig.getExperiment('game_difficulty_test').get('difficulty', 'medium');

// 2. Track exposure to Amplitude
amplitude.track('experiment_exposure', {
  experiment_name: 'game_difficulty_test',
  variant: variant,
  user_id: userId,
});

// 3. Apply variant logic
const gameConfig = variant === 'easy' ? EASY_CONFIG : MEDIUM_CONFIG;

// 4. Track outcome events
amplitude.track('game_completed', {
  difficulty: variant,
  score: finalScore,
  duration_seconds: gameDuration,
});
```

---

## 2. Experiment Methodology

### The 5-Phase Process

#### Phase 1: Hypothesis (1-2 days)

**Template:**
```
HYPOTHESIS: [Specific change] will increase [target metric] by [expected %] because [user psychology reason].

EXAMPLE: Adding a progress bar to the game UI will increase D1 retention by 8% because players will feel a sense of achievement and want to complete the next milestone.

RATIONALE:
- Current problem: 45% of new players quit after 1st game
- User feedback: "Didn't know if I was making progress"
- Behavioral principle: Goal gradient effect (closer to goal = higher motivation)
- Comparable data: Duolingo saw +12% retention with progress indicators
```

**Requirements for Strong Hypothesis:**
- [ ] Based on qualitative data (user feedback, session recordings, support tickets)
- [ ] Based on quantitative data (funnel drop-off, heatmaps, retention cohorts)
- [ ] Specific metric target (not "increase retention" but "increase D1 from 45% to 53%")
- [ ] Behavioral mechanism (why will users respond this way?)
- [ ] Comparable case study (has this worked elsewhere?)

#### Phase 2: Design (2-3 days)

**Test Design Checklist:**
- [ ] **Primary Metric:** D1/D7/D30 retention, revenue, engagement time
- [ ] **Secondary Metrics:** Session length, games played, share rate
- [ ] **Guardrail Metrics:** Crash rate, load time, revenue per user
- [ ] **Variants:** Control (current) + 1-2 treatments (keep it simple)
- [ ] **Traffic Allocation:** 50/50 for 2-variant, 33/33/33 for 3-variant
- [ ] **Duration:** Minimum 7 days, ideally 14 days (capture weekly patterns)
- [ ] **Sample Size:** Calculated via formula (see Section 3)
- [ ] **Exclusions:** Staff users, bots, users <13 years old (if COPPA applies)

**Variant Naming Convention:**
```
Experiment ID: game_difficulty_v1
Control: difficulty_medium (current default)
Treatment A: difficulty_easy
Treatment B: difficulty_adaptive (scales with skill)

Statsig Config:
{
  "experiment_name": "game_difficulty_v1",
  "variants": {
    "control": { "difficulty": "medium" },
    "easy": { "difficulty": "easy" },
    "adaptive": { "difficulty": "adaptive" }
  },
  "allocation": {
    "control": 0.34,
    "easy": 0.33,
    "adaptive": 0.33
  }
}
```

#### Phase 3: Implementation (3-5 days)

**Code Checklist:**
```typescript
// 1. Create Statsig experiment in dashboard
// 2. Implement variant logic
import { useExperiment } from '@/lib/statsig/hooks';

export function GameCanvas() {
  const { value: difficulty, isLoading } = useExperiment(
    'game_difficulty_v1',
    'difficulty',
    'medium' // fallback if Statsig fails
  );

  // 3. Track exposure event
  useEffect(() => {
    if (!isLoading) {
      amplitude.track('experiment_exposure', {
        experiment_name: 'game_difficulty_v1',
        variant: difficulty,
      });
    }
  }, [difficulty, isLoading]);

  // 4. Apply variant
  const gameConfig = useMemo(() => {
    switch (difficulty) {
      case 'easy':
        return { speed: 80, obstacles: 2 };
      case 'adaptive':
        return adaptiveDifficulty(userSkillLevel);
      default:
        return { speed: 100, obstacles: 3 }; // medium
    }
  }, [difficulty]);

  return <Game config={gameConfig} />;
}
```

**Pre-Launch QA:**
- [ ] Verify variant assignment (check Statsig dashboard user lookup)
- [ ] Confirm exposure events firing (check Amplitude user stream)
- [ ] Test all variants manually (force assignment via Statsig overrides)
- [ ] Verify guardrail metrics tracking (crash rate, load time)
- [ ] Check edge cases (offline mode, slow network, SDK timeout)
- [ ] Validate on iOS/Android/Web (platform-specific bugs)

#### Phase 4: Analysis (1-3 days after completion)

**Statistical Analysis Workflow:**

1. **Check Data Quality (Day 1 of experiment)**
```sql
-- Amplitude SQL: Verify exposure events are balanced
SELECT
  event_properties.variant,
  COUNT(DISTINCT user_id) as users,
  COUNT(*) as exposures
FROM amplitude_events
WHERE event_type = 'experiment_exposure'
  AND event_properties.experiment_name = 'game_difficulty_v1'
  AND event_time >= '2025-12-19'
GROUP BY 1;

-- Expected: ~33% each variant, no missing variants
```

2. **Monitor Daily (Days 2-7)**
- Check Statsig dashboard for automated results
- Watch guardrail metrics (alert if crash rate >2%)
- Review qualitative feedback (support tickets, app reviews)

3. **Final Analysis (Day 8+)**
```
PRIMARY METRIC: D1 Retention
Statsig Output:
  Control:    45.2% (n=3,421)
  Easy:       52.8% (n=3,398)  [+7.6pp, p=0.003] ✓
  Adaptive:   48.1% (n=3,412)  [+2.9pp, p=0.12]  ✗

INTERPRETATION:
- Easy variant: Statistically significant winner (p<0.01)
- Adaptive variant: Underpowered, not significant
- Effect size: +16.8% relative increase (7.6pp / 45.2%)

SECONDARY METRICS:
  Session Length:
    Control: 4.2 min
    Easy: 5.8 min (+38%, p<0.01) ✓
  Revenue per User (Day 1):
    Control: $0.12
    Easy: $0.14 (+16%, p=0.08) ~ (borderline)

GUARDRAILS:
  Crash Rate: 1.2% (all variants) ✓
  Load Time: 1.8s (all variants) ✓
```

4. **Decision Matrix**

| Outcome | Action |
|---------|--------|
| Primary metric improved (p<0.05) + Guardrails pass | Ship to 100% |
| Primary metric improved (0.05<p<0.10) | Run another week or increase sample |
| Primary metric neutral (p>0.10) | Kill experiment, try new hypothesis |
| Primary metric worse (p<0.05) | Kill immediately, investigate why |
| Guardrail metric regressed | Kill immediately, fix bug |

#### Phase 5: Rollout (1-2 days)

**Gradual Rollout Process:**

```
Day 1: 10% of users (canary deployment)
  - Monitor crash rate, server errors, user complaints
  - If stable for 24h → proceed

Day 2: 50% of users
  - Monitor retention cohorts, revenue impact
  - If stable for 48h → proceed

Day 4: 100% of users
  - Mark experiment as "Shipped" in Statsig
  - Remove feature flag code (hardcode winning variant)
  - Document learnings in experiment catalog
```

**Rollback Procedure:**
```typescript
// Emergency rollback (if crash rate spikes)
// 1. Go to Statsig dashboard
// 2. Set experiment allocation to 100% control
// 3. Or disable experiment entirely (uses fallback value)

// Code-level killswitch
const EMERGENCY_DISABLE = false; // Set to true if Statsig is down

export function GameCanvas() {
  const difficulty = EMERGENCY_DISABLE
    ? 'medium' // safe fallback
    : statsig.getExperiment('game_difficulty_v1').get('difficulty', 'medium');

  // ...
}
```

---

## 3. Sample Size Calculator

### Formula (for two-variant tests)

**Required sample size per variant:**

```
n = (Z_α/2 + Z_β)² × 2 × p × (1-p) / (MDE)²

Where:
  n = sample size per variant
  Z_α/2 = 1.96 (for 95% confidence, two-tailed)
  Z_β = 0.84 (for 80% power)
  p = baseline conversion rate (e.g., 0.45 for 45% D1 retention)
  MDE = minimum detectable effect (e.g., 0.05 for 5 percentage points)
```

### Practical Examples

**Example 1: D1 Retention Test**
```
Baseline: 45% D1 retention
Target: 50% D1 retention (5pp increase, 11% relative)
Confidence: 95%
Power: 80%

Calculation:
  p = 0.45
  MDE = 0.05
  n = (1.96 + 0.84)² × 2 × 0.45 × 0.55 / (0.05)²
  n = 7.84 × 0.495 / 0.0025
  n = 1,553 users per variant

Total needed: 3,106 users (both variants)
```

**Example 2: Revenue Test (smaller baseline)**
```
Baseline: 5% conversion to paid
Target: 6% conversion (1pp increase, 20% relative)
Confidence: 95%
Power: 80%

Calculation:
  p = 0.05
  MDE = 0.01
  n = (1.96 + 0.84)² × 2 × 0.05 × 0.95 / (0.01)²
  n = 7.84 × 0.095 / 0.0001
  n = 7,448 users per variant

Total needed: 14,896 users
```

### Quick Reference Table

**D1 Retention (baseline 45%)**

| MDE (pp) | Relative Lift | Users per Variant | Total Users | Days @ 1k DAU |
|----------|---------------|-------------------|-------------|---------------|
| 2pp      | 4.4%          | 9,754             | 19,508      | 20 days       |
| 3pp      | 6.7%          | 4,335             | 8,670       | 9 days        |
| 5pp      | 11%           | 1,553             | 3,106       | 4 days        |
| 7pp      | 15.5%         | 793               | 1,586       | 2 days        |
| 10pp     | 22%           | 385               | 770         | 1 day         |

**D7 Retention (baseline 25%)**

| MDE (pp) | Relative Lift | Users per Variant | Total Users | Days @ 1k DAU |
|----------|---------------|-------------------|-------------|---------------|
| 3pp      | 12%           | 5,082             | 10,164      | 11 days       |
| 5pp      | 20%           | 1,800             | 3,600       | 4 days        |
| 7pp      | 28%           | 909               | 1,818       | 2 days        |

**Revenue per User (baseline $0.15)**

| MDE ($)  | Relative Lift | Users per Variant | Total Users | Days @ 1k DAU |
|----------|---------------|-------------------|-------------|---------------|
| $0.02    | 13%           | ~12,000*          | ~24,000     | 24 days       |
| $0.03    | 20%           | ~5,500*           | ~11,000     | 11 days       |
| $0.05    | 33%           | ~2,000*           | ~4,000      | 4 days        |

*Revenue tests use t-test formula (assumes normal distribution of revenue)

### Duration Calculator

```
Duration (days) = Total Users Needed / Daily Active Users

Example:
  Need 3,106 users total
  Current DAU: 1,200
  50% in experiment (600/day)
  Duration = 3,106 / 600 = 5.2 days → round up to 7 days
```

**Recommended Minimum Durations:**
- Retention tests: 7 days (capture full week cycle)
- Revenue tests: 14 days (capture payment cycles)
- Engagement tests: 3 days (quick iteration)
- Onboarding tests: 7 days (see D7 impact)

### Online Calculators

**Use these for quick estimates:**
- Evan's Awesome A/B Tools: https://www.evanmiller.org/ab-testing/sample-size.html
- Optimizely Sample Size Calculator: https://www.optimizely.com/sample-size-calculator/
- VWO Calculator: https://vwo.com/tools/ab-test-duration-calculator/

**Input parameters:**
- Baseline conversion rate (current metric value)
- Minimum detectable effect (smallest change you care about)
- Statistical significance (95% = industry standard)
- Statistical power (80% = industry standard)

---

## 4. Statistical Rigor

### P-Value Thresholds

**Standard Significance Levels:**

| Significance Level | P-Value Threshold | Use Case |
|--------------------|-------------------|----------|
| Very Strict        | p < 0.01          | High-risk changes (payment flow, core gameplay) |
| Standard           | p < 0.05          | Most experiments (UI changes, features) |
| Exploratory        | p < 0.10          | Early-stage ideas (need follow-up test) |

**Interpretation:**
- **p < 0.01:** Less than 1% chance this is random noise (99% confident)
- **p < 0.05:** Less than 5% chance this is random noise (95% confident)
- **p < 0.10:** Less than 10% chance this is random noise (90% confident)
- **p > 0.10:** Result is likely random noise (don't ship)

### Multiple Testing Correction

**The Problem:**
If you run 20 experiments at p<0.05, you'll get 1 false positive by chance.

**Solution: Bonferroni Correction**
```
Adjusted α = 0.05 / number of tests

Example:
  Running 3 variants (2 comparisons vs control)
  Adjusted α = 0.05 / 2 = 0.025
  New threshold: p < 0.025 for significance
```

**When to Apply:**
- Testing multiple variants (A vs B vs C)
- Testing multiple metrics (primary + secondary)
- Running multiple experiments simultaneously

**Statsig Handles This Automatically:**
Statsig's built-in analysis applies sequential testing corrections, so you can check results daily without inflating false positives.

### Confidence Intervals

**Report both point estimate and confidence interval:**

```
BAD:  "Easy variant increased retention by 7.6%"
GOOD: "Easy variant increased retention by 7.6% (95% CI: 2.8% to 12.4%)"

INTERPRETATION:
  We're 95% confident the true effect is between +2.8% and +12.4%
  Even the lower bound (+2.8%) is worth shipping
```

**Confidence Interval Formula:**
```
CI = point_estimate ± (Z × standard_error)

For 95% CI: Z = 1.96
For 99% CI: Z = 2.58
```

### Statistical Power

**Definition:** Probability of detecting a true effect if it exists.

**Industry Standard:** 80% power
- Means: 20% chance of missing a real effect (Type II error)
- Tradeoff: Higher power requires larger sample size

**When to Increase Power:**
- High-value experiments (revenue, core retention)
- Small expected effects (need to detect 2-3% lifts)
- One-shot tests (can't run follow-up easily)

**Power Levels:**
- 80%: Standard for most tests
- 90%: High-stakes decisions (requires 1.7x more users)
- 95%: Critical infrastructure changes (requires 2.6x more users)

### Common Statistical Mistakes

#### Mistake 1: Peeking Too Early
**Problem:** Checking results daily and stopping when p<0.05 inflates false positives.

**Solution:**
- Use sequential testing (Statsig does this automatically)
- OR: Pre-commit to sample size and wait
- OR: Use much stricter threshold (p<0.001) for early stopping

#### Mistake 2: Not Running Long Enough
**Problem:** Stopping after 2 days because "it looks good" misses weekly cycles.

**Solution:**
- Always run at least 1 full week (captures weekend vs weekday)
- Retention tests: Run until you measure the metric (7 days for D7)

#### Mistake 3: Cherry-Picking Metrics
**Problem:** Testing 10 metrics and only reporting the 1 that's significant.

**Solution:**
- Pre-register primary metric before launch
- Apply Bonferroni correction to secondary metrics
- Report all metrics tested (null results are valid data)

#### Mistake 4: Comparing Variants Directly
**Problem:** Comparing variant A to variant B (not to control) doubles error rate.

**Solution:**
- Always compare each variant to control separately
- If you must compare variants, apply Bonferroni correction

#### Mistake 5: Ignoring Sample Ratio Mismatch (SRM)
**Problem:** Expecting 50/50 split but seeing 53/47 indicates assignment bug.

**Solution:**
- Check variant balance on Day 1 of experiment
- Use chi-square test: https://www.abtestguide.com/abtestsize/
- If p<0.01 for imbalance → investigate (bot traffic? SDK bug?)

---

## 5. Rollout Gates

### The 3-Stage Rollout Process

#### Stage 1: Canary (10% of users, 24 hours)

**Goal:** Catch catastrophic bugs before they affect everyone.

**Monitoring Checklist:**
- [ ] **Crash Rate:** <2% (if higher, rollback immediately)
- [ ] **Error Rate:** <1% of API calls (check server logs)
- [ ] **Load Time:** <3s p95 (check Amplitude performance events)
- [ ] **User Complaints:** <5 negative reviews/tickets mentioning new feature
- [ ] **Statsig Exposure Events:** Firing for 10% of users (check dashboard)
- [ ] **Amplitude Events:** Downstream events firing (e.g., game_completed after experiment_exposure)

**Rollback Triggers:**
- Crash rate >3% (immediate rollback)
- Revenue drop >10% (immediate rollback)
- Critical bug reported (payment failure, data loss)

**Tools:**
```bash
# Check error rate (last 24h)
# Amplitude SQL
SELECT
  COUNT(*) FILTER (WHERE event_type = 'error') as errors,
  COUNT(*) as total_events,
  (errors::float / total_events) as error_rate
FROM amplitude_events
WHERE event_time >= NOW() - INTERVAL '24 hours';

# Check variant balance
SELECT
  event_properties.variant,
  COUNT(DISTINCT user_id) as users
FROM amplitude_events
WHERE event_type = 'experiment_exposure'
  AND event_properties.experiment_name = 'your_experiment'
GROUP BY 1;
```

#### Stage 2: Majority (50% of users, 48 hours)

**Goal:** Verify results hold at scale and measure business impact.

**Monitoring Checklist:**
- [ ] **Primary Metric:** Trending in expected direction (check Statsig dashboard)
- [ ] **Revenue Impact:** No drop >5% (check payment events)
- [ ] **Engagement:** Session length, games played not regressing
- [ ] **Qualitative Feedback:** User reviews, support tickets mostly positive
- [ ] **Platform Stability:** Server CPU <70%, DB latency <100ms

**Decision Point (after 48h):**
- **If primary metric improved (p<0.05):** Proceed to 100%
- **If primary metric neutral (p>0.10):** Keep at 50%, wait for full 7-day read
- **If primary metric worse (p<0.05):** Rollback to control

#### Stage 3: Full Rollout (100% of users)

**Goal:** Make winning variant the new default.

**Actions:**
1. **Statsig:** Set experiment to 100% winning variant
2. **Code:** Remove feature flag, hardcode winning variant
3. **Docs:** Update experiment catalog with final results
4. **Team:** Share learnings in Slack/email (what worked, what didn't)
5. **Monitoring:** Watch for 7 days post-rollout (delayed effects)

**Code Cleanup:**
```typescript
// BEFORE (feature flag)
const difficulty = statsig.getExperiment('game_difficulty_v1').get('difficulty', 'medium');

// AFTER (hardcoded winner)
const difficulty = 'easy'; // Winner from game_difficulty_v1 (shipped 2025-12-19)

// Remove experiment from Statsig dashboard (archive it)
```

### Rollout Decision Tree

```
┌─────────────────────────────────────────┐
│     Launch Experiment (10%)             │
└───────────────┬─────────────────────────┘
                │
                ▼
        ┌───────────────┐
        │ After 24h:    │
        │ Guardrails OK?│
        └───────┬───────┘
                │
        ┌───────┴───────┐
        │               │
       YES             NO
        │               │
        ▼               ▼
┌───────────────┐   ┌─────────────┐
│ Increase to   │   │ ROLLBACK    │
│ 50%           │   │ Fix bugs    │
└───────┬───────┘   └─────────────┘
        │
        ▼
┌───────────────────┐
│ After 48h:        │
│ Primary metric OK?│
└────────┬──────────┘
         │
   ┌─────┴─────┐
   │           │
  YES         NO
   │           │
   ▼           ▼
┌──────────┐  ┌─────────────┐
│ Increase │  │ Keep at 50% │
│ to 100%  │  │ Wait 7 days │
└──────────┘  └─────────────┘
```

### Emergency Rollback Procedure

**Scenario:** Production incident (crash rate spikes, revenue drops)

**Steps (execute in order, ~5 minutes total):**

1. **Immediate:** Disable experiment in Statsig dashboard
   - Go to Statsig → Experiments → [your_experiment]
   - Set allocation to 100% control (or disable entirely)
   - Changes take effect in <60 seconds (client SDK polls every 30s)

2. **Verify:** Check Statsig exposure events
   - Should see 100% of new users getting control variant
   - Existing users may stay in treatment (acceptable for short period)

3. **Communicate:** Post in #engineering Slack
   ```
   🚨 Rolled back experiment: game_difficulty_v1
   Reason: Crash rate spiked to 5%
   Status: All new users getting control, investigating root cause
   ETA for fix: 2 hours
   ```

4. **Investigate:** Pull logs for treatment variant users
   ```bash
   # Check Sentry for crash reports
   # Filter by: user.variant = "easy"
   # Look for common stack trace
   ```

5. **Fix:** Deploy hotfix or kill experiment permanently
   - If fixable: Deploy fix → re-launch at 10%
   - If not fixable: Archive experiment, document learnings

6. **Postmortem:** Write incident report (within 24h)
   - What happened (timeline of events)
   - Why it happened (root cause analysis)
   - How to prevent (add test, change process)

---

## 6. Experiment Catalog Template

### Purpose
Document every experiment in a consistent format for institutional knowledge and meta-analysis.

### Template

```markdown
# Experiment: [Experiment Name]

## Metadata
- **ID:** game_difficulty_v1
- **Owner:** @username (Growth Team)
- **Status:** Shipped / Running / Killed
- **Dates:** 2025-12-19 to 2025-12-26
- **Platform:** Web / iOS / Android / All
- **Statsig Link:** [link to Statsig dashboard]
- **Amplitude Chart:** [link to Amplitude analysis]

## Hypothesis
**Problem:** 45% of new players quit after first game session.

**Hypothesis:** Reducing initial game difficulty from medium to easy will increase D1 retention from 45% to 53% because new players will experience more early wins, triggering dopamine release and habit formation.

**Rationale:**
- User feedback: "Too hard for beginners" (23% of 1-star reviews)
- Behavioral principle: Peak-end rule (positive first experience = higher retention)
- Comparable data: Candy Crush starts easy, 65% D1 retention

## Design
**Primary Metric:** D1 Retention (play again within 24h of first session)

**Secondary Metrics:**
- Session length (minutes)
- Games played per session
- Social shares (invitation sent)

**Guardrail Metrics:**
- Crash rate (<2%)
- Revenue per user (no drop >10%)
- D7 retention (ensure we're not just delaying churn)

**Variants:**
- **Control (50%):** difficulty = 'medium' (speed: 100, obstacles: 3)
- **Treatment (50%):** difficulty = 'easy' (speed: 80, obstacles: 2)

**Sample Size:** 3,106 users (calculated for 5pp MDE, 95% confidence, 80% power)

**Duration:** 7 days (December 19-26, 2025)

**Exclusions:**
- Staff users (marked with is_staff=true)
- Users who played before (existing players, not new user experience)

## Implementation
**Code Changes:**
- File: `/src/components/game/GameCanvas.tsx`
- Changed: Initial speed and obstacle count based on variant
- PR: #234

**Statsig Config:**
```json
{
  "name": "game_difficulty_v1",
  "variants": {
    "control": { "difficulty": "medium", "speed": 100, "obstacles": 3 },
    "easy": { "difficulty": "easy", "speed": 80, "obstacles": 2 }
  },
  "allocation": { "control": 0.5, "easy": 0.5 },
  "targeting": {
    "exclude": { "is_staff": true },
    "include": { "is_new_user": true }
  }
}
```

**QA Checklist:**
- [x] Verified variant assignment (checked 10 test users)
- [x] Confirmed exposure events firing (Amplitude user stream)
- [x] Tested both variants manually (forced assignment)
- [x] Validated on iOS/Android/Web
- [x] Checked offline mode behavior (uses fallback)

## Results

### Traffic
- **Total Users:** 6,842 (target: 3,106) ✓
- **Control:** 3,421 users (50.0%)
- **Treatment:** 3,421 users (50.0%)
- **SRM p-value:** 0.98 (no imbalance) ✓

### Primary Metric: D1 Retention
| Variant  | Retention | Absolute Δ | Relative Δ | P-Value | Significant? |
|----------|-----------|------------|------------|---------|--------------|
| Control  | 45.2%     | -          | -          | -       | -            |
| Easy     | 52.8%     | +7.6pp     | +16.8%     | 0.003   | ✓ (p<0.01)   |

**Interpretation:** Easy variant increased D1 retention by 7.6 percentage points (45.2% → 52.8%), a 16.8% relative improvement. Result is highly statistically significant (p=0.003).

### Secondary Metrics
| Metric            | Control | Treatment | Δ      | P-Value | Sig? |
|-------------------|---------|-----------|--------|---------|------|
| Session Length    | 4.2 min | 5.8 min   | +38%   | <0.001  | ✓    |
| Games/Session     | 2.1     | 3.4       | +62%   | <0.001  | ✓    |
| Social Shares     | 3.2%    | 4.8%      | +50%   | 0.02    | ✓    |

### Guardrail Metrics
| Metric            | Control | Treatment | Δ      | Status |
|-------------------|---------|-----------|--------|--------|
| Crash Rate        | 1.2%    | 1.1%      | -8%    | ✓ Pass |
| Revenue (Day 1)   | $0.12   | $0.14     | +16%   | ✓ Pass |
| D7 Retention      | 24.8%   | 28.3%     | +14%   | ✓ Pass |

### Qualitative Feedback
- App Store reviews: 4.2 → 4.6 stars during test period
- Positive mentions: "Great for beginners!" (18 reviews)
- Negative mentions: "Too easy now" (3 reviews)
- Support tickets: -12% volume (fewer "too hard" complaints)

## Decision: SHIP ✓

**Rationale:**
- Primary metric improved significantly (+16.8%, p<0.01)
- All secondary metrics improved (engagement up)
- All guardrails passed (no regressions)
- Qualitative feedback overwhelmingly positive
- D7 retention also improved (not just delaying churn)

**Rollout Plan:**
- December 26: Increase to 50% (canary passed)
- December 28: Increase to 100%
- December 30: Remove feature flag, hardcode "easy" as new default

**Impact Estimate:**
- Before: 450 of 1,000 new users retained (D1)
- After: 528 of 1,000 new users retained (D1)
- Gain: +78 users per 1,000 new players (+17% retention)

## Learnings

**What Worked:**
- Reducing friction in first session dramatically improved retention
- Users shared more when they felt successful (viral loop benefit)
- Longer sessions led to more ad impressions (revenue held up)

**What Didn't Work:**
- Initial concern that "easy" would hurt D7 retention was unfounded
- Some hardcore players complained, but they're <5% of base

**What to Try Next:**
- Test adaptive difficulty (scales with skill over time)
- Test different onboarding flows (tutorial vs no tutorial)
- Test progressive difficulty curve (easy → medium → hard)

## Related Experiments
- **Predecessor:** None (first difficulty test)
- **Follow-up:** game_difficulty_adaptive_v1 (planned Q1 2026)
- **Related:** onboarding_tutorial_v1 (tests same metric)

## Attachments
- [Statsig Results Screenshot](link)
- [Amplitude Retention Cohorts](link)
- [User Feedback Spreadsheet](link)
- [Implementation PR](link)
```

### Storage Location
Save all experiment docs in `/docs/experiments/YYYY-MM-DD_experiment_name.md`

**Example:**
- `/docs/experiments/2025-12-19_game_difficulty_v1.md`
- `/docs/experiments/2025-12-26_onboarding_tutorial_v1.md`

### Experiment Registry (Index)
Create `/docs/experiments/README.md` with table of all experiments:

```markdown
# Experiment Registry

| Date       | Experiment ID           | Status  | Primary Metric | Result | Owner   |
|------------|-------------------------|---------|----------------|--------|---------|
| 2025-12-19 | game_difficulty_v1      | Shipped | D1 Retention   | +16.8% | @alice  |
| 2025-12-26 | onboarding_tutorial_v1  | Running | D1 Retention   | TBD    | @bob    |
| 2025-01-05 | reward_frequency_v1     | Killed  | D7 Retention   | -2.1%  | @carol  |

**Legend:**
- Shipped: Winner rolled out to 100%
- Running: Currently in-flight
- Killed: Stopped early (negative result or bug)
```

---

## 7. Guardrail Metrics

### Purpose
Prevent shipping experiments that improve primary metric but break something else (revenue, stability, user experience).

### Must-Have Guardrails (Every Experiment)

#### 1. Crash Rate
**Definition:** % of sessions that end in app crash

**Threshold:** <2% (mobile), <1% (web)

**Tracking:**
```typescript
// Amplitude event
amplitude.track('session_end', {
  session_id: sessionId,
  crashed: didCrash, // boolean
  duration_seconds: sessionDuration,
});

// Analysis (Amplitude SQL)
SELECT
  event_properties.variant,
  COUNT(*) FILTER (WHERE event_properties.crashed = true) as crashes,
  COUNT(*) as total_sessions,
  (crashes::float / total_sessions) as crash_rate
FROM amplitude_events
WHERE event_type = 'session_end'
  AND event_time >= '2025-12-19'
GROUP BY 1;
```

**Rollback Trigger:** Crash rate >3% (immediate rollback)

#### 2. Revenue per User
**Definition:** Total revenue / total users (Day 1, Day 7, Day 30)

**Threshold:** No drop >10% (compared to control)

**Tracking:**
```typescript
// Amplitude event
amplitude.track('purchase_completed', {
  user_id: userId,
  amount_usd: purchaseAmount,
  product_id: productId,
  variant: experimentVariant,
});

// Analysis
SELECT
  event_properties.variant,
  SUM(event_properties.amount_usd) as total_revenue,
  COUNT(DISTINCT user_id) as total_users,
  (total_revenue / total_users) as revenue_per_user
FROM amplitude_events
WHERE event_type = 'purchase_completed'
  AND event_time >= '2025-12-19'
GROUP BY 1;
```

**Rollback Trigger:** Revenue per user drops >15% (immediate investigation)

#### 3. Load Time
**Definition:** Time from app launch to first interactive screen (p95)

**Threshold:** <3 seconds (mobile), <2 seconds (web)

**Tracking:**
```typescript
// Amplitude event
amplitude.track('app_loaded', {
  load_time_ms: loadTime,
  platform: 'ios' | 'android' | 'web',
  variant: experimentVariant,
});

// Analysis
SELECT
  event_properties.variant,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY event_properties.load_time_ms) as p95_load_time
FROM amplitude_events
WHERE event_type = 'app_loaded'
  AND event_time >= '2025-12-19'
GROUP BY 1;
```

**Rollback Trigger:** p95 load time >5 seconds (immediate investigation)

#### 4. Error Rate
**Definition:** % of API calls that return 4xx/5xx errors

**Threshold:** <1% of requests

**Tracking:**
```typescript
// Server-side logging
logger.info('api_request', {
  endpoint: '/api/game/save',
  status_code: 200,
  duration_ms: 150,
  user_id: userId,
  variant: experimentVariant,
});

// Analysis (server logs or Amplitude)
SELECT
  variant,
  COUNT(*) FILTER (WHERE status_code >= 400) as errors,
  COUNT(*) as total_requests,
  (errors::float / total_requests) as error_rate
FROM api_logs
WHERE timestamp >= '2025-12-19'
GROUP BY 1;
```

**Rollback Trigger:** Error rate >3% (immediate investigation)

### Feature-Specific Guardrails

#### For UI/UX Experiments

**5. Session Length**
- **Threshold:** No drop >20% (users might bounce faster)
- **Metric:** Median session duration (less sensitive to outliers than mean)

**6. Engagement Rate**
- **Threshold:** No drop >10%
- **Metric:** % of users who complete core action (play game, send invite, etc.)

#### For Monetization Experiments

**7. ARPU (Average Revenue per User)**
- **Threshold:** No drop >5% (primary metric for revenue tests)
- **Metric:** Total revenue / total users (7-day window)

**8. Conversion Rate**
- **Threshold:** No drop >10%
- **Metric:** % of users who make first purchase

**9. Refund Rate**
- **Threshold:** <2% of purchases
- **Metric:** % of purchases that are refunded (fraud/UX issues)

#### For Onboarding Experiments

**10. Tutorial Completion Rate**
- **Threshold:** No drop >15%
- **Metric:** % of users who complete onboarding tutorial

**11. Time to First Game**
- **Threshold:** <5 minutes (median)
- **Metric:** Time from signup to first game played

### Guardrail Monitoring Dashboard

**Set up automated alerts in Amplitude:**

```javascript
// Amplitude Alert Config
{
  "name": "Experiment Guardrails - game_difficulty_v1",
  "metrics": [
    {
      "name": "Crash Rate",
      "query": "crash_rate by variant",
      "threshold": 0.02,
      "condition": "greater_than",
      "alert_channel": "slack://engineering"
    },
    {
      "name": "Revenue per User (D1)",
      "query": "revenue_per_user by variant",
      "threshold": -0.10, // -10% vs control
      "condition": "percent_change_less_than",
      "alert_channel": "slack://growth"
    }
  ],
  "frequency": "daily",
  "recipients": ["growth-team@company.com"]
}
```

### Guardrail Decision Matrix

| Guardrail Status | Primary Metric | Decision |
|------------------|----------------|----------|
| All pass ✓       | Improved ✓     | Ship it  |
| All pass ✓       | Neutral ~      | Neutral (don't ship) |
| All pass ✓       | Worse ✗        | Kill experiment |
| 1 fails ✗        | Improved ✓     | Investigate → fix → re-test |
| 1 fails ✗        | Neutral/Worse  | Kill experiment |
| 2+ fail ✗        | Any            | Immediate rollback |

---

## 8. First 10 Experiments

### Prioritization Framework

**Scoring (1-10 scale):**
- **Impact Potential:** Expected lift × metric importance
- **Implementation Ease:** Low code changes = higher score
- **Learning Value:** Insights reusable for future tests?
- **Risk:** Lower risk = higher score

**Formula:**
```
Priority Score = (Impact × 0.4) + (Ease × 0.3) + (Learning × 0.2) + (Risk × 0.1)
```

### The Prioritized List

---

#### Experiment 1: Game Difficulty Calibration (HIGHEST PRIORITY)

**Priority Score:** 9.2 / 10

**Hypothesis:** Reducing initial difficulty from medium to easy will increase D1 retention from 45% to 53% because new players need early wins to build confidence.

**Rationale:**
- User feedback: "Too hard for beginners" (top complaint in 1-star reviews)
- Data: 55% of new players quit after losing first game
- Psychology: Peak-end rule (first experience sets expectations)

**Design:**
- **Primary Metric:** D1 Retention
- **Variants:** Control (medium difficulty) vs Easy vs Adaptive (scales with skill)
- **Duration:** 7 days
- **Sample Size:** 3,106 users

**Implementation:**
```typescript
// /src/components/game/GameCanvas.tsx
const difficulty = useExperiment('game_difficulty_v1', 'difficulty', 'medium');
const gameConfig = DIFFICULTY_CONFIGS[difficulty]; // { speed, obstacles, powerups }
```

**Expected Impact:** +8% D1 retention (45% → 53%)

**Risk:** Low (easily reversible, no revenue impact)

---

#### Experiment 2: Onboarding Tutorial (Skippable vs Mandatory)

**Priority Score:** 8.9 / 10

**Hypothesis:** Making tutorial skippable (instead of mandatory) will increase D1 retention from 45% to 50% because experienced players hate forced tutorials.

**Rationale:**
- Session recordings: 30% of users tap "skip" frantically during tutorial
- Industry data: Clash Royale made tutorial skippable, +12% retention
- Segment: New users benefit from tutorial, returning users don't

**Design:**
- **Primary Metric:** D1 Retention
- **Variants:**
  - Control: Mandatory tutorial (current)
  - Treatment: Skippable tutorial (big skip button)
- **Segment:** All new users
- **Duration:** 7 days
- **Sample Size:** 3,106 users

**Implementation:**
```typescript
// /src/components/onboarding/Tutorial.tsx
const { canSkip } = useExperiment('tutorial_skippable_v1', { canSkip: false });

return (
  <TutorialModal>
    {canSkip && <SkipButton onClick={handleSkip}>Skip Tutorial</SkipButton>}
    <TutorialContent />
  </TutorialModal>
);
```

**Expected Impact:** +5% D1 retention (45% → 50%)

**Risk:** Low (can track completion rate as guardrail)

---

#### Experiment 3: Daily Reward Streak (Show vs Hide)

**Priority Score:** 8.7 / 10

**Hypothesis:** Adding visible daily reward streak counter will increase D7 retention from 25% to 32% because loss aversion motivates users to maintain streaks.

**Rationale:**
- Psychology: Streaks trigger loss aversion (Snapchat, Duolingo proven this)
- Data: 40% of D7 retained users play 5+ consecutive days
- Opportunity: We have streak data but don't show it to users

**Design:**
- **Primary Metric:** D7 Retention
- **Secondary:** Consecutive play days, total sessions
- **Variants:**
  - Control: No streak UI (current)
  - Treatment: Show streak counter + "Don't break your streak!" reminder
- **Duration:** 14 days (need D7 data)
- **Sample Size:** 1,818 users

**Implementation:**
```typescript
// /src/components/home/StreakBanner.tsx
const { showStreak } = useExperiment('streak_counter_v1', { showStreak: false });
const streakDays = useStreakData(userId);

if (!showStreak) return null;

return (
  <Banner>
    🔥 {streakDays} Day Streak! Come back tomorrow to keep it alive!
  </Banner>
);
```

**Expected Impact:** +7pp D7 retention (25% → 32%)

**Risk:** Medium (might annoy users who don't care about streaks)

---

#### Experiment 4: Social Sharing Incentive (Reward vs No Reward)

**Priority Score:** 8.5 / 10

**Hypothesis:** Offering 100 coins for inviting a friend will increase viral coefficient from 0.3 to 0.5 (50% more invites) because users need extrinsic motivation to share.

**Rationale:**
- Data: Only 8% of users send invites organically
- User feedback: "Why would I invite friends? No benefit to me"
- Industry: Dropbox grew 3900% with referral rewards

**Design:**
- **Primary Metric:** Viral coefficient (invites sent per user)
- **Secondary:** Invite conversion rate (invites → signups)
- **Guardrail:** Fraud rate (fake accounts created for rewards)
- **Variants:**
  - Control: No reward for sharing
  - Treatment: 100 coins for each friend who signs up
- **Duration:** 14 days
- **Sample Size:** 4,000 users

**Implementation:**
```typescript
// /src/components/social/InviteButton.tsx
const { rewardAmount } = useExperiment('invite_reward_v1', { rewardAmount: 0 });

return (
  <Button onClick={handleInvite}>
    Invite Friends {rewardAmount > 0 && `(Earn ${rewardAmount} coins!)`}
  </Button>
);
```

**Expected Impact:** +67% viral coefficient (0.3 → 0.5)

**Risk:** Medium (potential for fraud/abuse, need fraud detection)

---

#### Experiment 5: Push Notification Timing (1h vs 24h)

**Priority Score:** 8.3 / 10

**Hypothesis:** Sending re-engagement push 1 hour after last session (instead of 24h) will increase D1 retention from 45% to 51% because users haven't moved on to other apps yet.

**Rationale:**
- Psychology: Recency effect (easier to re-engage while app is still in short-term memory)
- Data: 60% of churned users never return after 24h
- Industry: Gaming apps see 2x higher open rates on <2h notifications

**Design:**
- **Primary Metric:** D1 Retention
- **Secondary:** Push notification open rate
- **Guardrail:** App uninstall rate (<5%)
- **Variants:**
  - Control: Send push after 24h of inactivity
  - Treatment: Send push after 1h of inactivity
- **Duration:** 7 days
- **Sample Size:** 3,106 users

**Implementation:**
```typescript
// /src/lib/notifications/scheduler.ts
const { delayHours } = useExperiment('push_timing_v1', { delayHours: 24 });

scheduleNotification({
  title: "Your snake misses you!",
  body: "Come back and beat your high score",
  delay: delayHours * 60 * 60 * 1000, // ms
});
```

**Expected Impact:** +6% D1 retention (45% → 51%)

**Risk:** Medium (could increase opt-out rate if perceived as spam)

---

#### Experiment 6: In-App Currency Earning Rate (50 vs 100 coins/game)

**Priority Score:** 8.1 / 10

**Hypothesis:** Doubling coins earned per game (50 → 100) will increase D7 retention from 25% to 30% because users progress faster toward rewards.

**Rationale:**
- Data: Users need 1,000 coins for cheapest skin (takes 20 games at current rate)
- User feedback: "Takes forever to unlock anything"
- Psychology: Progress principle (visible progress = motivation)

**Design:**
- **Primary Metric:** D7 Retention
- **Secondary:** Games played, skin purchase rate
- **Guardrail:** IAP revenue (ensure doubled coins don't cannibalize purchases)
- **Variants:**
  - Control: 50 coins per game
  - Treatment: 100 coins per game
- **Duration:** 14 days
- **Sample Size:** 1,818 users

**Implementation:**
```typescript
// /src/lib/rewards/coins.ts
const { coinsPerGame } = useExperiment('coin_rate_v1', { coinsPerGame: 50 });

function awardCoins(score: number) {
  const baseCoins = coinsPerGame;
  const bonusCoins = Math.floor(score / 100) * 10;
  return baseCoins + bonusCoins;
}
```

**Expected Impact:** +5pp D7 retention (25% → 30%)

**Risk:** High (could reduce IAP revenue if users buy fewer coins)

---

#### Experiment 7: Leaderboard Visibility (Global vs Friends-Only)

**Priority Score:** 7.9 / 10

**Hypothesis:** Showing friends-only leaderboard (instead of global) will increase D7 retention from 25% to 29% because users care more about beating friends than strangers.

**Rationale:**
- Data: Users with 3+ friends have 45% D7 retention (vs 25% overall)
- Psychology: Social comparison theory (compare to similar others, not elites)
- Industry: Strava switched to friends-only, +18% engagement

**Design:**
- **Primary Metric:** D7 Retention
- **Secondary:** Leaderboard view rate, friend invites sent
- **Variants:**
  - Control: Global leaderboard (top 100 players)
  - Treatment: Friends leaderboard (your friends only)
- **Segment:** Users with 1+ friends
- **Duration:** 14 days
- **Sample Size:** 1,818 users

**Implementation:**
```typescript
// /src/components/leaderboard/LeaderboardView.tsx
const { scope } = useExperiment('leaderboard_scope_v1', { scope: 'global' });

const leaderboardData = scope === 'friends'
  ? useFriendsLeaderboard(userId)
  : useGlobalLeaderboard();
```

**Expected Impact:** +4pp D7 retention (25% → 29%)

**Risk:** Low (can offer toggle between global/friends)

---

#### Experiment 8: Game Over Screen (Immediate Replay vs Stats First)

**Priority Score:** 7.7 / 10

**Hypothesis:** Showing stats/achievements before replay button will increase session length by 25% because users reflect on progress before playing again.

**Rationale:**
- Session recordings: 70% of users tap "Play Again" within 2 seconds
- Psychology: Cognitive closure (need to process loss before moving on)
- Data: Users who view stats play 1.5x more games per session

**Design:**
- **Primary Metric:** Session length (minutes)
- **Secondary:** Games per session, stats view rate
- **Variants:**
  - Control: "Play Again" button immediately visible
  - Treatment: Show stats for 3s before showing "Play Again"
- **Duration:** 7 days
- **Sample Size:** 2,000 users

**Implementation:**
```typescript
// /src/components/game/GameOverScreen.tsx
const { delayReplay } = useExperiment('game_over_delay_v1', { delayReplay: false });

useEffect(() => {
  if (delayReplay) {
    setShowReplayButton(false);
    setTimeout(() => setShowReplayButton(true), 3000); // 3s delay
  } else {
    setShowReplayButton(true);
  }
}, [gameOver]);
```

**Expected Impact:** +25% session length (4.2 → 5.3 minutes)

**Risk:** Low (might slightly increase bounce rate if delay is annoying)

---

#### Experiment 9: Power-Up Frequency (1 per 10 apples vs 1 per 5 apples)

**Priority Score:** 7.5 / 10

**Hypothesis:** Doubling power-up frequency (spawn every 5 apples instead of 10) will increase D1 retention from 45% to 49% because more frequent rewards = more fun.

**Rationale:**
- Data: Games with power-ups have 30% longer sessions than games without
- User feedback: "Power-ups are too rare, I forget they exist"
- Psychology: Variable ratio reinforcement (unpredictable rewards = engagement)

**Design:**
- **Primary Metric:** D1 Retention
- **Secondary:** Session length, power-up collection rate
- **Guardrail:** Game balance (ensure power-ups don't make game too easy)
- **Variants:**
  - Control: Power-up spawns every 10 apples
  - Treatment: Power-up spawns every 5 apples
- **Duration:** 7 days
- **Sample Size:** 3,106 users

**Implementation:**
```typescript
// /src/lib/game/powerups.ts
const { spawnFrequency } = useExperiment('powerup_frequency_v1', { spawnFrequency: 10 });

function shouldSpawnPowerup(applesCollected: number) {
  return applesCollected % spawnFrequency === 0;
}
```

**Expected Impact:** +4% D1 retention (45% → 49%)

**Risk:** Medium (could make game too easy, need to monitor high scores)

---

#### Experiment 10: Paywall Timing (After Game 1 vs After Game 3)

**Priority Score:** 7.3 / 10

**Hypothesis:** Delaying paywall until after 3rd game (instead of 1st) will increase conversion rate from 5% to 7% because users need to experience value before paying.

**Rationale:**
- Data: 80% of users who see paywall on game 1 dismiss it immediately
- Psychology: Reciprocity (give value first, then ask for payment)
- Industry: Freemium apps see 2x higher conversion when paywall is delayed

**Design:**
- **Primary Metric:** Conversion rate (% who purchase)
- **Secondary:** ARPU (average revenue per user)
- **Guardrail:** Overall revenue (ensure delay doesn't reduce total revenue)
- **Variants:**
  - Control: Show paywall after 1st game
  - Treatment: Show paywall after 3rd game
- **Duration:** 14 days
- **Sample Size:** 14,896 users (large sample needed for 5% baseline)

**Implementation:**
```typescript
// /src/components/monetization/PaywallTrigger.tsx
const { triggerAfterGames } = useExperiment('paywall_timing_v1', { triggerAfterGames: 1 });

useEffect(() => {
  if (gamesPlayed === triggerAfterGames && !hasSeenPaywall) {
    showPaywall();
    setHasSeenPaywall(true);
  }
}, [gamesPlayed]);
```

**Expected Impact:** +2pp conversion rate (5% → 7%, +40% relative)

**Risk:** High (could reduce revenue if fewer users see paywall)

---

### Experiment Roadmap (Timeline)

```
Week 1-2 (December):
├── Experiment 1: Game Difficulty
├── Experiment 2: Onboarding Tutorial
└── Experiment 5: Push Timing

Week 3-4 (January):
├── Experiment 3: Daily Streaks
├── Experiment 6: Coin Earning Rate
└── Experiment 4: Social Sharing

Week 5-6 (February):
├── Experiment 7: Leaderboard Scope
├── Experiment 8: Game Over Screen
└── Experiment 9: Power-Up Frequency

Week 7-8 (March):
└── Experiment 10: Paywall Timing

PARALLEL CAPACITY: Max 2-3 experiments running simultaneously
(avoid interaction effects, ensure sufficient traffic per test)
```

---

## 9. Common Pitfalls

### Pitfall 1: Not Pre-Registering Metrics

**Problem:** Deciding which metric to optimize after seeing results (p-hacking).

**Example:**
- Launch experiment to improve D1 retention
- Results: D1 neutral, but D7 improved
- Team: "Let's call D7 the primary metric!" ← WRONG

**Solution:**
- Document primary metric BEFORE launch in experiment doc
- If you discover better metric mid-flight, re-run experiment with new primary

---

### Pitfall 2: Running Too Many Experiments Simultaneously

**Problem:** Not enough traffic per experiment → underpowered tests.

**Example:**
- 1,000 DAU split across 3 experiments = 333 users per experiment
- Each experiment has 2 variants = 167 users per variant
- Need 1,500 per variant for 5% MDE → won't reach significance for 9 days

**Solution:**
- Max 2-3 experiments running simultaneously
- Prioritize high-impact tests over quantity
- Use sequential testing (run experiments back-to-back, not parallel)

---

### Pitfall 3: Ignoring Seasonality

**Problem:** Running experiment during holiday/weekend when user behavior differs.

**Example:**
- Launch retention experiment on Friday
- Weekend traffic is 2x higher (casual players)
- Results show +10% retention, but regresses when weekday users return

**Solution:**
- Run experiments for full weeks (include Mon-Sun)
- Avoid launching during: holidays, app updates, major events
- Segment analysis by day-of-week if needed

---

### Pitfall 4: Shipping Based on Secondary Metrics

**Problem:** Primary metric neutral, but secondary improved, so you ship.

**Example:**
- Primary: D1 retention (neutral, p=0.3)
- Secondary: Session length (+20%, p=0.02)
- Team: "Longer sessions are good, let's ship!" ← RISKY

**Why Risky:**
- Secondary metrics have higher false positive rate (multiple testing)
- Longer sessions might = frustration (trying to complete task)
- D1 retention is true north (if neutral, feature isn't working)

**Solution:**
- Only ship if primary metric improves OR is directionally correct (0.05<p<0.10)
- If secondary metrics tell different story, dig deeper (qualitative research)

---

### Pitfall 5: Not Accounting for Novelty Effect

**Problem:** Users engage more with new feature just because it's new (wears off after 2 weeks).

**Example:**
- Add new power-up, retention spikes +15% in week 1
- Ship to 100%, retention boost disappears by week 3
- Cause: Novelty wore off, users reverted to baseline behavior

**Solution:**
- Run experiments for 2-4 weeks (capture novelty decay)
- Check if effect holds in week 2 vs week 1
- Monitor post-rollout retention (watch for regression)

---

### Pitfall 6: Confusing Statistical Significance with Practical Significance

**Problem:** Result is statistically significant but effect is too small to matter.

**Example:**
- D1 retention: 45.0% → 45.5% (p=0.04, significant!)
- Absolute lift: +0.5pp
- Relative lift: +1.1%
- Practical impact: +5 users per 1,000 (not worth engineering effort)

**Solution:**
- Pre-define minimum practical effect (e.g., +3pp for retention)
- Don't ship if lift is significant but tiny
- Consider engineering cost vs impact (ROI)

---

### Pitfall 7: Simpson's Paradox (Segment Reversal)

**Problem:** Treatment wins overall but loses in every segment.

**Example:**
- Overall: Treatment +5% retention (wins!)
- iOS segment: Treatment -2% retention (loses)
- Android segment: Treatment -3% retention (loses)
- Cause: Android users (who have lower baseline retention) were overrepresented in treatment

**Solution:**
- Check for sample ratio mismatch (SRM) on Day 1
- Segment analysis by platform, country, acquisition source
- If segments reverse, investigate assignment bug

---

### Pitfall 8: Not Testing Null Hypothesis

**Problem:** Assume experiment will improve metric, don't consider it might hurt.

**Example:**
- Hypothesis: "Adding tutorial will improve retention"
- Result: Retention dropped 8% (users hate forced tutorials)
- Team: "We didn't expect this!" ← Should have considered downside risk

**Solution:**
- Always use two-tailed test (test for both improvement and regression)
- Pre-define success criteria AND failure criteria
- Have rollback plan ready before launch

---

### Pitfall 9: Forgetting About Mobile App Caching

**Problem:** Statsig changes take 24h to propagate to all users (SDK polls every 30s but users don't restart app).

**Example:**
- Rollback experiment at 10am
- Users who opened app at 9am still in treatment variant until they restart
- Crash rate stays elevated for 6 more hours

**Solution:**
- Understand SDK polling frequency (Statsig: 30s for new sessions)
- Force SDK refresh on app resume: `statsig.updateUser()`
- In emergency, push app update (not ideal but guaranteed)

---

### Pitfall 10: Not Documenting Null Results

**Problem:** Only successful experiments get documented, failures are forgotten.

**Why Bad:**
- Team re-tests same failed idea 6 months later (waste of time)
- No institutional knowledge of what doesn't work
- Can't do meta-analysis ("What types of experiments work?")

**Solution:**
- Document ALL experiments in experiment catalog (wins and losses)
- Include "Learnings" section explaining why it failed
- Share null results in team meetings (normalize failure)

---

## 10. Quick Reference

### Statsig Experiment Setup (5-Minute Checklist)

```bash
# 1. Create experiment in Statsig dashboard
# - Name: game_difficulty_v1
# - Variants: control (50%), easy (50%)
# - Targeting: is_new_user = true

# 2. Add to codebase
# File: /src/lib/statsig/hooks.ts
export function useExperiment(experimentName: string, paramName: string, defaultValue: any) {
  const { value, isLoading } = statsig.getExperiment(experimentName).get(paramName, defaultValue);
  return { value, isLoading };
}

# 3. Implement variant logic
# File: /src/components/game/GameCanvas.tsx
const { value: difficulty } = useExperiment('game_difficulty_v1', 'difficulty', 'medium');

# 4. Track exposure event
amplitude.track('experiment_exposure', {
  experiment_name: 'game_difficulty_v1',
  variant: difficulty,
});

# 5. Launch at 10% (canary)
# Statsig dashboard → Set allocation → 10% treatment, 90% control

# 6. Monitor for 24h
# Check: Crash rate, error rate, exposure events

# 7. Increase to 50%
# Statsig dashboard → Set allocation → 50% treatment, 50% control

# 8. Wait for results (7 days)
# Statsig dashboard → View results → Check primary metric

# 9. Ship or kill
# If win: Set 100% treatment → Remove feature flag
# If loss: Set 100% control → Archive experiment
```

---

### Sample Size Formulas (Copy-Paste)

**For proportions (retention, conversion):**
```python
import math

def sample_size_proportion(baseline, mde, alpha=0.05, power=0.8):
    """
    baseline: current conversion rate (e.g., 0.45 for 45%)
    mde: minimum detectable effect (e.g., 0.05 for 5pp)
    alpha: significance level (0.05 = 95% confidence)
    power: statistical power (0.8 = 80%)
    """
    z_alpha = 1.96  # for alpha=0.05, two-tailed
    z_beta = 0.84   # for power=0.8

    p = baseline
    n = ((z_alpha + z_beta) ** 2) * 2 * p * (1 - p) / (mde ** 2)
    return math.ceil(n)

# Example
n = sample_size_proportion(baseline=0.45, mde=0.05)
print(f"Need {n} users per variant, {n*2} total")
# Output: Need 1553 users per variant, 3106 total
```

**For continuous metrics (revenue, session length):**
```python
def sample_size_continuous(std_dev, mde, alpha=0.05, power=0.8):
    """
    std_dev: standard deviation of metric (e.g., $2.50 for revenue)
    mde: minimum detectable effect (e.g., $0.50)
    """
    z_alpha = 1.96
    z_beta = 0.84

    n = ((z_alpha + z_beta) ** 2) * 2 * (std_dev ** 2) / (mde ** 2)
    return math.ceil(n)

# Example
n = sample_size_continuous(std_dev=2.50, mde=0.50)
print(f"Need {n} users per variant")
# Output: Need 393 users per variant
```

---

### Amplitude Analysis Queries

**D1 Retention by Variant:**
```sql
-- Amplitude SQL
SELECT
  ep.variant,
  COUNT(DISTINCT CASE
    WHEN EXISTS (
      SELECT 1 FROM amplitude_events e2
      WHERE e2.user_id = e.user_id
        AND e2.event_time BETWEEN e.event_time AND e.event_time + INTERVAL '24 hours'
        AND e2.event_type = 'game_started'
    ) THEN e.user_id
  END) as retained_users,
  COUNT(DISTINCT e.user_id) as total_users,
  (retained_users::float / total_users) as d1_retention
FROM amplitude_events e
WHERE e.event_type = 'experiment_exposure'
  AND e.event_properties.experiment_name = 'game_difficulty_v1'
  AND e.event_time >= '2025-12-19'
GROUP BY 1;
```

**Revenue per User by Variant:**
```sql
SELECT
  ep.variant,
  SUM(ep2.amount_usd) as total_revenue,
  COUNT(DISTINCT e.user_id) as total_users,
  (total_revenue / total_users) as revenue_per_user
FROM amplitude_events e
LEFT JOIN amplitude_events e2 ON e2.user_id = e.user_id
  AND e2.event_type = 'purchase_completed'
  AND e2.event_time BETWEEN e.event_time AND e.event_time + INTERVAL '7 days'
WHERE e.event_type = 'experiment_exposure'
  AND e.event_properties.experiment_name = 'game_difficulty_v1'
GROUP BY 1;
```

---

### Experiment Naming Convention

**Format:** `[feature]_[variation]_v[number]`

**Examples:**
- `game_difficulty_v1` (first difficulty test)
- `game_difficulty_v2` (follow-up difficulty test)
- `onboarding_tutorial_v1`
- `paywall_timing_v1`
- `push_notification_copy_v3` (third iteration)

**Variant Naming:**
- `control` (current/default)
- `treatment` (single alternative)
- `treatment_a`, `treatment_b` (multiple alternatives)
- Or descriptive: `easy`, `medium`, `hard`, `adaptive`

---

### Rollout Checklist (Print This)

```
PRE-LAUNCH:
[ ] Experiment documented in /docs/experiments/
[ ] Primary metric defined and tracked
[ ] Sample size calculated
[ ] Guardrail metrics configured
[ ] Code reviewed and tested
[ ] QA completed (all variants work)
[ ] Team notified of launch

DAY 1 (10% CANARY):
[ ] Exposure events firing (check Amplitude)
[ ] Variant balance correct (check Statsig)
[ ] No crash rate spike (check Sentry)
[ ] No error rate spike (check server logs)

DAY 2 (50% ROLLOUT):
[ ] Primary metric trending expected direction
[ ] Guardrail metrics stable
[ ] No user complaints (check support tickets)

DAY 7 (ANALYSIS):
[ ] Statistical significance reached (p<0.05)
[ ] Confidence interval calculated
[ ] Guardrail metrics passed
[ ] Decision made (ship/kill/extend)

POST-ROLLOUT:
[ ] Winner deployed to 100%
[ ] Feature flag removed from code
[ ] Experiment catalog updated
[ ] Team notified of results
[ ] Learnings shared in team meeting
```

---

### Decision Flowchart (ASCII)

```
START EXPERIMENT
    |
    ▼
Run for 7 days
    |
    ▼
Primary metric p-value?
    |
    ├─────────────┬─────────────┬──────────────┐
    |             |             |              |
  p<0.01        p<0.05      0.05<p<0.10      p>0.10
    |             |             |              |
    ▼             ▼             ▼              ▼
STRONG WIN    WEAK WIN    BORDERLINE      NO EFFECT
    |             |             |              |
    ▼             ▼             ▼              ▼
Guardrails   Guardrails   Run 1 more      KILL
pass?        pass?        week?           experiment
    |             |             |              |
  YES/NO        YES/NO        YES/NO           ▼
    |             |             |          Document
    ▼             ▼             ▼          learnings
  SHIP         SHIP        Re-analyze
  100%         100%        after 14 days
```

---

### Glossary

| Term | Definition | Example |
|------|------------|---------|
| **MDE** | Minimum Detectable Effect | 5pp (45% → 50%) |
| **p-value** | Probability result is random chance | p=0.03 (3% chance) |
| **Power** | Probability of detecting real effect | 80% power (standard) |
| **Confidence Interval** | Range of plausible effect sizes | 95% CI: 2.8% to 12.4% |
| **SRM** | Sample Ratio Mismatch | Expected 50/50, got 53/47 |
| **Guardrail** | Metric that must not regress | Crash rate <2% |
| **Variant** | Version of feature being tested | Control, Treatment A, Treatment B |
| **Exposure** | User sees experiment variant | Tracked via `experiment_exposure` event |
| **Canary** | Small rollout to detect bugs | 10% of users for 24h |

---

## Next Steps

### Week 1: Infrastructure Setup
- [ ] Install Statsig SDK: `npm install statsig-js`
- [ ] Create `/src/lib/statsig/client.ts` (Statsig initialization)
- [ ] Create `/src/lib/statsig/hooks.ts` (`useExperiment` hook)
- [ ] Add Statsig API key to `.env`: `NEXT_PUBLIC_STATSIG_CLIENT_KEY`
- [ ] Test experiment assignment (create test experiment in Statsig)
- [ ] Verify exposure events flowing to Amplitude

### Week 2: Launch First Experiment
- [ ] Choose from First 10 list (recommend: Game Difficulty)
- [ ] Create experiment document (use template from Section 6)
- [ ] Implement variant logic in code
- [ ] QA all variants (manual testing)
- [ ] Launch at 10% (canary)
- [ ] Monitor guardrails for 24h

### Week 3: Scale Experimentation
- [ ] Analyze first experiment results
- [ ] Ship winner (or kill if failed)
- [ ] Document learnings in experiment catalog
- [ ] Launch 2nd experiment (from First 10 list)
- [ ] Train team on playbook (share this doc)

### Month 2: Optimize Process
- [ ] Build Amplitude dashboard (retention by variant, revenue by variant)
- [ ] Create Slack alerts for guardrail breaches
- [ ] Conduct meta-analysis (what types of experiments win?)
- [ ] Prioritize next 10 experiments
- [ ] Aim for 2-3 experiments/month cadence

---

## Support & Resources

**Statsig Documentation:**
- Quickstart: https://docs.statsig.com/client/jsClientSDK
- React Hooks: https://docs.statsig.com/client/javascript-sdk/react
- Dynamic Config: https://docs.statsig.com/dynamic-config

**Amplitude Documentation:**
- Event Tracking: https://www.docs.developers.amplitude.com/data/sdks/typescript-browser/
- Experiment Analysis: https://help.amplitude.com/hc/en-us/articles/360061265492

**Statistical Tools:**
- Sample Size Calculator: https://www.evanmiller.org/ab-testing/sample-size.html
- SRM Checker: https://www.abtestguide.com/abtestsize/
- Chi-Square Test: https://www.socscistatistics.com/tests/chisquare2/default2.aspx

**Books:**
- "Trustworthy Online Controlled Experiments" (Kohavi et al.) - the bible of A/B testing
- "The Power of Experiments" (Michael Luca) - business strategy for experimentation

**Internal Contacts:**
- Growth Team Lead: [name]
- Data Analyst: [name]
- Engineering Lead: [name]

---

**Last Updated:** 2025-12-19
**Version:** 1.0
**Maintained By:** Growth Team
**Next Review:** 2026-01-19 (monthly updates)
