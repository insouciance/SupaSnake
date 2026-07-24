# SupaSnake architecture

**Updated:** 2026-07-24

**Runtime:** Next.js 15 App Router, React, TypeScript, Three.js/R3F, Supabase

This document describes the implemented repository. Product rules remain in
`docs/game/`; release and environment authority remain in `docs/ops/`.

## System shape

```text
Browser
  ├─ React pages, cockpit, Lab, profile, shop, settings
  ├─ deterministic SnakeGameLogic + input adapters
  ├─ react-three-fiber rendering
  └─ authenticated fetches
          │
          ▼
Next.js route handlers
  ├─ authenticate Supabase bearer token
  ├─ validate ownership, mode, inputs, and run evidence
  ├─ invoke server helpers / transactional RPCs
  └─ return canonical state
          │
          ▼
Supabase Postgres/Auth
  ├─ players, collection, settings, sessions, progression
  ├─ Genome, lineage, Codex, identity, clans, compliance
  ├─ RLS and service-role boundaries
  └─ forward-only migrations 001–038

External services: Stripe, Vercel, Sentry, PostHog, Discord, OpenAI, Resend
```

## Repository layout

```text
src/app/                  Next.js pages, layouts, and api routes
src/components/           UI and feature components
src/components/game/      Arena, cockpit, entities, inputs, decisions
src/lib/game/             Deterministic engine and game-side helpers
src/lib/server/           Server-only validation and progression logic
src/lib/auth/             Auth/session behavior
src/lib/stores/           Client UI stores
src/shared/config/        Economy and feature configuration
src/shared/game/          Rulesets, Genome, strains, genes, lineage
src/shared/types/         Cross-layer domain types
supabase/migrations/      Forward-only database history
e2e/                      Playwright player journeys
scripts/                  Release and deterministic verification tools
docs/game/                Product/system contracts
docs/ops/                 QA, environment, compliance, releases
```

## Authority boundaries

The browser may render predictions, animation, and optimistic UI, but it does
not own durable player state.

Server-authoritative operations include:

- player bootstrap and repair;
- snake grants, unlocks, equipment, and dynasty synchronization;
- Energy deduction/regeneration;
- game-session creation and settlement;
- score/DNA validation and reward grants;
- contracts, achievements, mastery, Codex, and lineage progression;
- purchases, Premium entitlements, and stipends;
- Training attempt replay, personal bests, and route-preset caps;
- account export, deletion, and compliance records.

The client never writes balances directly and never stores authoritative game
progress in localStorage. Local storage is limited to preferences, consent,
non-authoritative discovery state, and transient launch handoff data.

## Gameplay engine and rendering

`src/lib/game/SnakeGameLogic.ts` owns deterministic grid state and decision
transitions. Rendering consumes snapshots; it does not calculate rewards or
change rules.

Input paths—keyboard, flick, and D-pad—converge on the same direction contract:

- reversals are rejected;
- duplicate/current direction is a legal deliberate start/resume command;
- strategic overlays block input leakage;
- Ready and tactical hold do not advance the simulation;
- accepted input releases the hold atomically.

The R3F arena is one production WebGL canvas. The cockpit surrounds the board;
routine HUD surfaces do not overlap the playable rectangle. Strategic Genome
and portal decisions deliberately center over the visibly frozen arena.

## FTUE v2

Production uses:

```text
NEXT_PUBLIC_FTUE_V2=true
NEXT_PUBLIC_HUD_COCKPIT_V1=true
```

The Launch state machine is:

```text
idle -> authenticating -> bootstrapping -> loading run -> board ready
  ^                                                      |
  +---------------- retry <- failed <--------------------+
```

Migration 037 provides `bootstrap_player(user_id)`, an atomic and idempotent
operation that creates/repairs the player, resolves PRIMAL from catalog data,
grants only when ownership is empty, preserves existing choices, normalizes
equipment, and returns onboarding state. Home Launch and direct session start
both use this authority so initialization never requires the Lab.

## Database evolution

- Migrations are ordered, immutable after release, and forward-only.
- Production is aligned through 037.
- A release dry-run must be a no-op or match the exact migration list recorded
  in its release plan.
- Application/database compatibility must be established before promotion.
- Database rollback is not implied by a Git or Vercel rollback.

Migration groups of current interest:

| Range | Area |
|---|---|
| 024–026 | Clan/Discord, Analyst, identity compatibility |
| 027–028 | Contact and Premium |
| 029–033 | Genome, lineage, Codex, engagement, rollout |
| 034–036 | GDPR and service-role hardening |
| 037 | FTUE v2 bootstrap, backfill, equipment invariant |

## Integrations and degraded modes

- Stripe is authoritative for payment events. Production remains in sandbox
  until the separately reviewed live transition.
- Sentry captures application faults without becoming gameplay authority.
- PostHog is consent-gated and stays silent before analytics opt-in.
- Discord uses encrypted grants, an outbox, and protected dispatch jobs.
- Analyst narration consumes deterministic fact sheets; missing keys, budget,
  or service availability fall back to deterministic copy.
- Resend is optional for digest email. Gameplay remains available without it.

## Testing architecture

| Layer | Coverage |
|---|---|
| Jest | Engine, API logic, components, stores, migrations, validation |
| TypeScript/ESLint | Static contracts and repository quality |
| Cockpit scripts | Responsive geometry, real WebGL budgets, decision surfaces |
| Playwright | Guest FTUE, game setup, input, Lab, consent, cockpit, Genome |
| Supabase CI | Disposable local database with all migrations |
| Protected canary | Exact production-target artifact before promotion |

GitHub Build/Test jobs use placeholder credentials. E2E starts a disposable
Supabase stack. Hosted production data must never be reset or used for
destructive automation.

## Deployment

`main` is the canonical source branch. The manual production workflow validates
the release, previews migrations, stages a protected production-target Vercel
artifact, verifies health, promotes, applies only the reviewed forward
migrations, lints the database, and checks canonical health.

Repository reconciliation with an already-live release does not authorize a
deployment or migration. See `docs/ops/RELEASE_RUNBOOK.md` for the exact
boundary and rollback rules.

## Security and privacy

- Secrets exist only in environment/configuration providers.
- Service-role operations are server-only.
- RLS and explicit user binding protect player-facing reads and writes.
- Critical Supabase errors are checked; failure is not treated as success.
- Age, consent, export, deletion, and purchase evidence follow the legal and
  compliance runbook.
- Credential-pattern, dependency, and database-lint checks are release gates.

## Related documents

- `docs/README.md`
- `docs/game/GAME_DESIGN_V2.md`
- `docs/game/PLAYER_FLOW_INTERRUPTION_POLICY.md`
- `docs/game/HUD_COCKPIT_REDESIGN.md`
- `docs/ops/QA_CHECKLIST.md`
- `docs/ops/ENV_MATRIX.md`
- `docs/ops/RELEASE_RUNBOOK.md`
