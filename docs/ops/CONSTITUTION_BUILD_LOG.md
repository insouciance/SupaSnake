# Constitution Build Log

Autonomous build run against `docs/PRODUCT_CONSTITUTION.md` v1.3, executed by the
build orchestrator while the owner was away. **Started:** 25 July 2026.

**Integration branch:** `constitution/build`, created from `main` at `e82719d`.
Every work-package branch merges here.

**Envelope, as amended by the owner on 25 July 2026** (verified against
`.claude/commands/execute-constitution.md`, "Production releases"): unreviewed
production releases to supasnake.com are authorized **per completed phase, never
per work package**. A phase ships only when its gate actually passes. Stripe
remains untouchable and in test mode — no SKU, key, dashboard, or webhook change,
ever. Campus seeding, the Founding Keeper SKU, and anything Phase 3+ stay owner
work. Where a runbook step cannot be executed as written, the exact remaining
steps are queued here and flags are left off rather than improvised around.

**Nothing has been released.** Phase 0 is not complete, so no gate has passed and
no release condition exists yet.

**Baseline tag:** `pre-constitution` → `e82719d` (local only; push requires the
owner, see the to-do list). Migration baseline: **038**.

---

## Baseline verification (at `pre-constitution`)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run lint` | clean |
| `npm test` | 245 suites / 2944 tests passed |
| `npm run build` | success (CI placeholder env) |

---

## Orchestrator decisions

**D-1 · The authority documents were landed on the integration branch.**
`docs/PRODUCT_CONSTITUTION.md`, `docs/CONSTITUTION_CHECKLIST.md`,
`docs/IMPLEMENTATION_HANDOFF.md` and `docs/CONSTITUTION_AMENDMENTS_PROPOSED.md`
existed only as untracked files in the owner's worktree, together with uncommitted
edits to `CLAUDE.md` and `docs/game/MONETIZATION_DESIGN.md`. Every work package
reads them by path and the new PR template references the checklist, so no WP
branch could open without them. Committed as `4bf1c47` on `constitution/build`
only. `AGENTS.md` normally forbids an agent from including the owner's local
changes in a feature branch; that rule protects `main`, which is untouched here.
*Owner action: confirm this content is the intended v1.3 text.*

**D-2 · Local `main` is three commits ahead of `origin/main`, unpushed.**
`fc7aa7d`, `a873646`, `e82719d` — documentation only (the stale-doc deletion and
`GROUND_TRUTH.md`). The build branches from local `main`, so the final PR carries
them. *Owner action: push `main` before merging the PR, or accept them in it.*

**D-3 · Release path audited ahead of need (no production state touched).**
Tooling present: Supabase CLI 2.65.5 (CI pins 2.109.1), Vercel CLI 56.3.1, `gh`
authenticated. Two gaps found, both to be handled per the "do not improvise" rule
when Phase 0's gate passes:

- *Local production DB credentials do not exist.* `.env` carries the anon and
  service-role keys but no `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, or
  `SUPABASE_PROJECT_ID` — those live only as GitHub Actions secrets. So the
  pre-release `supabase db dump` cannot be run locally, and runbook precondition 3
  ("confirm Supabase backup/PITR") is a dashboard action, not a scriptable one.
  Migrations are applied *by* the Deploy workflow, which holds the secrets — the
  runbook explicitly forbids running `supabase db push` independently, so no local
  credential is needed for the release itself, only for the backup.
- *`main` is a protected branch* requiring 4 green status checks. The
  `constitution/build` → `main` step is therefore a PR merge, not a push.

**D-4 · Production env validation is coupled to the Stripe energy SKUs.**
`next.config.js` fails the production cloud build on wrong Price IDs, and the
production environment currently defines `NEXT_PUBLIC_STRIPE_ENERGY_SMALL/MEDIUM/
LARGE`, `NEXT_PUBLIC_STRIPE_STARTER_BUNDLE` and `NEXT_PUBLIC_STRIPE_DYNASTY_BUNDLE`.
WP-0.09 deletes `ENERGY_PRODUCTS` and `BUNDLE_PRODUCTS` from code. If the validator
requires those variables, the first post-0.09 production build fails; if it
requires their *absence*, it fails before 0.09 lands. This is a code and
environment-variable question only — no Stripe dashboard, key, or webhook change is
in scope, now or ever. Flagged to WP-0.09 as a required part of its acceptance.

**D-5 · Work packages run in git worktrees under
`/Volumes/Souci_WD/Dev/active/SupaSnake-worktrees/<id>-<slug>`** with `node_modules`
symlinked to the primary checkout, so parallel subagents never share a working
tree. The orchestrator re-runs the full pipeline itself in the primary checkout
before merging anything.

---

## Work packages

### Phase 0 — Truth and subtraction

| WP | Track | Status | Branch |
|---|---|---|---|
| 0.00 Baseline & rails | A+B | **merged** | `wp/0-00-baseline-rails` |
| 0.01 Energy envelope | A | in flight | `wp/0-01-energy-envelope` |
| 0.02 Multiplier stack removal | A | queued | |
| 0.03 Faucet & dead-config purge | A | queued | |
| 0.04 Achievements → Records | A | queued | |
| 0.05 Leaderboard integrity | A | **merged** | `wp/0-05-leaderboard-integrity` |
| 0.06 Session lifecycle & cohorts | A | queued | |
| 0.07 Aim universalization | B | queued | |
| 0.08 Growth hygiene bundle | B | in flight | `wp/0-08-growth-hygiene` |
| 0.09 Commerce removal & premium truth | A | queued | |
| 0.10 `verify:constitution` v1 | B | in flight | `wp/0-10-verify-constitution` |

Ordering follows the handoff's §3 constraints: migrations serialized, and no two
work packages sharing a hot file (`session/route.ts`, `game.ts`, `page.tsx`,
`game/page.tsx`, `gameValidator.ts`) in flight together.

---

#### WP-0.00 · Baseline & rails · **merged** (`83122db`)

Implemented by the orchestrator before the autonomous run began.

- `.github/pull_request_template.md` — embeds `docs/CONSTITUTION_CHECKLIST.md`
  verbatim (14 Rules, mechanical gates, decision log) and adds the handoff's
  per-PR obligations: WP id and track, acceptance evidence, R12 subtraction, R13
  operating cost, local decisions, escalations, "Found, not fixed", the migration
  serialization declaration, and the flag/rollback declaration.
- `AGENTS.md` — new work-package section (`wp/<phase>-<nn>-<slug>` branches, one
  WP per branch per PR, tracks, hot-file sequencing, contract-first parallelism,
  decision/escalation protocol, cross-review), and the migration rule reconciled
  with the handoff's claim-at-merge-time serialization. Records that the
  Constitution outranks `AGENTS.md` on design and `AGENTS.md` outranks the
  Constitution on process.
- `docs/README.md` — Constitution, Handoff and Checklist now head the index;
  `MONETIZATION_DESIGN.md` marked superseded; `GROUND_TRUTH.md` scoped to the
  `pre-constitution` tag.

Local decisions: the index rewrite (`docs/README.md`) was not named in the WP, but
`AGENTS.md`'s startup check routes every agent through it and it still declared the
superseded monetization document authoritative — leaving it would have broken the
rails this WP exists to build.

Found, not fixed: the checklist's TODO/FIXME gate must be scoped to source
extensions — `docs/CONSTITUTION_CHECKLIST.md` and the PR template legitimately
contain the strings `TODO`/`FIXME` while describing the gate. Handed to WP-0.10.

Gates: no code, schema, or configuration changed; the tree is byte-identical to
`pre-constitution` outside `*.md` and the PR template, so the baseline results
above carry. CI proves the acceptance criterion on the final PR.

---

#### WP-0.05 · Leaderboard integrity · **merged**

All three boards (`global`, `weekly`, `daily`) now fold over `game_sessions` with
one shared eligibility rule, differing only in the time window. The global board
previously read the denormalized `players.high_score` scalar, which cannot express
eligibility, per-player dedup, or a content version — that is the R12 subtraction.

Eligibility, enforced in the query and re-applied to the returned rows:
`ended_at IS NOT NULL` · `validated = true` · `is_free_play = false` ·
`anomaly_id IS NULL` · `started_at >= max(content epoch, period start)`. One best
per player; competition ranking (1, 2, 2, 4) ordered `score desc → achievedAt asc
→ runId asc` so paging is stable.

**Generation brackets deleted** — ranking a build-independent Score into
generation tiers implied the build mattered (R2).

**The `myRank` defect is real and GT §9.3 was accurate.** `route.ts` returned
`players.id`; `page.tsx` compared it against `auth.users.id` from `useAuth`.
Different UUID spaces, so `myRank` and the "(You)" highlight could never fire. The
same comparison bug in `handleNewHighScore` was fixed alongside it.

*Vocabulary note for later WPs:* there is no `flagged` column. `validated BOOLEAN
DEFAULT FALSE` (migration 002) is the gate; tests assert both `false` and `null`
are rejected.

**No migration** — every eligibility column already existed, and content version
is a config epoch (`LEADERBOARD_CONTENT_VERSION`), not schema. This also kept the
WP out of `session/route.ts`, a hot file owned by other packages.

**You-centered board API contract** (published for Track B):
`GET /api/leaderboard?type=global|weekly|daily&view=board|you&dynasty=…&limit=&offset=`,
Bearer auth optional (the board is public; a token only resolves `viewer`).
Returns `{type, view, dynasty, contentVersion, entries, top[3], window[±5], viewer,
total, truncated}`. `viewer.playerId` and `entry.playerId` are **both
`players.id`** — clients must never compare against an auth user id.

Orchestrator audit: tsc clean · lint clean · **246 suites / 2968 tests passed**
under CI env · R2 verified (`rulesets.ts` and `src/shared/game/` untouched; no
build-state column selected) · R6 verified (zero writes on the path) · R11
verified (every Supabase `error` checked and reported to Sentry) · scope held.

*Deleted test file, justified:* `src/lib/leaderboard/types.test.ts` imported
nothing from the module it named — it re-declared `getSkillBracket` and the
bracket tables inline and asserted against its own copies. Its entire subject was
deleted by this WP; 62 real tests replace it.

---

## PROVISIONAL rulings queued for the owner

**P-1 · Leaderboard ranking is computed in TypeScript over a capped scan**
(WP-0.05). Ranking folds over an eligible-run scan capped at 5000 rows, paged
1000 at a time; `truncated: true` is returned the moment the cap is hit, so the
board never silently serves wrong ranks. Exact at any population this game has
(415 player rows, 15 with a completed run) and far beyond.

- *Option A (implemented):* pure-TypeScript fold. No migration, no RPC, fully
  unit-testable without a database, no migration-serialization cost.
- *Option B:* a `SECURITY DEFINER` SQL function (`DISTINCT ON (player_id)`,
  `rank()`, you-centered window). Exact at any scale, one round trip; costs a
  migration slot and moves the integrity rules into SQL where jest cannot reach
  them.

*Recommendation:* keep A; promote to B when `truncated` first fires or population
passes ~2,000 weekly-active ranked players. The pure functions in `board.ts`
become the SQL's test oracle at that point.

---

## Found, not fixed — routed to the work package that owns it

| # | Finding | Routed to |
|---|---|---|
| F-1 | `session/route.ts` writes `high_score: Math.max(current, adjustedScore)` with **no `validation.valid` gate**, so a flagged run permanently poisons `players.high_score`. Harmless to the board after WP-0.05, but that column is still read by other surfaces. | WP-0.06 (owns session lifecycle) |
| F-2 | `useLeaderboardRealtime` broadcasts every session insert over a score threshold with no eligibility filter — a free-play or flagged run can still fire a "New high score!" toast for a run that will never rank. | WP-1.06 (Results/toast consolidation) |
| F-3 | GT §9.6 stale sessions: no expiry sweep exists, ~30% of session rows are open. Eligibility now makes them harmless to the board, but funnel and duration analytics stay unreliable. | WP-0.06 (its stated goal) |
| F-4 | `src/lib/game/aimSystems.ts`: Pathline/Gridlock/Firefly are still progression-gated, one of them on *breeding*. Constitution §6.1 and §15 overturn 10 require them universal from run 1. | WP-0.07 (its stated goal) |
| F-5 | The project has **no `@types/jest`**, so `npx tsc --noEmit` never typechecks any `*.test.ts`. Test files are verified only by running them. A type error in a test is invisible to the type gate. | WP-0.10 / owner |

## Owner to-do list

Maintained continuously; final form at the end of this log.

1. **`pre-constitution` tag — pushed** (points at `e82719d`). The three
   documentation commits could **not** be pushed to `main`: it is a protected
   branch requiring 4 status checks. They ride in with the integration PR instead.
2. Confirm the authority documents landed in D-1 are the intended v1.3 text.
3. Before the Phase 0 release: confirm Supabase backup/PITR in the dashboard
   (runbook precondition 3 — not scriptable from here, see D-3).
