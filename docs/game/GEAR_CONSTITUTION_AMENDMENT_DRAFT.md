# Constitutional Amendment Package B — The Kit

**Status: DRAFT PROPOSAL. NOT RATIFIED. The Constitution is not edited by this file.**

**Proposed:** 8 August 2026 · **Target version:** v1.17
**Source design:** `docs/game/GEAR_SYSTEM_DESIGN.md`
**Commissioned by:** the owner's directive of 8 August 2026, which pre-approved the
*process* ("if that needs updating of the constitution, then i approve that"). The
*specifics* below are proposed, not approved, and each requires a line-by-line
ruling.

---

## 0. Procedure, and one recommendation about it

The Constitution's preamble binds this file:

> **How to amend:** changes to the Inviolable Rules (§4) or the Caps (§12.2) require
> a written proposal naming the rule, the reason, and what is being given up; a
> seven-day cooling period; and the owner's recorded sign-off appended to the
> Overturn Record (§15). Everything else amends by normal revision with a changelog
> entry.

This package touches **Rules 2, 3, 4, 9 and 10** and **both caps tables**. It is
therefore the heaviest amendment since ratification: nine amendments, of which one
retires a public number the document has protected in every version since v1.0.

**The cooling period has been waived twelve times** (§15 rows 18, 21, 24, 27–38).
Every waiver has been recorded with its reason, and every one had the same
justification available: an approved production build was already in flight.

**Recommendation: do not waive it for A1.** Nothing is in flight. No gear code
exists, no migration is written, and §8 of the design document deliberately puts the
leaderboard cutover *off* the critical path so that gear can ship for months before
Score is retired. A1 is the one amendment in this project's history where the seven
days cost literally nothing and guard against exactly what they were written to
guard against — same-day enthusiasm about a decision that cannot be un-made once a
public ladder has changed units. A2–A9 may reasonably be ruled immediately; they are
strengthenings and admissions, not reversals.

If the owner waives anyway, §15's convention applies: the waiver is recorded, not
silent.

---

## A1 · Rule 2 — the ranked number

**Rule named:** Inviolable Rule 2, and §6.1 in full.

**Current text (Rule 2):**

> **Score measures the pilot.** The leaderboard score formula never reads genes,
> traits, anomalies, account state, or anything money could ever have touched
> (GT §2.2). *Reviewer: does the score fold read anything but the run's food events
> and the dynasty ruleset?*

**Proposed text:**

> 2. **The ranked number measures the run — skill and build together, and no euro
>    reaches either.** SupaSnake ranks **Yield**: the server-settled economic total
>    of a run, including the genes picked, the strains reached, the lineage bred, and
>    the gear earned. The fair measure is deliberately composite, because effort and
>    skill are both real and the product refuses to rank either alone. Every input to
>    Yield must be earnable by play and unreachable by payment (Rule 3). The
>    build-independent fold survives as **PILOT**, a private per-run skill reading
>    shown only to its own player, never ranked, never compared publicly, and
>    mechanically guarded by `npm run verify:constitution` against reading anything
>    but the run's food events and the dynasty ruleset. *Reviewer: can any input to
>    the ranked number be reached by payment? Does the PILOT fold still read nothing
>    but food events and the ruleset?*

**The reason.** Rule 2 was written when the only competitive number was
build-independent, and it made the product's entire buildcraft — genes, strains,
splices, lineage, Ascendance, and now gear — invisible on the only surface the game
ranks. §6.2 already concedes the tension: Yield "is where the build is *supposed* to
matter," yet nothing a stranger can see reads it. The owner's directive resolves the
tension in the direction the game's systems have been pointing since v1.2: *"our fair
measure is combined from skill and effort."* Gear makes the resolution urgent, because
a seventh investment axis that no ladder can see is a seventh reason to wonder what
any of it is for.

**What is being given up — stated at full weight.**

