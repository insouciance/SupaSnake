# SupaSnake repository context — key/value

This is a compact companion to `CLAUDE.md`. Operational facts defer to
`docs/ops/`; product behavior defers to the authoritative contracts linked from
`docs/README.md`.

## PROJECT

```text
Name: SupaSnake
State: Active operator production
Canonical_URL: https://supasnake.com
Stack: Next.js 15 + React + TypeScript + Three.js/R3F + Zustand + Supabase
Production_Payments: Stripe sandbox/test
```

## PRODUCTION_BASELINE

```text
Runtime_Commit: 645578e
Deployment: dpl_44KnYTUmDYygkcHrrdxsnaAoqDWB
Rollback_Deployment: dpl_3raqVivFqkbEXvuWy4WUvx1RAgz6
Migrations: 001-038 deployed and aligned
FTUE_Flag: NEXT_PUBLIC_FTUE_V2=true
Cockpit_Flag: NEXT_PUBLIC_HUD_COCKPIT_V1=true
```

## PLAYER_FLOW

```text
Priority: Gameplay first
Discovery: Player-pulled, notification-first
Fresh_Guest: Launch -> anonymous auth -> atomic bootstrap -> prepared run -> held board
Starter: PRIMAL
First_Movement: Deliberate accepted direction only
Mandatory_Lab: Never
Contracts_Before_First_Result: Never auto-open
Account_Creation: Optional
```

## RUN_COCKPIT

```text
Board: Centered and unobstructed by routine HUD
Desktop: Compact top command deck + bottom genome/extraction deck
Portrait: Proven top/arena/bottom composition
Short_Landscape: Compact symmetric side rails
Camera: Complete chassis visible at default/reset pose
Strategic_Decisions: Centered engine-frozen modal; focus/input owned atomically
Pause: Board-visible tactical hold; no pause menu
Resume: Accepted movement input
Abandon: Secondary destructive confirmation
```

## SERVER_AUTHORITY

```text
Progress: Server authoritative
Economy: Server authoritative
Session_Settlement: Server authoritative
Rewards: Server authoritative and idempotent
Bootstrap: bootstrap_player(user_id), atomic and idempotent
Client_Direct_Balance_Writes: Forbidden
Authoritative_LocalStorage: Forbidden
Database_Migrations: Forward-only
```

## ACTIVE_DYNASTIES

```text
IDs: CYBER, PRIMAL, COSMIC
Starter: PRIMAL
Deprecated: EMBER, CRYSTAL, VOID
```

## QUALITY_GATES

```text
Node: 22
Unit: npm test -- --runInBand
Lint: npm run lint
Types: npx tsc --noEmit
Audit: npm audit --audit-level=high
Build: npm run build
E2E: Playwright + isolated Supabase
Cockpit_Geometry: verify:cockpit-prototype
Cockpit_WebGL: verify:cockpit-webgl
Cockpit_Decisions: verify:cockpit-decisions
```

## SAFETY

```text
Secrets_In_Source: Forbidden
Hosted_DB_Reset: Forbidden
Production_Destructive_E2E: Forbidden
Unpreserved_Dirty_Work_Deletion: Forbidden
Automatic_Deployment_From_Merge: Not implied
Migration_From_Merge: Not implied
Stripe_Live_Mode: Separate reviewed release
```

## DOCUMENT_ROUTING

```text
Index: docs/README.md
Game: docs/game/GAME_DESIGN_V2.md
Player_Flow: docs/game/PLAYER_FLOW_INTERRUPTION_POLICY.md
Genome: docs/game/BUILDCRAFT_GENOME_DESIGN.md
Cockpit: docs/game/HUD_COCKPIT_REDESIGN.md
QA: docs/ops/QA_CHECKLIST.md
Environment: docs/ops/ENV_MATRIX.md
Release: docs/ops/RELEASE_RUNBOOK.md
Launch: docs/ops/LAUNCH_CHECKLIST.md
```

## HISTORICAL_BOUNDARY

```text
docs/platform: Historical ZTE/context-engineering research
PRODUCTION_ROADMAP_AAA.md: Aspirational business roadmap
Authority: Neither overrides current product or operations documents
```
