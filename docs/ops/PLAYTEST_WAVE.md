# The Playtest Wave — Player Truth, Lexicon, Workbench

**Approved by the owner, 26 July 2026.** This is the authoritative scope for
WP-2.05 … WP-2.10b. Implementers: read this alongside
`docs/IMPLEMENTATION_HANDOFF.md` §2–3 (working agreements, branch and migration
protocol) and `docs/PRODUCT_CONSTITUTION.md` (design law). Every PR still runs
`docs/CONSTITUTION_CHECKLIST.md`.

**Status:** FINAL — three exploration reports and three design reviews folded
in; every section grounded in verified file:line evidence from
`constitution/build`. Design reviews corrected six of my own leanings; those
corrections are marked inline and in "Where the plan was corrected" below.

## The wave at a glance

Seven work packages, all shipping before campus-1 seeding (owner ruling 2), in
this execution order:

| # | Package | Why it exists |
|---|---|---|
| **2.10a** | Connect the shipped condition | Weekly/daily conditions are mechanically inert and the Signal UI states a tilt that never reaches the engine. Ships first, alone. |
| **2.05** | Player Truth | Validation silently costs progression **and DNA**; plus a downward player-scalar write and a 404 that deletes a run's payout. Takes an exclusive lock on 4 hot files. |
| **2.06** ∥ **2.07a** | Lab Truth ∥ Lexicon core | 32 of 43 snakes unreachable + an intermittent equip 500; and the game never explains its own vocabulary (impossible on touch). |
| **2.07b** | Lexicon chips | Popovers, after 2.06 restructures the sheet. |
| **2.10b** | Strain-interactive weeks | Makes setup optimization mean something every week. |
| **2.09** | Tuning trio | Molt shed+speed, hold budget, PASS copy. |
| **2.08** | The Workbench | The in-game calculator, consuming 2.07's registry and 2.10b's contract. |

**Read for review:** the Context and Owner rulings below, then §WP-2.05 (the
riskiest), then "Where the plan was corrected by design review" — which lists
thirteen places the design reviews overturned my own leanings.

## Context

The owner's first real playtest (2026-07-26, account Sans_Souci) surfaced six
defects and two missing information systems. All were verified against production
data and source in the diagnostic session:

- 27 sessions carried `validated=false`; ~10 legitimate extractions silently lost
  progression (banked-run ramp) and leaderboard eligibility. Causes split three
  ways: an unwired client-side Ascetic gene suppression (server strips picks the
  client legally offered), an unexplained divergence on `scavenger` snakes
  (777/473 DNA), and 3-DNA rounding drift against `CLAIM_EPSILON = 1`. Owner
  ruling: **"in no way can that score be taken away"** — the server recompute is
  authoritative; validation must never subtract player progress.
- A flat `maxDuration: 600` invalidated long and careful runs (tactical-hold
  play). Owner ruling: **delete the cap; a long run is a good run** — replace
  with a tactical-hold budget (small fixed allowance, +1–2 at length thresholds).
- The Lab can only show/equip **one snake per variant** (`CollectionGrid` Map
  keyed by variant id, last-write-wins): 32 of the owner's 43 snakes are
  unreachable, bred generations invisible ("generation always shows 1").
- Equip intermittently fails ("Could not equip this snake"); suspected
  row-order unique violation in `equip_snake` (migration 037 merged two UPDATEs
  into one under a non-deferrable partial unique index); route never reports to
  Sentry (CLAUDE.md violation), so Sentry silence proves nothing.
- **Trait explanations are unreachable**: `TRAITS[].effect/.cost` text exists but
  renders only as an HTML `title` tooltip in the breeding page — impossible to
  read on touch. The Codex has no trait category and its reference text is gated
  behind 15 banked runs. Owner ruling: tap-to-explain popovers everywhere + the
  Codex becomes an always-readable lexicon (discovery layer stays progressive).
- Molt (FERAL expression) resets length absolutely every 20 foods → unbounded
  runs. Owner ruling: proportional shed **plus a compounding speed increase per
  molt** — the run ends on human reaction limits, not on a timer rule; cost
  stated on the card.
