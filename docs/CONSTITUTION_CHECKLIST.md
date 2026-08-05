# Constitution Compliance Checklist

Run on **every PR**. Copy into the PR description and check each line. A `[ ]` left
unchecked blocks merge. Source of truth: `docs/PRODUCT_CONSTITUTION.md` (v1.14) §4.
Items marked ⚙ are mechanically checkable (grep/test); the rest are reviewer reads.

## The 15 Rules

- [ ] **R1 — Run sanctity.** Nothing new renders, fires, or sounds between first
  input and run end except the run's own decisions. An ordinary Genome cadence
  becomes a decision only when the player collects its physical relic; placement
  and expiry never create an offer or hold.
- [ ] **R2 — Score is build-independent.** ⚙ The score fold reads only food events
  and the dynasty ruleset (`rulesets.ts` — no genome/account/charge state).
- [ ] **R3 — No euro reaches a computed number.** Trace any purchase in this PR to
  its outputs; the trace terminates in appearance or continuity.
- [ ] **R4 — Nothing sold but identity/continuity.** Any SKU touched is permanent,
  non-random, fully specified pre-payment, non-consumable.
- [ ] **R5 — Absence never destructive.** A 30-day absence loses only opportunities
  and one Take-streak tier; nothing owned decays, expires, or is confiscated.
- [ ] **R6 — Earned things are permanent.** ⚙ No code path writes a player-owned
  row downward (cosmetics, records, tracks, tenure, lineage), except the
  owner-initiated lineage exchange defined in §8.2: exact recorded DNA returned
  in full and immutable pedigree history retained.
- [ ] **R7 — Commerce in its district.** Zero commercial surfaces in-run and on
  Results; ≤1 per screen elsewhere; no commercial notification/email/badge.
- [ ] **R8 — Competition creates prestige; integrity makes it credible.** The
  change makes real, server-verified achievement legible; payment cannot buy
  Score, Depth, rank, qualification, matchmaking, gameplay power, exclusive
  tactical information, or earned-proof styling. Any manually assigned honor or
  reward has auditable eligibility, timing, and idempotency rules.
- [ ] **R9 — Pillars/numbers/calendar.** The change lands in Mastery, Lineage, or
  Discovery; surfaces on Score or Depth; schedules on Signal/Ascension, Serpent, or
  season — or an amendment is attached.
- [ ] **R10 — Caps intact.** ⚙ No new currency, daily/weekly surface, mode, SKU
  archetype, gene-pool growth past 16, dynasty, or Results layer; taps ≤3/≤2.
- [ ] **R11 — Server authority.** ⚙ All economy/progress mutations via API routes +
  RPCs; settlement is server recompute; **every Supabase `error` checked** and
  reported to Sentry. No progress-related fact, receipt, pending request,
  attention state, pursuit, or career projection persists in browser storage.
- [ ] **R12 — Subtraction first.** The PR names the existing system that could not
  do the job (in the description).
- [ ] **R13 — Operating cost stated.** The PR description names the permanent
  operating cost at current capacity (content cadence, balance, moderation, support).
- [ ] **R14 — If it matters, it has a URL.** New meaningful artifacts are linkable
  with an OG image.
- [ ] **R15 — Length only increases; free space only shrinks.** ⚙ Nothing in this
  PR reduces snake length or enlarges free space — no reset, truncation, splice,
  slice, or "costs N segments". Anything that costs the player costs **growth**.
  *If a cost is written as "segments removed," it is pricing a reward with a
  reward — send it back.*
- [ ] **R8 competitive proof (v1.7).** Public/member contribution facts identify
  their authoritative run or settlement source, distinguish no-result from
  failure, and cannot be edited into a competitive number by a leader or client.

## Mechanical gates ⚙ (run before review)

- [ ] `npx tsc --noEmit` and `npm run lint` and `npm test` green.
- [ ] No `TODO`/`FIXME` in committed code (project rule).
- [ ] No `random()` in any breeding/lineage path (armed once WP-1.05 merges).
- [ ] **Length monotonicity ⚙ (R15).** No length-reducing path in engine or length
  model: grep the diff for `slice(`/`splice(`/`length =` on the snake body and for
  reset-style dials. Arms fully once WP-3.01 lands; until then the shed family is
  the known exception and is being deleted, not grandfathered.
- [ ] **Fold parity ⚙.** Any change to growth or length lands in ONE shared
  function called by both `SnakeGameLogic` and `computeLengthTrace`, with the
  parity test written first. A divergence silently invalidates honest runs.
- [ ] No energy grant/consume path reachable from any purchase or perk.
- [ ] No new claim RPC beyond the Daily Take's collect.
- [ ] Victory Lap collection taps only acknowledge already-secured presentation;
      Replay/Setup remain available and one action can complete the ceremony.
- [ ] **Home contract (when touched).** Not touched, or Home remains a
      full-viewport chamber with exactly one head plus two body pieces, Play
      primary, and the five-rune Research relic contextual rather than primary.
- [ ] **One Workbench (when touched).** Not touched, or every player-facing
      Research entrance renders the same free Genome Workbench; `/codex` is only
      a compatibility route and the Research Record remains subordinate.
- [ ] **Genome interaction v2 (when touched).** Not touched, or the post-resolution
      8 ± 2 cadence places a 40-tick relic without an automatic offer; ignore/
      expiry is not DECLINE/PASS/Bond, and foods eaten while live do not advance
      the next interval.
- [ ] **Simple-first Loom (when touched).** Not touched, or the Loom begins neutral
      with equal choices, written Strain identity and one salient consequence;
      focus/hover never consents, and affected route/Splice/locus/ledger detail
      appears only after UNFOLD DETAILS.
- [ ] **Interaction continuity (when touched).** Not touched, or the immutable
      interaction sub-version, opportunity cursor, outstanding relic cell/spawn/
      expiry, pending offer, RNG state, and lease survive checkpoint/reconnect;
      omitted/legacy interaction stamps retain v1 behavior.
- [ ] **No local progress ⚙ (R11).** `npm run verify:constitution` finds no
  progress-related `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, or
  equivalent browser-persistent state, including reward outboxes and notifications.
- [ ] Migrations: numbered per the handoff's serialization protocol; reversible or
  with explicit down-note; every new RPC `SECURITY DEFINER` audited.
- [ ] **A migration's NOTICE says what it actually counted.** Migration 055
  reported "75 invalid settled earning rows examined … 54 unclassified (expected
  0)" and alarmed everyone, because its filter also swept expired and abandoned
  rows that had earned nothing and could never be restored. A tripwire that cries
  wolf teaches the next reader to ignore it. Either narrow the filter to the rows
  the message describes, or describe the rows the filter actually selects.
  *(055 itself is applied and therefore immutable — this is for its successors.)*
- [ ] New player-visible surfaces behind a `NEXT_PUBLIC_*` flag with the rollback
  path tested deliberately (project rule — never let CI infer it).
- [ ] **Engineering doctrine (system-shaped work).** Persistence, settlement,
  session/state lifecycle, validation, sync, caching, or workflow/release
  machinery: the description names the `docs/ENGINEERING_DOCTRINE.md` failure
  modes this change touches and links its prior-art brief, new or updated.
  *"n/a — not system-shaped"* is the answer for product and UI work.

## Decision log

- [ ] Local decisions made in this PR (naming, copy, layout-within-bounds) are
  listed in the description.
- [ ] Nothing in this PR decides against a Rule, a cap, §10.4, or a [H] default —
  those escalate to the owner instead (see `docs/IMPLEMENTATION_HANDOFF.md` §2).
