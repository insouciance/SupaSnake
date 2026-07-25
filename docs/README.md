# SupaSnake documentation map

This index identifies the current sources of truth. Older research and planning
documents remain useful context but do not override the files listed here.

## Start here

| Need | Document |
|---|---|
| **The verified state of the game as built** | [Ground Truth](GROUND_TRUTH.md) |
| Strategic assessment and open decisions | [Product, Gameplay & Metagame Audit](game/SUPASNAKE_PRODUCT_GAMEPLAY_METAGAME_AUDIT.md) |

`GROUND_TRUTH.md` is generated from code and migrations, with a citation for every
claim. Where a design document and the code disagree, `GROUND_TRUTH.md` records what
is actually true; the design document records what was intended. Both matter, but
only one of them ships.

## Product contracts

| Area | Authoritative document |
|---|---|
| Complete game direction | [Game Design v2](game/GAME_DESIGN_V2.md) |
| Player flow, onboarding, and interruptions | [Player Flow & Interruption Policy](game/PLAYER_FLOW_INTERRUPTION_POLICY.md) |
| Genome/buildcraft | [Buildcraft: The Genome](game/BUILDCRAFT_GENOME_DESIGN.md) |
| Active game screen and camera | [Run Cockpit & Arena](game/HUD_COCKPIT_REDESIGN.md) |
| Deliberate practice | [Training Lab](game/TRAINING_LAB_DESIGN.md) |
| Monetization behavior | [Monetization Design](game/MONETIZATION_DESIGN.md) |
| Player identity | [Player Identity v1](game/PLAYER_IDENTITY_V1.md) |

If an older document conflicts with one of these contracts, the newer dated
contract and its explicit supersession language win.

## Operations

| Need | Document |
|---|---|
| Current production and test evidence | [QA Checklist](ops/QA_CHECKLIST.md) |
| Environment and credential ownership | [Environment Matrix](ops/ENV_MATRIX.md) |
| Future production deployment | [Release Runbook](ops/RELEASE_RUNBOOK.md) |
| Commercial launch gates | [Launch Checklist](ops/LAUNCH_CHECKLIST.md) |
| Legal/compliance engineering status | [Legal & Compliance](ops/LEGAL_COMPLIANCE.md) |
| Premium billing verification | [Premium and Billing QA](game/QA_PREMIUM_BILLING.md) |

## Still current, outside the contract set

- `game/ACCESSIBILITY.md` — WCAG 2.1 AA guidance. Cross-cutting and compatible
  with the current design.
- `game/systems/CLAN_DUELS_spec.md` — the v1 duel design that Game Design v2 and
  the Gauntlet build directly on top of.
- `game/systems/DYNASTY_SYSTEM_specification_v1.0.md` — **partially superseded.**
  Game Design v2 removes its stat-bonus and generation-scaling mechanics; its art
  direction, variant catalog, unlock costs, DB fields and Panini UX remain
  authoritative. See that file's own header note.
- `game/templates/` — spec authoring templates.

## Deleted (2026-07-25)

Twenty design documents written between October 2025 and January 2026 were removed,
along with the `platform/` ZTE research directory, `PRODUCTION_ROADMAP_AAA.md`,
`CLAUDE_KV.md`, `CONTEXT_INJECTION.md`, and the `automation/` scripts.

They described an abandoned design — Lab-centric 70/30 time split, opt-in ads,
EMBER/CRYSTAL/MECHA dynasties, Tower Mode, 500+ variants, generation stat scaling,
forced tutorial — and were confident, well-formatted, and wrong. Keeping them
degraded every agent and contributor that read them.

The history remains in git (`git log --diff-filter=D --name-only`). It should be read
as rationale for an abandoned direction, never implemented from.

## Supporting material

- Root `AGENTS.md` defines the clean-context, branch-isolated working agreement
  for parallel coding agents.
- Root `CLAUDE.md` provides repository context loaded into every agent session;
  operational claims still defer to `ops/`.
- Root `PLATFORM_STATUS.md` is a single-page current production summary
  (deployment and rollback ids, feature defaults, known follow-ups).

## Documentation maintenance

When a release changes production state:

1. Update the QA target table and release evidence.
2. Update the environment matrix if configuration or migration state changed.
3. Update the relevant product contract when behavior changed.
4. Keep the release runbook generic; do not leave completed migrations listed
   as pending.
5. Link new authoritative documents from this index and the root README.
