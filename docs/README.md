# SupaSnake documentation map

This index identifies the current sources of truth. Older research and planning
documents remain useful context but do not override the files listed here.

## Start here

| Need | Document |
|---|---|
| **What may be built at all — design law** | [Product Constitution](PRODUCT_CONSTITUTION.md) (v1.7) |
| What to build next, and how | [Implementation Handoff](IMPLEMENTATION_HANDOFF.md) |
| The gate every PR passes | [Constitution Checklist](CONSTITUTION_CHECKLIST.md) |
| The verified state of the game as built | [Ground Truth](GROUND_TRUTH.md) |
| Amendments awaiting the owner | [Proposed Amendments](CONSTITUTION_AMENDMENTS_PROPOSED.md) |
| Strategic assessment behind the Constitution | [Product, Gameplay & Metagame Audit](game/SUPASNAKE_PRODUCT_GAMEPLAY_METAGAME_AUDIT.md) |

The Constitution decides *what* may exist: its 14 Inviolable Rules and §12.2 caps
bind every change, and a change that cannot be reconciled with them needs an
amendment, not an exception. Work is decomposed into numbered work packages in the
Implementation Handoff; `AGENTS.md` carries the branch, worktree, and migration
protocol that executes them.

`GROUND_TRUTH.md` is generated from code and migrations, with a citation for every
claim, as of the `pre-constitution` tag. Where a design document and the code
disagree, `GROUND_TRUTH.md` records what is actually true; the design document
records what was intended. As work packages land it goes stale — code outranks it.

## Product contracts

These remain authoritative **within** the Constitution. Where one of them conflicts
with the Constitution, the Constitution wins and the contract is the stale document.

| Area | Authoritative document |
|---|---|
| Complete game direction | [Game Design v2](game/GAME_DESIGN_V2.md) |
| Progress recognition, career memory, and social proof | [Career Spine](game/CAREER_SPINE.md) |
| Player flow, onboarding, and interruptions | [Player Flow & Interruption Policy](game/PLAYER_FLOW_INTERRUPTION_POLICY.md) |
| Genome/buildcraft | [Buildcraft: The Genome](game/BUILDCRAFT_GENOME_DESIGN.md) |
| Active game screen and camera | [Run Cockpit & Arena](game/HUD_COCKPIT_REDESIGN.md) |
| Energy Commitment and Clan Energy Battles | [Energy Commitment & Clan Battles](game/ENERGY_COMMITMENT_AND_CLAN_BATTLES.md) |
| Monetization, catalog, and commerce sequencing | [Monetization Strategy](game/MONETIZATION_STRATEGY.md) |
| Deliberate practice | [Training Lab](game/TRAINING_LAB_DESIGN.md) |
| Player identity | [Player Identity v1](game/PLAYER_IDENTITY_V1.md) |

## Approved player-journey contract

- [Cohesive Player Journey](game/COHESIVE_PLAYER_JOURNEY.md) — approved 31 July
  2026; implementation and production validation tracked in this release.
  end-to-end journey, information architecture, continuity UX, and attention
  hierarchy. It becomes authoritative only after the owner validates the local
  review build.

**Superseded:** `game/MONETIZATION_DESIGN.md` — replaced by Constitution §10, with
the ruling recorded in its §15 Overturn Record. It is kept as the historical v1.0
position. Do not implement from it; use the current Monetization Strategy for
product boundaries, catalog sequencing, and commerce architecture.

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
| Supporter billing verification | [Supporter Billing QA](game/QA_PREMIUM_BILLING.md) |

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
