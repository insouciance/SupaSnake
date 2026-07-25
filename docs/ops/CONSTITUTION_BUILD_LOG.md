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
| 0.05 Leaderboard integrity | A | in flight | `wp/0-05-leaderboard-integrity` |
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

## PROVISIONAL rulings queued for the owner

None yet.

---

## Owner to-do list

Maintained continuously; final form at the end of this log.

1. **`pre-constitution` tag — pushed** (points at `e82719d`). The three
   documentation commits could **not** be pushed to `main`: it is a protected
   branch requiring 4 status checks. They ride in with the integration PR instead.
2. Confirm the authority documents landed in D-1 are the intended v1.3 text.
3. Before the Phase 0 release: confirm Supabase backup/PITR in the dashboard
   (runbook precondition 3 — not scriptable from here, see D-3).
