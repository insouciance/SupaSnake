# SupaSnake platform status

**Updated:** 2026-08-02

**Environment:** operator production, Stripe sandbox

**Canonical URL:** <https://supasnake.com>

## Production

| Item | State |
|---|---|
| Application | Healthy |
| Database | Healthy, Supabase `eu-central-1` |
| Schema | Migrations 001–064 deployed and aligned; reviewed 065 Genome v2 addition pending release |
| FTUE | v2 enabled; one-click anonymous PRIMAL bootstrap |
| Run UI | Refined cockpit enabled |
| Practice | Training Lab enabled; deterministic and rewardless |
| Energy | Server-time recovery to 6; 1–6 commitment; nonlinear harvest |
| Clan battle | Automatic positive-Energy eligibility; three days; best five per member |
| Career | Durable run ingress; atomic progression; bounded recognition; server-backed attention and memory |
| Player-feature baseline | `23ba6e6fd95029cd9da4cea5b78a998b55aac782` |
| Current deployment | `dpl_EnCt6pRQPqsgWzrohK7r9oYSAssx` |
| Outgoing pre-Genome artifact | `dpl_EnCt6pRQPqsgWzrohK7r9oYSAssx`; compatible with additive migration 065 before v2 intake, but not a safe rollback target after any v2 session is issued |
| Payments | Test/sandbox mode only |

The current release passed protected-PR and post-main Build, Lint, Test, and
both isolated-Supabase E2E workflows; full type checking, lint, Jest coverage,
production build, deterministic cockpit fixtures, local migrations 001–064
from zero, phased continuity/Career and concurrency SQL integration, the production
runtime dependency audit, staged and canonical health, linked database lint,
and focused public-production smoke. Detailed evidence is maintained in
`docs/ops/QA_CHECKLIST.md`.

## Player-facing baseline

- Home Launch authenticates, bootstraps, prepares the run, and reaches the held
  board without a mandatory Lab or second Play action.
- PRIMAL is the authoritative starter for a genuinely new player.
- Every accepted earning run is secured before presentation, then feeds one
  coherent Career Spine: a bounded Results recognition sequence, server-backed
  attention, Career Pulse, lineage history, milestones, and personal or
  privacy-safe clan consequence.
- The arena remains centered and clear of routine HUD elements.
- CYBER and COSMIC keep +1 normal body growth; PRIMAL owns the degressive
  +4/+3/+2/+1 body-pressure curve, while Genome offers run on their own 4–8-food
  clock.
- Growth and CYBER speed changes use brief, non-blocking board callouts rather
  than permanent cockpit telemetry.
- Board pressure now has one shared physical/committed occupancy model across
  client mechanics, rendering, and server claim validation.
- Long snakes render as stable occupied cells with motion concentrated at the
  head and entering/departing boundaries rather than animating every body unit;
  newly completed tight coils earn a one-shot contact-edge seal.
- Restriction reads as transformed terrain: amber forming cells, matte slate
  solids, and pale Genome-derived source reliefs for arena, Fortress,
  calcification, or rung.
- Desktop uses compact top/bottom telemetry decks; portrait mobile keeps the
  proven composition and short landscape uses symmetric side rails.
- Strategic gene, mutation, portal, infusion, and surge decisions command the
  frozen arena in centered dialogs.
- Pause is a tactical hold, not a menu. Accepted movement resumes; Abandon Run
  is a secondary confirmed action.
- Desktop and mobile accept a turn inside a 25%-tick grace window (capped at
  40ms) and execute it at the next valid movement point; Slipstream retains its
  distinct full-tick benefit.
- Mobile flick input holds at most two unresolved turns and narrowly suppresses
  only a rapid third-turn micro-U that would enter the newly formed neck. It has
  no general steering cooldown or broad collision forgiveness.
- COSMIC remains uninterrupted in normal play. Voluntary tactical holds begin
  at six and gain two at modelled lengths 25 and 40, for ten across the typical
  run; no food wave or tactical object pauses the game automatically.
- The Training Lab provides voluntary drills, circuits, and custom routes;
  attempts are server-replayed and cannot grant run rewards.
- Stored Energy recovers from server time at one unit per hour to a cap of six,
  including partial and offline progress. Run Setup defaults to one committed
  Energy and requires a second explicit confirmation for six.
