# SupaSnake

3D precision snake game. The central mechanic is **extraction**: a portal appears and
the player chooses BANK (secure), CONTINUE (deepen Carry), or MUTATE (consume the
portal for build power). Three dynasties (CYBER/PRIMAL/COSMIC) are genuinely
different rulesets. A
run-scoped buildcraft system (genes/strains/splices) feeds a collection and breeding
metagame ("Snake Lab").

**Status:** pre-launch. Live at supasnake.com but no real audience (415 player rows, 15
with a completed run — dev/QA noise). Stripe is in **test mode**; no real purchase has
settled, so the economy can still change freely.

## Documentation authority

**IMPORTANT — `docs/PRODUCT_CONSTITUTION.md` (v1.13, 2026-08-03) is the single design
authority.** Every system change is designed from it and checked against its 15
Inviolable Rules; every PR runs `docs/CONSTITUTION_CHECKLIST.md`. Implementation work
is decomposed in `docs/IMPLEMENTATION_HANDOFF.md` — take work packages from there,
follow its branch/migration protocol, and never invent scope outside a WP.

`docs/GROUND_TRUTH.md` is the code-verified **baseline of 2026-07-25, pre-Constitution**.
Cite it for what shipped; as work packages land it goes stale — trust code over it.
`docs/game/MONETIZATION_DESIGN.md` is **superseded** by Constitution §10 (overturn
recorded in Constitution §15). Twenty stale design documents were deleted on
2026-07-25; git has the history; do not implement from any of it.

Current Genome behavior is governed by Constitution v1.13 and
`docs/game/TACTICAL_GENOME_V2.md`: ordinary 6 ± 2-food opportunities place a
40-tick physical relic, only collection creates an offer, the Loom is
simple-first with per-offer UNFOLD DETAILS, and one free Genome Workbench is the
only player-facing Research instrument. `/codex` remains a compatibility route,
not a second product surface.

## Stack

- Next.js (App Router) + React + TypeScript (strict)
- react-three-fiber + three.js + drei (3D scene)
- Supabase (Postgres, auth, realtime) — server-authoritative; no game progress in localStorage
- Stripe (dedicated SupaSnake account; **never** the Court OS account)
- zustand, Tailwind; jest (unit, coverage ratchet) + Playwright (e2e); GitHub Actions → Vercel

## Layout

```
src/app/            # routes: game, lab, shop, clan, leaderboard, settings, auth, legal + api/*
src/components/     # game (R3F scene), lab, auth, engagement, profile, ui
src/lib/            # engine (game/SnakeGameLogic.ts), stores, auth, audio, effects, server helpers
src/shared/config/  # game.ts (economy/features), engagement.ts, premium.ts
src/shared/game/    # deterministic rules: rulesets, genes, strains, splices, mastery, lineage
supabase/migrations # Forward-only schema/RPC history; derive the current set from the repo
e2e/                # Playwright specs
```

## Rules

- Server authority: all economy/progress mutations go through API routes + RPCs; the
  client never writes balances.
- Parameterized queries only; no hardcoded secrets (see `.env.example`).
- Dynasties are CYBER/PRIMAL/COSMIC. EMBER/CRYSTAL/VOID is deprecated — never reintroduce.
- **Check the `error` result of every Supabase call**; report failures to Sentry. Several
  existing routes violate this; do not copy them.
- Complete implementations only — no TODO/FIXME in committed code.
- Score is deliberately independent of genes, traits, and anomalies. There are
  **two** score folds, both in `src/shared/game/rulesets.ts`: `computeRunTotals`
  (accumulator at :312) and `computeGenomeRunTotals` (:499). Both may only do
  `score += Math.round(FOOD_BASE_SCORE * ruleset.scoreMultiplier(n))`. The
  leaderboard measures play, not build. `npm run verify:constitution` enforces this
  mechanically; do not weaken it.

## Commands

```
npm run dev / build / lint
npm test            # jest
npx tsc --noEmit    # typecheck
npm run verify:cockpit-prototype / verify:cockpit-webgl / verify:cockpit-decisions
```

Production defaults are `NEXT_PUBLIC_FTUE_V2=true` and `NEXT_PUBLIC_HUD_COCKPIT_V1=true`.
Test rollback paths deliberately; never let CI infer them from an omitted flag.

## Release

Production procedure and rollback boundaries: `docs/ops/RELEASE_RUNBOOK.md`.
