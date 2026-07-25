# SupaSnake

3D precision snake game. The central mechanic is **extraction**: a portal appears and
the player chooses BANK (secure ×1.25), PASS (continue), or INFUSE (pay body length for
build power). Three dynasties (CYBER/PRIMAL/COSMIC) are genuinely different rulesets. A
run-scoped buildcraft system (genes/strains/splices) feeds a collection and breeding
metagame ("Snake Lab").

**Status:** pre-launch. Live at supasnake.com but no real audience (415 player rows, 15
with a completed run — dev/QA noise). Stripe is in **test mode**; no real purchase has
settled, so the economy can still change freely.

## Documentation authority

**IMPORTANT — read `docs/GROUND_TRUTH.md` before designing or changing any game system.**
It is the verified state of the game, generated from code and migrations with a
citation for every claim. Design docs describe intent; it describes what ships.

Current contracts are listed in `docs/README.md`. `docs/game/MONETIZATION_DESIGN.md` is
LOCKED — changing its §1 principles needs explicit sign-off. Twenty stale design
documents were deleted on 2026-07-25; if you need that history it is in git, but it
describes an abandoned design and should not be implemented from.

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
supabase/migrations # 001-038; 029-033 Genome, 034-036 security/compliance, 037 FTUE v2, 038 Training
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
- Score is deliberately independent of genes, traits, and anomalies
  (`src/shared/game/rulesets.ts:261-267`). The leaderboard measures play, not build.
  Keep it that way.

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