1. **The purest fairness guarantee the product owns.** A build-blind ladder is
   unfalsifiably fair; a build-inclusive one is only as fair as the rule that keeps
   money out of the build. Rule 3 stops being one of two guarantees and becomes the
   only one. A2 and A3 exist to compensate, and they are not equivalent — a mechanism
   is being traded for a law.
2. **The promise to the pure pilot.** A player who is excellent and infrequent had a
   surface where their excellence was the whole story. They no longer have one; they
   have PILOT, privately, and a Yield board where a well-equipped average player can
   beat them on a single run. The design document bounds this (`GEAR_SYSTEM_DESIGN.md`
   §3.5: full gear ×2.19 against skill's ×2.47) but does not eliminate it.
3. **The all-time board.** A build-inclusive number cannot be ranked all-time without
   making the ladder a start-date ladder, so A5 makes it seasonal. The permanence of
   "best ever" moves from a public board to the Chronicle.
4. **Three tuned curves and their tolerance test.** §6.1's per-dynasty Score shapes
   and §17.30's ±10% integral requirement lose their public purpose. Under the
   recommended reading they survive attached to PILOT, at a reduced standard; under
   the alternative (D3 in the design document) they are deleted outright.

**What is deliberately kept, and why it is not a hedge.** PILOT is retained not for
sentiment but for two mechanical jobs neither of which Yield can do: it is the only
machine-checked fairness invariant in the repository, and **Yield ÷ PILOT is exactly
the build's contribution to a run**, which is simultaneously the audit that keeps
gear inflation honest against live data and the primary automated signal separating a
human from a farm (`GEAR_SYSTEM_DESIGN.md` §5.4). Cost: one fold, one CI job.

---

## A2 · Rule 3 — strengthened, and made specific about gear

**Rule named:** Inviolable Rule 3.

**Current text:**

> 3. **Depth measures the dynasty, and no euro can move it.** Money touches no
>    computed number: not Score, not Yield, not Depth, not DNA, not XP, not odds, not
>    timers.

**Proposed text:**

> 3. **The measured numbers are unreachable by money.** Money touches no computed
>    number: not Yield, not Depth, not PILOT, not DNA, not Scales, not gear power,
>    not a rank, not a level, not a slot, not XP, not odds, not timers, and not the
>    rate at which any of them accrue. **With the ranked number now reading the
>    build, this rule is the product's entire fairness guarantee and is amended only
>    by dissolving the product.** *Reviewer: trace any purchase to any numeric output;
>    the trace must terminate in appearance or continuity.*

**The reason.** A1 removes the mechanical guarantee. This rule inherits its whole
job, and inheriting a job silently is how load-bearing rules get weakened by people
who did not know what they were holding up. The added sentence is not rhetoric; it is
a note to a 2029 reader.

**What is being given up:** nothing. This is a strengthening.

---

## A3 · Rule 4 and §10.4 — the never-sold list

**Rules named:** Inviolable Rule 4; §10.4, the locked list.

**Proposed additions to §10.4, verbatim:**

> Rigs · gear slots and slot unlocks · gear ranks and rank promotions · gear levels
> and level-ups · **Scales in any form or amount** · any acceleration, doubling,
> discount, conversion or "instant finish" of gear progress · the catch-up
> (Slipstream) rate · Standard-Issue timing · gear conditions or any influence over
> them · and any bundle, pack, season track, or subscription perk containing any of
> the above.

**Proposed addition to Rule 4:**

> Scales, rigs, ranks and levels are additionally **non-transferable**: they may not
> be sold, gifted, traded, pooled, or moved between accounts by any mechanism,
> including the §10.5 gifting system, which remains cosmetic-only.

**The reason.** Two jobs. First, §10.4 is the list a future pricing discussion is
checked against, and a category absent from the list is a category someone will argue
was never excluded. Second, non-transferability is the *entire* defence against
multi-account farming (`GEAR_SYSTEM_DESIGN.md` §5.3, A4) — an alt that farms Scales it
can never move gains nothing, and that is a rule rather than a detector.

**What is being given up.** The most reliable remaining revenue idea available to
this product: a gear-progress boost. §10.7's honest expectation is 1–3% conversion on
appearance alone; a progress SKU would plausibly multiply that. It is named in the
design document (§6.4) precisely so no future proposal can present it as new.

---

## A4 · §12.1 and §12.2 — one growth slot, one earned material

**Sections named:** §12.1 (growth slots), §12.2 (the caps).

**Proposed change to §12.1 — an eighth slot:**

| Slot | Grows by | Marginal cost |
|---|---|---|
| 8. Gear lines | New rigs in the seven shipped slots, drawn from the bounded condition catalog | Low, bounded |

**Proposed changes to §12.2:**

| Quantity | Current | Proposed |
|---|---|---|
| Currencies | **1** (DNA); premium currencies **0**, forever | **1** (DNA); premium currencies **0**, forever. Plus **1 earned material** (Scales): earned-only, single-sink, non-transferable, never sold, never priced, with no storefront and no euro representation in schema. Stored in hundredths; there is no second noun for fractions. **A second material is an amendment.** |
| Public numbers | **2** (Score, Depth) | **2** (Yield, Depth). PILOT is a private number, like Mastery XP: shown to its own player, never ranked or publicly compared. |
| Growth slots (§12.1) | 7 | **8** |

**The reason for the material, and why it is not a second currency in disguise.**
The honest test is: can a player convert it, price it, hold it as wealth, or be
targeted through it? Scales fail all four. They have exactly one sink (rank
promotion), no exchange rate with DNA in either direction, no storefront, no gifting,
and no euro representation anywhere in the schema — `gear_definitions` deliberately
carries no `price_eur` column, so a rig has no way to *be* priced. What Scales
actually are is a **calendar**: a legible representation of elapsed committed play.
The alternative designs were worse, and were considered: pricing ranks in DNA makes
the whole spine buyable by one good week and destroys the years-long curve; pricing
them in Energy violates §8.6's never-spent-on-anything-but-a-run rule; and pricing
them in nothing at all — pure time gates — makes effort unrewardable, which is the
directive's central requirement.

**What is being given up.** The cleanest sentence in the marketing position: "one
currency." It becomes "one currency, one earned material, neither for sale," which is
longer and slightly weaker. And the cap on *materials* is now a thing that exists and
can be argued upward in 2029 — which is why the amendment writes "a second material is
an amendment" into the table itself.

**The subtraction that pays for the additions (Rule 12: default to subtraction).**
A1 removes a public ranked number, a public board, an all-time epoch, and — under
D3's alternative — two folds, three tuned curves, a CI verifier and one open
question. This package subtracts more than it adds.

---

## A5 · §6.1 and §6.2 — the two numbers, restated

**Sections named:** §6.1 (Score), §6.2 (Yield and Depth), and §7.1's calendar row for
Ascension.

**Proposed:**

1. **§6.1 is renamed "Yield — the run number" and answers:** *what was that run
   worth?* Ranked on leaderboards under the existing eligibility rules (run ended,
   validation passed, one best entry per player, compatible content version).
2. **The ranked epoch is seasonal (quarterly).** Standings reset with the season;
   possessions and records never (§9.3's existing formula, applied to the board).
   Lifetime bests move to the Chronicle as permanent Records under Rule 6. **This
   closes the leaderboard-epoch decision that has been open since the Redesign Wave**,
   and gear is what closes it: a build-inclusive all-time board is a start-date board.
3. **Ascension re-anchors** from "the sum of your best ten daily Signal Scores" to
   "the sum of your best ten daily Signal **Yields**." Everything else about Ascension
   — best-ten, promotion-only, absolute published thresholds, earned-only tier marks —
   is unchanged. It is presented as "Yield, this month."
4. **§6.2's Depth definition is unchanged.** Depth remains the sum of a member's five
   strongest valid Energy-funded Yields per battle cycle. Gear reaches Depth because
   gear multiplies Yield, which is the intent.
5. **§6.2's honesty rules are updated in one place only:** "Yield never appears on the
   Score ladder; Score never appears on Serpent surfaces" becomes "the run board shows
   Yield per run; Serpent surfaces show Depth in segments. Different names, different
   units, different screens." The anti-conflation architecture survives intact,
   because the two numbers still answer different questions in different units.
6. **Ranked bands, if population ever justifies them, band on Yield percentile only** —
   never on gear power, generation, or any account state. Kill-list #21 (generation
   skill brackets, deleted) stays deleted and this sentence is why.

**The reason.** These are A1's mechanical consequences. Listing them separately is
the point: an amendment that changes a unit and does not enumerate every surface
reading that unit is how a product ends up showing two ranked numbers at once.

**What is being given up.** The all-time board, and with it the single most durable
form of bragging the product had. Mitigated by Chronicle permanence, not replaced by
it — a record in your own history is not a name at the top of a page, and pretending
otherwise would be dishonest.

---

## A6 · §5 — the protected run gains one sentence

**Section named:** §5, the protected-core list.

**Proposed addition:**

> - **Gear changes what a run is worth; it never changes how a run plays.** No rig,
>   rank, level, or condition may alter speed, tick, growth, length, collision,
>   control, hold count, portal timing, gene odds, terrain, or validation. Gear
>   composes with Ascendance into the run's Yield multiplier and touches nothing
>   else. *The argument is v1.16's camera argument: two players on one ladder must
>   read the same geometry — and must play the same physics. A gear system that
>   bought difficulty reduction would let effort purchase an easier game, which is
>   both a violation of Rule 15's spirit and the exact failure the owner left another
>   game over.*

**The reason.** Without this sentence, "gear that powers the snake" will eventually
be read as a shield, a slow-time, or a second life, and each of those is a Rule 15
problem, a §5 problem, and a fairness problem at once. With it, Rule 15 compliance is
true by construction rather than by review.

**What is being given up.** The most obvious and most viscerally satisfying gear
fantasy — armour that actually protects you. Owned honestly: the plates will look
like protection and will not be protection, and the product must never imply
otherwise in copy.

---

## A7 · §8 — Lineage widened, and §8.8 added

**Sections named:** §8.2 (Lineage), §8.4 (Collection), and a new §8.8.

**Proposed:**

1. **§8.2's framing question widens** from *"what is special about my snake?"* to
   *"what is special about my snake — bred, and outfitted?"* Gear lands **inside
   Lineage**. There is no fourth pillar and the §12.2 cap of three is untouched.
2. **New §8.8 — The Kit**, carrying the design document's §2 and §3: seven slots
   (three head, four plate), rigs and skins as separate objects, ranks gating levels,
   DNA as the level currency and Scales as the rank material, the lane portfolio, the
   Slipstream, Standard Issue, and the balance law of §8.8a below.
3. **§8.8a, the balance law, stated as a rule rather than a number:** *the complete
   kit's Yield multiplier must remain strictly below the multiplier a pilot gains by
   doubling a single run's food count on the same dynasty.* Today that is ×2.19
   against ×2.47. Every future rig, rank, slot, or curve retune is checked against
   this inequality, measured on live data.
4. **§8.5's DNA section gains gear as a named job:** DNA's jobs become variants,
   breeding, gear levels, and the earned cosmetic shelf.

**The reason.** Rule 9 requires every proposal to name its pillar. Gear is worn by
the snake, renders on the snake, and multiplies the same number Ascendance multiplies
— it is Lineage or it is a fourth pillar, and a fourth pillar is a cap violation the
package would have to argue separately and would lose. §8.8a exists because "gear is
balanced" is not checkable and an inequality is.

**What is being given up.** The tightness of "Lineage means breeding." Lineage
becomes a two-verb pillar, which is more surface to keep coherent in the Lab and in
the Chronicle.

---

## A8 · Rule 9 and Rule 10 — restated for the new vocabulary

**Rules named:** 9 and 10. Mechanical restatements, no substantive change.

> 9. **Three pillars, two numbers, one calendar.** New work lands inside Mastery,
>    Lineage, or Discovery; surfaces on **Yield** or Depth; and schedules on the
>    Signal (including its monthly Ascension cycle), the Serpent battle cycle, or the
>    season.

> 10. **The Caps are law** (§12.2): one currency and one earned material, zero
>     premium currencies, one daily and one recurring clan surface, ≤16 active genes,
>     three dynasties, **seven gear slots**, four SKU archetypes, three Results
>     layers, ≤3 taps from open to board through the Run Setup page.

---

## A9 · §13 and §14 — the kill list and the sequencing

**Sections named:** §13 (kill list), §14 (sequencing).

**Proposed kill-list rows:**

| # | System (state) | Action | Preservation path |
|---|---|---|---|
| 27 | **The public Score ladder** (shipped) | Retire at the G-7 cutover. The ranked board reads seasonal Yield. | Every historical Score, personal best and rank becomes a permanent Chronicle Record (Rule 6). The fold survives as PILOT; nothing is recomputed and no row is written downward. |
| 28 | **All-time leaderboard epoch** (shipped) | Replace with seasonal standings | Lifetime bests to the Chronicle; standings reset with the season, possessions never |

**Proposed sequencing note for §14:** gear ships as a Phase-4-adjacent package
(§12.1 slot 8) and **the leaderboard cutover is deliberately not on its critical
path** — G-7 in `GEAR_SYSTEM_DESIGN.md` §8. Gear may be live for months while Score
is still ranked. The reason is evidentiary: cutting over later means cutting over
against live gear telemetry rather than against this package's estimates, and §8.8a's
balance law can be checked before it is relied upon.

---

## B · New §17 open questions, with their tests

To be appended to §17. Every number in the design document is [H].

> 37. **The Scale cadence and the grinder spread** (Package B). Floor 4.2/month, full
>     8.2/month, ratio 1.94×, converting to a 12% Yield spread at twelve months.
>     *Test:* lane-completion distribution across cohorts; the realised material and
>     multiplier spread at 3/6/12 months; whether the top decile's advantage tracks
>     the model. Retune the lane values, never the power curve — the logarithm is the
>     fairness mechanism, not a dial.
>
> 38. **The §8.8a balance law under live data** (Package B). Complete kit ×2.19
>     against a doubled run's ×2.47. *Test:* measured Yield distribution by kit power
>     and by food count, quarterly. If gear power ever explains more variance than
>     food count does, the ceiling is wrong and gear is retuned — never the run.
>
> 39. **Slipstream calibration** (Package B). ×2 below the 50th percentile of owned
>     gear power, ending at the 60th. *Test:* time-to-median for accounts created
>     after each season boundary; sandbagging attempts detected; whether newcomers
>     report the framing as help or as a handicap.
>
> 40. **Standard Issue cadence** (Package B). One rank per four seasons. *Test:*
>     newcomer retention at D30 by cohort start date, read beside veteran sentiment
>     on the quarter it fires. Both numbers, together, or the decision is being made
>     on half the evidence.
>
> 41. **Yield/Depth conflation after the cutover** (Package B, extending §17.1).
>     Removing Score removes one of the three numbers players could confuse, but the
>     ranked number now shares a name with the clan input. *Test:* the §17.1
>     comprehension protocol re-run at cutover; act if >20% conflate "my Yield" with
>     "my Depth contribution."

---

## C · Draft Overturn Record rows (§15)

To be appended after row 38, with the owner's ruling date and any waiver.

| # | Reversed decision | Ruling | What is given up |
|---|---|---|---|
| 39 | **Score measures the pilot, and the leaderboard formula never reads anything money could have touched** (Rule 2, §6.1, in force since v1.0 and mechanically enforced by `verify:constitution` against two locked folds) | **v1.17, A1: the ranked number is Yield** — skill and build together, because the fair measure is composite and the product refuses to rank either alone. The build-independent fold survives as **PILOT**, a private per-run skill reading, still mechanically guarded, now serving as the build-contribution audit (Yield ÷ PILOT) and the primary anti-farm signal | The only unfalsifiable fairness guarantee the product owned, and the surface where an excellent infrequent player's excellence was the whole story. Rule 3 inherits the entire fairness contract (A2). The all-time board goes with it (A5). Kept: the fold, the verifier, and the invariant — as an instrument rather than a ladder |
| 40 | **One currency, forever; zero others of any kind** (§12.2, identity-bound cap) | **v1.17, A4: one currency plus one earned material.** Scales: earned-only, single-sink, non-transferable, no storefront, no euro representation in schema, stored in hundredths with no second noun. A second material is an amendment | The cleanest line in the marketing position. And the existence of a *materials* cap that can now be argued upward — which is why the cap text states its own amendment requirement |
| 41 | **The leaderboard epoch is all-time** (shipped; the decision has been open since the Redesign Wave) | **v1.17, A5: seasonal (quarterly) standings**, because a build-inclusive number ranked all-time is a start-date ladder. Lifetime bests become permanent Chronicle Records | Public permanence of "best ever." A record in your own history is not a name at the top of a page, and this row does not pretend it is |
| 42 | **Seven growth slots** (§12.1) | **v1.17, A4: eight.** Gear lines, at ~1 rig per quarter on one shared curve | One more content lane to keep fed, forever, at current headcount |
| 43 | **Lineage means breeding** (§8.2) | **v1.17, A7: Lineage means the snake that is yours — bred and outfitted.** Gear lands inside the existing pillar; the cap of three is untouched | The tightness of a one-verb pillar; more Lab and Chronicle surface to keep coherent |

---

## D · The dilution test (§12.3), for the record

All eight hold. The full working is `GEAR_SYSTEM_DESIGN.md` §4.4.

A. **Lineage**, widened. · B. **Slot 8**, opened and priced. · C. Caps: public numbers
stay 2; currencies stay 1 plus one argued material; every other cap unchanged. ·
D. Zero mandatory taps — Run Setup gains a preset *line*. · E. Rule 5 holds: a missed
day costs that day's Scales, nothing decays, nothing banks as debt. · F. No euro
reaches any gear number (A2, A3). · G. Operating cost stated: ~1 rig/quarter, one
shared curve, one Lab screen, one quarterly flip, one telemetry review. ·
H. **Ascendance** could not do the job — one verb, invisible, one binary sink, and no
lane for effort (`GEAR_SYSTEM_DESIGN.md` §4.5).

---

## E · Owner sign-off

Each amendment is ruled separately. A1 is the only one the seven-day cooling period
is recommended for (§0).

| | Amendment | Ruling | Date | Cooling period |
|---|---|---|---|---|
| A1 | Rule 2 — the ranked number becomes Yield; PILOT survives private | ☐ approve ☐ approve with changes ☐ reject | | ☐ observed ☐ **waived** |
| A2 | Rule 3 — strengthened, gear named | ☐ | | |
| A3 | Rule 4 / §10.4 — never-sold and non-transferable | ☐ | | |
| A4 | §12.1 slot 8 · §12.2 one earned material | ☐ | | ☐ observed ☐ waived |
| A5 | §6.1 / §6.2 — Yield ranked, seasonal epoch, Ascension re-anchored | ☐ | | |
| A6 | §5 — worth, never physics | ☐ | | |
| A7 | §8.2 / §8.4 / new §8.8 — Lineage widened, the Kit, the balance law | ☐ | | |
| A8 | Rules 9 and 10 — restated | ☐ | | |
| A9 | §13 / §14 — kill-list rows and sequencing | ☐ | | |

Additionally required before implementation opens, per
`docs/game/GEAR_SYSTEM_DESIGN.md` §9: rulings on **D1–D10** — the material's name,
the cadence spread, whether PILOT survives, the gear ceiling, the epoch, the Standard
Issue cadence, the slot count, account-level versus per-dynasty loadouts, the
condition catalog, and the ship sequencing.

---

*Drafted 8 August 2026 against Constitution v1.16. This file amends nothing. It
becomes an amendment when the table above is filled in and the §15 rows in C are
appended to the Constitution with their ruling dates.*