- Personal credited DNA applies the immutable commitment curve only to normal
  run harvest. Score, Yield, Depth, Mastery, achievements, unlocks, and fixed
  rewards remain commitment-independent.
- A positive-Energy normal run begun during an active clan cycle is assigned
  automatically. Each member's five strongest banked Yields contribute; the
  viewer sees their own replacement threshold and aggregate clan totals.

## Engineering baseline

- Next.js App Router, React, TypeScript strict mode
- react-three-fiber / Three.js rendering
- Zustand client state with deterministic engine logic outside rendering
- Supabase server-authoritative progress, economy, and session settlement
- No progress, reward, recovery request, receipt, attention state, or pursuit
  authority in `localStorage`, `sessionStorage`, IndexedDB, or browser caches
- Stripe, Sentry, PostHog, Discord, and Analyst integrations with documented
  degraded modes
- Jest, Playwright, GitHub Actions, Vercel, and isolated Supabase CI

Production feature defaults:

```text
NEXT_PUBLIC_FTUE_V2=true
NEXT_PUBLIC_HUD_COCKPIT_V1=true
NEXT_PUBLIC_GROWTH_LAB_V1=true  # inert legacy environment value; code retired
NEXT_PUBLIC_LADDER_V1=true
NEXT_PUBLIC_CAREER_SPINE_V1=true  # presentation only; never gates settlement
NEXT_PUBLIC_RUN_FLOW_V1=true  # cockpit Setup and Victory Lap
```

## Known follow-ups

These do not invalidate the operator production release:

- Physical iOS Safari and Android Chrome safe-area, browser-chrome, haptic,
  audio, camera, and long-session touch validation
- Owner calibration of PRIMAL's ruled 75/96/120 growth thresholds, plus live-run
  judgement of the coil seal, smoother tail boundary, Genome-derived terrain
  runes, and each source's forming-to-solid transition
- Live Energy tuning: commitment distribution, bank timing, effective reward
  per Energy, progression inflation among high-frequency returners, and whether
  six-Energy attempts become disproportionately attractive
- Live clan tuning: best-five replacement cadence, three-day participation,
  low-Energy skill competitiveness, late-cycle clustering, and generation
  progression during a battle
- Live Career tuning: recognition significance and pacing, Results readability,
  attention noise, lineage-memory usefulness, and clan-consequence clarity
- Monitor pending-settlement age, recovery latency, quarantine volume, duplicate
  end requests, and the ratio of accepted run ends that need asynchronous
  adoption
- Define a reviewed retention policy for routine Career receipts before
  enabling any pruning; permanent milestones and earned history remain durable
- Linked database lint passed with no error and existing non-blocking warnings.
  Address warnings only through a reviewed forward migration; never rewrite
  deployed migration history.
- Migration 061 intentionally closes the retired Career writer. For Genome v2,
  migration 065 remains additive, but once a v2 session is issued the outgoing
  pre-v2 application cannot resume that immutable contract. Rollout incidents
  therefore require the documented dual-version, flag-off forward fix rather
  than restoring the outgoing application.
- Final commercial legal review and support-mailbox operating procedures
- Stripe test-to-live review and a controlled real purchase/refund
- `RESEND_API_KEY` if weekly digest email becomes a marketed feature
- Add a deliberate `/robots.txt` policy before public discovery/SEO work

## Sources of truth

- Product direction: `docs/game/GAME_DESIGN_V2.md`
- Player flow: `docs/game/PLAYER_FLOW_INTERRUPTION_POLICY.md`
- Cockpit: `docs/game/HUD_COCKPIT_REDESIGN.md`
- Energy and clan battles: `docs/game/ENERGY_COMMITMENT_AND_CLAN_BATTLES.md`
- Career and recognition: `docs/game/CAREER_SPINE.md`
- Monetization: `docs/game/MONETIZATION_STRATEGY.md`
- Production QA: `docs/ops/QA_CHECKLIST.md`
- Environment state: `docs/ops/ENV_MATRIX.md`
- Deployment procedure: `docs/ops/RELEASE_RUNBOOK.md`
- Commercial gates: `docs/ops/LAUNCH_CHECKLIST.md`

The verified state of the game as built — every claim cited to code or a
migration — is `docs/GROUND_TRUTH.md`. Read it before designing or changing any
game system.