- **Workbench pulled forward AND re-scoped as "the calculator"** (owner
  directive, 2026-07-26): the Survivor.io reference — an external gear
  calculator that every advanced player uses because trial-and-error
  optimization against varying bosses/debuffs is endless — is the role model.
  SupaSnake has the four ingredients natively: varying context (weekly Serpent
  conditions / daily Signal), account-bound inventory (snakes, traits, lineage,
  spawn points), computable interaction (the pure rule modules), stakes
  (Yield→Depth, the clan number). Structural gift: Score is build-independent
  by law, so setup optimization can only touch Yield/Depth — the number where
  build is *supposed* to matter (§6.2). The calculator threatens nothing.
  **Boundary revision (supersedes the earlier "no optimizer" line):**
  inventory-vs-context optimization is IN ("which of my snakes fits this
  week?"; Yield projection via the real fold); global tier lists, in-run
  prompts (Rule 1), and anything purchasable (§10.4) stay OUT.
  **Correction to my own earlier reasoning** (design agent, §0.4): I argued
  "Score is build-independent, therefore an optimizer threatens no competitive
  integrity." That is incomplete — §12.2 caps *public numbers* at two, and clan
  **Depth is the second one and is leaderboard-shaped**, so an optimizer does
  affect a public number. The correct and still-complete defence is **Rule 8 +
  Rules 5/6**: clan Depth is a plain additive `SUM` with no threshold, floor or
  intra-clan mathematics (migration 046:236-239; `settleSerpentWeek` at
  serpent.ts:403-417, both explicit), and every carried number is
  `GREATEST(existing, recomputed)` — so optimizing raises your own number and
  **can never lower anyone else's**. Put this argument in the module headers;
  the weaker Rule-2 version collapses under review.
  **Dependency this creates:** Serpent/Signal condition-sets must expose
  machine-readable strain/trait interactions (buff/debuff lists), or the
  calculator has nothing to compute — weekly conditions that only scale
  difficulty make setup irrelevant. Offer gravity already weights "the week's
  anomaly strain" +100, so weeks are strain-tagged today; the schema must make
  that a first-class contract.

**Handoff target:** Opus 5 Ultra implements, as work packages on the existing
`constitution/build` integration branch under `docs/IMPLEMENTATION_HANDOFF.md`
protocol. A Phase 2 orchestrator is concurrently active — coordination rules
below.

## Owner rulings on this plan (2026-07-26)

1. **Ascetic stays, the leak gets fixed.** "No genes, pure snake" remains a real
   build. INFUSE on an Ascetic snake grants a **Strain Surge** instead of a gene
   offer; equipping shows an explicit "this snake will never see genes" warning.
   The trait becomes a choice rather than a trap because §2.07 finally explains it.
2. **The whole wave ships before campus-1 seeding.** All five WPs (plus the
   condition-schema work) land, are released, and are verified before anyone is
   invited. Consequences, all favourable: the wave is one phase-scoped release
   rather than two; no new player ever meets a known defect; and because
   strain-interactive weeks arrive *before* the first real hunt, there are no
   historical Serpent weeks to migrate and no rules changing under a live
   audience. Cost accepted: a later launch, more unreleased code on the branch
   at once (mitigated by flags + the phase-gate scenario).
3. **Backfill = counters and boards.** Re-stamp eligibility on false-positive
   rows, recompute `players.high_score`, refresh Legacy Records. **No Codex
   re-derivation** (the accepted picks were discarded at settlement, so the
   archive cannot be honestly reconstructed) and no DNA/mastery re-credit
   (both were always paid). Owner's account: ~15 → ~26 banked runs, apex gate
   (20) opens, the 1750 CYBER score returns to the board.
4. **Weeks become strain-interactive.** Serpent weeks and Signal days carry a
   machine-readable strain/trait interaction block, consumed identically by the
   settlement fold and the Workbench. This is what makes the calculator worth
   opening every Monday. Content remains a curated modifier draw (§12.1 slot 2,
   near-zero authoring cost per week). Approved as a gameplay change, not just
   a calculator feature.

## Constitutional constraints binding this wave

- Rule 2 / verify:constitution — score fold reads only food events + ruleset;
  Molt's speed change affects *speed*, never the score formula.
- Rule 1 — no new surfaces intrude on a live run; popovers live outside runs;
  the gene overlay's inline text stays as-is.
- §10.4 — Workbench is planning information: never sold, never gated.
- Rule 8 / §6.2 — eligibility changes must not open cheat paths into Depth:
  physical-impossibility rejections stay hard.
- Rule 14 — Workbench builds get URL + OG image.
- CLAUDE.md — every Supabase error checked and reported to Sentry.

## Coordination with the running Phase 2 orchestrator

- New WPs join `constitution/build` via the standard branch protocol
  (`wp/p-01-*`, `wp/p-02-*`, `wp/p-03-*`), migrations serialized at merge.
- Hot-file discipline: this wave touches `gameValidator.ts`,
  `session/route.ts`, `game/page.tsx` (all hot). WPs touching them must not be
  in flight simultaneously with Phase 2 WPs touching the same files — sequence
  via the build log's in-flight list.
- Release: **one phase-scoped production release containing the entire wave**,
  then campus-1 seeding (owner ruling 2). Nothing in the wave is deferred past
  launch, so there is no "blocker vs follower" split — but ordering still
  matters for dependencies and hot-file contention (see Execution notes).

## Sequencing facts (verified by exploration)

- Phase 2 is the live phase; WP-2.01–2.04 merged (Ascension, World Report,
  contract page, PWA/push). **This wave = WP-2.05 … WP-2.09.** Migration
  high-water mark: 052 → next free 053. Branches are the numbering source of
  truth (the build log's WP table stops at Phase 0 — stale; fix rides along).
- Phase 1 already SHIPPED to production (26 Jul, migrations 046–051) with
  eight `NEXT_PUBLIC_*` flags default OFF; flags are build-time inlined —
  every flip needs a rebuild. `NEXT_PUBLIC_RUN_FLOW_V1` and
  `NEXT_PUBLIC_SHARE_ARTIFACTS_V1` are among the off-by-default set.
- Neither Lexicon nor Workbench exists in `docs/IMPLEMENTATION_HANDOFF.md` —
  net-new scope; the PR template's R12 section needs the justification (use
  finding B-2: /codex is in the public sitemap yet auth-walled — the ungate
  also fixes a live SEO/UX contradiction).

## Work packages

*(final numbering: 2.05 Player Truth · 2.06 Lab Truth · 2.07 Lexicon ·
2.08 Workbench · 2.09 Gameplay tuning trio)*

### WP-2.05 — Player Truth (validation severity, the divergence root causes, backfill) — DESIGNED

**0. THE HEADLINE, found in design review: this is a live DNA-loss path, not
just lost progression.** `validation.adjustedDna` **is the payout**, and it is
computed from `genomeInput.heirloom` / `.tierCap`. So when `getGenomeRunFacts`
swallows a read error → `bankedRuns = 0` → tierCap 1 and heirloom `{}`, the
server **pays the player less DNA** — a transient database blip takes money off
a run. Same shape via `mastery.ts:57-62` (error → 0 XP → narrower pool →
picks dropped → smaller recompute) and the unchecked traits read at
`route.ts:708` (→ `traits = []` → trait multipliers *and* heirloom points both
vanish). **This outranks the severity model in priority.** Two more, equally
serious and both previously unlisted:
- **`route.ts:1121` writes three player-owned scalars DOWNWARD.** On a
  transient read failure `currentPlayer` is null, and :1145-1153 then writes
  `total_games_played: 1`, `total_dna_earned: finalDna`,
  `high_score: max(0, thisRunScore)`. A Rule 6 violation the CI gate cannot
  see, because no payload field is literally decremented.
- **`route.ts:660` destroys the run permanently.** Unchecked read → `!session`
  → **404**, and `rewardOutbox.ts:206` retries 5xx but **drops 4xx** — so a
  transient blip deletes the outbox entry and the DNA is gone forever. This
  single fact fixes the direction of every error-handling change: **503, never
  404.**

**1. Severity reclassification — the root fix, no schema change.**
`validated` today collapses every error class into one boolean
(`gameValidator.ts:520,967`; stamped at `session/route.ts:954`). The
`eligible`-column alternative is far worse than I estimated: not 6 SQL
consumers but **53 `gs.validated IS TRUE` predicates across 12 migration
files**, most inside live `SECURITY DEFINER` RPCs that would each need
re-declaring in one forward-only migration against daily-only backups — and a
half-migrated state is worse than either end state. Reclassify at the stamping
site, and restate the semantics in a `COMMENT ON COLUMN` where the next author
writing that predicate will find it.

**The classification principle** (write it down — it is what makes the table
auditable): the server can recompute every economic quantity from the run's
inputs; the only two it cannot recompute, only *bound*, are `duration_seconds`
and `food_count`. Therefore **FATAL ⇔ after repair, the server still cannot
bound the run's physics within the session it observed.** Everything else is
repaired, paid, counted, and alerted. Plus one deliberately narrow second axis
— **forgery**: a claim no engine could emit. Exactly one code qualifies.

**The FATAL set is exactly two codes:** `INVALID_DURATION` (the
client-vs-serverElapsed bound — load-bearing because the food-rate bound is
*derived* from duration) and `SPLICE_CLAIMED_DIRECTLY` (splices are derived by
`fusePicks`, never claimed). **All ~20 others become advisory**, including
`DNA_MISMATCH`/`SCORE_MISMATCH` (the divergence signal itself),
`TRAIT_CONFLICT`, every clamp, and `OFFER_SEED_MISMATCH` — whose own source
comment already calls it advisory while the code sets `valid = false`.

**Fail-safe defaults, deliberately asymmetric:** at runtime an unrecognised
code is **advisory** (a future author who forgets the table must never cost a
player); in the backfill an unrecognised code **skips the row** (a code whose
semantics nobody has read must never put a row on a public board). A source-scan
test forces every pushed code to have a table entry, so the runtime default is
a safety net, not a loophole.

Implementation: one exported table in `gameValidator.ts` (**not** a per-push
severity argument — that means touching all 45 push sites in a money-adjacent
file and creates a second source of truth the SQL backfill cannot read);
`ValidationResult` gains `fatalErrors`/`advisoryErrors` with `errors` untouched
so every consumer and the stored blob stay wire-identical; and an exported
`appendAdvisory()` that **throws on a fatal code**, replacing the route's
hand-set `validation.valid = false` (pinned by a source scan). `CLAIM_EPSILON`
stops being an eligibility threshold and becomes the advisory-alert threshold
only, made relative. The `console.warn` becomes a **fingerprinted** Sentry
alert (`['run-validation', dynasty, ...codes]`) carrying claimed-vs-recomputed,
traits, tierCap, heirloom and picks — so 500 mismatches group into one issue
with the data to reproduce them, which is the forensic job the boolean was
wrongly doing.

**2. Settle under the rules the run STARTED under — migration 053.**
Persist a server-derived `run_context JSONB` at start (snake id/generation/
traits, mutation pool, and on a genome run the gene pool, heirloom, lineage
bias, tierCap, splice/crown gates, suppressed strains, anomaly strain);
settlement reads it instead of re-deriving. Never client-supplied, strictly
parsed (malformed → re-derive path + an `error`-level alert, since a NULL is
expected but a malformed blob is a bug). Start uses the **existing pre-migration
retry ladder** (the `run_seed` pattern at route :430-450) so the app deploys
before the migration, as the runbook requires. Three free wins fall out: 4–6
fewer round trips per settlement; `verifyOfferTrace` finally replays against
the context the engine actually received (retiring a class of
`OFFER_SEED_MISMATCH`); and re-equipping mid-run can no longer change how a
run settles.

**Every unchecked read becomes 503, never 404** — direction fixed by the
outbox's retry-5xx/drop-4xx rule. Priority order: `route:1121` (the downward
Rule-6 write), `route:660` (the 404 that deletes the run), `genome.ts:150-184`
(return `{ok:false}` so the failure cannot be ignored), `mastery.ts:57-62`
(a strict variant for settlement). The 503 path also writes
`end_reason='completed'` with `ended_at` NULL — the marker WP-0.06 already
uses — to buy the row the **8-day** pending-settlement window instead of the
3-hour open one. (Consequence: migration 054 must NOT copy 045's assertion
that those two are never out of step.)

