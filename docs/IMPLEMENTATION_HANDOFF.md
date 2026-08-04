# Implementation Handoff — Constitution → Code

**For:** the implementing agents (Opus 5 max, GPT 5.6 max) running in parallel on
feature branches. **Prepared:** 25 July 2026 from Constitution v1.3; maintained
under the current `docs/PRODUCT_CONSTITUTION.md` (v1.14) and
`docs/GROUND_TRUTH.md` (code-verified baseline @ `main` fd22c0c era).
**Owner:** available for escalations; batch them.

---

## 1. Read order — per task, not per session

For any work package (WP): read **CLAUDE.md → this file's §2–3 → your WP entry →
the GT/Constitution sections it cites**. Do not read the whole Constitution per
task; do not explore the repo beyond the WP's owned paths plus what imports them.
GROUND_TRUTH describes the **pre-implementation baseline** — as WPs merge it goes
stale; when code and GT disagree, the code is the truth and the WP spec is the goal.

## 2. Working agreements — all agents, non-negotiable

1. **The Constitution outranks everything** except a direct owner instruction.
   `docs/game/MONETIZATION_DESIGN.md` is superseded; never implement from it.
2. **Scope = the WP.** Nothing outside the WP's Goal and Owned paths, however
   tempting. Found a bug outside scope? File it in the PR description under
   "Found, not fixed."
3. **Decision protocol.** Naming, copy, layout-within-protected-bounds, internal
   code structure → decide locally, log in the PR description. Anything that would
   bend a Rule (§4), a cap (§12.2), the never-sold list (§10.4), a [H] default, or
   a protected §5 element → **stop, write up the fork, escalate to the owner.**
   Batch escalations; keep working on unblocked parts.
4. **Every PR runs `docs/CONSTITUTION_CHECKLIST.md`** in full, pasted and checked.
5. **Complete implementations only** — no TODO/FIXME; every Supabase `error`
   checked and reported (several legacy routes violate this — never copy them).
6. **Tests ship with the WP**: unit for settlement/economy math, e2e for flows the
   WP's acceptance names. Coverage ratchet must not fall.
7. **Report honestly.** If acceptance isn't met, the PR says so. A red test is
   information, not an embarrassment.

## 3. Branch, migration, and merge protocol (multi-agent safety)

- **Branches:** one WP = one branch = one PR. Naming: `wp/<phase>-<nn>-<slug>`
  (e.g. `wp/0-01-energy-envelope`). No shared branches.
- **Tracks:** **Track A (server/data)** and **Track B (surfaces/growth)** — the WP
  table assigns each WP a track. Suggested: Opus 5 max on A, GPT 5.6 max on B;
  the split matters more than the assignment.
- **Migrations are Track A only, and serialized.** Migration 038 was this
  handoff's preparation baseline; always derive the live baseline from the
  freshly fetched repository. The next migration number is claimed **at merge
  time, not branch time**: before
  merging, rebase on main and renumber your migration file to the next free slot.
  Two migration-bearing PRs never merge the same day without a rebase in between.
- **Hot files** (merge-conflict magnets): `src/app/api/game/session/route.ts`,
  `src/shared/config/game.ts`, `src/app/page.tsx`, `src/app/game/page.tsx`,
  `src/lib/server/gameValidator.ts`. Each WP lists its hot files; **two WPs
  sharing a hot file are never in flight simultaneously** — sequence them.
- **Merge cadence:** merge to main per finished WP (small, reviewed, green); main
  stays deployable; player-visible surfaces land behind `NEXT_PUBLIC_*` flags,
  defaulted off until the phase gate, with rollback tested deliberately.
- **Cross-review:** the other track's agent reviews every PR against the
  checklist before the owner sees it. Migration-bearing and economy-touching PRs
  additionally get the owner's `/code-review ultra`.
- **Contract-first parallelism:** any WP that exposes an API names its
  request/response contract in the PR description *first*; the consuming track
  builds against that contract (mocked) without waiting.

