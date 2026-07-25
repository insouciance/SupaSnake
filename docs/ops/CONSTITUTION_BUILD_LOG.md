# Constitution Build Log

Autonomous build run against `docs/PRODUCT_CONSTITUTION.md` v1.3, executed by the
build orchestrator while the owner was away. **Started:** 25 July 2026.

**Integration branch:** `constitution/build`, created from `main` at `e82719d`.
Every work-package branch merges here. **`main` is never touched, nothing is
deployed, no migration is applied to any database, Stripe is untouched, and no
`NEXT_PUBLIC_*` flag default is flipped.** The run ends with a single PR to `main`
for the owner.

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

**D-3 · Work packages run in git worktrees under
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

1. Push `main` (3 unpushed documentation commits) and the `pre-constitution` tag.
2. Confirm the authority documents landed in D-1 are the intended v1.3 text.