**(A) Clamps explain themselves:** `clampGenomeClaims` returns the individual
clamps it applied; each emits `CLAIM_CLAMPED: <field> claimed N, cap M`. New
testable invariant: **`claimed − recomputed` is fully accounted for by the
reported clamp deltas**, so no `DNA_MISMATCH` is ever unexplained again.

**(C–G) Fold parity — the root cause is architectural.** The engine already
calls the same shared functions; every divergence is in the *arguments*. Fix:
give the engine a **live `LengthTrace`** (snapshot length before the move,
record shed events as they fire) and feed the shared functions from it, then
import the already-exported `tithePerFoodFloor` (zero call sites today). Order
of operations in the eat block moves to growth → shed → price, which requires
splitting `applyShedCycles` into a pure half (moves) and a visible half (emits
stay put). **The single highest-risk line in the wave: deleting the
out-of-fold Regenesis payment** — leaving it double-pays, removing it before
the fold fix under-pays; land those two changes in one commit.
**Correction: (F) Thick Hide is NOT a divergence** — both sides compute
`max(initialLength, len − 5)`. Normalize the reported value anyway (one line),
but spend no risk budget on it.
R2 constraint that shapes this: any extracted shared helper must return **DNA
only** — both score folds stay literally where they are, or the CI gate fails.

**(7.6) `VOLT_RATE_ALLOWANCE_FACTOR` is a payout bug, not just a flag:** at 1.5
it clamps honest VOLT foods away on PRIMAL (`maxFoodPerSecond: 1.0`). Derive it:
`1 + STRAIN_PHYSICS.arcMaxPerEat` = 3. And defer the `INVALID_FOOD_RATE` push
into the branch that knows the final bound, so the error cannot outlive its own
retraction.

**3. Ascetic — design review rejected BOTH options I put to the owner.**
The ruling's intent (keep the trait, fix the leak, no trap) is preserved, but
the mechanism changes, and the owner should know why:
- **Why the Strain Surge (the option as I described it) fails:** `strainTier`
  gates Expression behind 2 *in-run genes* and Apex behind 3. An Ascetic snake
  has zero, forever — so a surge is **permanently capped at tier 1**, and
  getting even that far needs two new validator branches, a new engine branch
  and a new surge-strain source, in the file this WP exists to de-risk.
- **What ships instead — narrow the validator, don't add a mechanic.** The
  trait's stated cost is *"mutation foods never spawn"*, and the spawner is
  correctly gated; **a portal is not food**. So the engine is arguably right and
  the validator was wrong to strip *all* picks. New clause: picks that ride an
  accepted infuse's food index are **honest and paid**; only picks with no
  infuse to explain them are dropped (advisory). Zero new mechanics, zero
  subtraction from any player, and `TRAIT_CONFLICT` becomes near-unreachable
  from an honest client. Wire the dead `genePoolBlockedByTraits` into the
  spawner as the single Ascetic authority.
- **Flagged for the owner at PR time, not decided silently:** this makes the
  trait's *text* ("no builds, pure snake") narrower than its *behaviour*
  (builds via portals only, ≤3 genes). Either the copy changes or the trait
  does — a design question for a design WP, deliberately not settled inside a
  settlement-hardening package.

**4. Duration — keep the bound FATAL *and* clamp what is stored.** Delete
`maxDuration` and its sole consumer. But making the serverElapsed bound
advisory would open a real exploit: Signal's `endure` objective reads
`duration_seconds` straight off the row, so a crafted `999999` would complete
it. So: bound stays FATAL, **and** the row stores
`min(claim, serverElapsedSeconds)` — clamped to serverElapsed, not
serverElapsed+10, because the +10 is a skew tolerance for *rejection*, not a
licence to store time that did not pass. Clamp the `validateRunEvents` input
to the same number.