## 4. Kickoff briefing — paste this at the top of each agent session

> You are implementing SupaSnake work packages. Authority:
> `docs/PRODUCT_CONSTITUTION.md` v1.14 (design law — its §4 Rules and §12.2 caps
> are inviolable). Process: `docs/IMPLEMENTATION_HANDOFF.md` (your WP, the branch
> and migration protocol, the decision/escalation rules). Baseline facts:
> `docs/GROUND_TRUTH.md` (pre-implementation; code outranks it once WPs land).
> Per task: read CLAUDE.md, the handoff §2–3, your WP entry, and only the files
> the WP cites. One WP per branch (`wp/<phase>-<nn>-<slug>`); complete
> implementations only; every Supabase error checked; tests included; run
> `docs/CONSTITUTION_CHECKLIST.md` on your PR. Decide local details and log them;
> escalate anything that bends a Rule, cap, [H] default, or §5 protection — in a
> batch, with your recommendation. Never implement from
> `docs/game/MONETIZATION_DESIGN.md` (superseded).

---

## 5. Phase 0 work packages — Truth and subtraction

*Goal of the phase: the economy tells the truth, the boards are credible, the
growth surface exists. Gate: economy paths audited post-subtraction; boards show
only real, ended, validated runs.*

**WP-0.00 · A+B · Baseline & rails.** Tag `pre-constitution` on main; confirm
`npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` green; add the PR
template embedding the checklist; add `wp/` branch conventions to repo docs.
*Acceptance: a no-op PR passes the full pipeline with the template.*

**WP-0.01 · A · Energy envelope** (Constitution §8.6; GT §3.3, §9.1–9.2).
Remove the run-start gate, the 20-min drip (`energyRegen.ts`), the offline energy
restore (`claim-offline` route), and the premium stipend path. Add day-scoped
charge accounting (6/day, refill at 00:00 UTC, lazy server-side), lean-factor
settlement (25% DNA on uncharged; **Yield recorded full-strength separately**;
Mastery XP from full fold), and exemptions (Signal objective run, Serpent runs).
Hot: `session/route.ts`, `gameValidator.ts`, `game.ts`. Migration: yes.
*Acceptance: settlement tests for charged/lean/exempt runs; no purchase or perk
path can grant charges; GT §9.1/9.2 defect tests pass (no destruction, one clock).*

