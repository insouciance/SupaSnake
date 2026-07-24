# SupaSnake development context

SupaSnake is an active production game, not a blank template or early rebuild.
Preserve shipped behavior and consult the authoritative documents before
changing gameplay, player flow, economy, or production operations.

## Product priority

The core promise is immediate, satisfying play. Gameplay outranks meta systems;
discovery is player-pulled and notification-first. A fresh player launches once,
receives PRIMAL through the atomic FTUE v2 bootstrap, reaches a held arena, and
starts only with deliberate movement.

## Current game screen

- The game board is the centered visual and geometric hero.
- Routine telemetry never overlays the playable board.
- Desktop uses compact top/bottom cockpit decks; mobile retains its proven
  responsive composition.
- Gene and strain identity is graphical and accessible, not tiny microtext.
- Consequential gene, mutation, portal, infusion, and surge choices are the
  deliberate overlay exception: centered dialogs own an atomically frozen run.
- Pause enters a board-visible tactical hold. Accepted movement resumes;
  Abandon Run requires destructive confirmation.

## Architecture constraints

- Game rules and validation remain deterministic and independent of rendering.
- Supabase APIs/RPCs are authoritative for player progress, resources, grants,
  equipment, session settlement, and rewards.
- Never write progress directly from the client or store authoritative progress
  in localStorage.
- Migrations are forward-only. Production is aligned through migration 037.
- Use environment variables; never commit credentials or production data.
- CYBER, PRIMAL, and COSMIC are the active dynasty model. PRIMAL is the starter.

## Production defaults

```text
NEXT_PUBLIC_FTUE_V2=true
NEXT_PUBLIC_HUD_COCKPIT_V1=true
```

An omitted or false flag is a deliberate rollback test, not the default
development assumption.

## Read before changing behavior

1. `docs/README.md`
2. `docs/game/GAME_DESIGN_V2.md`
3. `docs/game/PLAYER_FLOW_INTERRUPTION_POLICY.md`
4. `docs/game/BUILDCRAFT_GENOME_DESIGN.md`
5. `docs/game/HUD_COCKPIT_REDESIGN.md`
6. `docs/ops/QA_CHECKLIST.md`

For deployments or schema work, follow `docs/ops/RELEASE_RUNBOOK.md`. A request
to merge or clean the repository does not authorize a production deployment,
database migration, payment-mode change, or deletion of unpreserved dirty work.