**5. Consistency:** unify eligibility null-semantics (`=== true` everywhere;
Serpent accepts null today, leaderboard doesn't); fix `offerVerifier`'s missing
`suppressedStrains` arg (latent).

**6. Backfill — migration 054, separate file** (so a 054 abort leaves an
applied, harmless 053). Owner ruling 3, with one scope correction from review.
- Re-stamp `validated = TRUE` on settled, non-practice rows whose recorded
  codes are **all** advisory. `validation_errors` is **JSONB, not text**, so
  the parse is `jsonb_array_elements_text` + `split_part(value, ':', 1)` —
  exact, and far safer than a text scan.
- Recompute `players.high_score` through `GREATEST` (can only rise), and call
  `refresh_player_records` (itself `GREATEST` throughout).
- **Codex discoveries ARE re-derived after all** — a correction to my earlier
  "cannot be honestly reconstructed". The genome blob is stored on the row and
  `record_codex_discoveries` is idempotent by construction
  (`ON CONFLICT DO NOTHING`, reward only on insert); iterate `ORDER BY ended_at
  ASC` so world-first attribution stays chronological. This stays inside owner
  ruling 3's spirit (restore what the flag wrongly withheld) rather than
  inventing history.
- **Not re-credited, each with its reason:** DNA / `total_dna_earned` /
  `yield_dna` (never gated — already paid in full), mastery XP (gated on
  `extracted`, not `validated`), `total_games_played` (never gated), the Daily
  Take (never reads sessions).
- **The complete historical code universe is knowable:** all 9 revisions of the
  validator were walked; only `INVALID_DNA` and `INVALID_SCORE` ever existed
  and no longer do, and both were advisory by construction. So the allowlist is
  **complete** and the unknown-code branch is a pure tripwire that should find
  zero rows — reported as a `NOTICE`, never an abort, with those rows left
  alone.
- **Safety:** one transaction; pre-snapshots of sessions/players/records/codex;
  assertions before `COMMIT` covering *no run lost validation*, *no settled
  value rewritten* (dna/yield/score/duration/lifecycle byte-identical), *every
  re-stamped row was advisory-only*, *no fatal-coded row re-stamped*,
  *completeness*, and **Rule 6 on every player-owned scalar and every Record**.
  Any failure rolls the whole thing back. Idempotent by construction.
- **Serpent/Signal disclosure:** weeks inside the 8-day resettle window recover
  by invoking the two ops settlement routes once after the migration; **older
  weeks cannot be recomputed in SQL** (the recompute lives in TypeScript). The
  migration `RAISE NOTICE`s exactly which weeks those are, for the release log
  — disclosed, never silently skipped.
- Owner's account: ~15 → ~26 banked runs, apex gate opens, the 1750 returns.

### WP-2.06 — Lab Truth (N snakes per variant + the equip stack) — DESIGNED

**New pure module `src/lib/collection/roster.ts`** (+ colocated test; matches
the `src/lib/breeding/*` convention — presentation rule, not game math):
`compareOwnedSnakes` / `rosterForVariant` / `rostersByVariant` returning
`{variantId, snakes[], representative, count}`. **Order: equipped → favorited →
generation desc → acquiredAt desc → id.** Design-agent correction: `favorited`
belongs in the rule because the codebase already ships that precedent — the
identity-avatar rule is favorited → equipped → newest (migration
`022_identity_core.sql:728-738`, pinned by `player/identity/migration.test.ts:207`);
the id tiebreak makes the order total so React keys and tests are stable.
Equipped id is *passed in*, not read from `isEquipped`, because the optimistic
path rewrites that flag on every row before the server answers.

**Grid:** replace the overwriting Map (`CollectionGrid.tsx:135-143`) with
`rostersByVariant`; `onSelectVariant` hands over the **whole roster**, not one
snake. Card gains `×N` chip **and the count in its accessible name** (a badge
alone still hides it from screen readers). Drop `role="grid"` (invalid without
row/gridcell children) → `ul`/`li` list semantics.
*Rejected alternatives, recorded:* a flat one-card-per-snake list breaks the
sticker-book metaphor and three shipped surfaces (EmptySlot, CollectionProgress,
DynastyTabs) — 43 cards against 11 slots makes completion illegible; an
expandable in-card row is clipped by `VariantCard`'s own `overflow-hidden`
(:123) and nests buttons.

**Detail sheet gains the roster selector** (`role="radiogroup"`, `flex-wrap`
**not** a horizontal scroller — this modal shipped a scroll bug three commits
ago, `89b1c87`), placed under the art, above Lore. `owned` keeps its meaning as
*the selected snake*, so Generation/Traits/Lineage/startingPoints all become
correct for free. Single-snake variants render no selector.

**Equip stack:**
- New migration **053** (037 is pinned by string-regex tests — never edit it):
  `CREATE OR REPLACE FUNCTION equip_snake` with **two ordered statements**
  (release `is_equipped=false` excluding the target, then claim), advisory lock
  and grants unchanged, no touch to the unique index. Header must state *why
  one statement cannot work*: a **partial** unique index cannot be redeclared
  as a `DEFERRABLE` constraint (Postgres constraints carry no `WHERE`), so
  ordering the writes is the **only** available fix — stronger than "tidier".
  `unlock_and_equip_variant` inherits the fix via its `PERFORM`.
- **The route fix works TODAY, without the migration** (repo convention: new
  migrations ship written-but-not-applied): a **single retry** on `23505` under
  the advisory lock sees a settled state and cannot race again. That turns the
  owner's intermittent hard failure into an invisible one before 053 is ever
  applied. Error taxonomy: ownership/`P0001` → 404 no Sentry; `23505` → retry,
  then 409 + Sentry warning; other → 500 + Sentry; **re-read failure → 200**
  (the equip already committed; today's 500 makes the client roll back a
  *committed* change and leaves the UI permanently wrong).
- Widen the re-read join to `snake_variants(*, dynasties(name))` — the narrow
  join degrades `traitSlots` and nulls `lineage`.
- **`EquipResponse` (`snake-data-model.ts:204`) must declare `equippedSnake`** —
  it doesn't today, so the client *couldn't* apply the row even if it tried.
  Then apply it, and route equip failures to a new `equipError` channel rather
  than `setError` (whose banner offers a full-collection "Retry", the wrong
  affordance).

**Rides along:** `completionByDynasty` counts **distinct variants** + carries a
snake count (fixes 43/11 = 391% at source; `DynastyTabs` becomes correct with
no edit) and `CollectionProgress` clamps; `useDialogFocusTrap` on the sheet —
**not** a `ModalDialog` migration (correction: 13 files hand-roll
`role="dialog"`; ModalDialog is the newer primitive, not the universal one, and
migrating a bottom-anchored sheet to its top-anchored layout is a visual change,
not a fix); **favorite persistence promoted from defer** (new
`api/collection/favorite` route, no migration — the representative rule uses
`favorited`, and a dead heart in the sheet this WP rebuilds is indefensible;
if cut, remove the control); equip stops closing the sheet (you want to see
"Equipped" flip and compare siblings); unused `getPlayerId` import.

**Test coverage note:** `CollectionGrid` has **no test file at all** today —
the new one (43 snakes → exactly 11 cards; representative's generation, not the
oldest; roster contains every sibling) is the file that would have caught this.

### WP-2.07 — The Lexicon (popover primitive, chips, Run Setup, Codex-as-reference)

**Registry `src/shared/game/lexicon.ts`** — `describe(kind, id) → LexiconEntry |
null` over `trait | gene | splice | strain | strainTier | anomaly | dynasty |
mechanic`, plus `lexiconSection(kind)` for the Codex; entry carries
`{name, effect, cost, taxonomy?, strains?, color?, runNotice?}`.
**One-home rule, stated exactly:** a *number* lives only in its tuning module;
a *sentence* lives only on the def that owns it, else lexicon.ts — and
lexicon.ts **never retypes a number, it interpolates** (`` `Reach
${STRAIN_THRESHOLDS.minor} points…` ``, never a literal 2), with a test
asserting the copy contains `String(dial)` so retuning reveals which sentence
lied. Reads **`GENES`, never `MUTATIONS`** (12 of 34 genes are absent there —
corrected from 15 during WP-2.07a, which counted `NEW_GENES` as 9 base plus 3
signature; the reasoning is unaffected, since reading MUTATIONS would still drop
a dozen genes and every strain tag). Absorbs `StrainMeterHUD`'s private tier-name
copy, promoting its invented `'Dormant'` into a documented tier-0 label.

**Popover `src/components/ui/InfoPopover.tsx`** — AccountChip's dismissal
pattern (outside mousedown **and touchstart**, Escape restoring focus, second
tap), with three deliberate divergences:
- **`createPortal` + `position: fixed` + `z-[110]` is mandatory, not
  stylistic** — `VariantCard` and `VariantDetailModal` are both
  `overflow-hidden`, so an absolute panel is clipped in both; `z-[110]` clears
  `ModalDialog`'s `z-[100]`.
- **An always-rendered `sr-only` description on the trigger** carrying
  name/effect/cost: screen-reader users get the text *without* tapping, touch
  users get the panel *on* tap. One control, two correct channels.
- **Panel is text-only, no focusable descendants** (the portal places it at the
  DOM end, so interactive content would break tab order; text-only also keeps
  it correctly non-modal). **No ModalDialog escalation at any viewport**
  (correction to my leaning): the portal already removed the clipping motive,
  the content is three lines, and two behaviours split by viewport doubles the
  a11y surface and rots. `max-w-[min(20rem,calc(100vw-2rem))]` covers narrow.
- Chips gain `interactive?: boolean`, **default false** — preserving today's
  markup at the two nested-`<button>` sites; `StrainChip` additionally gains an
  unconditional `aria-label` (it has none today).
- **Deliberately not everywhere:** `MutationHUD`/`StrainMeterHUD` keep
  `title`-only — mid-run, one-handed, at speed, a popover that swallows the
  next steering input is worse than none, and their text is now in the Codex.
  The **breeding draft board gets inline effect/cost instead** — it is a moment
  of choice, and this codebase's grammar for that is inline text
  (`GeneChoiceOverlay.tsx:157-158`), not a tooltip.

**Run Setup — new `src/components/game/HeirloomSummary.tsx`** (a component, not
inline JSX: `game/page.tsx` is a declared hot file, so this keeps its diff to
~6 lines and makes the block unit-testable).
- **The precise justification** (correction): `spawnPointsUnlocked` is *not*
  merely a display gate — below 12 banks `genome.ts:129-131` really returns
  `heirloom: {}`, so strain pips genuinely do nothing. But **traits are always
  live** (`session/route.ts:291` reads them unconditionally into settlement).
  Today's code gates both on one flag, conflating two different facts. So:
  ungate the traits, keep the pips gated.
- Always visible, outside the collapsed `<details>`, in **both**
  `NEXT_PUBLIC_RUN_FLOW_V1` branches. Renders `TraitChipRow interactive`, the
  `runNotice` line (warning when a system is *removed* — Ascetic's "no mutation
  foods this run"; notice when *dampened* — Patient), and for a traitless snake
  an empty slot reading "breed to fill this slot" (potential, not silence).
  **No `btn-go`** — `RunSetupPanel.test.tsx:46` pins exactly one.

**Codex-as-reference (verified cheap):** the server ALREADY sends real
`effect`/`cost` for every entry regardless of discovery
(`api/codex/utils.ts:205-206,226-227`); the hiding is purely client
presentation (`codex/page.tsx:143-194` masks names/effects) plus one server
early-return (`api/codex/route.ts:68-75`, the 15-bank gate). Changes:
- Relax the route: always return the catalog; `unlocked`/`bankedRuns` become a
  *label* input for the discovery layer, never a catalog gate.
- **The auth wall narrows rather than disappears** (design-agent refinement):
  documented sections (traits, dynasties, strains + 15 tiers, anomalies,
  mechanics) come from `lexiconSection()` — pure static rules, no API, no
  player state — so they render for **signed-out visitors**, which is precisely
  what resolves the live contradiction (`/codex` sits in the public sitemap and
  the public footer while being auth-walled *and* 15-bank-gated). Discovery
  sections keep an inline "sign in to see which of these you have found". That
  contradiction is the R12 justification the PR template demands.
- **Two pinned tests must be rewritten, not deleted** — `codex/page.test.tsx:57`
  *and* `codex/route.test.ts:128` (which asserts the sub-15-bank response
  `toEqual({live, unlocked, bankedRuns, unlockAt})` exactly). Deleting either
  removes the only guard on the discovery gate we are keeping.
- **Server-side tightening:** null `parents` for undiscovered splices
  (`utils.ts:222`). Today the JSON ships the recipe and the page masks it
  client-side — exactly the lie the route's own comment warns against. The
  splice recipe is the *only* content that stays hidden; rules never are.
- **New categories go in a separate `LexiconCategory`, NOT in
  `CodexDiscoveryType`** (correction): that union is persisted in
  `player_codex.discovery_type` and RPC-validated, so growing it needs a
  migration and would falsely assert that traits are *discoverable*.
- Codex nav link stops hiding behind `codexUnlocked` (`LabHeader.tsx:18-19`) —
  a lexicon anyone can read has no reason to be invisible.
- Fix while in file: the per-gene stats query omits `is_free_play=false`
  (`route.ts:83-92`) while the unlock count includes it, and Free Play grants
  the entire pool including unearned mastery/signature genes — so practice runs
  inflate "N picks · M banked" on every card.

**Copy to author** (the only real writing in this WP; every number
interpolated): 15 strain-tier effect/cost pairs (numbers exist today only in
`STRAIN_ECONOMICS`/`STRAIN_PHYSICS` JSDoc); **5 anomaly costs — added to
`AnomalyDef` itself, not the lexicon**, since every sibling def carries both
halves (`gold_rush` splits into "All food ×1.5 DNA" / "portals spawn 6 foods
later"; two pure-physical anomalies get `cost: ''` and join a documented
costless list); infuse; the three thresholds; the trait-slot cap; lineage
strength (honestly including that its spawn effect needs 12 banks);
Ascendance; **the extraction verbs BANK/PASS/INFUSE** — the most load-bearing
vocabulary in the game, documented nowhere; and **charges** (6/day, UTC refill,
25% lean) — both added on the design agent's recommendation as the same defect
class as Ascetic.

### WP-2.08 — The Workbench (calculator; implementation verified feasible)

**Product frame** (owner-confirmed): the in-game equivalent of Survivor.io's
community gear calculator, aimed at the weekly hunt — with two advantages no
external calculator has. It reads the player's **real inventory** (no manual
data entry, the thing that makes external calcs miserable), and it can be
**placed in the ritual**: linked from the Monday Serpent briefing, so the weekly
loop becomes *read the briefing → plan the hunt → hunt*. Surfaces: a context
selector (this week's Serpent · today's Signal · neutral), a loadout built from
one of your own snakes, the computed panels below, and an **inventory ranking
for the selected context** — "which of my 43 snakes fits this week", the
question the tool exists to answer.

Module-layer prerequisites (small, in `shared/game`):
- **Export `geneWeightBreakdown`, not just `geneWeight`** — and implement the
  scalar in terms of the breakdown. The design agent's most important
  structural call: returning `{base, strainRaw, strain, strainCapped,
  spliceCompletion, spliceWith, lineage, condition, total}` and defining
  `geneWeight = breakdown().total` makes divergence between the calculator's
  explanation and the engine's draw **impossible** rather than merely tested.
- **Generalize the condition channel:** keep `OfferContext.anomalyStrain`
  (engine :1644, validator, route all set it) and ADD
  `strainWeights?: Partial<Record<StrainId, number>>`, resolved in one private
  helper. Smaller, safer diff than removing the old field.
- **Extract to a new `src/shared/game/genePool.ts`** (verbatim, from
  `src/lib/server/genome.ts`): `composeGenePool` (:82-104), `deriveFtue` (:51),
  `ftueTierCap` (:70), `GenomeFtue` (:42), `deriveHeirloom` (:124). All pure;
  every dependency is already under `@/shared`; no cycle. `lib/server/genome.ts`
  **re-exports all five so no call site changes**, retaining only the async
  `getGenomeRunFacts` and `lineageFromRows`. (Note for the record: the
  `SupabaseClient` import is `import type` and erased at compile time — this is
  layer hygiene and shared ownership, not a bundle fix.)
- **Wire the dead `genePoolBlockedByTraits`** (genome.ts:914, zero call sites)
  into the pool composition, so the engine and the Workbench agree on Ascetic.
  Without it the Workbench cannot answer "impossible combos" honestly. Pairs
  with WP-2.05's INFUSE fix (owner ruling 1) — that predicate becomes the
  single Ascetic authority.
- **All computation in one pure module `src/shared/game/workbench.ts`** (zero
  React, zero fetch) — this is what the parity suite targets. Compute with:
  `strainActivations` (genome.ts:181 — the tier resolver honoring
  tierCap/suppressions; NOT bare `strainTier`), `fusePicks`/`fusedSlotCount`/
  `spliceForPair` (splices.ts:135,167,197), `startingStrainPoints` →
  `capSpawnPoints`, `composeGenePool` + `genePoolBlockedByTraits`,
  `deriveFtue`+`ftueTierCap`, `geneWeightBreakdown`, and **both**
  `computeGenomeRunTotals` **and** `applyGenomeOutcome`.
- **A loadout is an ORDERED PLAN WITH A CADENCE, not a set of genes** — the
  single most consequential correction, and it determines every data shape:
  `strainActivations` walks `atFood`-ordered events, so the Workbench derives
  pick indices from `PLAN_FOOD_STEP = GENOME_SPAWN.intervalBase` (20) and
  states that assumption on screen. Never a free-text food field.
- **Yield projection, stated honestly** (two traps): Yield is
  `applyGenomeOutcome(rawDna, …)`, **not** `rawDna` — show rawDna, banked,
  salvaged and both multipliers; and because bounded-trust claims (Gilded Wake
  cells, Molt foods, Ouroboros bites, Second Sun) are *claimed* not derived, a
  projection excludes them and is therefore a **deterministic floor**, labelled
  as such. Project at **three labelled bases** from the player's own history
  (median / best / the plan's own floor) with the sample size shown — a single
  average hides variance and makes the tool feel wrong the first undershoot.
- **Offer likelihood — only what is honestly computable:** show slot-1 share
  **labelled "before overrides"**; name the lineage-guarantee and pity
  overrides *conditionally* (the Workbench is pre-run and cannot know
  `recentOffers`, so pity must read "if your last two offers hold no FERAL…",
  never an assertion); and **quote no slot-2 number at all** — its 25% wildcard
  branch makes any figure wrong, and a wrong probability in a calculator is
  worse than none. State that refusal in the module header so nobody
  "improves" it later.
- **Never project Score — enforced mechanically, not by promise:**
  `WorkbenchReading` has **no `score` field** (destructure
  `computeGenomeRunTotals` and drop it), and `workbench.ts` imports neither
  `FOOD_BASE_SCORE` nor references `scoreMultiplier`. A test asserts both,
  including a source grep. Keep Workbench code out of
  `rulesets.ts`/`SnakeGameLogic.ts` (the CI gate's token blocklist).
- **Rule 1 enforced by import graph:** nothing under
  `src/components/workbench/` may be imported by `src/app/game/page.tsx` —
  asserted in a test.
- **Reachability hints** where the tool earns its keep: annotate
  dynasty/mastery/season-locked genes and name the unlock for the 3 unformable
  splices (comet_tail CYBER-M6, black_magnet COSMIC-M6, old_growth PRIMAL-M3 +
  Season 1).
- **Placement:** a second tab on the existing Codex page (`?view=workbench` —
  shareable, back-button honest, no new route, no new nav entry, zero taps
  added before a run). Inherit the Codex's existing banked-run gate; add **no
  new gate** (§10.4 forbids *selling* planning information, not gating it, and
  a brand-new player's FTUE tierCap would show tiers they cannot reach).
- **Share:** `src/lib/share/buildCode.ts` modeled on `lineageCode.ts` —
  7 `~`-separated percent-encoded fields (name, dynasty, gen, genes in pick
  ORDER, anomaly, clause, infuses), bounded, **refuses to repair** (unknown
  clause id / wrong field count / gene not in GENES → `null` → 404, never a
  card of guesses). No DB, no auth, no migration: the "a recipe is not
  evidence" forgeability argument transfers from lineageCode.ts:12-15. **The
  card must carry NO projected Yield** — on a forgeable code a Yield number is
  a leaderboard-shaped claim; carry strain tiers and the context instead.
  New `/b/<code>` route trio following `/x/` line-for-line (page force-dynamic
  + flag + notFound; opengraph-image **not** flag-gated and never throws).
  Path-segment, not query — Next's `opengraph-image` convention never receives
  `searchParams`, which is why `/og/challenge` exists.
  **Owner decision to record:** `/b/` is a *seventh* artifact class where
  Rule 14 enumerates six. Recommendation: mint it — the §12.2 caps table has no
  artifact-class row (Rule 14's list is a floor, the caps table is the test),
  and the query alternative is structurally blocked. The tidier-looking
  alternative (extend the lineage code) is worse: it makes
  `decodeLineageCode`'s field-count check variable and puts a shipped, tested
  decoder at risk.
- **Tests:** parity suite over `(snake, plan, condition)` asserting the
  Workbench equals `strainActivations` / `computeGenomeRunTotals` /
  `applyGenomeOutcome` / `geneWeight` directly, with the four cases where a
  hand-rolled tier calculator diverges (4 points but only 2 in-run genes;
  `tierCap: 1`; a suppressed strain; a 3-point pre-cap heirloom); the
  no-Score constitutional test; the OG render/raster split
  (`artifactImages.test.tsx` mock + e2e bytes); and buildCode's refusal table.
- Flag: **new** `NEXT_PUBLIC_WORKBENCH_V1`, default off. Do **not** reuse
  `SHARE_ARTIFACTS_V1_ENABLED` — it will already be ON, which would ship the
  Workbench share the moment the Workbench merges.
- Context selector consumes the week's interaction block — see the
  condition-schema contract below (implementer verifies the shipped
  `serpent_weeks.modifiers` shape first; extend it if it lacks a
  machine-readable strain/trait interaction block).

### The skip meta — PASS **already ships**; the work is copy + one missing test

Design-agent correction: PASS is implemented end-to-end and my budget for it was
~10× too large. Verified: `declineMutation()` at `SnakeGameLogic.ts:1609-1617`
resolves the trace with `picked: null` (:1623-1629); the button exists at
`GeneChoiceOverlay.tsx:170-179` (`data-testid="gene-decline"`, "Take neither
(Esc)") with an Escape handler; `recentOffers.push` happens at **roll** time
(:1653) so **the pity window already counts offers, not picks — a pass already
feeds pity**; server side `offerVerifier.ts:65-70,80,121-122` agrees, pushing
recentOffers before the picked-branch; and `gameValidator.ts:633-639`'s
`maxPicks` is an UPPER bound so a pass cannot trip it. **Nothing in the engine,
validator or trace needs changing.**

Remaining work (WP-2.09):
- **Affordance + copy only:** promote the de-emphasized underline to a third
  full-width card in the effect/cost grammar, keeping `data-testid` and Escape
  (e2e depends on both). Consequence line must be **computed from state**, not
  a constant: when the pity window will force slot 1 (derived from
  `OFFER_GRAVITY.pityOfferWindow` + `topStrain`), say which strain; otherwise
  "keeps your six slots for the combo you want."
- **The missing parity test** (nobody has ever tested this): fixed seed, pass
  two offers, assert the trace is all-null, that the third offer's slot 1 is
  the top-strain gene (pity fired **from passes alone**), and that
  `verifyOfferTrace` returns ok.
- **Binding constraint for the implementer:** do NOT add a `passed: true` field.
  `picked === null` is the shipped contract that `sanitizeOfferTrace` and the
  e2e depend on.
- Ride-along defect (low severity): `SnakeGameLogic.ts:1650` uses
  `picked: undefined` as an "unresolved" sentinel, which `offerVerifier.ts:65`
  maps to `null` — so dying mid-decision is recorded as a pass. Harmless for
  pity replay (both sides agree) but any future pass counter would be wrong.
  Widen the type honestly or add a `resolved` flag.

### WP-2.10a — **Connect the shipped condition** (P0; ships FIRST, alone)

Design-agent finding, and the most important discovery of this planning pass:
**the weekly/daily condition-sets are not "merely scaling difficulty" — they are
mechanically inert, and one of them renders a false claim to players today.**

- `session/route.ts:199-206` makes `isAnomalyRun` and `isSerpentRun` disjoint
  modes. A Serpent run stamps `serpent_week_id` and **never** `anomaly_id`
  (:419-425), so the end path reads `sessionAnomaly` from `session.anomaly_id`
  (:761-763) as null and calls `computeGenomeRunTotals(..., anomaly = null)`
  (:875). `serpent_weeks.modifiers` (migration 046:171) is written, parsed
  (`serpent.ts:117-124`) and rendered (`:578`) — and **consumed by nothing.**
- Worse: `signal.ts:186` stores `strain_tilt` and `SignalSurface.tsx:279`
  renders **"Gene pool tilts {strainTilt} today."** The tilt never reaches the
  engine, because `genomeBlock.anomalyStrain` is only set when
  `mode === 'anomaly'` (:390). **The shipped UI is lying to players.** That
  makes this a launch blocker on its own terms, independent of the Workbench.
- Fix: resolve the condition server-side from the session row (Serpent week's
  modifiers, or the claimed Signal day) at start, set the offer-weight channel,
  and re-derive the *same* condition at end for the recompute — mirroring how
  `anomaly_id` is already handled.
- **Ships as its own small PR, first**, because it changes live payouts and
  offer distributions and must be observable in isolation. No new
  `NEXT_PUBLIC_*` flag: a build-time-inlined flag on payout math could
  desynchronize engine and validator; it rides the existing
  `serpent_week_id`/signal-attempt stamps, which are already server authority.
- Land at a **week boundary** and record a GT-delta note: Depth is
  `GREATEST`-clamped so nothing shrinks (Rules 5/6 hold), but week-to-week
  Depth comparability changes. Ruling 2 helps — no real audience yet.
- Test that would have caught it: a Serpent run and a Signal run each resolve a
  non-null condition at start, and the end path recomputes with the same one.
- Note but do not fix here: legacy `mode: 'anomaly'` is a fifth game mode
  against a cap of four; removing it has leaderboard consequences and is its
  own deletion.

### WP-2.10b — Strain-interactive weeks (the clause schema) — APPROVED

Owner ruling 4: approved as a **gameplay** change, not merely a calculator
feature. The calculator is only as deep as the weekly conditions are
interactive; conditions that only scale difficulty make setup irrelevant.

New pure module `src/shared/game/worldCondition.ts` — **copy the shipped
namespaced-clause vocabulary from `gauntlet.ts:25-58,487-502`** (`GauntletBan`
= `'gene:${id}' | 'strain:${id}'` with a total parser, a namer, and two pure
consumers) rather than inventing a shape.

- `ConditionClauseId` — a flat curated union (`aurum_ascendant`,
  `volt_dampened`, `gilded_wake_doubled`, `shallow_expression`, `deep_apex`, …
  ~14), each with `{name, effect, polarity: 'benefit'|'cost', interaction}`.
- `WorldCondition = { anomaly, clauses[], interaction }` — the ONE object the
  fold and the Workbench read. Total parser `resolveWorldCondition(stored)`
  never throws and ignores unknown ids; `conditionFromAnomaly` adapts existing
  call sites; `NEUTRAL_CONDITION` for practice.
- **Wave-1 interaction fields ship only where a seam already exists:**
  `strainOfferWeight` (generalizes `ANOMALY_STRAIN_WEIGHT` at
  offerGravity.ts:135-140), `suppressedStrains` (**zero** new plumbing —
  `strainActivations` already takes it), `strainThresholdDelta` (via
  `strainTier`), `expressionFlatScale`, `spliceScale`, `bankDelta`.
  **Deliberately deferred, stated as prose not a marker word** (the CI gate
  matches TODO/FIXME/XXX/HACK inside comments): general per-strain scaling of
  *composed* per-food effects — `genomeFoodValueModifier` folds everything into
  one multiplicative `mod` with no per-strain attribution, and adding that is a
  refactor of the payout authority, not a UI ride-along.
  `strainThresholdDelta` delivers most of the build-relevance far more cheaply,
  because it changes *which of your snakes can reach an Apex* — exactly the
  question the Workbench exists to answer.
- **Draw:** same seeded partial Fisher–Yates as `serpentModifiersForWeek`
  (serpent.ts:180-191), 1 clause/week and 1/day, with **mandatory domain
  separation** (`'clause:week:'` / `'clause:day:'`) — on a Monday the Signal day
  key and Serpent week key are the SAME string (signal.ts:115-124), so a bare
  hash would make every Monday's clause equal that week's. That exact class of
  bug shipped once, which is why `signal.calendar.test.ts` exists.
- **Content cost stays ~zero:** a week is `(anomaly, clause)` = 5 × 14 = 70
  distinct condition-sets from existing mechanics, with zero per-week authoring.
  Four fifths of the interaction table is already authored-but-unbuilt in
  `docs/game/BUILDCRAFT_GENOME_DESIGN.md:256-264`, needing no new balance
  authority.
- **Storage:** Serpent needs **no migration** — `modifiers TEXT[]` already holds
  `[...anomalies, ...clauses]` and `ensure_serpent_week`'s drift tripwire
  (046:383-387) gets stronger for free. Signal needs **migration 053**: add
  `clauses TEXT[] NOT NULL DEFAULT '{}'` + widen `ensure_signal_day` and its
  drift check (~40 lines, additive, follows the 046/049 template).
- **One consumption path:** widen the 5th parameter of
  `computeGenomeRunTotals`/`applyGenomeOutcome`/`genomeOutcomeMultipliers`/
  `computeLengthTrace`/`genomeClaimCaps` to `AnomalyId | WorldCondition | null`
  and normalize on the first line — a **widened union, not an optional 6th
  param**, because a forgotten optional param means client and server silently
  disagree. Clause math lives in `worldCondition.ts` and is imported into
  `rulesets.ts` beside `anomalyFoodValueModifier`; `rulesets.ts:501` stays
  byte-identical for the score-independence gate.
- Sequencing: after **2.10a** and after **2.05** (shared settlement territory);
  2.08 consumes it.
- Risk to watch: `strainThresholdDelta` reaches the payout authority via
  `strainActivations`, which the validator recomputes — a divergence here would
  silently flag honest players, so it must live in ONE signature both sides
  call, covered by the parity sweep.

### WP-2.09 — Gameplay tuning trio (Molt · PASS · hold budget)

**Molt shed+speed (owner ruling — designed from Explorer B):**
- Shed becomes proportional: reset length = `max(12, floor(len × 0.6))` [H],
  changed in the **shared** model (`src/shared/game/genome.ts` shed-cycle
  machinery + `strains.ts` `STRAIN_PHYSICS.moltResetLength`) so engine and
  server stay in parity by construction.
- **Per-molt compounding speed step**: new `STRAIN_PHYSICS.moltTickFactor`
  (~0.92/molt [H], floor 25ms — same clamp as Overclocked Reality). Hook: the
  single speed choke point `SnakeGameLogic.effectiveSpeedForFood`
  (`:2677-2702`), beside the `overclockedRealityTickFactor` line. The loop
  re-arms its interval from `getSpeed()` every tick (`game/page.tsx:1484-1501`),
  so mid-run changes apply with zero extra plumbing. Purely physical `[P]` —
  no server fold change (molt DNA cadence is event-count-based and unchanged).
  Also fix `start()`'s speed bypass (`SnakeGameLogic.ts:766` skips
  `effectiveSpeedForFood` — finding #18).
- Card copy states the cost explicitly ("shed 40% · +8% speed, compounding").
  verify:constitution note: speed is physics, not score formula — Rule 2 gate
  unaffected; confirm the score-independence test doesn't pin tick values.

**Explicit PASS on gene offers** (see "The skip meta" section): PASS button in
`GeneChoiceOverlay`; engine records a pass in the offer trace (offer consumed,
no pick — `recentOffers` already carries offered ids, so the pity rule feeds
automatically); validator/`offerVerifier` accept an offer with zero picks
(`GENE_BOUND` offer-source counting at `gameValidator.ts:635` must not require
pick-count == offer-count).

**Tactical-hold budget replacing maxDuration** (verified: no hold tracking
exists anywhere — no counter, no paused-ms; `duration_seconds` is raw client
wall-clock including holds). Design: engine-side `holdsUsed` counter in
`pause()` (`SnakeGameLogic.ts:1075` — the single funnel), budget 3 base, +1 at
length 25, +1 at length 40 [H]; HUD shows remaining holds; choice-holds
(gene/portal/surge) explicitly exempt (they are the game's decisions, Rule 1).
No server enforcement needed: holds carry no economy. Duration bounding moves
server-side in WP-2.05 item 4.

## Where the plan was corrected by design review

Recorded because the corrections are load-bearing and a future reader should
not re-derive the discarded versions:

1. **Weekly conditions are inert, not merely shallow** — and the Signal UI
   states "Gene pool tilts X today" while the tilt never reaches the engine.
   Added WP-2.10a as a first, standalone fix. A shipped falsehood is a launch
   blocker on its own terms.
2. **PASS already ships end-to-end.** My budget was ~10× too large; the work is
   copy, affordance and one missing parity test. Do not add a `passed` field.
3. **My competitive-integrity argument was wrong.** Depth is the second public
   number and is leaderboard-shaped, so "Score is build-independent" does not
   settle it. The correct defence is Rule 8 + Rules 5/6 (additive `SUM`, no
   thresholds, `GREATEST`-clamped: optimizing can never lower anyone else's
   number).
4. **`ModalDialog` migration is not the fix** for the detail sheet — 13 files
   hand-roll `role="dialog"`; the defect is a missing focus trap (2 lines).
5. **`spawnPointsUnlocked` gates a real mechanic**, not just display — so the
   argument is "traits are always live, pips genuinely are not", not "trait
   knowledge is lexicon, not ramp".
6. **New Codex categories must not extend `CodexDiscoveryType`** — persisted
   and RPC-validated; a separate `LexiconCategory` avoids a migration and
   avoids asserting that traits are discoverable.
7. **The validation bug is a live DNA-loss path, not only lost progression** —
   `adjustedDna` is derived from the very context that degrades. Two further
   unlisted defects found: a downward write of three player scalars
   (`route:1121`) and a 404 that makes the outbox delete a run's payout
   (`route:660`). This is now the wave's top priority.
8. **My FATAL set was far too wide.** `INVALID_FOOD_RATE`, `INVALID_OUTCOME`
   and the forged-id codes are all repairable, so they are advisory; the FATAL
   set is exactly two codes.
9. **Making `INVALID_DURATION` advisory would open a Signal `endure` exploit** —
   so the bound stays FATAL *and* the stored value is clamped. Both.
10. **The `eligible`-column alternative is far worse than estimated** — 53 SQL
    predicates across 12 migrations, not 6.
11. **(F) Thick Hide is not a divergence at all** — both sides already agree.
12. **Ascetic: both options I put to the owner were rejected on mechanism.** A
    Strain Surge is permanently capped at tier 1 for an Ascetic snake; the
    ruling's *intent* is delivered instead by narrowing the validator so
    infuse-sourced picks are honest and paid. Flagged as an open copy/design
    question rather than settled silently.
13. **Codex discoveries CAN be honestly re-derived** in the backfill (the
    genome blob is on the row and the RPC is idempotent) — reversing my
    "cannot be reconstructed" note, inside ruling 3's spirit.

Also promoted into scope on review: favorite persistence (the representative
rule depends on it), the equip route's `23505` retry (fixes the symptom before
the migration is applied), the re-read 200-not-500 correction, and two copy
items (extraction verbs, charges).

## Exploration findings triage (beyond the six owner-reported defects)

**Ride along in this wave** (same files, small):
- WP-2.06: completion counts rows not variants (43/11 = 391%, unclamped bar);
  equip re-read's narrow join degrades traitSlots/lineage; client discards the
  server's equip response; favorite toggle never persisted; equip errors
  flattened (owner-vs-23505 indistinguishable); no Sentry in collection stack;
  `unlock_and_equip_variant` shares the equip race; VariantDetailModal lacks
  focus trap/portal (adopt ModalDialog); double error surface on equip fail.
- WP-2.07: StrainChip title-only tooltip + missing aria-label; StrainMeterHUD
  duplicate tier names ('Dormant'); codex free-play stat inflation (B-1);
  /codex sitemap-vs-authwall contradiction (B-2); undiscovered entries leak
  strain chips (B-3 — keep, but state it: strains visible, recipe hidden);
  three shed cadences (20/25/Molt) need distinguishing copy (B-14).
- WP-2.09: `start()` bypasses effectiveSpeedForFood (#18).
- Wave hygiene: build-log WP table extended through Phase 2 (B-13).

**Defer (log in build log as found-not-fixed, no WP now):**
- codexStore.reset() never called on sign-out (B-4); store-wide zustand
  subscriptions re-render both codex consumers (B-5); dead unreachable codex
  branch (B-6); CollectionGrid dead skeleton branch + emptySlotCount unused +
  role="grid" ARIA (#2,3,5 — grid ARIA rides 2.06 only if trivial);
  hexToRgba ×6 duplication (#17); startGameLoop re-creates interval every tick
  (#19); Lab mastery-map uppercase fragility (#21); lab fetches degrade
  silently (#22 — F-24 successor); TRAIT_STRAINS has no FERAL trait (B-12 —
  Workbench annotates instead); optimistic unlock snake malformed (#10).

## Execution notes for the implementer (Opus)

- One WP = one branch (`wp/2-05-player-truth` … `wp/2-10-interactive-weeks`)
  onto `constitution/build`, standard handoff §2–3 protocol; migrations 053+
  claimed at merge; coordinate hot files (`session/route.ts`,
  `gameValidator.ts`, `game/page.tsx`) against any in-flight Phase 2 WP via
  the build log.
- Order (refined by the design agents):
  1. **WP-2.10a** — connect the shipped condition. Small, alone, first: it
     changes live payouts, must be observable in isolation, and it stops the
     Signal UI lying. Land at a week boundary. (Touches `session/route.ts`, so
     it must merge before 2.05 takes the hot-file lock.)
  2. **WP-2.05** — severity + start context + fold parity + backfill.
     **This WP takes an exclusive lock on four of the five declared hot files**
     (`session/route.ts`, `gameValidator.ts`, `game.ts`, `SnakeGameLogic.ts`),
     so **no other WP may be in flight while it runs** — that is a constraint
     on the wave, not just on this package. Internally it stages as:
     A foundations (severity table, delete maxDuration) → B stop the bleeding
     (the 503s, in priority order) → C start context + migration 053 →
     D validator honesty (clamps, VOLT factor, Ascetic) → E fold parity
     (largest engine diff, **parity test written first with the known
     divergences as expected failures**) → F backfill 054 + the live-Postgres
     gate test → **test migration last**, so ~25 flipped `valid` assertions
     cannot mask a real regression in A–E.
  3. **WP-2.06** ∥ **WP-2.07a** — resume parallelism once 2.05 releases the
     lock. File-disjoint: 2.06 owns the Lab/collection family; 2.07a owns
     lexicon + popover + HeirloomSummary + codex + `game/page.tsx`.
  4. **WP-2.07b** (chips) — strictly after 2.06 merges, since 2.06
     restructures the detail sheet and popovers would otherwise be reflowed.
  5. **WP-2.10b** — the clause schema (settlement fold, after 2.05 vacates it).
  6. **WP-2.09** — engine tuning (Molt speed, hold budget, PASS copy + test);
     after 2.05, which owns `SnakeGameLogic.ts`.
  7. **WP-2.08** — the Workbench, consuming 2.07's registry and 2.10b's
     contract.
- **Release order** (matters, because the app must be deployable before its
  migrations): deploy the app → apply 053 → apply 054 → invoke the Serpent and
  Signal ops settlement routes once → record the 054 NOTICE numbers, the
  unclassified-code count (expect 0) and the out-of-window Serpent weeks in the
  build log.
- Because the whole wave gates launch (ruling 2), the phase-gate scenario is
  the real acceptance: a full simulated week — found clan → Signal with a PASS
  → Serpent runs under an interactive week → settlement → Depth → share — plus
  the owner's manual replay of the six original repro paths, before campus 1.
- Update as part of the wave: `docs/IMPLEMENTATION_HANDOFF.md` gains the five
  WP entries (R12 justifications included above); build-log WP table extended
  through Phase 2 (finding B-13); GT-delta note for stale §9.3 (Explorer 7.9).
- Constitution touch: §17 gains tests for the [H] dials introduced here (hold
  budget, molt factor, advisory-epsilon, take on severity classes); the
  Workbench boundary revision (§16/§12 dilution-test note) is recorded in the
  Overturn Record as a v1.3 addendum row (calculator in, tier lists still out).
- Flags: every player-visible surface behind `NEXT_PUBLIC_*` default OFF
  (rebuild-to-flip caveat); release rides the next phase-scoped deploy.

## Verification

- **Unit — severity matrix:** every code has exactly one severity; FATAL is
  exactly the two named codes; unknown ⇒ advisory; a **source scan** proves
  every pushed code has a table entry; and the decisive pair — a run firing
  *every* advisory code pays **the identical `adjustedDna`** as a clean run,
  and a run with a fatal code pays the identical amount as the same run
  without it. *The payout never depends on severity.*
- **Property parity (write it FIRST, with today's divergences as expected
  failures):** seeded scripted runs assert **exact** equality — engine
  `dnaCollected` minus bounded-trust claims === `computeGenomeRunTotals`, score
  ===, engine length trace === `computeLengthTrace`, and validator errors
  **empty** (not merely `valid`). Exactness matters: `CLAIM_EPSILON` is a
  whole-run absolute epsilon and would hide a 1-DNA drift that a long run turns
  into ten. Fourteen adversarial axes (last_gasp boundary, bulk_up bucket edge,
  stacked growth, arcs + overgrowth, 3-foods-per-eat on PRIMAL, tithe before
  the pick, tithe fused, **Regenesis cycling — the double-pay case**, Molt,
  Thick Hide, Ouroboros cadence, infuse before a boundary food, voided Phoenix,
  COSMIC combo) plus a 200-script fixed-seed randomized sweep that prints its
  seed on failure.
- **Backfill gate test against live Postgres** (`src/gate/*.gate.test.ts`
  pattern): seed one row per advisory code, per fatal code, an unclassified
  one, a free-play one, a mixed one; apply 053+054; assert the re-stamp set is
  exactly right, `high_score` rose and never fell, Records never fell,
  settled values byte-unchanged, the unclassified row untouched — **then run
  054 again and diff every table for zero changes.**
- **Referential-identity + sweep** (signal.calendar pattern): Workbench fns
  `toBe` engine fns; adversarial build sweep for tiers/splices/weights.
- **Migration tests:** 053 start-context roundtrip; backfill re-stamp counts
  asserted in-transaction (only advisory-class rows flip; fatal rows never).
- **E2E:** equip each of N same-variant snakes (new picker); touch popover on
  trait/strain chips (mobile viewport); Codex rules readable logged-out and
  at 0 banks; PASS on a gene offer settles validated; molt speed-step
  observable in tick interval; Workbench `/b/<code>` OG image bytes-check
  (render/raster split per `artifactImages` pattern).
- **Gates:** `verify:constitution` green (Workbench never touches
  FOOD_BASE_SCORE; no code in rulesets.ts/SnakeGameLogic.ts).
- **Manual:** owner replays the six original repro paths on staging; then the
  backfill confirms ~15 → ~26 banked runs on Sans_Souci and the 1750 CYBER
  score appears on the board.