**WP-0.02 · A · Multiplier stack removal** (GT §3.1; kill #4–6). Delete streak /
set-bonus / clan-duel multipliers (`dnaMultipliers.ts` and callers); migrate
longest-streak into a Legacy Record; add Take-streak columns (consumed by WP-1.09).
Migration: yes. *Acceptance: settled payout = raw fold × outcome multiplier only.*

**WP-0.03 · A · Faucet & dead-config purge** (GT §9.8, §10; kill #8, #9, #16).
Delete `/api/daily-rewards` + RPC; the GT §10 dead-config list; the clan dead
button; inactive contract rows; `daily_logins`. Migration: yes.
*Acceptance: grep-clean against the GT §10 table; no unreachable faucet responds.*

**WP-0.04 · A · Achievements → Records** (GT §9.5; kill #11). One atomic
migration: settle outstanding claims, convert earned achievements to Legacy Record
entries, remove claim endpoints/UI hooks. *Acceptance: sum of granted rewards
preserved (assert in migration); no separate achievement surface renders.*

**WP-0.05 · A · Leaderboard integrity** (GT §9.3; kill #21). Eligibility: ended,
validated, one-best-per-player, content version. Fix `myRank` identity join
(players.id vs auth id). Remove generation brackets. Add you-centered board API
(±5 + top 3). Hot: leaderboard route. *Acceptance: flagged/in-progress runs cannot
rank; myRank resolves for a real account; e2e board test.*

**WP-0.06 · A · Session lifecycle & cohorts** (GT §9.6, §13). Stale-session
expiry + end reasons; flag dev/QA/fixture accounts out of all public surfaces.
Migration: yes. *Acceptance: open-session count decays; public boards exclude
flagged cohorts.*

**WP-0.07 · B · Aim universalization** (GT §9.4; kill #18). All aim systems
become settings from run 1; unlock records → Chronicle trivia. Hot: `game/page.tsx`
(sequence vs WP-1.08). *Acceptance: fresh anonymous account sees all four options.*

**WP-0.08 · B · Growth hygiene bundle** (GT §8; Constitution §11.4–11.6).
Share-card URL fix (`genomeCardImage.ts:351`); favicon/app icons; OG/Twitter
images; `robots.ts`/`sitemap.ts`; landing below-the-fold pitch + `<title>`/meta;
UTM/referrer capture at signup; `/play` intent page + VideoGame structured data;
Dispatch waitlist (one field, double-opt-in, Resend); funnel-stage events in the
PostHog taxonomy (§11.5 stages). *Acceptance: share sheet carries a URL; Lighthouse
SEO pass; waitlist row lands; funnel events visible in PostHog.*

**WP-0.09 · A · Commerce removal & premium truth** (GT §7; kill #2, #3, §10.1).
Delete `ENERGY_PRODUCTS` + `BUNDLE_PRODUCTS`; strip progression perks from
`premium.ts` (keep plans/grace/drop plumbing for Keeper); rewrite the header claim
to describe what ships; disable the false "Season Pass included" copy everywhere.
*Acceptance: no purchasable SKU grants energy, DNA, or progression; premium.ts
header is true.*

**WP-0.10 · B · `verify:constitution` v1.** Script + npm task running the
mechanical gates (checklist ⚙ items): score-independence test, owned-row-downward
write scan, breeding-`random()` grep (armed after WP-1.06), energy-commerce grep,
TODO/FIXME gate. Wire into CI. *Acceptance: CI fails on a seeded violation of each
gate.*

## 6. Phase 1 work packages — The two numbers

*Gate: a clan of one completes a full Signal→Serpent→settlement→share week
untouched by the developer. All surfaces behind flags until the gate passes.*

**WP-1.01 · A · Serpent core** (§6.2, §7.3). `serpent_weeks` (id, seed,
modifier-set, starts/ends), run flagging, weekly Depth (best-3 per member), clan
Depth, lifetime Depth (monotonic), Sunday settlement cron, Chronicle entries.
Serpent runs: no charge consumed; Depth from full Yield; DNA per charge rules.
Publishes the panel API contract. Migration: yes. *Acceptance: settlement unit
tests (best-3, sums, monotonic lifetime); cron idempotent; contract documented.*

**WP-1.02 · A · Clan rework** (§9.2–9.4; kill #14–15 fold). Cap 12; clan-of-one
founding RPC (name + preset heraldry); invite codes/links; directory-alive-only
query; duels folded into paired weeks (band matching, optional layer,
self-referential primary); Gauntlet/playoffs behind gate flags; rivalry memory
columns. Migration: yes. *Acceptance: found→hunt→settle solo path e2e; no officer
lever exists; gated layers hidden but state preserved.*

**WP-1.03 · A · Signal engine** (§7.2). Daily seed + condition from curated pool;
three-objective choice; auto-settle; archive-as-practice; first-completion bonus;
cumulative milestones; contracts cutover (retire RPCs, preserve history).
Migration: yes. Hot: `session/route.ts`. *Acceptance: same conditions worldwide
per UTC day; objective settlement tests; contracts unreachable after cutover.*

**WP-1.04 · A · Daily Take** (§7.2). First-run-of-day detection; base 100 DNA;
tier streak 3/7/14/30 → ×1.25/×1.5/×2/×3; **one-tier cooling on a missed day**;
single collect endpoint (the game's only claim). Seeds from WP-0.02 columns.
*Acceptance: tier math + cooling unit tests; double-collect impossible; Take
multiplies only itself.*

**WP-1.05 · A · Lineage rework** (§8.2; kill #19–20). Deterministic draft RPC
(variant line, trait draft, lineage strain — full preview, no `random()`); reroll
tokens → 150 DNA conversion migration; lineage-reroll RPC retired; **Ascendance**:
uncapped gens; Gen1–3 remain ×1 and Gen4+ compounds Yield by ×1.02 per
generation, with no ordinary design ceiling; the cost curve still steepens past
Gen3. New runs freeze the exact curve version and multiplier at start, while
unstamped/in-flight legacy runs retain v1 settlement. Migration: yes.
*Acceptance: breeding path grep-clean of `random()`; preview equals outcome in
tests; v2 waypoints and v1 cross-deploy settlement are unit-tested; existing
Gen>3 snakes enter the current curve at their generation without rewriting old
run outcomes.*

**WP-1.06 · B · Run Setup + Results three layers** (§5). LAUNCH → setup (preset,
one-tap START; first-run fully preset) → board; REPLAY skips setup; Results L1
outcome + share + Take collect, L2 Score + Yield/Depth, L3 collapsed digest with
exactly one next action; toasts/notifications consolidated per §5. Hot:
`game/page.tsx`, `page.tsx`. *Acceptance: tap counts ≤3/≤2 asserted in e2e; 14
sections → 3 layers; Take collect renders only on day's first run.*

**WP-1.07 · B · Clan & Serpent surfaces** (§9.2, §7.3). Founding flow at 8 banks;
directory (alive-only); hunt panel (you vs best, clan vs best, rival layer);
additive contribution display; Monday briefing view. *Acceptance: solo player's
week reads meaningfully at N=1; no cut lines or minimums anywhere.*

**WP-1.08 · B · Share artifacts + challenge links** (§11.3). Signal grid
composer (portal-decision string), Serpent settlement card, lineage card; OG image
routes for run/snake/clan/Signal/settlement/profile; challenge links (seed +
target) landing into a live board. *Acceptance: every artifact URL renders an OG
image; challenge link → playable same-seed run e2e.*

**WP-1.09 · B · Auto-post + weekly email** (§11.6, §7.6). Settlement auto-composed
post (one-tap publish); deterministic weekly settlement email on the Resend path
(LLM narration retired). *Acceptance: post generated from a real settlement;
email renders from settlement data, opt-in only, zero commercial content.*

## 6b. The Playtest Wave — WP-2.05 … WP-2.10b (owner-approved 2026-07-26)

**`docs/ops/PLAYTEST_WAVE.md` is the authoritative scope for these seven work
packages** and supersedes anything below that contradicts it. It came out of the
owner's first real playtest and three independent code investigations, and it
ships **in full before campus-1 seeding** (owner ruling).

Execution order — **not** numeric order, and the constraint in step 2 binds the
whole wave:

1. **WP-2.10a** connect the shipped world condition (alone, first — it changes
   live payouts and stops the Signal UI stating a tilt the engine never applies)
2. **WP-2.05** Player Truth — validation severity, run-start context, fold
   parity, backfill. **Holds an exclusive lock on `session/route.ts`,
   `gameValidator.ts`, `game.ts` and `SnakeGameLogic.ts`: no other WP may be in
   flight while it runs.**
3. **WP-2.06** Lab Truth ∥ **WP-2.07a** Lexicon core (file-disjoint)
4. **WP-2.07b** Lexicon chips (after 2.06 merges)
5. **WP-2.10b** strain-interactive weeks
6. **WP-2.09** tuning trio (Molt shed+speed, hold budget, PASS copy)
7. **WP-2.08** the Workbench

**WP-2.08 surface supersession (owner ruling, 3 August 2026):** the execution
order above remains historical fact, but its paired Codex/Workbench package shape
does not remain current scope. Constitution v1.14 and
`docs/game/TACTICAL_GENOME_V2.md` §3.2 require one free player-facing Genome
Workbench. `/codex` is a compatibility adapter into that same instrument;
personal discovery and history form a subordinate Research Record, never a
parallel Archive/Codex primary choice or duplicate rules surface. Any remaining
WP-2.08 follow-up implements that singular shape while preserving legacy/internal
compatibility identifiers.

Highest-priority defect in the wave: the validation bug is a **live DNA-loss
path**, not only lost progression — plus a downward write of three player
scalars and a 404 that makes the reward outbox delete a run's payout. See
§WP-2.05 of the wave document.

## 6c. Player Evolution & Onboarding — WP-A … WP-F (owner-approved 2026-08-03)

This is the first approved product release after the Genome v2 update. The binding
scope is `docs/game/PLAYER_EVOLUTION_ONBOARDING.md`; Constitution v1.14 and
`docs/game/TACTICAL_GENOME_V2.md` 2.5 carry its protected boundaries. Three
companion documents carry the settled evidence and must be read before the package
they govern: `PLAYER_EVOLUTION_STARTER_POOL_SIMULATION.md` (the starter lists and
pool-health numbers), `PLAYER_EVOLUTION_LEARNING_EVENTS.md` (the per-Gene event
catalog and its two gaps), and `PLAYER_EVOLUTION_SERVER_CONTRACT.md` (state, RPCs,
RLS, stamping, migration, rollout).

**WP-A is complete.** Its deliverables are those three documents, the decision table
at `PLAYER_EVOLUTION_ONBOARDING.md` §13, and the simulation harness at
`src/shared/simulation/starterPool.ts`. **No implementation package may open until
the owner ratifies §13 line by line** — a veto on any row returns that row to `[H]`
and blocks the packages named in its last column.

**Execution order — B before C, then D/E/F.** B and C both touch
`src/app/api/game/session/route.ts` and `src/shared/game/genomeV2.ts`, which are hot
files: they are never in flight at the same time. D and E consume B's contracts, so B
states its final table, RPC, and stamp shapes in its PR description immediately on
opening (contract-first parallelism, §2).

**WP-B · A · Server curriculum core** (PEO §4.1–4.2, §8; server contract §1–4, §6–7).
Create `player_gene_eligibility` with the `player_ladders` RLS precedent
(SELECT-only to the owning player, no write policy, service-role RPCs) and the six
RPCs in server contract §2. Replace `genomeV2ActivePool(startDynasty)` at
`session/route.ts:1163` with `genomeV2PlayableVocabulary(dynasty, facts)` in
`src/shared/game/genes.ts`, enforcing `result ⊆ genomeV2ActivePool(dynasty)`. Extend
`RunStartGenomeV2Context` and the manifest genome block with the eligibility contract
version, learning-event version, and the *inputs* used, following the
`genomeV2FtueFromPresentation` re-derive-and-compare pattern; bump
`RUN_CONTEXT_VERSION` and teach `strictV2GenePool` to parse the new block strictly.
Add the bounded monotone `learningEventsResolved` field to the run state, written by
the reducer, and resolve eligibility at settlement from the validated record — never
by scanning the compacting journal. Delete the `apexesUnlocked` signature offer
filter (`genomeV2.ts:3933-3934`) and its paired `ensureActivePool` throw
(`:1639-1643`), leaving `tierCap` untouched. Write the backfill: graduate accounts at
≥10 banked runs or Mastery ≥3, credit the rest from `player_codex` (a `splice` row
credits both parents), seed the Dynasty starter seven, and never re-onboard an
account with `total_games_played > 0`. Close the flag-off and absent-infrastructure
paths to the legacy full Dynasty pool, using the `isMissingLadderInfra` degradation
pattern and **not** `server/genome.ts`'s deliberate refusal to degrade.
Owned: `supabase/migrations/0NN_player_gene_eligibility.sql`, `src/lib/server/genome*`,
`src/shared/game/genes.ts`, `src/lib/server/runContext.ts`,
`src/lib/game/genomeCapability.ts`. Hot: `session/route.ts`, `genomeV2.ts`.
Migration: **yes** — number claimed at merge time, never at branch time.
*Acceptance: a new account receives exactly its seven; the client cannot add a locked
Gene; an in-flight run's stamped pool is unchanged by an unlock; the stamp
re-derives and a forged one is rejected; settlement promotes at most one Gene per
run from the validated record; a long run whose event compacted away still resolves;
veterans keep every historically used Gene; flag-off and a missing table both compose
the full Dynasty pool; `verify:constitution` green.*

**WP-C · A · Offer and trial mechanics** (PEO §4.4–4.5; server contract §5).
Extend `rollGenomeV2Offer` to honour a stamped trial candidate exactly as
`state.anchor.pinnedGeneId` is honoured: trial in slot one when legal, slot two drawn
ordinarily so an ordinary alternative always survives, DECLINE untouched. Implement
the guarantee as *three collected offers containing the trial*, not three runs, and
suppress rather than decrement when the trial's action is unteachable (catalog §5).
Add the pool-health guards that make PEO boundary 13 mechanical: no composed
vocabulary smaller than seven, and ≥9 by the six-bank Splice gate. Extend the
simulation harness with the trial mechanism and re-run it.
Owned: `src/shared/game/genomeV2.ts` (offer roll), `src/lib/game/genomeV2Runtime.ts`,
`src/shared/simulation/`. Hot: `genomeV2.ts` — **after WP-B merges**.
Migration: no.
*Acceptance: `assertGenomeV2OfferMatchesRoll` passes server-side with a trial active;
every trial offer preserves one ordinary candidate and DECLINE; an unteachable trial
consumes no guarantee; Ascetic, Patient, Free Play, expired and uncollected relics
consume none; `npm run simulate:starter-pools` green with the trial modelled.*

**WP-D · B · Reveal and guidance surfaces** (PEO §5; Career Spine).
Insert the curriculum entry into the Results fold at
`src/lib/game/resultsNextAction.ts` above `visit-lab`, per the §13 row-11 priority,
with the clan reveal winning a same-settlement collision. Emit the unlock as a
`runImpact` `significance: 'milestone'` so it reaches the Victory Lap beat and
`progression_moments` on the existing rails. Persist seen/dismissed state server-side
as a `player_attention_items` row with `attention_kind = 'action'` and
`destination = 'codex'` — a `'recognition'` row cannot be dismissed, because
`recognition_never_action_terminal` forbids the terminal states a **Not now** needs.
Mount the authored-but-never-mounted `OverlayHint`, extend `InfoPopover` beyond its
two chip hosts, add Workbench annotation and trial selection, and refresh and mount
the orphaned extraction prose in `src/shared/game/lexicon.ts` (its numbers are v1 and
stale for v2). In-run instruction goes **only** in the existing `eventCallout` /
`rateCallout` cockpit slots: nothing new renders between first input and run end.
Add the first-BANK recognition beat, which needs `bankedRunsBefore` on
`BuildRunImpactInput`.
Owned: `src/lib/game/resultsNextAction.ts`, `src/lib/server/runImpact.ts`,
`src/components/engagement/`, `src/components/lab/`, `src/shared/game/lexicon.ts`.
Migration: only if the attention shape needs one — coordinate with WP-B.
*Acceptance: at most one new-system recommendation per Results; Replay and Setup
never wait; **Not now** persists server-side and never in browser storage; reduced
motion, focus order, screen-reader announcement and phone-height containment hold;
`verify:cockpit-decisions` green.*

**WP-E · B+A · Clan handoff** (PEO §6; Constitution §9.2 as amended).
Make the eight-bank clan reveal the single recommended Results action routing to
`/clan`, not to Compete — the Compete nav item points at `/leaderboard`. Add the
first-contribution explanation and the exact clan-total delta on the first eligible
settlement. Update the superseded §12.2 argument in `ClanFoundingPrompt.tsx:23-30` to
record the ruling rather than deleting it, and correct its claim of two mounts.
Fold in two adjacent defects: add the missing `is_anonymous` guard to every clan
found/join path, using the `checkout/route.ts:70-78` pattern, and fix
`AccountUpgrade.tsx:118-124` to call `linkIdentity` rather than `signInWithOAuth`,
which today orphans the anonymous account it claims to save.
Owned: `src/app/api/clan/`, `src/components/clan/`, `src/components/auth/AccountUpgrade.tsx`.
Migration: yes, if the anonymous guard belongs in `found_clan`.
*Acceptance: no auto-enrolment; a clan of one is offered; **Not now** costs nothing;
an anonymous account cannot found or own a clan; an OAuth upgrade preserves the
anonymous player's progress; the first eligible contribution states entry or
replacement and the exact delta.*

**WP-F · B · Telemetry and rollout** (PEO §9; TGv2 §11; server contract §8).
Add the consent-gated instrumentation named in TGv2 §11 — eligibility prefix and
contract version, trial invitation, Show me/Not now, selection and switch, guarantee
consumption, learning-event resolution, graduation — with the QA/dev cohort filtered
out of every conclusion. Add `NEXT_PUBLIC_PLAYER_EVOLUTION_V1` to
`config/production-public-surface.json`, taking the manifest from 22 flags to 23; no
separate `production-env-validation.cjs` edit is needed because its required list
splices the manifest's flags. Add the four-shape e2e flag matrix (curriculum on/off ×
Genome v2 on/off) with no leg inferred from an omitted flag, and write the
rollout/rollback record.
Owned: `config/production-public-surface.json`, `e2e/`, `docs/ops/`.
Migration: no.
*Acceptance: no metric collected without consent; no veteran counted in the
new-account cohort; the manifest hash change is reviewed; all four e2e legs pass;
rollback to the legacy full pool is demonstrated, not asserted.*

## 7. Phases 2–5

Sequenced in Constitution §14; decompose the same way when Phase 1 gates pass.
Phase 2 (campus launch): Ascension, World Report, /contract page, lead ladder,
Founding Keeper, PWA + push, operating rhythm start. Phase 3 (commerce): Keeper,
Atelier + monthly additions, Season v2, Patron Packs, gifting + Broodmarks,
replays/ghosts. Phase 4: earned shelf, mastery trials, creator seeds, gates,
paid-UA gate. Phase 5: native apps. **Stripe stays in test mode until the §14
pre-live checklist is green — WP-0.09 is a hard prerequisite of any live key.**

## 8. What "done" means, per phase

Phase done = all WPs merged · flags flipped in staging · phase gate scenario
passes end-to-end · `verify:cockpit-*` + full pipeline green · GT-delta note
appended to the PR that flips the flag (what GROUND_TRUTH sections are now stale)
· owner sign-off recorded. Then, and only then, the next phase's branches open.

## 9. Escalation shape

One batched message to the owner: the fork, the two coherent options, your
recommendation, what blocks vs. what continues meanwhile. The Constitution's §17
carries the [H] dials — implementers never retune them silently; propose the
change with the test data that motivates it.

## 10. First wave — session assignments

Four parallel sessions, each in its **own checkout** (separate clone or
`git worktree add ../supasnake-<agent> main`): **A1** (Opus): WP-0.00 →
WP-0.01 → then WP-0.02 → WP-0.04. **A2** (Opus): WP-0.05 → WP-0.09 → WP-0.06.
**B1** (GPT): WP-0.08 → WP-0.07. **B2** (GPT): WP-0.10 → cross-review duty.
File-disjoint by construction; merge order: 0.00 first (PR template), 0.01 before
any other migration-bearing PR, rest as ready. The exact kickoff prompts for this
wave were issued by the owner from the Constitution session on 25 July 2026 and
follow the §4 briefing + per-WP assignment pattern; reuse that pattern for every
subsequent wave.

**Unattended alternative:** `/execute-constitution`
(`.claude/commands/execute-constitution.md`) runs the whole buildable backlog —
Phase 0 → Phase 2 code artifacts — as one orchestrator spawning a fresh subagent
per WP, everything on the `constitution/build` integration branch, nothing merged
to main, nothing touching production, PROVISIONAL escalations queued in
`docs/ops/CONSTITUTION_BUILD_LOG.md` for the owner's return.
