# Post-Launch Playbook: SupaSnake

## Document Purpose

This playbook defines operational procedures for maintaining SupaSnake after launch. It covers balance updates, emergency response, content releases, community management, performance monitoring, and incident post-mortems.

**Target Audience:** Product managers, game designers, engineers, community managers, QA
**Last Updated:** 2025-12-19
**Review Cadence:** Monthly (adjust based on learnings)

---

## Table of Contents

1. [Balance Patch Process](#1-balance-patch-process)
2. [Emergency Response](#2-emergency-response)
3. [Content Release Cadence](#3-content-release-cadence)
4. [Community Management](#4-community-management)
5. [Performance Monitoring](#5-performance-monitoring)
6. [Post-Mortem Template](#6-post-mortem-template)
7. [Quick Reference](#7-quick-reference)

---

## 1. Balance Patch Process

### Philosophy: Supercell-Style Balance

**Core Principles:**
- **Buff weak, don't nerf strong** (except game-breaking cases)
- **Small, frequent adjustments** over large, disruptive changes
- **Data-driven decisions** backed by 2+ weeks of stable data
- **Player communication** precedes all major changes

### 1.1 Data Collection Period

**Minimum:** 2 weeks of stable data after any major update
**Ideal:** 4 weeks for seasonal content, 6 weeks for new features

**Required Metrics:**
```
Variant Performance:
- Play rate (% of games using this variant)
- Win rate (vs baseline/average)
- Retention impact (D1/D7 retention for players using variant)
- Revenue impact (IAP conversion for users with variant)

Power-Up Performance:
- Purchase rate (% of games where power-up used)
- Win rate delta (games with power-up vs without)
- Revenue per user (ARPU for power-up buyers)

Event Performance:
- Participation rate (% of DAU engaging)
- Completion rate (% reaching milestones)
- Reward claim rate (% claiming vs earning)
- Churn rate (D1/D7 retention during event)
```

**Data Sources:**
- Amplitude: User behavior, funnel metrics
- Supabase Analytics: Game outcomes, variant usage
- Revenue Dashboard: IAP, battle pass sales
- Community Feedback: Discord, app store reviews

### 1.2 Intervention Thresholds

**Nerf Candidates (Overpowered):**
| Metric | Threshold | Action |
|--------|-----------|--------|
| Play Rate | >20% for single variant | Investigate (may be healthy preference) |
| Play Rate | >35% for single variant | High priority nerf |
| Win Rate | >65% (vs 50% baseline) | Medium priority nerf |
| Win Rate | >75% (vs 50% baseline) | High priority nerf |
| Retention Drop | <-5% D1 for non-users | Emergency nerf (meta warping) |

**Buff Candidates (Underpowered):**
| Metric | Threshold | Action |
|--------|-----------|--------|
| Play Rate | <2% after 4 weeks | High priority buff |
| Win Rate | <35% (vs 50% baseline) | Medium priority buff |
| Engagement | <1% of users ever try | Content visibility issue (not balance) |

**Special Cases:**
- **New Content:** Allow 4 weeks before nerfing (honeymoon period expected)
- **Seasonal Events:** Balance for 60% completion rate (not 100%)
- **Premium Content:** Balance for fun, not P2W (win rate <55%)

### 1.3 Balance Change Process

#### Phase 1: Analysis (2-3 days)
1. **Data Review:** Export metrics, create visualization dashboard
2. **Community Sentiment:** Survey Discord, Reddit, app reviews
3. **Hypothesis Formation:** Why is this over/underpowered?
4. **Solution Proposal:** Design 2-3 balance options

**Example:**
```
Problem: "Viper Variant" has 42% play rate, 68% win rate
Community Feedback: "Too fast, impossible to catch up"
Hypothesis: Speed boost too strong in early game
Solutions:
  A) Reduce speed boost 30% → 20%
  B) Delay speed boost until 50 food eaten
  C) Add cooldown between speed bursts (2s → 4s)
```

#### Phase 2: Community Communication (1 week before patch)

**Announcement Template:**
```markdown
# Balance Update Preview: [Patch Version]
**Release Date:** [Tuesday, Date]

## Why We're Making Changes
[Brief explanation: "Viper has been dominating matches since release, with
a win rate 18% higher than other variants. We want every snake to feel
competitive while preserving Viper's speed fantasy."]

## Proposed Changes
**Viper Variant:**
- Speed Boost: 30% → 20% movement speed
- _Goal: Maintain speed advantage while giving opponents counterplay_

**Komodo Variant:**
- Poison Duration: 3s → 4s
- _Goal: Increase viability in competitive play_

## Timeline
- **Today:** Feedback period opens (reply in #balance-feedback)
- **[Date + 3 days]:** Final changes announced
- **[Date + 7 days]:** Patch goes live

## How to Give Feedback
Reply in Discord #balance-feedback or email balance@supasnake.com
We'll review all feedback before finalizing changes.
```

**Distribution Channels:**
- Discord #announcements (pinned)
- In-game news popup (once per user)
- Twitter/X, Reddit r/SupaSnake
- Email to opted-in players (top 10% playtime)

#### Phase 3: Feedback Review (3-5 days)

**Triage Process:**
1. **Collect:** Aggregate all Discord, Reddit, email feedback
2. **Categorize:**
   - Constructive (data-backed, specific suggestions)
   - Emotional (complaints without solutions)
   - Off-topic (feature requests unrelated to balance)
3. **Synthesize:** Identify common themes
   - "10+ players suggest speed reduction too harsh"
   - "5+ players propose alternative: cooldown instead"
4. **Decide:** Adjust proposal or proceed as-is
5. **Communicate:** Post final decision 2 days before patch

**Final Decision Template:**
```markdown
# Balance Update Final: [Patch Version]
**Release:** [Tuesday, 10 AM PST]

## What Changed from Proposal
Thanks for 200+ feedback messages! Based on your input:
- **Viper:** Changed from 20% speed to 22% (less harsh nerf)
- **Komodo:** Keeping 4s poison duration (no changes)

## Why We Made These Adjustments
[Explanation of feedback impact]

## Full Patch Notes
[Link to detailed changelog]
```

#### Phase 4: Testing (3-5 days)

**Internal Testing:**
- Playtest 50+ games with balanced changes
- Verify no unintended side effects (collision bugs, visual glitches)
- Test edge cases (max speed, multiple power-ups stacking)

**Beta Testing (Optional for Major Changes):**
- Release to 5% of players via feature flag
- Monitor metrics daily (play rate, win rate, crash rate)
- Collect beta feedback in Discord #beta-testers
- Rollback if critical issues found (>10% crash increase)

**QA Checklist:**
```
[ ] Game compiles without errors
[ ] All variants selectable in UI
[ ] No visual glitches (speed trails, collision effects)
[ ] Stats tracking correctly (win rate, game duration)
[ ] Multiplayer sync correct (no desync issues)
[ ] Performance stable (60fps maintained)
[ ] Tutorial still accurate (no outdated tooltips)
```

#### Phase 5: Release (Tuesday, 10 AM PST)

**Why Tuesday:**
- Monday: Team recovering from weekend, not ideal for emergencies
- Tuesday: Full week to monitor, hotfix if needed
- Avoid Friday: No weekend coverage for critical bugs

**Release Procedure:**
1. **Deploy:** Push to production (via CI/CD pipeline)
2. **Verify:** Run smoke tests (game loads, stats track, no crashes)
3. **Announce:** Post in Discord, Twitter, in-game news
4. **Monitor:** Watch Sentry (errors), Amplitude (play rates), Discord (sentiment)

**Announcement Template:**
```markdown
# Patch [Version] Now Live!
**Balance Changes:**
- Viper: Speed boost 30% → 22%
- Komodo: Poison duration 3s → 4s

**Bug Fixes:**
- Fixed collision detection edge case
- Improved multiplayer sync stability

**Full Notes:** [Link]
**Questions?** Ask in #game-discussion
```

#### Phase 6: Post-Release Monitoring (2 weeks)

**Daily Checks (First 3 Days):**
- Crash rate (should be <0.5% per session)
- Play rate delta (changed variants should shift 5-15%)
- Community sentiment (Discord, app reviews)
- Revenue impact (should be neutral or positive)

**Weekly Review (Week 1-2):**
- Compare pre-patch vs post-patch metrics
- Identify if goals achieved (win rate closer to 50%?)
- Document learnings for next balance cycle

**Success Criteria:**
```
Goal: Reduce Viper play rate from 42% to 25-30%
- Week 1: 35% (trending down, good)
- Week 2: 28% (success!)

Goal: Maintain overall engagement
- Sessions/day: 3.2 → 3.1 (acceptable, <5% drop)
- Session duration: 10m → 10m (stable)
```

### 1.4 Emergency Balance Hotfix

**When to Hotfix (Skip Normal Process):**
- Win rate >80% or <20% (unplayable)
- Crash rate >5% tied to specific variant/power-up
- Exploit discovered (infinite DNA, invincibility)
- Negative press trending (viral "game broken" posts)

**Hotfix Process:**
1. **Identify:** Confirm issue with data (not anecdotes)
2. **Fix:** Design minimal change to stop bleeding
3. **Test:** 30-min playtest (not full QA cycle)
4. **Deploy:** Immediate release (same day)
5. **Communicate:** Apologize, explain, promise full fix later

**Hotfix Announcement Template:**
```markdown
# Emergency Hotfix: [Issue]
We've deployed an emergency fix for [specific problem].

**What Happened:**
[Brief explanation: "A bug caused Viper to move 3x faster than intended"]

**Immediate Fix:**
[What we did: "Temporarily disabled Viper until full fix ready"]

**Next Steps:**
[Timeline: "Full balance patch coming Tuesday with proper Viper tuning"]

**Compensation:**
[Goodwill gesture: "All players receive 500 DNA, 24hr energy refill"]

We apologize for the disruption. Thank you for your patience.
```

---

## 2. Emergency Response

### 2.1 Severity Levels

| Priority | Impact | Response Time | Examples |
|----------|--------|---------------|----------|
| **P0** | Game unplayable for >50% users | 1 hour | Complete server outage, login broken, payment processing down |
| **P1** | Core feature broken | 4 hours | Leaderboard not updating, breeding system disabled, battle pass locked |
| **P2** | Degraded experience | 24 hours | Slow load times, minor visual bugs, analytics not tracking |
| **P3** | Minor issue | 1 week | Typos, cosmetic glitches, non-critical feature requests |

### 2.2 Response Time Targets

**P0 (Critical):**
- **Detection:** 5 minutes (monitoring alerts)
- **Acknowledgment:** 15 minutes (team notified)
- **Triage:** 30 minutes (cause identified)
- **Resolution:** 1 hour (fix deployed or workaround)
- **Communication:** Every 30 minutes (status updates)

**P1 (High):**
- **Detection:** 30 minutes
- **Acknowledgment:** 1 hour
- **Triage:** 2 hours
- **Resolution:** 4 hours
- **Communication:** Every 2 hours

**P2 (Medium):**
- **Detection:** 4 hours
- **Acknowledgment:** 8 hours
- **Triage:** 1 day
- **Resolution:** 24 hours (or batched with next patch)
- **Communication:** Daily update

**P3 (Low):**
- **Detection:** 1 week
- **Triage:** 1 week
- **Resolution:** Next scheduled release
- **Communication:** Included in patch notes

### 2.3 On-Call Rotation

**Coverage:**
- **Primary:** Engineer (full access, deploy rights)
- **Secondary:** Product Manager (comms, decision-making)
- **Backup:** Senior Engineer (escalation path)

**Schedule:**
- **Weekdays:** 8 AM - 8 PM (12hr coverage)
- **Weekends:** 10 AM - 6 PM (8hr coverage)
- **Rotation:** Weekly (Monday-Sunday)

**On-Call Playbook:**
```
Alert Received:
1. Acknowledge in PagerDuty (stops escalation)
2. Check Sentry, Supabase logs, Amplitude for scope
3. Assess severity (P0-P3)
4. Notify team in Slack #incidents
5. Follow severity-specific runbook

If Unable to Resolve in 50% of Target Time:
- Escalate to secondary on-call
- Create war room (Zoom call)
- Involve backup on-call if needed
```

### 2.4 Incident Communication Templates

#### P0: Critical Outage

**Initial Update (Within 15 Minutes):**
```markdown
# Service Disruption - Investigating
We're aware of an issue preventing players from logging in.
Our team is investigating and will provide updates every 30 minutes.

**Status:** Investigating
**Impact:** Login unavailable
**Next Update:** [Time + 30min]
```

**Progress Update (Every 30 Minutes):**
```markdown
# Service Disruption - Update [#2]
**Status:** Identified - Database connection issue
**Current Work:** Restoring backup connection pool
**ETA:** 20 minutes
**Next Update:** [Time + 30min]
```

**Resolution:**
```markdown
# Service Restored
The login issue has been resolved. All systems are operational.

**What Happened:** Database connection pool exhausted during traffic spike
**Fix:** Increased pool size, added monitoring alerts
**Downtime:** 47 minutes (10:15 AM - 11:02 AM PST)

**Compensation:**
All players will receive:
- 1,000 DNA
- 48-hour energy refill
- 2x XP for 24 hours

Thank you for your patience. Full post-mortem coming within 48 hours.
```

#### P1: Feature Broken

**Announcement:**
```markdown
# Known Issue: [Feature Name]
We're aware that [feature] is not working correctly.

**Impact:** [Specific behavior: "Battle pass rewards not claiming"]
**Workaround:** [If available: "Restart app to trigger reward"]
**ETA:** Fix deploying within 4 hours

We'll update this thread when resolved.
```

**Resolution:**
```markdown
# Fixed: [Feature Name]
[Feature] is now working correctly. No app update required.

**What We Fixed:** [Brief: "Server-side reward claim logic"]
**Compensation:** [If warranted: "Affected players receive missing rewards + 500 DNA"]

Thanks for your patience!
```

### 2.5 Hotfix Deployment Process

**Pre-Deployment Checklist:**
```bash
# 1. Create hotfix branch
git checkout main
git pull origin main
git checkout -b hotfix/[issue-description]

# 2. Implement fix
# [Make minimal code changes]

# 3. Write test
npm test [affected-module].test.ts

# 4. Verify locally
npm run dev
# [Manual test: Reproduce issue, verify fix]

# 5. Create PR
git commit -m "Hotfix: [issue description]"
git push origin hotfix/[issue-description]
# Create PR with label "hotfix" (bypasses normal review)

# 6. Deploy to staging
# [CI/CD auto-deploys to staging]
# [Run smoke tests]

# 7. Deploy to production
# [Merge PR triggers production deploy]

# 8. Verify production
curl https://supasnake.com/api/health
# [Check Sentry for new errors]
# [Monitor Amplitude for impact]

# 9. Communicate
# [Post resolution message in Discord, Twitter]
```

**Rollback Procedure (If Hotfix Fails):**
```bash
# Option A: Revert commit
git revert [commit-hash]
git push origin main

# Option B: Redeploy previous version
git checkout [previous-stable-commit]
git push origin main --force
# [Requires approval from senior engineer]

# Then: Investigate why hotfix failed
# Write post-mortem
# Re-attempt fix with more thorough testing
```

### 2.6 Compensation Policies

**Philosophy:**
- Compensation should match frustration level (not just downtime)
- Be generous early (build trust), refine over time
- Premium currency (DNA) is cheap to give, valuable to players

**Compensation Matrix:**

| Severity | Downtime | Premium Currency | Energy | XP Boost | Other |
|----------|----------|------------------|--------|----------|-------|
| **P0** | >1 hour | 1,000 DNA | 48hr refill | 2x for 24hr | Apology email from CEO |
| **P0** | 30-60 min | 500 DNA | 24hr refill | 2x for 12hr | - |
| **P0** | <30 min | 250 DNA | 12hr refill | - | - |
| **P1** | >4 hours | 500 DNA | 24hr refill | - | - |
| **P1** | <4 hours | 250 DNA | 12hr refill | - | - |
| **P2** | Any | 100 DNA | - | - | Included in patch notes |
| **P3** | N/A | None | - | - | Acknowledgment only |

**Special Cases:**
- **Payment Failures:** Refund + 100% bonus DNA (if charge went through but DNA not awarded)
- **Lost Progress:** Restore progress + 500 DNA (if server rollback affects save data)
- **Event Disruption:** Extend event 24hr + energy refill (if downtime during limited event)
- **Streamer Impact:** Custom compensation (if outage during sponsored stream)

**Delivery Method:**
```sql
-- Add compensation to affected users
INSERT INTO player_inbox (player_id, item_type, item_amount, message, expires_at)
SELECT
  id,
  'dna',
  1000,
  'We apologize for the recent service disruption. Here''s 1,000 DNA as compensation. Thank you for your patience!',
  NOW() + INTERVAL '7 days'
FROM players
WHERE created_at < '[outage_start_time]'  -- Only users who existed during outage
  AND last_login > NOW() - INTERVAL '30 days';  -- Only active players
```

---

## 3. Content Release Cadence

### 3.1 Content Calendar Template

**Weekly Releases (Every Tuesday, 10 AM PST):**
- **Week 1:** New variant (e.g., "Coral Snake - Camouflage ability")
- **Week 2:** New power-up (e.g., "Magnetic Food - Attract nearby food")
- **Week 3:** Mini-event (e.g., "Speed Run Weekend - 2x XP for under-3-minute games")
- **Week 4:** Community spotlight (e.g., "Featured player highlight, user-generated content")

**Monthly Releases (First Tuesday of Month):**
- **Battle Pass Season:** 30-day progression (50 tiers, free + premium tracks)
- **Major Event:** 2-week themed event (e.g., "Dynasty Wars - Clan competition")
- **Balance Patch:** Address 2-3 meta shifts
- **Quality of Life:** UI improvements, bug fixes

**Quarterly Releases (January, April, July, October):**
- **New Dynasty:** 5+ variants with shared theme (e.g., "Arctic Dynasty - Ice abilities")
- **Major Feature:** New game mode, social system, or meta-layer (e.g., "Ranked Ladder")
- **Infrastructure:** Performance improvements, backend upgrades
- **Marketing Push:** App store featuring, influencer partnerships

### 3.2 Weekly Variant Release

**Timeline:**
```
Week -2 (Design):
- Concept ideation (designer + artist brainstorm)
- Mechanics prototype (what makes this unique?)
- Art direction (color palette, pattern, VFX)

Week -1 (Production):
- Implement variant logic (speed, size, special ability)
- Create art assets (sprite, animations, UI icon)
- Write flavor text (dynasty lore, unlock description)
- QA testing (balance, bugs, visual polish)

Monday (Pre-Release):
- Tease on social media (silhouette art, cryptic hint)
- Notify influencers (early access for content creators)
- Prepare announcement (Discord post, patch notes)

Tuesday 10 AM (Release):
- Deploy patch (CI/CD pipeline)
- Announce in Discord, Twitter, in-game news
- Monitor metrics (play rate, crash rate, sentiment)

Week +1 (Monitoring):
- Collect data (play rate, win rate, retention)
- Address bugs (hotfix if critical)
- Plan next variant based on learnings
```

**Variant Design Checklist:**
```
[ ] Unique mechanics (not just stat adjustments)
[ ] Thematic cohesion (fits dynasty lore)
[ ] Balanced on paper (win rate target: 45-55%)
[ ] Accessible to new players (not pay-gated)
[ ] Visual clarity (distinct silhouette, readable at speed)
[ ] Performance tested (no frame drops)
[ ] Tutorial tooltip (explains special ability)
[ ] Unlockable via gameplay (DNA cost: 500-2000)
```

### 3.3 Monthly Battle Pass Season

**Season Structure:**
```
Duration: 30 days
Tiers: 50 (Free: 20 rewards, Premium: 50 rewards)
Cost: $9.99 USD (or 2,000 DNA)
XP per Tier: 1,000 XP (50,000 XP to complete)
Daily XP Available: ~2,000 (casual) to 5,000 (hardcore)
Expected Completion: 15-25 days for engaged players
```

**Reward Distribution:**

| Tier | Free Track | Premium Track |
|------|------------|---------------|
| 1 | 100 DNA | Exclusive variant (season theme) |
| 5 | Energy refill | 500 DNA |
| 10 | Common skin | Rare skin |
| 15 | 200 DNA | Legendary skin |
| 20 | Power-up unlock | 1,000 DNA |
| 25 | - | Epic skin |
| 30 | - | 1,500 DNA |
| 35 | - | Mythic skin |
| 40 | - | 2,000 DNA |
| 50 | - | Ultimate reward (animated skin + title) |

**Season Theme Examples:**
- **Season 1:** "Founder's Legacy" (classic snakes, bronze/gold theme)
- **Season 2:** "Neon Nights" (cyberpunk, synthwave colors)
- **Season 3:** "Jurassic Jungle" (prehistoric, dinosaur-inspired)
- **Season 4:** "Celestial Serpents" (space, constellation patterns)

**Launch Checklist:**
```
Week -4: Theme locked, rewards designed
Week -3: Art production (skins, UI assets, promotional art)
Week -2: Implementation (progression logic, reward claiming)
Week -1: QA testing, marketing assets finalized
Day -3: Pre-announcement (teaser trailer, social media)
Day 0: Season launch (in-game event, Discord celebration)
Day +1: Monitor metrics (purchase rate, engagement, bugs)
Week +2: Mid-season event (double XP weekend)
Day 28: Last chance messaging ("2 days left!")
Day 30: Season ends, next season teased
```

### 3.4 Quarterly Major Feature

**Feature Development Cycle:**
```
Month 1: Planning
- User research (what do players want?)
- Competitive analysis (what are similar games doing?)
- Design documentation (specs, wireframes, technical architecture)
- Stakeholder review (approve scope, timeline, budget)

Month 2: Production
- Engineering implementation (backend, frontend, integration)
- Art production (UI, VFX, animations)
- Weekly playtests (iterate on feel, usability)
- QA testing (functional, performance, edge cases)

Month 3: Polish & Launch
- Beta testing (5% rollout to early adopters)
- Bug fixing (address critical issues)
- Marketing preparation (trailer, press release, influencer kits)
- Soft launch (50% rollout, monitor metrics)
- Full launch (100% rollout, celebrate!)
```

**Feature Launch Template (Example: Ranked Ladder):**
```markdown
# Introducing: Ranked Ladder

**What:**
Compete against players of similar skill for glory and rewards.

**How:**
- Play ranked matches (1v1, skill-based matchmaking)
- Earn rank points (wins = +25, losses = -15)
- Climb tiers (Bronze → Silver → Gold → Platinum → Diamond)
- Unlock exclusive rewards (skins, titles, DNA)

**When:**
Season 1 starts [Date], resets monthly

**Why:**
We heard you want more competitive gameplay. Ranked Ladder is our
answer: fair matches, meaningful progression, bragging rights.

**Learn More:** [Link to full guide]
```

---

## 4. Community Management

### 4.1 Discord Moderation Guidelines

**Moderation Principles:**
- **Transparency:** Explain why actions taken (DM warnings, public bans)
- **Consistency:** Same rules for everyone (no favoritism)
- **Escalation:** Warning → Timeout → Ban (progressive discipline)
- **Redemption:** Temp bans can be appealed (second chances)

**Rules Enforcement:**

| Rule Violation | First Offense | Second Offense | Third Offense |
|----------------|---------------|----------------|---------------|
| Spam (repetitive messages) | Delete + warning | 24hr timeout | 7-day ban |
| NSFW content | Delete + warning | 7-day ban | Permanent ban |
| Harassment/toxicity | Warning | 7-day ban | Permanent ban |
| Cheating/exploits | Permanent ban | - | - |
| Self-promotion (unapproved) | Delete + warning | 24hr timeout | 7-day ban |
| Doxxing/threats | Permanent ban | - | - |

**Moderator Responses:**

**Spam:**
```
@User, please avoid spamming the chat. If you have a question, ask once
and wait for a response. Repeated violations will result in a timeout.
```

**Toxicity:**
```
@User, we want to keep this community welcoming. Personal attacks and
insults aren't tolerated. This is your warning - next offense is a ban.
```

**Exploit Sharing:**
```
@User, sharing exploits publicly is not allowed. Please report bugs via
our official form: [link]. Your account has been flagged for review.
```

### 4.2 Bug Report Triage Process

**Intake Channels:**
- Discord #bug-reports (community-submitted)
- In-game "Report Bug" button (auto-creates ticket)
- Email: bugs@supasnake.com (formal submissions)
- App store reviews (monitored daily)

**Triage Workflow:**
```
New Report Received:
1. Assign ID (BUG-2025-001)
2. Tag with severity (Critical, High, Medium, Low)
3. Tag with category (Gameplay, UI, Performance, Server)
4. Assign owner (Engineer or QA)
5. Request reproduction steps if unclear
6. Prioritize in backlog

Daily Triage Meeting (15 min):
- Review new bugs (assign severity)
- Update status (In Progress, Fixed, Won't Fix)
- Escalate blockers (Critical bugs blocking releases)
```

**Bug Report Template (Auto-Generated):**
```
Bug ID: BUG-2025-001
Reported By: @DiscordUser#1234
Date: 2025-12-19 10:35 AM PST

**Description:**
Game crashes when I try to claim battle pass reward at tier 20.

**Reproduction Steps:**
1. Open battle pass screen
2. Scroll to tier 20
3. Tap "Claim" button
4. App freezes, then crashes

**Expected Behavior:**
Reward should be claimed, added to inventory.

**Actual Behavior:**
App crashes, reward not received.

**Device:**
- Platform: iOS
- Device: iPhone 14 Pro
- OS Version: iOS 17.2
- App Version: 1.3.5

**Attachments:**
- Screenshot: [link]
- Crash log: [link]

**Status:** New
**Severity:** High (blocking progression)
**Assigned To:** @EngineerName
```

**Response Times:**

| Severity | Acknowledge | Investigation | Fix | Communication |
|----------|-------------|---------------|-----|---------------|
| Critical | 1 hour | 2 hours | 4 hours (hotfix) | Hourly updates |
| High | 4 hours | 1 day | 1 week | Daily updates |
| Medium | 1 day | 1 week | 2 weeks | Weekly updates |
| Low | 1 week | 2 weeks | Next release | Patch notes only |

**User Communication Templates:**

**Acknowledged:**
```
Thanks for reporting! We've reproduced the issue and are investigating.
We'll update this thread when we have more info.

Bug ID: BUG-2025-001
Status: Investigating
Estimated Fix: [Timeline]
```

**Fixed:**
```
This bug has been fixed in version 1.3.6, deploying today.
Please update your app and let us know if you still encounter the issue.

As compensation for the inconvenience, we've added 500 DNA to your account.
Thanks for helping us improve SupaSnake!
```

**Won't Fix:**
```
After investigation, this is working as intended. [Explanation of why
behavior is correct]. If you have suggestions for improving this, please
share in #feature-requests. Thanks!
```

### 4.3 Feature Request Tracking

**Voting System:**
- Discord #feature-requests (upvote with reactions)
- In-game "Suggest Feature" form (auto-creates ticket)
- Community surveys (quarterly, top 10 requests)

**Request Categorization:**
```
Gameplay: New modes, variants, power-ups
UI/UX: Interface improvements, accessibility
Social: Clans, chat, spectating
Monetization: IAP bundles, pricing, battle pass
Technical: Performance, stability, cross-platform
```

**Decision Framework:**

| Criteria | Weight | Score (1-5) |
|----------|--------|-------------|
| Community votes | 30% | [Count / 100] |
| Strategic fit | 25% | [Team rating] |
| Development effort | 20% | [5 = low, 1 = high] |
| Revenue impact | 15% | [Projected ARPU lift] |
| Differentiation | 10% | [Unique vs competitors?] |

**Example Scoring:**
```
Request: "Add spectator mode for clan matches"
- Votes: 450 (4.5/5 score)
- Strategic fit: High (4/5) - supports clan engagement
- Effort: Medium (3/5) - requires new UI + server logic
- Revenue: Low (2/5) - no direct monetization
- Differentiation: Medium (3/5) - common in competitors

Total Score: (4.5 * 0.3) + (4 * 0.25) + (3 * 0.2) + (2 * 0.15) + (3 * 0.1)
           = 1.35 + 1.0 + 0.6 + 0.3 + 0.3
           = 3.55 / 5 (71% - Add to roadmap)
```

**Roadmap Communication:**
```markdown
# Feature Roadmap Update: Q1 2026

**In Development:**
- Spectator Mode (Q1 release)
- Replay System (Q1 release)

**Planned:**
- Guild vs Guild Wars (Q2)
- Custom Game Modes (Q2)
- Leaderboard Seasons (Q2)

**Under Consideration:**
- Cross-platform progression (investigating technical feasibility)
- Cosmetic workshop (user-generated skins - legal review needed)

**Not Planned:**
- PvP trading (economy concerns)
- Voice chat (moderation complexity)

Questions? Ask in #roadmap-discussion
```

### 4.4 Influencer & Streamer Program

**Tiers:**

| Tier | Followers | Benefits | Requirements |
|------|-----------|----------|--------------|
| **Micro** | 1K-10K | Early access, custom code (100 DNA) | 1 video/month |
| **Mid** | 10K-100K | Above + exclusive skin, revenue share (5%) | 2 videos/month |
| **Macro** | 100K-1M | Above + co-designed content, 10% revenue share | 1 sponsored video/month |
| **Mega** | 1M+ | Custom integration, 15% revenue share, event hosting | Partnership negotiation |

**Onboarding Process:**
```
1. Application: influencers@supasnake.com (proof of audience)
2. Review: Verify follower count, content quality, brand fit
3. Approval: Send contract, NDA, creator kit
4. Launch: Provide early access, tracking link (revenue attribution)
5. Support: Dedicated Discord channel, priority bug reports
6. Reporting: Monthly performance review (views, conversions, revenue)
```

**Creator Kit Contents:**
- Game press kit (logos, screenshots, trailer)
- Talking points (what makes SupaSnake unique?)
- Gameplay tips (how to create entertaining content)
- Custom creator code (100-500 DNA for viewers)
- Revenue dashboard (track conversions, earnings)

**Performance Metrics:**
```
Views: How many people watched?
Click-through rate: % clicking game link in description
Installs: App downloads attributed to creator
Conversion rate: % of installs becoming paying users
Revenue: Total IAP from attributed users
LTV: Long-term value of creator's audience
```

---

## 5. Performance Monitoring

### 5.1 Daily Health Check Template

**Run every morning (9 AM PST):**

```markdown
# Daily Health Check: [Date]

## Player Metrics (vs. 7-day avg)
- DAU: [Count] ([+X%] / [-X%])
- Sessions per DAU: [Avg] ([+X%] / [-X%])
- Avg session duration: [Minutes] ([+X%] / [-X%])
- New installs: [Count] ([+X%] / [-X%])
- Churn rate (D1): [%] ([+X%] / [-X%])

## Revenue Metrics (vs. 7-day avg)
- Daily revenue: $[Amount] ([+X%] / [-X%])
- ARPDAU: $[Amount] ([+X%] / [-X%])
- Conversion rate: [%] ([+X%] / [-X%])
- Battle pass sales: [Count] ([+X%] / [-X%])

## Technical Health
- Server uptime: [%] (target: 99.9%)
- API response time (p99): [ms] (target: <200ms)
- Crash rate: [%] (target: <0.5%)
- Error rate (Sentry): [count] (target: <100/day)

## Top Issues
1. [Issue description + status]
2. [Issue description + status]
3. [Issue description + status]

## Action Items
- [ ] [Action if metric concerning]
- [ ] [Action if metric concerning]

**Overall Status:** 🟢 Healthy / 🟡 Monitoring / 🔴 Alert
```

**Automation Script:**
```bash
#!/bin/bash
# File: scripts/daily-health-check.sh

# Fetch metrics from Amplitude, Supabase, Sentry
# Generate report
# Post to Slack #daily-metrics
# Alert if any metric >10% deviation from 7-day avg
```

### 5.2 Revenue vs Retention Balance

**Philosophy:**
- Retention drives long-term revenue (LTV > short-term ARPDAU)
- Aggressive monetization kills retention (balance is critical)
- Target: 40% D1, 20% D7, 10% D30 retention (industry healthy)

**Monitoring Dashboard:**

| Metric | Target | Yellow Alert | Red Alert | Action |
|--------|--------|--------------|-----------|--------|
| D1 Retention | 40% | <35% | <30% | Investigate onboarding, reduce friction |
| D7 Retention | 20% | <18% | <15% | Review content cadence, progression pacing |
| D30 Retention | 10% | <8% | <6% | Assess long-term engagement hooks |
| ARPDAU | $0.50 | <$0.40 | <$0.30 | Review IAP pricing, offer visibility |
| Conversion Rate | 5% | <4% | <3% | Test new offers, reduce paywall friction |
| Session Length | 10 min | <8 min | <6 min | Check engagement loops, core fun |

**Cohort Analysis (Weekly):**
```
Compare cohorts by install week:
- Week 1 (installed Dec 1-7): D1=42%, D7=22%, ARPDAU=$0.55
- Week 2 (installed Dec 8-14): D1=38%, D7=19%, ARPDAU=$0.62
- Week 3 (installed Dec 15-21): D1=35%, D7=?, ARPDAU=$0.48

Question: Why did Week 3 D1 drop to 35%?
- Check: Any new bugs introduced?
- Check: Did we change onboarding flow?
- Check: Increased paywall aggressiveness?
- Action: Rollback changes, A/B test alternatives
```

**Retention Killers to Watch:**
- Too many paywalls in first session (>2 = churn risk)
- Energy system too restrictive (can't play 3+ games/day = churn)
- Progression too slow (no unlocks in first 30 min = churn)
- Technical issues (crashes, slow loads = immediate churn)

### 5.3 Server Performance Thresholds

**Infrastructure:**
- **Hosting:** Vercel (frontend), Supabase (backend, database)
- **CDN:** Vercel Edge Network (static assets)
- **Monitoring:** Vercel Analytics, Supabase Metrics, Sentry

**Performance Targets:**

| Metric | Target | Warning | Critical | Action |
|--------|--------|---------|----------|--------|
| API Response (p50) | <50ms | >75ms | >100ms | Optimize queries, add caching |
| API Response (p99) | <200ms | >300ms | >500ms | Investigate slow queries, scale resources |
| Database CPU | <50% | >70% | >90% | Optimize indexes, vertical scaling |
| Database Memory | <60% | >80% | >95% | Review connection pooling, horizontal scaling |
| CDN Hit Rate | >95% | <90% | <80% | Review cache headers, asset optimization |
| Page Load (p50) | <2s | >3s | >5s | Bundle optimization, lazy loading |
| Crash-Free Rate | >99.5% | <99% | <98% | Priority bug fixes, rollback if needed |

**Daily Checks (Automated):**
```bash
#!/bin/bash
# File: scripts/server-health-check.sh

# Check Supabase API response times
curl -w "@curl-format.txt" -o /dev/null -s https://api.supasnake.com/health

# Check database queries
psql $DATABASE_URL -c "SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active';"

# Check error rates
curl -H "Authorization: Bearer $SENTRY_TOKEN" \
  "https://sentry.io/api/0/projects/supasnake/issues/?query=is:unresolved"

# Alert if thresholds exceeded
if [ $RESPONSE_TIME -gt 200 ]; then
  slack_alert "API response time p99 > 200ms"
fi
```

### 5.4 App Store Rating Management

**Target:** 4.5+ stars (top 10% of category)

**Rating Drivers:**
- **Positive:** Fun gameplay, fair progression, responsive devs, frequent updates
- **Negative:** Bugs, crashes, aggressive monetization, poor customer support

**Monitoring:**
```
Daily:
- Check new reviews (iOS App Store, Google Play)
- Respond to negative reviews within 24hr
- Tag reviews by theme (bug report, feature request, praise, complaint)

Weekly:
- Analyze rating trends (improving or declining?)
- Identify top complaint themes (what's hurting rating?)
- Prioritize fixes (address top complaints in next patch)

Monthly:
- Request reviews from happy users (in-game prompt after win streak)
- Highlight positive reviews in marketing (social media, website)
```

**Review Response Templates:**

**Bug Report (1-2 stars):**
```
Hi [Name], we're sorry you experienced this issue. Our team is
investigating and will have a fix in our next update (releasing [Date]).

As an apology, we've added 500 DNA to your account. Please email
support@supasnake.com with your username so we can help further.

Thanks for your patience!
- SupaSnake Team
```

**Feature Request (3 stars):**
```
Thanks for the feedback! [Feature] is on our roadmap for Q[X]. We'll
keep you posted. In the meantime, have you tried [alternative feature]?

Appreciate your support!
- SupaSnake Team
```

**Monetization Complaint (2 stars):**
```
We hear you - balancing free and paid content is tough. We're committed
to keeping the game fair for everyone. [Explain how free players can
progress: daily rewards, events, etc.]

If you have specific suggestions, we'd love to hear them:
feedback@supasnake.com

Thanks for playing!
- SupaSnake Team
```

**Praise (5 stars):**
```
Thank you so much! Reviews like yours keep us motivated. We've got
exciting updates coming - stay tuned!

Happy slithering!
- SupaSnake Team
```

**Prompt for Reviews (In-Game):**
```
Trigger: After 3-win streak OR after claiming battle pass tier 10
Message: "Enjoying SupaSnake? Leave us a review - it helps us grow!"
Buttons: [Rate Now] [Maybe Later] [Don't Ask Again]
Timing: Max 1 prompt per user per month
```

---

## 6. Post-Mortem Template

**Purpose:** Learn from incidents to prevent recurrence.

**When to Write:**
- All P0 incidents (mandatory)
- All P1 incidents (recommended)
- Major feature launches (lessons learned)
- Surprising metrics (unexpected churn spike, viral growth)

**Template:**

```markdown
# Post-Mortem: [Incident Title]

**Date:** [Incident Date]
**Author:** [Name]
**Reviewers:** [Engineering Lead, Product Manager]
**Severity:** P0 / P1 / P2
**Status:** Draft / Under Review / Published

---

## Executive Summary
[2-3 sentences: What happened, impact, root cause, resolution]

Example: "On Dec 15, 2025, a database migration caused login failures
for 6 hours, affecting 100% of users. Root cause was an untested schema
change. Resolution involved rolling back migration and implementing
staging environment testing."

---

## Timeline (All Times PST)

| Time | Event |
|------|-------|
| 10:00 AM | Deployment started |
| 10:15 AM | First user reports login failure in Discord |
| 10:20 AM | PagerDuty alert triggered (error rate spike) |
| 10:25 AM | Engineer acknowledges, begins investigation |
| 10:45 AM | Root cause identified (database schema mismatch) |
| 11:00 AM | Rollback initiated |
| 11:15 AM | Service restored, login working |
| 11:30 AM | Verification complete (no data loss) |
| 12:00 PM | Post-mortem started |

**Total Duration:** 6 hours (10:00 AM - 4:00 PM)
**User-Facing Downtime:** 1 hour 15 min (10:00 AM - 11:15 AM)

---

## Impact

**Users Affected:** 100% (entire user base unable to login)
**Sessions Lost:** ~5,000 (estimated based on typical hourly sessions)
**Revenue Lost:** ~$500 (estimated based on ARPDAU * affected users)
**Support Tickets:** 47 (Discord + email)
**Social Media Mentions:** 120+ (mostly negative)

**Downstream Effects:**
- App store rating dropped from 4.6 to 4.4 (30+ 1-star reviews)
- Clan event disrupted (leaderboard frozen during outage)
- Streamer event cancelled (scheduled tournament postponed)

---

## Root Cause Analysis

**What Happened:**
A database migration (005_add_user_preferences.sql) altered the
`players` table schema. The migration script added a `preferences`
column but failed to set a default value, causing all INSERT queries
to fail with "null constraint violation."

**Why It Wasn't Caught:**
1. Migration tested locally (SQLite) but not on production DB (PostgreSQL)
2. Staging environment didn't exist (deployed directly to production)
3. No pre-deployment validation (query tests would have caught this)
4. CI/CD pipeline lacked database migration checks

**Contributing Factors:**
- Time pressure (rushed deployment to meet deadline)
- Single engineer deployment (no code review for migration)
- Lack of monitoring (no alert for failed login attempts)

---

## Resolution

**Immediate Fix (11:00 AM):**
```sql
-- Rollback migration
ALTER TABLE players DROP COLUMN preferences;

-- Restart application servers
heroku restart
```

**Permanent Fix (Dec 16, Deployed 10 AM):**
```sql
-- Corrected migration with default value
ALTER TABLE players
ADD COLUMN preferences JSONB DEFAULT '{"theme": "dark", "sounds": true}';

-- Test queries
INSERT INTO players (username, preferences)
VALUES ('test_user', DEFAULT);
```

**Verification:**
- Tested on local PostgreSQL database
- Tested on new staging environment
- Ran automated integration tests (100+ login scenarios)
- Manual QA (5 testers, 30 min)

---

## Prevention (Action Items)

**Immediate (This Week):**
- [x] Create staging environment (parity with production)
- [x] Add database migration tests to CI/CD pipeline
- [x] Document migration checklist (testing, review, rollback plan)
- [x] Set up alerts for login failure rate (>5% = PagerDuty)

**Short-Term (This Month):**
- [ ] Require code review for all database changes (2 approvals)
- [ ] Implement canary deployments (5% → 50% → 100%)
- [ ] Add pre-deployment smoke tests (automated login checks)
- [ ] Create runbook for database rollbacks (step-by-step guide)

**Long-Term (This Quarter):**
- [ ] Implement blue-green deployments (zero-downtime deploys)
- [ ] Add database migration versioning (track applied migrations)
- [ ] Conduct disaster recovery drill (simulate total outage)
- [ ] Invest in observability (better logging, tracing, dashboards)

---

## Lessons Learned

**What Went Well:**
- Fast detection (15 min from deployment to alert)
- Clear communication (Discord updates every 30 min)
- Successful rollback (no data loss, clean recovery)
- Team coordination (engineering, product, community all aligned)

**What Went Poorly:**
- No staging environment (deployed untested code to production)
- No pre-deployment validation (migration not tested on PostgreSQL)
- Slow root cause identification (45 min to find schema issue)
- Delayed compensation (took 8 hours to distribute DNA to users)

**Surprises:**
- Community was very understanding (many supportive messages)
- Streamer postponed tournament gracefully (offered to reschedule)
- App store rating recovered quickly (back to 4.5 within 1 week)

---

## Compensation & Follow-Up

**User Compensation:**
- All users: 1,000 DNA + 48hr energy refill
- Active during outage: +500 DNA bonus
- Streamer tournament participants: Custom skins + 2,000 DNA

**Communication:**
- Apology post in Discord (11:30 AM, pinned)
- In-game message (visible for 7 days)
- Email to opted-in users (sent 12:00 PM)
- Social media post (Twitter, Reddit)

**Monitoring:**
- Retention impact: D1 dropped 2% (39% → 37%), recovered within 3 days
- Revenue impact: ARPDAU dropped 10% day-of, recovered next day
- Sentiment: 80% of post-incident reviews positive (appreciated transparency)

---

## Appendix

**Related Documents:**
- [Incident Slack Thread](link)
- [Database Migration Guide](link)
- [CI/CD Pipeline Documentation](link)

**Metrics Dashboard:**
- [Incident Metrics (Grafana)](link)
- [User Sentiment Analysis (Amplitude)](link)

**Code Changes:**
- [PR #234: Rollback Migration](link)
- [PR #235: Fixed Migration](link)
- [PR #236: Add Staging Environment](link)
```

---

## 7. Quick Reference

### Emergency Contacts

| Role | Name | Phone | Email | Slack |
|------|------|-------|-------|-------|
| On-Call Engineer | [Rotating] | [Phone] | oncall@supasnake.com | @oncall |
| Product Manager | [Name] | [Phone] | pm@supasnake.com | @pm |
| CEO | [Name] | [Phone] | ceo@supasnake.com | @ceo |
| Community Manager | [Name] | [Phone] | community@supasnake.com | @community |

### Key Links

**Dashboards:**
- [Amplitude Analytics](https://analytics.amplitude.com/supasnake)
- [Supabase Database](https://app.supabase.com/project/supasnake)
- [Sentry Error Tracking](https://sentry.io/organizations/supasnake)
- [Vercel Deployments](https://vercel.com/supasnake)
- [Revenue Dashboard](https://dashboard.stripe.com/supasnake)

**Tools:**
- [Discord Server](https://discord.gg/supasnake)
- [GitHub Repository](https://github.com/supasnake/game)
- [Figma Designs](https://figma.com/supasnake)
- [Content Calendar](https://notion.so/supasnake/content-calendar)

**Documentation:**
- [API Documentation](docs/api/README.md)
- [Database Schema](docs/database/schema.md)
- [Event Taxonomy](docs/analytics/events.md)
- [Runbooks](docs/runbooks/README.md)

### Common Commands

**Deploy Hotfix:**
```bash
git checkout -b hotfix/[issue]
# [Make changes]
git commit -m "Hotfix: [description]"
git push origin hotfix/[issue]
# [Create PR, merge, auto-deploys]
```

**Rollback Deployment:**
```bash
# Vercel
vercel rollback [deployment-url]

# Database Migration
psql $DATABASE_URL -c "DELETE FROM schema_migrations WHERE version = '[version]';"
psql $DATABASE_URL -f supabase/rollbacks/[version]_rollback.sql
```

**Grant Compensation:**
```sql
-- Add DNA to all active users
INSERT INTO player_inbox (player_id, item_type, item_amount, message, expires_at)
SELECT id, 'dna', 1000, 'Compensation for [incident]', NOW() + INTERVAL '7 days'
FROM players WHERE last_login > NOW() - INTERVAL '7 days';
```

**Check System Health:**
```bash
# API response time
curl -w "@curl-format.txt" -o /dev/null -s https://supasnake.com/api/health

# Database active connections
psql $DATABASE_URL -c "SELECT COUNT(*) FROM pg_stat_activity;"

# Recent errors
sentry-cli issues list --query "is:unresolved" --last 24h
```

### Escalation Paths

**P0 (Game Down):**
1. On-call engineer acknowledges (15 min)
2. If unresolved in 30 min → page secondary on-call
3. If unresolved in 1 hour → page CEO (critical incident)

**P1 (Feature Broken):**
1. On-call engineer investigates (1 hour)
2. If complex issue → schedule war room (Zoom call)
3. Daily updates to stakeholders until resolved

**Community Crisis (Viral Negative Press):**
1. Community manager notifies product manager
2. Product manager assesses severity (PR risk?)
3. If high risk → prepare public statement (CEO approval)
4. Post response within 4 hours (transparency critical)

---

## Revision History

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2025-12-19 | 1.0 | Initial playbook creation | Claude (Technical Writer) |

---

## Feedback & Updates

This playbook should evolve based on real-world experience.

**How to Contribute:**
1. Identify gaps (process missing? unclear step?)
2. Propose changes (create PR with suggested edits)
3. Review quarterly (team retrospective, update based on learnings)

**Questions?** Slack #post-launch-ops or email ops@supasnake.com
