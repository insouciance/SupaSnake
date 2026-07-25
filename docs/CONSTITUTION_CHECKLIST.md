# Constitution Compliance Checklist

Run on **every PR**. Copy into the PR description and check each line. A `[ ]` left
unchecked blocks merge. Source of truth: `docs/PRODUCT_CONSTITUTION.md` (v1.3) §4.
Items marked ⚙ are mechanically checkable (grep/test); the rest are reviewer reads.

## The 14 Rules

- [ ] **R1 — Run sanctity.** Nothing new renders, fires, or sounds between first
  input and run end except the run's own decisions.
- [ ] **R2 — Score is build-independent.** ⚙ The score fold reads only food events
  and the dynasty ruleset (`rulesets.ts` — no genome/account/charge state).
- [ ] **R3 — No euro reaches a computed number.** Trace any purchase in this PR to
  its outputs; the trace terminates in appearance or continuity.
- [ ] **R4 — Nothing sold but identity/continuity.** Any SKU touched is permanent,
  non-random, fully specified pre-payment, non-consumable.
- [ ] **R5 — Absence never destructive.** A 30-day absence loses only opportunities
  and one Take-streak tier; nothing owned decays, expires, or is confiscated.
- [ ] **R6 — Earned things are permanent.** ⚙ No code path writes a player-owned
  row downward (cosmetics, records, tracks, tenure, lineage).
- [ ] **R7 — Commerce in its district.** Zero commercial surfaces in-run and on
  Results; ≤1 per screen elsewhere; no commercial notification/email/badge.
- [ ] **R8 — Clans never grade, never bill.** No reward thresholds, no intra-clan
  reward math, no officer lever keyed to member output, no purchasable clan number.
- [ ] **R9 — Pillars/numbers/calendar.** The change lands in Mastery, Lineage, or
  Discovery; surfaces on Score or Depth; schedules on Signal/Ascension, Serpent, or
  season — or an amendment is attached.
- [ ] **R10 — Caps intact.** ⚙ No new currency, daily/weekly surface, mode, SKU
  archetype, gene-pool growth past 16, dynasty, or Results layer; taps ≤3/≤2.
- [ ] **R11 — Server authority.** ⚙ All economy/progress mutations via API routes +
  RPCs; settlement is server recompute; **every Supabase `error` checked** and
  reported to Sentry.
- [ ] **R12 — Subtraction first.** The PR names the existing system that could not
  do the job (in the description).
- [ ] **R13 — Operating cost stated.** The PR description names the permanent
  operating cost at current capacity (content cadence, balance, moderation, support).
- [ ] **R14 — If it matters, it has a URL.** New meaningful artifacts are linkable
  with an OG image.

## Mechanical gates ⚙ (run before review)

- [ ] `npx tsc --noEmit` and `npm run lint` and `npm test` green.
- [ ] No `TODO`/`FIXME` in committed code (project rule).
- [ ] No `random()` in any breeding/lineage path (armed once WP-1.05 merges).
- [ ] No energy grant/consume path reachable from any purchase or perk.
- [ ] No new claim RPC beyond the Daily Take's collect.
- [ ] Migrations: numbered per the handoff's serialization protocol; reversible or
  with explicit down-note; every new RPC `SECURITY DEFINER` audited.
- [ ] New player-visible surfaces behind a `NEXT_PUBLIC_*` flag with the rollback
  path tested deliberately (project rule — never let CI infer it).

## Decision log

- [ ] Local decisions made in this PR (naming, copy, layout-within-bounds) are
  listed in the description.
- [ ] Nothing in this PR decides against a Rule, a cap, §10.4, or a [H] default —
  those escalate to the owner instead (see `docs/IMPLEMENTATION_HANDOFF.md` §2).
