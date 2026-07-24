# SupaSnake documentation map

This index identifies the current sources of truth. Older research and planning
documents remain useful context but do not override the files listed here.

## Product contracts

| Area | Authoritative document |
|---|---|
| Complete game direction | [Game Design v2](game/GAME_DESIGN_V2.md) |
| Player flow, onboarding, and interruptions | [Player Flow & Interruption Policy](game/PLAYER_FLOW_INTERRUPTION_POLICY.md) |
| Genome/buildcraft | [Buildcraft: The Genome](game/BUILDCRAFT_GENOME_DESIGN.md) |
| Active game screen and camera | [Run Cockpit & Arena](game/HUD_COCKPIT_REDESIGN.md) |
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

## Supporting material

- `game/systems/analysis/` contains deep system research and historical design
  analysis. It is not automatically the current implementation contract.
- `platform/` documents the earlier ZTE/context-engineering toolchain. It is
  retained as historical engineering reference, not as SupaSnake product or
  release status.
- `PRODUCTION_ROADMAP_AAA.md` is an aspirational business roadmap. It does not
  define the current shipped scope, production state, or release authority.
- Root `CLAUDE.md` and `CLAUDE_KV.md` provide concise repository context for
  development agents; operational claims still defer to `ops/`.

## Documentation maintenance

When a release changes production state:

1. Update the QA target table and release evidence.
2. Update the environment matrix if configuration or migration state changed.
3. Update the relevant product contract when behavior changed.
4. Keep the release runbook generic; do not leave completed migrations listed
   as pending.
5. Link new authoritative documents from this index and the root README.
