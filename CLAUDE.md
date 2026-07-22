# SupaSnake

3D snake game with a collection/breeding meta-game ("Snake Lab").

## Stack
- Next.js (App Router) + React + TypeScript (strict)
- react-three-fiber + three.js + drei (3D game scene)
- Supabase (Postgres, auth, realtime) — server-authoritative game state; no game progress in localStorage
- Stripe (energy packs + bundles) — **dedicated SupaSnake Stripe account; never use the Court OS account**
- zustand (client stores), Tailwind CSS
- jest (unit, 80% coverage threshold) + Playwright (e2e), GitHub Actions CI → Vercel

## Layout
```
src/app/            # routes: game, lab, shop, clan, leaderboard, settings, auth, legal + api/*
src/components/     # game (R3F scene), lab, auth, engagement, profile, ui
src/lib/            # game engine (game/SnakeGameLogic.ts), stores, auth, audio, effects, server helpers
src/shared/config/  # game.ts (economy/features), engagement.ts
src/shared/game/    # deterministic gameplay rules and Genome catalogs
supabase/migrations # schema 001-033; 029-033 are the staged Genome rollout
docs/game/          # design specs (Genome + LOCKED CYBER/PRIMAL/COSMIC dynasties)
e2e/                # Playwright specs
```

## Rules
- Server authority: all economy/progress mutations go through API routes + RPCs; client never writes balances.
- Parameterized queries only; no hardcoded secrets (use env vars, see .env.example).
- Dynasties are the DB model (CYBER/PRIMAL/COSMIC, UUID variants). EMBER/CRYSTAL/VOID is deprecated — never reintroduce.
- Check the `error` result of every Supabase call; report failures to Sentry.
- Complete implementations only — no TODO/FIXME left in committed code.

## Commands
```
npm run dev / build / lint
npm test            # jest
npx tsc --noEmit    # typecheck
```

## Release plan
Active release-readiness plan: see `~/.claude/plans/investigate-this-repo-it-rosy-charm.md` (workstreams: dependency upgrade, dynasty unification + engagement loop, persistence reliability, launch readiness).
