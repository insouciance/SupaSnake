# SupaSnake

SupaSnake is a 3D competitive snake game with a collection, Genome, breeding,
and long-term progression layer. The player-facing priority is immediate play:
one Launch prepares a PRIMAL guest, opens a held arena, and waits for deliberate
movement. Meta systems remain voluntary and discoverable.

Production: <https://supasnake.com>

## Current production baseline

- Next.js 15 App Router, React, TypeScript, react-three-fiber, and Zustand
- Supabase Auth/Postgres with server-authoritative economy and progression
- Migrations 001–065 deployed and aligned
- FTUE v2, the refined Run Cockpit, the Training Lab, Energy Commitment,
  Career Spine, and Tactical Genome v2 enabled in production; Genome v2 is live
  with its exact-`true` public contract and immutable v1/v2 run compatibility
- Stripe sandbox/test mode until the commercial-launch checklist is complete

Energy recovers server-side to a six-unit cap. A rewarded run commits 1–6
Energy at start for a configurable nonlinear personal-harvest multiplier; the
same ordinary run automatically feeds the active three-day clan battle, where
each member's best five full-strength Yields contribute. Current deployment,
rollback, schema, and test evidence live in
[Platform Status](PLATFORM_STATUS.md), avoiding volatile release identifiers in
this overview.

The live cockpit keeps the arena centered and unobstructed, uses compact
telemetry decks, presents consequential Genome/portal decisions as dominant
engine-frozen dialogs, and turns Pause into a board-visible tactical hold.
The Training Lab adds deterministic, rewardless practice without spending
Energy or advancing the economy.

Every accepted earning-run result now enters a durable server-side Career
Spine before the client receives completion. Settlement, progression, personal
bests, career memory, recognition, and attention survive dropped responses,
reloads, reconnects, and duplicate completion attempts without storing progress
or recovery work in browser storage.

Tactical Genome v2 preserves uninterrupted Snake flow by placing an optional
physical Gene relic every deterministic 6 ± 2 foods. Only deliberate collection
opens the compact Tactical Loom; six loci then combine shared Genes, Dynasty
signatures, 2/3/4 Strain reactions, and eight Splices. Deeper build research
lives in one free responsive Genome Workbench rather than a parallel in-run
dashboard or duplicate Codex surface.

## Local development

Requirements:

- Node.js 22
- npm
- Supabase CLI 2.109.1 when running the isolated database/E2E stack

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Use local or disposable test credentials only. Production secrets live in
Vercel and must never be copied into source, fixtures, logs, or issue text.

## Quality gates

```sh
npm test -- --runInBand
npm run lint
npx tsc --noEmit
npm audit --audit-level=high
npm run build
```

Cockpit-specific deterministic checks:

```sh
npm run verify:cockpit-prototype
npm run verify:cockpit-webgl
npm run verify:cockpit-decisions
```

The cockpit scripts expect a local server on port 3107 unless
`COCKPIT_BASE_URL` is set. Playwright CI starts an isolated Supabase stack and
must never point destructive tests at hosted production.

## Repository map

| Path | Purpose |
|---|---|
| `src/app` | Pages, layouts, and server API routes |
| `src/components/game` | Arena, cockpit, inputs, overlays, and rendering |
| `src/lib/game` | Deterministic game engine and input logic |
| `src/shared/game` | Genome, strains, rulesets, lineage, and shared catalogs |
| `src/lib/server` | Server-authoritative validation and progression helpers |
| `supabase/migrations` | Forward-only schema history |
| `e2e` | Playwright player-flow and cockpit journeys |
| `docs/game` | Product and system design contracts |
| `docs/ops` | QA, environment, compliance, and release runbooks |

## Authoritative documentation

Start with [the documentation index](docs/README.md). The primary references
are:

- [Game Design v2](docs/game/GAME_DESIGN_V2.md)
- [Career Spine](docs/game/CAREER_SPINE.md)
- [Player Flow & Interruption Policy](docs/game/PLAYER_FLOW_INTERRUPTION_POLICY.md)
- [Tactical Genome v2](docs/game/TACTICAL_GENOME_V2.md)
- [Energy Commitment & Clan Battles](docs/game/ENERGY_COMMITMENT_AND_CLAN_BATTLES.md)
- [Monetization Strategy](docs/game/MONETIZATION_STRATEGY.md)
- [Run Cockpit & Arena](docs/game/HUD_COCKPIT_REDESIGN.md)
- [Current QA baseline](docs/ops/QA_CHECKLIST.md)
- [Production release runbook](docs/ops/RELEASE_RUNBOOK.md)
- [Launch checklist](docs/ops/LAUNCH_CHECKLIST.md)

## Release discipline

- `main` is the canonical source branch.
- Build, Lint, Test, and isolated E2E must pass before merge.
- Database migrations are forward-only and applied only through the reviewed
  production runbook.
- A repository merge is not permission to redeploy, migrate, change Stripe
  mode, or remove rollback artifacts.
- Preserve unrelated dirty work before branch or worktree cleanup.

Commercial launch remains separate from an operator-only production release.
Legal review, support-mailbox operations, live payments, and real-device field
testing are tracked in the launch and QA checklists.
