<!--
Every PR on this repository is a work package from docs/IMPLEMENTATION_HANDOFF.md
and is judged against docs/PRODUCT_CONSTITUTION.md (v1.3).

The checklist below is a verbatim copy of docs/CONSTITUTION_CHECKLIST.md. If that
file changes, this template changes with it in the same PR. An unchecked `[ ]`
blocks merge. Do not delete a line to make it pass; if a line does not apply, keep
it and write "n/a — <reason>" after it.
-->

## Work package

- **WP:** <!-- e.g. WP-0.01 · Energy envelope -->
- **Track:** <!-- A (server/data) or B (surfaces/growth) -->
- **Constitution sections:** <!-- e.g. §8.6 -->
- **Ground Truth sections:** <!-- e.g. GT §3.3, §9.1–9.2 -->

## What changed

<!-- Player- or operator-visible outcome first, then the mechanism. -->

## Acceptance criteria

<!-- Copy the WP's acceptance line, then state met / not met per clause, with the
     evidence (test name, e2e spec, query). Report honestly: an unmet clause here
     is information, not an embarrassment. -->

- [ ] <!-- criterion --> — evidence:

## R12 · Subtraction first

<!-- Required by the checklist. Name the existing system that could not do this
     job, and what this PR deletes. "Nothing was removed" is an answer, but it
     needs a reason. -->

## R13 · Operating cost

<!-- The permanent cost this adds at current capacity: content cadence, balance
     passes, moderation, support load, cron/infra. -->

## Local decisions

<!-- Naming, copy, layout-within-protected-bounds, internal structure: decided
     here, logged here (handoff §2.3). One line each. -->

## Escalations

<!-- Anything that would bend a Rule (§4), a cap (§12.2), the never-sold list
     (§10.4), a [H] default (§17), or a protected §5 element. State the fork, the
     two coherent options, your recommendation, and what stayed blocked vs.
     what continued. "None" is a valid entry. -->

## Found, not fixed

<!-- Bugs and smells seen outside this WP's scope. Do not fix them here. -->

## Migrations

- [ ] No migration in this PR
- [ ] Migration included — number claimed at **merge** time, rebased on `main`,
      renumbered to the next free slot (handoff §3); forward-only; reversible or
      carrying an explicit down-note; every new `SECURITY DEFINER` RPC audited.

Migration files: <!-- paths, or n/a -->

## Flags and rollback

- [ ] No new player-visible surface
- [ ] New surface behind `NEXT_PUBLIC_*` flag: <!-- name --> — default **off**
      until its phase gate, and the flag-off path is **explicitly tested**, never
      inferred from an omitted flag (project rule).

---

# Constitution Compliance Checklist

Source of truth: `docs/PRODUCT_CONSTITUTION.md` (v1.3) §4. Items marked ⚙ are
mechanically checkable (grep/test); the rest are reviewer reads.

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
- [ ] No `random()` in any breeding/lineage path (post WP-1.6).
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

---

## Gates run

<!-- Paste the actual results. "Green" without output is not evidence. -->

```text
npx tsc --noEmit    →
npm run lint        →
npm test            →
npm run build       →
npx playwright test →   (when the WP touches a player journey)
verify:cockpit-*    →   (when the WP touches the game screen)
```

## Cross-review

- [ ] Reviewed by the other track's agent against this checklist
      (handoff §3) — reviewer:
- [ ] Migration-bearing or economy-touching: owner's `/code-review ultra` requested
