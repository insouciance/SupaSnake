# Training and UX feature-batch release plan

- **Date:** 2026-07-24
- **Status:** Deployed and verified
- **Production payments mode:** Stripe test/sandbox
- **Application base:** `b28648580e3a1488d10125aa42b519272136ea4b`
- **Hosted schema before release:** migrations 001–037
- **Production release commit:** `645578ed83483d350e99fff201e984a6f8c25e4e`
- **Production deployment:** `dpl_44KnYTUmDYygkcHrrdxsnaAoqDWB`
- **Hosted schema after release:** migrations 001–038
- **Immediate application rollback:** `dpl_3raqVivFqkbEXvuWy4WUvx1RAgz6`
- **Deployment evidence:** GitHub Actions run `30123163234`
- **Release tag:** `production-2026-07-24-training-ux`

## Release contents

- Deadeye becomes a heading-relative, board-edge T guide with a snapped
  current-cell cue.
- Signed-out and save-progress account dialogs render in a viewport-level,
  focus-contained layer above navigation.
- Notification attention records use semantic destinations, reliable clearing,
  accessible badges, and a viewport-contained notification center.
- Training Lab adds rewardless deterministic drills, a guide-free Circuit,
  custom sandbox routes, server replay, verified skill profiles, and durable
  presets.
- Root `AGENTS.md` establishes the clean-context parallel-feature workflow used
  to create this batch.

Source feature tips before integration:

| Feature | Reviewed source tip |
|---|---|
| Deadeye guide | `b4b6418b3c6cd99e5b01fd135c00c88104a9d890` |
| Account dialog visibility | `dab9bbe8dae965b164f8056af2b9bcf8afeb1520` |
| Notification attention reliability | `d0fdeb4527c785a40362e5f4782bfa62430a22e6` |
| Training Lab | `b4463bf8a8fdecea3ece5f1c4c152e2863952c08` |

## Exact database plan

The linked migration dry-run must select exactly:

```text
038_training_lab.sql
```

Any other pending migration is a stop condition.

Migration 038 is additive and has no backfill. It creates:

- `training_attempts`, containing bounded server-replayed practice facts;
- `training_bests`, containing one atomic best per player/drill/difficulty;
- `training_presets`, containing at most 20 validated sandbox routes per
  player;
- `record_training_attempt`, callable only by `service_role`;
- `save_training_preset`, callable only by `service_role`.

All three tables cascade from `players`, enable RLS with no browser policies,
and grant no access to `anon` or `authenticated`. Training objects never write
Energy, DNA, game sessions, mastery, contracts, seasons, streaks, or economy
transactions.

## Application/schema compatibility

The deployment order in `deploy-production.yml` remains safe on both sides of
the boundary:

- **New application + schema 037:** drills and server replay work; profile and
  preset calls explicitly degrade to non-live/session-local behavior.
- **New application + schema 038:** verified bests, recent attempts, and
  presets persist normally.
- **Previous application + schema 038:** safe. The migration only adds objects
  that the previous runtime does not reference.

Therefore the workflow may stage and promote the application against schema
037, then apply migration 038. A Vercel application rollback remains safe after
038; the additive migration must remain in place.

## Required release gates

- Clean migration replay from 001 through 038.
- Direct SQL verification of PB ordering, concurrent-safe preset cap, cascade
  deletion, RLS, and function grants.
- Full Jest coverage ratchet, TypeScript, ESLint, dependency audit, and
  production build.
- Cockpit geometry, WebGL, and decision-surface matrices.
- Isolated-Supabase Playwright, including auth dialog, notifications, normal
  gameplay, and Training Lab.
- Protected pull-request Build, Lint, Test, and E2E checks on the combined
  release commit.
- Hosted dry-run naming only migration 038 and production environment contract
  validation in Stripe test mode.

## Production smoke

After promotion and migration:

1. Confirm `/api/health` reports application and database healthy.
2. Confirm signed-out account choices remain above Home navigation at mobile,
   landscape, and desktop sizes.
3. Confirm notification opening does not clear attention and semantic actions
   reach their existing Contracts, Season, offline-reward, account, Lab, and
   identity destinations.
4. Confirm a Deadeye run shows the T guide to the correct board edges without
   covering cockpit telemetry.
5. Complete or abandon a Training drill, confirm server verification, refresh,
   and confirm the best remains.
6. Save, reload, and delete a Training sandbox preset.
7. Confirm Training spends no Energy and changes no DNA, contract, season,
   mastery, streak, or leaderboard state.
8. Check production logs for new 5xx, auth, migration, RLS, or rendering errors.

## Release outcome

- The hosted dry-run selected only `038_training_lab.sql`; the workflow staged
  and health-checked the new app against schema 037 before promotion.
- Vercel promoted `dpl_44KnYTUmDYygkcHrrdxsnaAoqDWB`, then Supabase applied
  migration 038. Linked database lint completed with the four previously
  documented older-function warnings and no errors.
- Independent migration listing shows local/remote parity through 038. The
  canonical health endpoint reports both application and database healthy.
- The protected feature and deployment-fix PRs, both post-main CI runs, 245/245
  Jest suites (2,944/2,944 tests), the production build, full isolated E2E, and
  deterministic cockpit checks passed.
- Public production passed account-dialog viewport/focus, notification-center,
  Training, and one-click PRIMAL launch checks. One combined headless run
  starved the URL assertion while the WebGL board was visibly loaded; an
  instrumented trace confirmed `/game` navigation and the exact isolated test
  then passed without retries in 11.4 seconds.
- Remaining work is tactile/manual: real-device safe areas, browser chrome,
  touch feel, live camera motion, full Deadeye play, and the state-heavy
  Training preset and reward-invariance journeys.

## Failure and rollback

- Before promotion: stop; production remains unchanged.
- After promotion but before migration: the new runtime remains schema-037
  compatible; repair and rerun the reviewed forward migration.
- After migration: roll back the application alias only if needed. Do not
  reverse migration 038; it is additive and compatible with the previous
  runtime.
- If persistence invariants fail, stop player-facing Training promotion work,
  preserve the database, and ship a forward fix. Never reset hosted data.
