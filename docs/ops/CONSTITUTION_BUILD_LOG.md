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

**Phase 2 code artifacts shipped to production on 26 July 2026** (`c6dc9e2`, deploy
run `30204056845`, migration 052 applied, health green, all surfaces behind flags
defaulted off). **Phase 1 shipped 26 July 2026** (`2dbddd7`, deploy run
`30194424181`, migrations 046–051 applied, health green, all surfaces behind flags
defaulted off). **Phase 0 shipped 25 July 2026** (`fd040af` + `be33b4b`, deploy run
`30172084085`, migrations 039–045 applied, `/api/health` healthy). Two owner-only
steps are done: `NEXT_PUBLIC_GROWTH_SURFACES_V1` is flipped and verified in
production, and cohort flagging is deliberately partial until launch (see below).
Phase 1 is in progress. See "Phase 0 release" below.

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
| 0.01 Energy envelope | A | **merged** | `wp/0-01-energy-envelope` |
| 0.02 Multiplier stack removal | A | **merged** | `wp/0-02-multiplier-removal` |
| 0.03 Faucet & dead-config purge | A | **merged** | `wp/0-03-faucet-purge` |
| 0.04 Achievements → Records | A | **merged** | `wp/0-04-achievements-to-records` |
| 0.05 Leaderboard integrity | A | **merged** | `wp/0-05-leaderboard-integrity` |
| 0.06 Session lifecycle & cohorts | A | **merged** | `wp/0-06-session-lifecycle` |
| 0.07 Aim universalization | B | **merged** | `wp/0-07-aim-universalization` |
| 0.08 Growth hygiene bundle | B | **merged** | `wp/0-08-growth-hygiene` |
| 0.09 Commerce removal & premium truth | A | **merged** | `wp/0-09-commerce-removal` |
| 0.10 `verify:constitution` v1 | B | **merged** | `wp/0-10-verify-constitution` |

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

#### WP-0.03 · Faucet & dead-config purge · **merged** (migration 044)

One migration stating one rule and applying it everywhere: **delete mechanisms and
pure configuration; preserve player-owned rows unless a row is provably redundant
with a surviving audit record.** One transaction, two `ON COMMIT DROP` snapshots
taken before anything is destroyed, and **eight `RAISE EXCEPTION` preservation
guards** — no DNA moved, frozen stock unwritten, no player row lost, audit grown
only by the backfill, contract and season claim history intact, no orphaned board
row, and two refusals to treat a *live* purse as dead config.

Removed: `/api/daily-rewards` and `claim_daily_reward`; `claim_clan_energy_bonus`
(F-14, an orphan energy faucet with no caller); the clan bonus panel, its dead
Claim button and both copy lines promising "+1 energy every 6 hours"; six inactive
contract rows; contract `reward_energy` (with the three contract RPCs re-declared
without it); the battle-pass DNA/energy reward types; `CLAN_LIMITS.minMembers: 20`;
and the entire GT §10 dead-config table, walked item by item in the PR.

**`daily_logins` is the one player-scoped table dropped**, and only after the
migration *proves* every claim has an `economy_transactions` receipt — backfilling
the missing ones first, labelled `reconstructed: true` rather than passed off as
historical. It aborts rather than drop a table that is the only record of a grant.
That is also the retroactive F-15 fix.

**Ruling on `players.energy` / `max_energy` / `energy_regen_at`: they stay**,
re-commented from *DEPRECATED* to *FROZEN* — "deprecated invites removal, frozen
states a decision." The reasoning is sound and I accept it: `DROP COLUMN` is
exactly the irreversible confiscation R6 forbids, against the only per-player
record of a resource that was purchasable while the SKUs existed. Dropping them
would additionally have required rewriting five `SECURITY DEFINER` functions
including `handle_new_user`, the **signup trigger**, with no database available to
test against — a signup outage wagered against tidiness. The *mechanism* is
entirely gone: all five faucets migration 039 named are removed, and
`bootstrap_player`/`handle_new_user` no longer seed the columns. Zero writers, zero
readers. `player_daily_state` and `clan_members.last_clan_bonus_at` kept on the
same rule. F-16 closed: `bootstrap_player` no longer returns `energy`/`maxEnergy`.

Also deleted `src/shared/config/game.ts.template`, an unreferenced sibling carrying
a *staler* copy of four GT §10 entries — removing only the live file would have
left the dead numbers one directory listing away. Good instinct.

**Orchestrator audit:** tsc clean · lint clean · **3207 tests** ·
`verify:constitution` PASS. The subagent honestly reported one failure it could not
reproduce on a loaded machine and declined to omit it; I ran the full suite **three
times** and got 3207/3207 each time, so it is recorded as load-induced and
unconfirmed rather than dismissed. *Orchestrator fixup:* three stale "migration 042"
comments in `contracts/route.ts` corrected to 043 after the renumber.

#### WP-0.02 · Multiplier stack removal · **merged** (migration 041)

**Settlement before:** `finalDna = floor(floor(rawFold × outcome) × streakTier ×
setBonus × clanDuel) × harvestFactor`, with `streakTier ∈ {1, 1.05, 1.10, 1.20,
1.35}`, `setBonus = 1 + 0.10 × completedDynasties`, `clanDuel ∈ {1, 1.05}`.

**Settlement after:** `yieldDna = validation.adjustedDna` (the validator's exact
recompute) then `finalDna = applyHarvestFactor(yieldDna, chargeState)`. **Raw fold
× outcome multiplier, and nothing else. No account state reaches the number.**

Deleted `dnaMultipliers.ts` and every caller: the session route's multiplier block,
the `dnaMultiplier` response field, the `dna_multiplier` ledger metadata,
`ENGAGEMENT_CONFIG.streaks.tiers`, the `/api/streaks` `multiplier`/`energyBonus`
fields, and four UI surfaces that advertised a factor.

**Migration 041** — one transaction, snapshot taken before any write, explicit
down-note:
- **`DROP FUNCTION clan_duel_bonus(UUID)` — this closes the live exploit the owner
  asked about (F-6b).** It resolved a clan-wide ×1.05 DNA week from *current*
  `clan_members`, so a player could leave and join whichever clan won last week and
  harvest a bonus they never contributed to, repeatable weekly. R8 forbids
  intra-clan reward mathematics outright.
- `DROP TABLE streak_bonus_tiers` (a catalogue, not player data) and
  `ALTER TABLE player_streaks DROP COLUMN streak_multiplier` (a derived cache) — so
  no factor has a column to return through. The meaningful value is banked first.
- Longest streak banked into the `unbroken` Legacy Record with `GREATEST()` on
  value, tier **and** `legacy_score`, deliberately **not** delegating to
  `refresh_player_records`, which still carries the F-6 downward-write defect.
- **Preservation asserted inside the migration**: a pre-write temp snapshot, re-read
  in a `DO` block that `RAISE EXCEPTION`s — aborting the transaction — if any record
  moved downward, if a player with a streak lost their record, or if any banked
  value fell below the streak it came from.
- **`REVOKE EXECUTE ON record_daily_play FROM PUBLIC/anon/authenticated`** — migration
  009 left a `SECURITY DEFINER` function callable by any authenticated session
  through PostgREST. An R11 hole found and closed in passing.
- Take-streak columns for WP-1.04, **schema only**, with constraints that make the
  forbidden state unrepresentable rather than trusting the later WP to honour R5:
  `CHECK ((take_last_claim_date IS NULL) = (take_streak_days = 0))` means a player
  who has ever collected a Take can never hold zero days, so cooling can only walk
  the ladder down one rung; `CHECK (take_streak_days >= (ARRAY[0,3,7,14,30])[take_tier+1])`
  forbids an unearned tier; `CHECK (take_longest_streak >= take_streak_days)` keeps
  the high-water mark permanent. Encoding R5 in the schema is better than the WP
  asked for.

*Deliberately not hidden:* `record_daily_play` was re-declared carrying F-10's
reset-to-1 **unchanged**, because that is WP-1.04's fix and burying it inside this
migration would have concealed it.

**Orchestrator audit:** tsc clean · lint clean · **247 suites / 3007 tests** ·
`verify:constitution` PASS. Migration renumbered **040 → 041** at merge (040 went
to WP-0.08); the renumber required updating the shape test's filename reference and
three `Migration 040` string assertions, which I caught and fixed before merging.

#### WP-0.07 · Aim universalization · **merged** (no migration)

All four aim systems are settings from run 1. `src/lib/game/aimSystems.ts` no
longer exports `isUnlocked`, `unlockHint`, `isAimSystemUnlocked` or
`getUnlockedAimSystems`; `AimSystemDef` is now `{id, name, description}`, and a test
scans the module's own source to keep progression tokens out of it. Server-side,
`buildAimStats` is deleted and the `403 "Aim system locked"` branch is gone — the
only rejection left is `400` on a malformed id.

**Nothing was deleted to achieve this (R6).** There was never an "unlocked" table:
unlock state was *derived* from `players.high_score / total_games_played /
breeds_completed`, all still intact. The three retired predicates moved **verbatim**
into `src/lib/chronicle/aimTrivia.ts` and now render as a Chronicle **Trivia**
section listing only the milestones a player actually cleared — no tier, no points,
no cosmetic, nothing claimable, and no section at all for a career with no
footnotes. That is the right shape: a footnote, not a Record, earning no Legacy
Score.

**Orchestrator audit:** tsc clean · lint clean · **249 suites / 3025 tests** ·
`verify:constitution` PASS · all three `verify:cockpit-*` suites pass (prototype
8 viewports × 4 states, 4 WebGL profiles, 22 frozen-state/legal-surface checks) —
the subagent started a dev server for these and shut it down.

The acceptance tests are unusually good: one asserts a **fresh zero-progression
account and a veteran render identically**, and another pins the component's prop
surface to exactly `['selected', 'onSelect']`, so progression cannot be
reintroduced through a prop later. The tap law is asserted structurally — flat
always-visible `radiogroup`, exactly one preselected option, no expander or dialog
trigger — so open → LAUNCH → START → board stays at three taps.

*Local decision accepted:* trivia deliberately reads `players.high_score`, which
WP-0.05 avoided for the leaderboard because flagged runs poison it (F-1). Justified
here: trivia grants nothing, so the reason the board avoids that column does not
apply, and reproducing the retired predicate exactly is the point.

#### WP-0.08 · Growth hygiene bundle · **merged** (migration 040)

All nine items complete except §11.4's "one clip" on the landing page — the repo
has no video asset and producing one is not a code work package. Recorded for the
owner rather than faked.

- **Share-card URL fix.** The URL is set **and** repeated as the last line of
  `text`, because platforms drop the `url` field when `files` is present — which is
  precisely the failure mode that produced the original defect. Unit-tested.
- **Waitlist double opt-in is enforced in the schema**, not in the route:
  bidirectional CHECK constraints tie `status='confirmed'` to `confirmed_at` in
  both directions, so a half-written row can never be mailed. Tokens are stored as
  SHA-256 digests only; RLS on; `REVOKE ALL … FROM PUBLIC, anon, authenticated`
  with service-role-only grants.
- **Confirmation is a POST behind a button, not a GET link** — mail scanners follow
  GET links, and a subscription a machine confirmed is not a subscription. Good
  call, and not something the WP asked for.
- Icons, OG/Twitter images, `robots.ts`, `sitemap.ts`, metadata, `/play` +
  `VideoGame` JSON-LD, UTM/referrer capture, and the §11.5 funnel events all ship.
  Four funnel stages have a shipped mechanism; the other four are live parameters
  of the same API awaiting the WPs that create those stages.
- **Flag:** one flag, `NEXT_PUBLIC_GROWTH_SURFACES_V1`, **default off**, gating the
  pitch, `/play` and the waitlist. The build was run in **both** flag states —
  flag-on emits `/play`, `/dispatch/*`, `/api/growth/*` and lists `/play` in the
  sitemap; flag-off 404s them and the sitemap omits `/play`. Metadata, icons, OG
  images, robots/sitemap, the share fix and the taxonomy ship unflagged, none being
  a new player surface.
- **The landing pitch cannot cost a tap.** It renders for logged-out visitors only,
  as a sibling *after* the 100dvh chamber, and a test asserts the DOM ordering and
  that the only button below the fold is the waitlist submit. §5's tap law is
  protected structurally rather than by care.

**Orchestrator audit:** tsc clean · lint clean · **261 suites / 3089 tests** ·
R7 verified — the dispatch email carries no price, offer, badge or upsell (the only
such words in the module are a comment saying there are none) and sets
`List-Unsubscribe`. Migration renumbered **039 → 040** at merge, since WP-0.01 took
039; no reference to the old filename existed. `verify:constitution` could not run
on the branch itself (it was cut before WP-0.10 merged) — it passes on the
integration branch after the merge, over 681 files.

*Accepted local decision worth the owner's eye:* **attribution is gated on
`marketing` consent.** The existing banner describes that category as "track where
players come from", and persisting attribution *is* that processing. The cost is
real — attribution coverage drops to consenting visitors and everyone else counts
as `direct` — but it is the lawful reading. Privacy §3.6a/§3.9 and a new
cookie-policy Marketing section were written to match the code, including declining
to promise a retention-expiry job that does not exist.

*Touch on a protected surface, reviewed and accepted:* the **Activate** funnel event
fires from `PortalChoiceOverlay`'s BANK handler, which sits inside §5's
"declared correct as built" in-run presentation. It adds no render, no sound and no
gate, and the run's own decision executes first and unconditionally, so **Rule 1
holds** — the rule forbids new things *reaching the player*, and telemetry does not.
The cleaner hook, `game/page.tsx`, was a hot file held by WP-0.07. Recorded so the
next WP touching that file can move it if preferred.

#### WP-0.01 · Energy envelope · **merged** (migration 039)

Energy stops being a **stock** and becomes a **derived day-scoped allotment**. Two
columns — `players.charges_day` (a UTC date) and `players.charges_used` (a counter)
— and one rule: `remaining = chargesPerDay − (charges_day == today ? charges_used :
0)`. **A stale date *is* the refill.** No cron, no timer, no drip, nothing that can
fail to run and leave a player short.

That shape is why the acceptance criterion is structurally true rather than
audited: **there is no balance to credit, so "grant a charge" is not an operation
the schema supports.** §10.4 is enforced by the data model, not by reviewing eight
faucets. The old model had eight faucets and two independent clocks writing one
integer (GT §9.1–9.2); both defects die with the system rather than being patched.

- **No run-start gate anywhere** — the server 400, both divergent client gates, the
  `ModeToggle` disabling of EARN/ANOMALY, the silent auto-demotion to Free Play, and
  the launch `retry-as-free` path are all gone. An empty day changes what a run
  *harvests*, never what a player may do.
- **Lean settlement.** `Yield = adjustedDna × accountMultiplier` is recorded
  full-strength on `game_sessions.yield_dna`; credited DNA is `Yield ×
  chargeFactor`. Charge state is stamped on the session row **at start** from server
  facts, so a replayed `end` cannot re-decide it, and a pre-migration row settles
  full-strength. Mastery XP already ran off the full fold — untouched, per §8.6.
- **"Lean, never zero" is enforced in code:** `applyHarvestFactor` floors to a
  minimum of 1 on any positive Yield. Naive flooring pays 0 for any Yield under 4.
- **Exemptions are closed by default.** They require a server-resolved id
  (`signalObjectiveRunId` / `serpentWeekId`), so a client sending `mode: 'serpent'`
  gets an ordinary charged run. WP-1.01/1.03 populate the facts.
- **Failure directions favour the player:** if the ledger RPC errors or migration
  039 has not been applied, the run settles **charged** (full), never lean. A server
  fault must not quietly cut a harvest to a quarter.
- Dials match §8.6 exactly: 6 charges/day, 0.25 lean factor, meter hidden until 4
  banked runs — all marked `[H]` in `GAME_CONFIG`.
- **Deleted:** `energyRegen.ts`, the `claim-stipend` route, the offline energy
  restore, `stipendEnergyPerDay`, `claimStipend`, and `claim_premium_stipend`.

**Orchestrator audit:** tsc clean · lint clean · **246 suites / 2992 tests** ·
`verify:constitution` PASS, with known findings dropping **41 → 34** as a
cross-check between this WP and WP-0.10's gates. Migration 039 adds columns only
and writes no player row; `consume_run_charge` is `SECURITY DEFINER` with pinned
`search_path`, revoked from `PUBLIC`/`anon`/`authenticated`, granted only to
`service_role`; explicit down-note present. R11 verified. I independently confirmed
no commerce or premium module can reach the charge ledger — `charges_used` /
`consume_run_charge` appear in exactly one module plus its tests and the migration.

*On the rewritten tests:* 18 suites asserted the behaviour this WP removes. I
spot-checked the largest rewrite (`ModeToggle.test.tsx`) and the new assertions are
**stricter** than the ones they replace — they assert the copy must *not* say "out
of energy", "wait", or "cannot", which the old tests never checked. Not a weakening.

*Retained deliberately:* `players.energy`/`max_energy`/`energy_regen_at` are marked
deprecated but neither dropped nor zeroed — they record something players paid for
(R6), and dropping them would force rewriting five RPCs owned by WP-0.03/0.09.
`premium_stipend_claims` is kept for the same reason; only the function is dropped.

**Cross-boundary edit, accepted:** this WP removed the **Energy Packs storefront
section** and the energy line from two bundle descriptions in `src/lib/stripe/products.ts`,
which is WP-0.09's file. Its change made those SKUs undeliverable, and a listing
charging €4.99 for a good that no longer exists is a false claim. I agree with the
call — a work-package boundary is not worth shipping a false price. Stripe is in
test mode and nothing settled. **WP-0.09 has been briefed that `products.ts` is
already partly cleared and `rewards.energy` data is left for it to delete.**

#### WP-0.10 · `verify:constitution` v1 · **merged**

`scripts/verify-constitution.mjs` (Node ESM, no new dependencies), the
`verify:constitution` npm task, and a four-line step in the Lint workflow. Five
gates over 638 files.

1. **`score-independence` (R2)** — static, four sub-checks: every write to the
   score accumulator in both folds must be exactly
   `score += Math.round(FOOD_BASE_SCORE * ruleset.scoreMultiplier(n))`; the
   `scoreMultiplier(n: number): number` signature must stay exact (a widened
   signature is the realistic way build state would arrive); the engine mirror in
   `SnakeGameLogic.ts` may only do `+= scoreValue`; and the runtime proofs in
   `rulesets.genome.test.ts` / `rulesets.traits.test.ts` must still exist —
   deleting them is itself a violation.
2. **`owned-row-downward` (R6)** — deletes and decrementing updates against
   player-owned tables, in both TypeScript and SQL, including
   `ON CONFLICT DO UPDATE` on a monotonic column with no `GREATEST()`. Catalogue
   tables (`*_definitions`, `*_tiers`, `training_presets`) are excluded.
3. **`breeding-random` — ships DISARMED**, because WP-1.05 is what removes the RNG
   it would flag (3 live findings today: `030_genome_lineage.sql:278,342` and
   `:543`). It resolves each Postgres function's **live definition**, highest
   migration wins, so WP-1.05 can retire the RNG with a new migration without
   rewriting applied history. **Arming switch:** set
   `GATE_BREEDING_RANDOM_ARMED = true` at the top of the script — do it in the
   WP-1.05 PR once `--gate breeding-random` reports zero.
4. **`energy-commerce` (§10.4)** — written against the *rule*, not the file layout:
   an energy-shaped identifier taking a non-zero value within ±12 lines of a
   commercial token. WP-0.01/0.09 deleting those files leaves the gate green
   rather than broken.
5. **`todo-fixme`** — scoped to source extensions under `src/ supabase/ scripts/
   e2e/`, so the checklist and PR template that legitimately name the markers are
   untouched. The marker literals are built by concatenation so the gate cannot
   fire on its own source. *(This closes F-0 from WP-0.00.)*

Exemptions are deliberately awkward: inline `// constitution-allow: <gate>
<reason>` with a reason of at least 12 characters, plus a `BASELINE` array of
today's real violations, each naming the WP that retires it and each carrying a
`max` count — **debt may shrink, never grow.** Migrations 001–038 are
pre-Constitution applied history: reported, non-fatal; 039+ is fully gated.

Notably, the subagent's own seeding found three real defects in its gates and
fixed them: a missing `\b` that let every snake_case commerce identifier escape,
a false positive on TypeScript type annotations, and whole-file baseline entries
that hid new violations.

**Orchestrator audit:** scope clean (3 files, no seed artifacts left behind) ·
tsc clean · lint clean · 245 suites / 2944 tests · gates pass on the merged
integration branch (638 files). I re-seeded three violations independently rather
than trusting the report — a genome read in the score fold (`rulesets.ts:294`), a
`.from('player_cosmetics').delete()` in a new route, and a `TODO` marker — **all
three failed the build**, and the tree returned to PASS on revert.

*Orchestrator fixup applied (1 line, `CLAUDE.md`):* the project rule cited
`rulesets.ts:261-267` as the score fold. That range is docblock prose, and there
are **two** folds, not one — the real accumulators are at `:312`
(`computeRunTotals`) and `:499` (`computeGenomeRunTotals`). Corrected, with a
pointer to the gate that now enforces it.

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

**P-2 · The R2 gate does not statically cover `gameValidator.ts`** (WP-0.10). The
gate covers both folds in `rulesets.ts` and the engine mirror. But
`sanitizeCosmicClaim` in `src/lib/server/gameValidator.ts` is the one server path
that can raise a score *above* the fold (the clamped COSMIC combo), and it is
covered by unit tests only, not by the static gate. *Recommendation:* extend the
gate to assert the clamp's bound. **Still open** — WP-0.01 was already in flight
when this was raised, so it did not pick it up; re-routed to WP-0.06, the next
Track A package that touches server validation. Accepting test-only coverage in the
meantime is defensible; the clamp is bounded-trust and server-side.

**P-5 · Free Play still exists, and §8.6 says it should not** (WP-0.01). §8.6 lists
"Free Play as a second-class mode" among what stays dead, because the whole point of
the envelope is that there is no second-class run. But §12.2 caps game modes at
**4** and names them Run, Signal, Serpent, **Training** — and the shipped product has
*both* Free Play and the Training Lab. After WP-0.01, Free Play consumes no charge
and is stamped `exempt`, so it is no longer a scarcity escape hatch; it is now
simply a second rewardless practice mode sitting next to Training.

- *Option A:* collapse Free Play into the Training Lab. One rewardless practice
  mode, matching §12.2's named four exactly, and §8.6's "Free Play stays dead" is
  satisfied literally.
- *Option B:* keep Free Play as the zero-friction "just play" entry and treat
  Training as the structured-drills surface, accepting that §12.2's mode list names
  Training but not Free Play.

*Recommendation: Option A*, collapsing Free Play into Training — it is the only
reading under which the mode cap and §8.6 are both literally true, and the Training
Lab's rewardless contract (§5, protected) already covers the use case. **This needs
an owner ruling**; it is a §12.2 cap question, so it was not decided in a branch.
Nothing is blocked meanwhile — Free Play is exempt and harmless as it stands.

**P-3 · Baseline entries protect by count, not identity** (WP-0.10). A whole-file
baseline entry with `max: 6` blocks a seventh violation but would accept a
*different* violation replacing one of the six. Every such file is slated for
deletion by WP-0.01/0.09, so the window is short. *Recommendation:* accept, and
delete the baseline entries as those WPs land rather than hardening the mechanism.

**P-6 · `/api/player/claim-offline` is still a live DNA faucet, and no work package
owns it** (found by WP-0.03). WP-0.01 stripped its energy restore, but the passive
DNA grant survives: **1 DNA per snake per hour, capped at 24h, claimed on a
wall-clock timer.** §12.2 says the Daily Take's collect (WP-1.04) is to be the
game's **only** claim, and §8.6's whole argument is that the day's shape comes from
charges, not from a second timer running while the player is away. This is the last
faucet standing.

- *Option A:* delete it in Phase 1 alongside WP-1.04, so the Daily Take is
  literally the only claim, exactly as §12.2 says.
- *Option B:* keep it as a deliberate returning-player courtesy, and amend §12.2 to
  name two claims.

*Recommendation: Option A.* The Daily Take already does this job better — it is the
designed return ritual, it has a streak with one-tier cooling, and it pays on a run
rather than on absence. Paying a player for being away is the shape §8.6 was written
to remove. **Not decided in a branch** — it is a §12.2 cap question and needs the
owner. Meanwhile WP-0.03 pinned it into the "no second claim endpoint" test as the
single named exception, so **the list can only shrink**: nothing new can join it
while it waits for a ruling. Nothing is blocked.

**P-4 · The energy-commerce gate approximates reachability** (WP-0.10). A ±12-line
proximity window stands in for a call graph, so a grant separated from its
purchase caller by an indirection is not caught. *Recommendation:* accept — the
gate is a backstop, and R3/R4 remain reviewer reads on the checklist.

---

## Found, not fixed — routed to the work package that owns it

| # | Finding | Routed to |
|---|---|---|
| F-1 | `session/route.ts` writes `high_score: Math.max(current, adjustedScore)` with **no `validation.valid` gate**, so a flagged run permanently poisons `players.high_score`. Harmless to the board after WP-0.05, but that column is still read by other surfaces. | WP-0.06 (owns session lifecycle) |
| F-2 | `useLeaderboardRealtime` broadcasts every session insert over a score threshold with no eligibility filter — a free-play or flagged run can still fire a "New high score!" toast for a run that will never rank. | WP-1.06 (Results/toast consolidation) |
| F-3 | GT §9.6 stale sessions: no expiry sweep exists, ~30% of session rows are open. Eligibility now makes them harmless to the board, but funnel and duration analytics stay unreliable. | WP-0.06 (its stated goal) |
| F-4 | `src/lib/game/aimSystems.ts`: Pathline/Gridlock/Firefly are still progression-gated, one of them on *breeding*. Constitution §6.1 and §15 overturn 10 require them universal from run 1. | WP-0.07 (its stated goal) |
| F-5 | The project has **no `@types/jest`**, so `npx tsc --noEmit` never typechecks any `*.test.ts`. Test files are verified only by running them. A type error in a test is invisible to the type gate. | WP-0.10 / owner |
| **F-6** | **The strongest R6 defect in the repo.** `refresh_player_records` (`023_records_chronicle.sql:507`) does `ON CONFLICT DO UPDATE SET value = EXCLUDED.value, tier = EXCLUDED.tier` with **no `GREATEST()`**. It recomputes all 21 records from aggregates, so any *shrinking* source writes `player_records.value`/`.tier` — and `players.legacy_score` — **downward**. Detected and baselined by the new R6 gate. **See F-6a for the live shrink path and its exploit.** | WP-0.04 (owns Records) |
| **F-6a** | **`crowned`'s bye path is wrong in both directions** (owner question, 25 July; verified in code). The normal path is correct: it reads the **locked roster snapshot** from the championship semifinal duel (`roster_a`/`roster_b`), so leaving the clan afterwards cannot lower it. But the **bye path** (`d.id IS NULL` — a championship with no duel, `023:465-469`) falls back to `EXISTS (SELECT 1 FROM clan_members …)`, i.e. *current* membership. Consequences: (i) leaving lowers a permanent record (the F-6 shrink); (ii) **joining a bye-champion clan grants the record retroactively**, and the tier badges are `ON CONFLICT DO NOTHING` inserts into `player_cosmetics` that are **never revoked** — so a player can join, collect permanent badges, and leave. A repeatable permanent-cosmetic farm. **Fix: snapshot membership at settlement for the bye path too, exactly as the duel path already does — one change closes both directions.** Note `crowned`/`legacy_score` feed **no** computed number (display and identity only, per `player_identity_view`), so this is record and identity integrity, not an economy exploit. | WP-0.04 |
| **F-6b** | **A farmable clan bonus on the DNA multiplier exists today** (owner question, 25 July). `clan_duel_bonus` (`011_clan_duels.sql:399`) returns **×1.05 clan-wide DNA** for the week after the player's clan won its weekly duel, resolved from **current** membership (`SELECT clan_id FROM clan_members WHERE player_id = v_user_id`). It therefore reverts on leaving — the owner's stated requirement — but is farmable in the inverse direction: a player can leave and join whichever clan won last week and collect the +5% **without having contributed to that win**, repeating weekly. **No patch needed: WP-0.02 deletes the whole multiplier stack, and R8 ("no intra-clan reward mathematics") forbids its return.** Recorded so the deletion is understood as closing a live exploit, not just simplifying math. | WP-0.02 (already scoped) |
| F-7 | `clan/route.ts:476` hard-deletes `clan_members` on leave, destroying `joined_at` — i.e. clan tenure, which R6 names as permanent. | WP-1.02 |
| F-8 | `009_dynasty_unification.sql:147` has an unguarded `DELETE FROM collected_snakes WHERE snake_variant_id IS NULL` inside a DDL migration. Applied history — recorded, not editable. | none (historical) |
| F-9 | `EnergyRefillSchema` (`src/lib/validation/schemas.ts:157`) types energy bought by `'purchase'` **or `'ad'`**. Zero callers, but committed — §10.4 (never sold) and §10.6 (dark patterns) material. | WP-0.09 |
| F-10 | `record_daily_play` (`009:347`) resets a broken streak **to 1**. Rule 5 allows the loss of exactly one tier, never a reset to zero. | WP-1.04 (owns Take streak) |
| F-11 | Unchecked Supabase errors and missing energy audit rows in `src/app/api/achievements/route.ts:184-192` and `src/app/api/player/claim-offline/route.ts:107-121` (R11). WP-0.01 deletes the latter outright. | WP-0.04 / WP-0.01 |
| F-12 | `SnakeGameLogic.ts:2210-2226` calls `Math.random()` directly, bypassing the injected `this.rng` — breaks replay determinism, which challenge links depend on. | WP-1.08 (challenge links) |
| F-13 | ~~Flaky test: `SnakeGameLogic.traits.test.ts` "Iron Scales", ~1 run in 20.~~ **FIXED by the orchestrator** during integration verification — it failed a full-suite run on the integration branch, and a 1-in-20 flake would have blocked CI and therefore the Phase 0 release. `start()` spawns food at a random cell; on the 10×10 grid it sometimes landed in the head's marching row, so the snake ate on the way to the wall and the length-preservation assertion failed. The march never changes `z`, so parking the food on another row makes it deterministic. **0 failures in 40 consecutive runs** (≈2 expected before). | closed |
| F-17 | **Most API routes check Supabase errors with `console.error` only and never report to Sentry**, contrary to CLAUDE.md's project rule — only 4 modules import Sentry at all. WP-0.05, 0.01 and 0.08's new routes do report; the legacy surface is a standing R11 gap wider than any single WP. | owner — needs its own WP |
| F-18 | `AnalyticsEvents` still declares `AD_WATCHED`, `AD_SKIPPED`, `COINS_EARNED`, `COINS_SPENT`, `ENERGY_PURCHASED` — dead config contradicting the no-ads lock (§10.6) and the one-currency cap (§12.2). | WP-0.09 / GT §10 |
| F-19 | `src/app/auth/callback/route.ts` exchanges the code with the **anon** client and does not write the session to cookies; the browser client re-reads it. Fragile. | owner |
| F-20 | Dead weight in the repo: `assets/OG_SNAKE_base.png` and `styleguide/assets/OG_SNAKE_base.png` are 2.9 MB each at 2048×2048 and referenced nowhere; ~~`public/textures/minimalistic_background_texture_of_space_1.png` is 2.1 MB and will hurt any Lighthouse performance score~~. **The served half is FIXED (LF-D):** all three delivered textures are now WebP derived from the authored plates, 2,870,581 → 414,698 bytes (−85.6%), the 2.1 MB backdrop among them at −91.3% with its pixels and crop untouched. The repo-weight half stands: the unreferenced `OG_SNAKE_base.png` pair, `public/brand/mascot.png` (391 KB, referenced by nothing), and ~71 MB of duplicated plates under `assets/`, `assets/New/` and `styleguide/assets/` are still committed. None of it is ever requested by a client, so it is a clone/build-context cost, not a player cost. | owner — repo weight only |
| F-21 | Waitlist rows are not account-linked, so `delete-account` cannot reach them. The privacy policy names the contact address as the erasure path, which is lawful but manual. A real erasure hook would be better. | owner |
| F-22 | `CONSENT_KEY = 'cookie-consent'` is now duplicated across three modules (pre-existing in two). One shared constant would be better. | any WP touching consent |
| F-23 | `src/app/api/player/route.ts` GET discards `error` on the create-path re-read (~line 132), and `createError`/`settingsInsertError` are console-logged without Sentry. A specific instance of F-17. | see F-17 |
| F-24 | `AimSystemPanel` and `game/page.tsx` use bare `.then(res => res.json())` with no `res.ok` check, so a 500 silently yields `undefined` fields rather than an error. | WP-1.06 (owns those surfaces) |

## GROUND_TRUTH deltas — sections made stale by this build

`docs/GROUND_TRUTH.md` is a frozen baseline at the `pre-constitution` tag and is
deliberately **not** edited as work packages land (CLAUDE.md: code outranks it).
This is the running list of what it now describes wrongly, for the owner's
GT-refresh after the phase gate.

| GT section | Made stale by | Now |
|---|---|---|
| §3.1 multiplier stack | WP-0.02 | settled payout is raw fold × outcome multiplier only; `clan_duel_bonus` dropped |
| §3.3, §9.1, §9.2 energy, dual clocks, destruction | WP-0.01 | Energy is a derived day-scoped allotment; one refill authority; no stock to destroy |
| §7, §10 commerce and dead config | WP-0.09 + WP-0.03 | catalogue empty; `grant_purchase_rewards` dropped; premium is billing plumbing only; the GT §10 dead-config table is grep-clean |
| §8 growth surfaces | WP-0.08 | share URL fixed; icons, OG, robots, sitemap, `/play`, waitlist and funnel events ship |
| §9.3 leaderboard | WP-0.05 | eligibility enforced; brackets deleted; `myRank` join fixed |
| §9.4 aim gating | WP-0.07 | all four aim systems are settings from run 1; unlock predicates are Chronicle trivia |
| §9.5 achievements | WP-0.04 | mechanism retired into Legacy Records; `refresh_player_records` now monotonic |
| §9.7, §9.8 clan bonus, faucets | WP-0.03 | clan energy bonus and its dead button gone; `daily_logins` dropped after receipt proof |
| F-14 | `claim_clan_energy_bonus` (migration 007) is an orphan RPC with no caller in `src/`, and its `WHERE user_id = p_player_id` looks mismatched against every other RPC's `players.id` convention. | WP-0.03 |
| F-15 | Three energy grant paths bypassed the `economy_transactions` audit entirely (offline claim, achievements, clan bonus), and `achievements/route.ts` does a read-modify-write with **no row lock**. | WP-0.03 / WP-0.04 |
| F-16 | `/api/player/bootstrap` (migration 037) still returns `energy`/`maxEnergy` in its JSON. Harmless extra fields — the TypeScript type no longer declares them — but the shape is now a lie. | WP-0.03 |

## Phase 2 code artifacts — **SHIPPED to production, 26 July 2026**

| Step | Result |
|---|---|
| PR #9 `constitution/build` → `main` | 4/4 green (e2e 8m24s against a real stack), squash-merged as `c6dc9e2` |
| **Deploy to Production** (`payments_mode=test`) | run `30204056845` — **success**, both jobs |
| Migration applied | **052_push_subscriptions** |
| `/api/health` | `healthy`, database `healthy` (356 ms) |
| `/`, `/game`, `/leaderboard`, `/clan`, `/serpent`, `/play` | all 200 |
| `/contract`, `/manifest.webmanifest` | **404 — correct**, their flags are off |

**Shipped:** Ascension (§6.1, the Signal's monthly aggregation *view*), the World
Report (§7.5, "return without debt"), PWA manifest + install offer + push plumbing
(migration 052), and the `/contract` manifesto page + handle-claim lead ladder
(§3, §11.7).

**Flags, all default off:** `NEXT_PUBLIC_ASCENSION_V1`,
`NEXT_PUBLIC_WORLD_REPORT_V1`, `NEXT_PUBLIC_PWA_V1`,
`NEXT_PUBLIC_PLAYER_CONTRACT_V1`, `NEXT_PUBLIC_LEAD_LADDER_V1`.

**Excluded because they need a human:** campus seeding (§9.6) and the Founding
Keeper SKU (§10.2) — the latter is Stripe work, untouchable per the envelope.

### Two design decisions worth keeping

**The push two-trigger cap is enforced by the type system**, not by review:
`PushTriggerId` is `keyof typeof PUSH_TRIGGERS`, so adding a third trigger is a
compile error. §12.4 names push volume as a forbidden retention response; this makes
that structural.

**The service worker's notification text lives in TypeScript, not `public/`** —
deliberately, because `public/` is invisible to jest and lint, and the worker is the
last place a badge or commercial string could be added without anything failing. As a
string, the R5 and R7 sweeps can read it.

---

## Phase 1 release — **SHIPPED to production, 26 July 2026**

| Step | Result |
|---|---|
| PR #8 `constitution/build` → `main` | 4/4 green, squash-merged as `2dbddd7` |
| **Deploy to Production** (`payments_mode=test`) | run `30194424181` — **success**, both jobs |
| Migrations applied | **046–051**, all six, exactly as dry-run predicted |
| `/api/health` | `healthy`, database `healthy` (129 ms) |
| Core pages `/ /game /leaderboard /shop /lab /clan /play` | all 200 |
| `/serpent` with `SERPENT_V1` off | **200 off-state by design** — verified to leak no Depth, segments, lifetime or best-week data |
| Leaderboard | 2 ranked players (`Sans_Souci`, `savoir`) — the owner's cohort flagging working as intended |

**Every Phase 1 surface shipped dark.** Eight flags default off: `SERPENT_V1`,
`SIGNAL_V1`, `DAILY_TAKE_V1`, `RUN_FLOW_V1`, `CLAN_V2`, `SETTLEMENT_DISPATCH_V1`,
`CLAN_GAUNTLET`, `CLAN_PLAYOFFS`. The schema and code are live; what players see is
unchanged until each flag is flipped. Note `NEXT_PUBLIC_*` is **build-time inlined**,
so each flip needs a rebuild to take effect — and so does each rollback.

### The gate earned its keep

Migrations 046–051 had never been executed anywhere before the Phase 1 gate ran
them against a real Postgres. It found two defects that every shape test passed
over, either of which would have broken this deploy:

- **Migration 048 could not apply at all** (SQLSTATE 42809) — migration 020 already
  creates `clan_rivalries` as a VIEW, so `CREATE TABLE IF NOT EXISTS` was a silent
  no-op and the next `CREATE INDEX` aborted the migration. Production has 020.
- **Three central RPCs raised on every call** (SQLSTATE 42702) — `RETURNS TABLE` OUT
  names colliding with column names inside `ON CONFLICT` inference. With
  `begin_signal_objective_run` down, **§8.6's charge exemption could never have been
  granted to any player**: the feature would have shipped inert.

### One defect CI caught that branch verification did not

`src/app/api/signal/panel/route.ts` exported a helper. Next.js App Router route files
may export only HTTP handlers and known config fields, so `npm run build` failed with
"is not a valid Route export field" — invisible to `tsc --noEmit`, lint and jest.
**Orchestrator process gap**, not a subagent's: branch verification now includes
`npm run build`.

---

## Phase 0 gate — **PASSED**, verified empirically on `constitution/build`

| Gate check | Result |
|---|---|
| Economy settlement tests green post-subtraction | **PASS** — 100 tests across the energy envelope, multiplier removal and faucet purge suites |
| A board query returns only real, ended, validated runs | **PASS** — 88 leaderboard/eligibility tests; eligibility enforced in the query *and* re-applied in the pure fold |
| `verify:constitution` wired and failing on seeded violations | **PASS** — seeded a genome read in the score fold → `exit=1` on R2; seeded a `TODO` marker → `exit=1` on todo-fixme; reverted, back to PASS |

Full pipeline on the integration branch: `tsc` clean · `lint` clean · **269 suites /
3321 tests** · `npm run build` success · `verify:constitution` PASS over 691 files,
**22** known findings (down from 41 at the start of the run).

Migrations written, none applied: **039–045** (energy envelope, dispatch waitlist,
multiplier stack removal, achievements→records, commerce removal, faucet purge,
session lifecycle & cohorts).

---

## Phase 0 release — **SHIPPED to production, 25 July 2026**

Owner confirmed Supabase backup/PITR, which cleared the one blocker. Released via
`docs/ops/RELEASE_RUNBOOK.md`.

| Step | Result |
|---|---|
| PR #6 `constitution/build` → `main` | 4/4 checks green, **squash-merged** as `fd040af` |
| PR #7 dependency fix + gate split | 4/4 green, merged as `be33b4b` |
| **Deploy to Production** (`payments_mode=test`) | run `30172084085` — **success**, both jobs |
| Migration dry-run | **exactly 039–045**, no extras (the stop condition did not trigger) |
| Migrations applied | 039, 040, 041, 042, 043, 044, 045 — all seven |
| `/api/health` | `status: healthy`, `database: healthy` (375 ms) |

**Squash, not merge or rebase.** `main` requires linear history, so a merge commit
was refused. Squash was chosen over rebase deliberately: rebasing would have
replayed WP-0.09's WIP checkpoints — which explicitly do not compile — onto `main`,
leaving `git bisect` walking through broken commits. Full commit-by-commit history,
including every per-package audit note, is preserved on `origin/constitution/build`.

### Post-release smoke, run against production

| Check | Result |
|---|---|
| `/`, `/leaderboard`, `/shop`, `/lab`, `/legal/privacy` | all 200 |
| `/play`, `/dispatch/confirm` (flag off) | **404** — correct; the flag is not flipped |
| `/robots.txt`, `/sitemap.xml` (unflagged hygiene) | 200; sitemap omits `/play` |
| Shop copy: Energy, energy pack, Starter Bundle, Dynasty Bundle, "Season Pass included" | **all absent** (R3/R4) |
| `/api/leaderboard?view=you` | 200 public, `contentVersion v2-designv2-2026-07-18`, top 3 returned, **13 ranked players**, `truncated: false`, `viewer: null` for anonymous |

That last row is the eligibility rule working in production: 415 player rows, and
only **13** with a run that ended, validated, and fell inside the content window.
Before WP-0.05 the board read a denormalized `players.high_score` scalar that could
not express any of those conditions.

### The audit-gate incident, and its ruling

The first deploy attempt **failed at the `verify` job and the deploy job was
skipped — production was untouched.** Cause: `npm audit --audit-level=high` reported
27 high-severity findings. Verified **not** caused by this build — Phase 0 changed
`package.json` by exactly one line (the `verify:constitution` script) and did not
touch `package-lock.json` at all; a new advisory had landed since the last release.

**Exactly one of the 27 was reachable from the production dependency tree:**
`brace-expansion <=5.0.7` (GHSA-mh99-v99m-4gvg, DoS via unbounded expansion). It was
**patched**, not exempted — `npm audit fix` → 5.0.8, lockfile diff that package only,
production-only high/critical **1 → 0**.

**Owner ruling (25 July): split the gate.** Blocking =
`npm audit --audit-level=high --omit=dev` (the shipped tree); non-blocking = the full
audit, reported every release so toolchain debt stays visible. The remaining 26 are
jest/eslint/babel and their glob/minimatch chain, never bundled, and clearing them
needs breaking major upgrades — a deliberate maintenance decision, not something to
do between a merge and a deploy. **The gate was not weakened to pass:** the reachable
finding was fixed first, because narrowing the gate alone would have hidden it.

### Still owner-only (needs Vercel/dashboard access this environment lacks)

1. **Flip `NEXT_PUBLIC_GROWTH_SURFACES_V1=true`** in the Vercel production
   environment to light up the landing pitch, `/play` and the Dispatch waitlist.
   They are deployed and currently 404 by design. Rollback is unsetting it; that path
   is explicitly tested, not inferred.
2. **Cohort flagging — deliberately partial until launch (owner ruling, 25 July).**
   `players.cohort` excludes flagged accounts from every public surface. The owner is
   flagging the dev/QA noise but **keeping `savoir` and `Sans_Souci` visible on
   purpose**: with no public audience yet, a visible account is the only way to verify
   the board, `myRank`, the "(You)" highlight and Depth actually work end to end. An
   empty board proves nothing.

   **PRE-PROMOTION STEP — do this before any acquisition push:**
   ```sql
   UPDATE players SET cohort = 'dev'
   WHERE cohort = 'player'
     AND lower(coalesce(handle, username, '')) IN ('savoir', 'sans_souci');
   ```
   Verified working: flagging one account moved the public board from 13 ranked
   players to 12, with nothing deleted — it is a read-side label and `SET cohort =
   'player'` restores an account instantly with every run and record intact (R6).
3. **Optional, unhurried:** remove the five retired `NEXT_PUBLIC_STRIPE_*` price
   variables from Vercel. The validator tolerates their presence *and* absence (D-4),
   so there is no deadline and no ordering constraint.

## Phase 0 release — original queue (superseded by the record above)

The phase gate passed, so the owner's phase-scoped release authorization applies.
**The release was not executed**, because a runbook precondition cannot be performed
from here, and the envelope's instruction for that case is explicit: *"If production
credentials are unavailable or a runbook step cannot be executed as written, do not
improvise: queue the exact remaining steps in the build log, leave flags off, and
continue building."*

**The blocker:** `docs/ops/RELEASE_RUNBOOK.md` precondition 3 requires confirming
Supabase backup/PITR before the release. That is a dashboard action, and the
`supabase db dump` alternative needs `SUPABASE_ACCESS_TOKEN` / `SUPABASE_DB_PASSWORD`
/ `SUPABASE_PROJECT_ID`, which exist only as GitHub Actions secrets (D-3). This
release applies **seven** migrations that drop functions, drop columns, and drop one
player-scoped table (`daily_logins`). Each has internal `RAISE EXCEPTION` guards and
`daily_logins` is dropped only after proving receipt coverage — but a verified backup
is the outer safety net those guards do not replace. Proceeding without it would be
improvising against the one precondition that protects player data.

**Nothing else blocks.** No `LAUNCH_CHECKLIST.md` no-go trigger is known to apply.
Stripe stays in test mode and was never touched.

### The exact remaining steps, in order

1. **Confirm Supabase backup/PITR** for project `gmpwyzqafoyowndbvlma` in the
   dashboard, or take a dump with credentials this environment does not hold.
   *(This is the blocker. Everything below is unblocked by it.)*
2. **Record the current Vercel production deployment id** as the rollback target
   (runbook precondition 3).
3. **Merge the integration PR** `constitution/build` → `main`. `main` is protected
   and requires 4 green checks, so this is a PR merge, not a push — the PR also
   carries three of the owner's own unpushed documentation commits (D-2).
4. **Dispatch “Deploy to Production”** on `main`: type `DEPLOY`, `payments_mode=test`.
   The workflow verifies, validates the Vercel environment, dry-runs the migrations,
   builds and stages, smokes the staged app, promotes, **then applies migrations
   039–045**, lints the database and re-smokes. Do not run `supabase db push`
   independently — the runbook forbids it.
   **Expected dry-run output: exactly migrations 039–045. Any extra migration is a
   stop condition.**
5. **Run the runbook's post-release smoke** (§Post-release smoke), paying particular
   attention to: a run starting with **zero charges** (must play and settle lean,
   never be blocked), the leaderboard resolving `myRank` for a real account, and the
   shop showing **no** energy or bundle SKU.
6. **Flip Phase 0's flag:** `NEXT_PUBLIC_GROWTH_SURFACES_V1=true` in the Vercel
   production environment, then verify `/play`, `/dispatch` and the landing pitch
   render, and that the sitemap lists `/play`. **Rollback is unsetting it** — that
   path is explicitly tested, not inferred. This is the only Phase 0 flag.
7. **Flag the dev/QA/fixture accounts** into `players.cohort` (WP-0.06 ships the
   column and the two single-statement commands but flags **nothing**
   automatically — no schema signal distinguishes a developer's account from a
   player's, and a wrong guess would hide a real player). Until this is done the
   boards are correct but still count the 415 rows of dev/QA noise.
8. **Optional, unhurried:** remove `NEXT_PUBLIC_STRIPE_ENERGY_SMALL/_MEDIUM/_LARGE`,
   `NEXT_PUBLIC_STRIPE_STARTER_BUNDLE`, `NEXT_PUBLIC_STRIPE_DYNASTY_BUNDLE` from the
   Vercel production environment. The validator tolerates their presence *and* their
   absence (D-4), so this can happen before or after the deploy, or never.

Building continues on `constitution/build` meanwhile, per the envelope.

## Build incidents

**I-1 · Two subagents stalled on a watchdog timeout** (WP-0.04, WP-0.09), both
during initial exploration, both leaving zero commits. Root cause was **resource
contention**, not the work: three subagents were running while the orchestrator ran
a full test suite, and that suite took **1447s instead of ~25s**. Both packages were
relaunched with fresh agents per the retry protocol, and concurrency is now capped
at **two** subagents with no full-suite run while they work.

**I-1b · WP-0.09 failed a second time**, this run to an API connection error rather
than a stall — but it left **real uncommitted work** on three files
(`products.ts`, `checkout/route.ts`, `webhook/stripe/route.ts`: both SKU groups
deleted, `StoreProductType` narrowed, `ALL_PRODUCTS` emptied), not compiling because
its consumers had not been updated yet. Per the resume rule — never respawn a
duplicate against a branch showing real progress — the orchestrator committed the
work as an explicitly-labelled WIP checkpoint (`50ad44d`) so a third failure cannot
lose it, and dispatched a fresh subagent to **finish** the branch rather than
restart it. Two infrastructure failures on one WP; neither was a work-quality
failure, so this is logged rather than escalated as a blocked package.

**I-2 · A cross-work-package test failure that neither WP could have caught.**
WP-0.02 and WP-0.08 both edited `src/lib/share/genomeCardImage.test.ts`, on separate
hunks, so git merged them without conflict and each branch was green on its own. But
WP-0.08's Rule-14 assertion hard-coded `'2,526 DNA'` — a total computed while the
streak/set/clan-duel factors still multiplied the payout — while WP-0.02 rewrote the
shared fixture to `cascade.total = 1750`. The stale literal only failed once both
were on the integration branch. Fixed by the orchestrator; the fixture is the source
of truth and 1,750 is correct. **This is the case for verifying the integration
branch after every merge, not just each branch in isolation.**

## Owner to-do list

Maintained continuously; final form at the end of this log.

1. **`pre-constitution` tag — pushed** (points at `e82719d`). The three
   documentation commits could **not** be pushed to `main`: it is a protected
   branch requiring 4 status checks. They ride in with the integration PR instead.
2. Confirm the authority documents landed in D-1 are the intended v1.3 text.
3. Before the Phase 0 release: confirm Supabase backup/PITR in the dashboard
   (runbook precondition 3 — not scriptable from here, see D-3).

## Playtest Wave — migration 054/055 live verification (2026-07-26)

WP-2.05 reported migration 055 as its largest unverified piece: the SQL had
never been executed, its column names had been wrong once and corrected, and
the live-Postgres gate test was not written (no Docker in that environment).

Verified here against a local Supabase stack (CLI 2.65.5), not against
production:

1. `supabase start` applied the full history including 053, 054 and 055 —
   `schema_migrations` tops out at 055. The SQL is syntactically valid and
   executes.
2. 055 was then re-run against **seeded representative rows**, because its
   first run met an empty table and its assertions passed trivially:

   | seeded row | expected | observed |
   |---|---|---|
   | advisory-only (TRAIT_CONFLICT + DNA_MISMATCH) | re-stamp | re-stamped |
   | rounding-only (3-DNA drift) | re-stamp | re-stamped |
   | FATAL (INVALID_DURATION) | stay false | stayed false |
   | unclassified future code | stay false, be named | stayed false, named in NOTICE |
   | free play | ignored | ignored |

   `high_score` rose 100 → 1750 through GREATEST; `total_dna_earned` and
   `total_games_played` were untouched, which is correct — neither was ever
   gated on `validated`, so neither is owed a re-credit.
3. **Idempotence proven**: a second run reported "0 run(s) re-stamped, 0
   high_score(s) rose" and left an identical row hash
   (`c5939b14555718941a922830f878ce9f`) and identical player scalars.

The unclassified-code branch is a `RAISE NOTICE`, never an abort, and it
correctly named the offending session id — so an unknown historical code
leaves its row alone rather than putting it on a public board.

Still not covered by this: production data volume, and the assertions that can
only fail against real rows (Rule 6 on Records and `codex_first_discoveries`).
Those remain protected by the migration's own in-transaction assertions, which
roll the whole thing back on any mismatch.

## Playtest Wave — promote-before-migrate compatibility analysis (2026-07-27)

`deploy-production.yml` promotes the application BEFORE applying migrations, so
every release has a window in which the new code runs against the old schema.
This wave ships four migrations; each was checked against that window rather
than assumed safe.

| migration | what it does | behaviour in the window |
|---|---|---|
| 053 equip_snake ordered writes | `CREATE OR REPLACE` of a function | no app dependency either way; old and new callers both work |
| 054 run_start_context | `ADD COLUMN game_sessions.run_context` | new app writes it; before the column exists the insert retry ladder (the shipped `run_seed` pattern) drops the field and starts the run anyway. Settlement falls back to the re-derive path, which is 503-hardened |
| 055 validation severity backfill | data only, no schema | nothing for the app to depend on |
| 056 signal_day_clauses | `ADD COLUMN` + new `ensure_signal_day` signature | **double-protected**: the call sits behind `SIGNAL_V1_ENABLED` (`NEXT_PUBLIC_SIGNAL_V1`, default off), and if reached before 056 lands, PostgREST answers PGRST202, `isMissingSignalInfra` recognises it, and the day resolves to null — the Signal goes dark rather than storing a day with a silently empty clause set |

Nothing in the wave requires a coordinated redeploy, and no migration drops a
column or table the promoted runtime reads. 054's own DOWN-NOTE records that a
reversal needs no redeploy for the same reason.

Order for the release: deploy the app, apply 053-056, run the Serpent and Signal
ops settlement routes once, smoke, then flip flags. Flags stay off until the
schema is in place, which is what makes the window uninteresting.

## Playtest Wave — release plan (2026-07-27)

**Expected migration list: exactly 053, 054, 055, 056.** Runbook precondition 5
makes any additional pending migration a stop condition, so this is the list the
dry-run output is checked against.

| # | migration | applied-state risk |
|---|---|---|
| 053 | equip_snake ordered writes | function replace; no app dependency either direction |
| 054 | run_start_context column | app tolerates absence via the insert retry ladder |
| 055 | validation severity backfill | data only; asserts and rolls back on any mismatch |
| 056 | signal_day_clauses | flag-gated caller + PGRST202 fallback that fails closed |

Sequence: merge PR #11 → dispatch **Deploy to Production** on `main`
(`confirmation=DEPLOY`, `payments_mode=test`) → the workflow stages, smokes,
promotes, then applies migrations and lints the linked database → invoke
`/api/ops/serpent-settlement` and `/api/ops/signal-settlement` once each with the
`CRON_SECRET` bearer so weeks inside the 8-day resettle window recover Depth →
production health smoke.

**Not in this release, and not within the deploying agent's access:** flipping
`NEXT_PUBLIC_*` flags. They are build-time inlined, so enabling one needs a
Vercel production environment change plus a rebuild, and `VERCEL_TOKEN` exists
only as a GitHub Actions secret. The wave therefore lands **dark** — which is
the intended state, since flags must not flip until the schema is in place. The
owner flips them afterwards.

Stripe stays in test mode. Campus-1 seeding remains a separate owner action.

## Playtest Wave — release RESULT (2026-07-27, run 30245968841)

Deployed from `main` at `7dec037` (squash of PR #11), `payments_mode=test`.
Rollback anchor recorded per runbook precondition 3: the previous production
deployment is **`dpl_6XkMBj196wUaoZmy8SRapLmyWFcv`** (commit `cb2e112`,
2026-07-26 14:38 UTC). The promoted deployment is
`dpl_3cdCVw9TpYVRrSvCrhTkf6WQSYrV`.

Dry-run named exactly 053, 054, 055, 056 — precondition 5 satisfied. The app was
staged, health-smoked and promoted BEFORE the migrations were applied, as the
expand/contract order requires. Post-migration health: `healthy` / database
`healthy`.

### 055 backfill NOTICE numbers (the record the plan asked for)

```
75 invalid settled earning rows examined
13 re-stamped (advisory-only)
 8 carry a FATAL code and stay false
54 unclassified and left untouched (expected 0)
```

**The unclassified tripwire fired, and the plan's claim that it would report
zero was wrong** — but the rows are harmless and the allowlist was not the
reason. Every one of the 54 reports `parseable=<NULL>, codes={}`: they are rows
stamped `validated = false` with no `validation_errors` at all. Verified against
production afterwards, the complete `validated = false` population breaks down as:

| end_reason | extracted | has codes | earned anything | count |
|---|---|---|---|---|
| expired | no | no | no | 59 |
| abandoned | no | no | no | 18 |
| completed | yes | yes | yes | 6 |
| completed | no | yes | yes | 2 |

So **every row that earned a score or DNA carries codes, and no code-less row
earned anything.** The 77 code-less rows are swept/expired sessions with score 0
and DNA 0 — there is nothing in them to restore, and leaving them untouched
costs no player anything. What the tripwire actually caught is that the
migration's row filter is looser than the NOTICE text claims: it counts expired
and abandoned rows among "settled earning rows". That wording is misleading in
exactly the situation the tripwire exists for, and should be tightened — the
count is noise, and noise in a tripwire trains the next reader to ignore it.

### Effect on the owner's account (the plan's acceptance criterion)

`Sans_Souci`: banked runs **21** (from ~15) — the apex gate at 20 is open; the
1750 CYBER run of 2026-07-26 is `validated = true` again; `high_score` 2290
(an older validated 2290 run outranks it); 18 rows remain `validated = false`,
all expired/abandoned with nothing owed. The plan projected ~26; the real figure
is 21, because the projection assumed more of the invalid population was
recoverable than the code-less breakdown above allows.

### Settlement

`/api/ops/serpent-settlement` and `/api/ops/signal-settlement` were each invoked
once with the `CRON_SECRET` bearer: 200 and 200. Serpent settled week
`2026-07-20` (0 players, 0 clans — no clan activity yet). Signal settled the
pending objective runs, one completing at 141/90 for 150 bonus DNA. Note for
future releases: both routes are already scheduled Vercel crons
(`serpent-settlement` Mondays 00:40 UTC, `signal-settlement` daily 00:20 UTC),
so the manual invocation only matters when a release lands after a week boundary
has passed — as this one did.

### Found immediately after the deploy, fixed in PR #12

- **Artifact codes were double-encoded.** `buildArtifactPath` and
  `lineageArtifactPath` wrapped `encodeURIComponent` around codes their encoders
  had already escaped field by field. Measured on Next 15.5.21: a `page.tsx`
  receives its route param RAW while a `route.ts` receives it decoded once, so
  the page — where a shared link lands — got one decode too few. `/b/` 404'd and
  `/x/` returned 200 with every gene silently dropped. Not player-visible:
  `NEXT_PUBLIC_SHARE_ARTIFACTS_V1` is off in production, verified by probe
  (`/x/`, `/s/`, `/w/`, `/c/`, `/r/` all 404 while their `opengraph-image`
  routes return 200). **Must land before that flag or `WORKBENCH_V1` flips.**
- **The Codex stopped being server-rendered.** The `useSearchParams` added for
  the Workbench tab forced the archive below a Suspense boundary, so a no-JS
  request received the fallback. Production served 25,552 bytes with zero
  occurrences of `codex-rules`, `lexicon-mechanics` or the extraction verbs.
  `/codex` is in the public sitemap, which is WP-2.07a's whole justification —
  this was a live regression shipped by this release and is the one thing in the
  wave that reached production in a worse state than intended.

### Still owner-gated

Flag flips (`WORKBENCH_V1`, `SHARE_ARTIFACTS_V1`, and confirmation of the
Phase-1 `SERPENT_V1` / `SIGNAL_V1` / `RUN_FLOW_V1` states) and campus-1 seeding.
Stripe remains in test mode; no SKU, key or webhook changed.

### Flag coverage gap, found while flipping (2026-07-27)

The owner enabled every `NEXT_PUBLIC_*` flag in the Vercel production
environment. Nine of them (`SERPENT_V1`, `SIGNAL_V1`, `RUN_FLOW_V1`, `CLAN_V2`,
`CLAN_GAUNTLET`, `CLAN_PLAYOFFS`, `SETTLEMENT_DISPATCH_V1`, `DAILY_TAKE_V1`,
`GROWTH_SURFACES_V1`) had already been set before the wave deploy, so they were
inlined into `7dec037`; the remaining seven (`WORKBENCH_V1`,
`SHARE_ARTIFACTS_V1`, `ASCENSION_V1`, `WORLD_REPORT_V1`, `LEAD_LADDER_V1`,
`PWA_V1`, `PLAYER_CONTRACT_V1`) required the `7e5128e` rebuild.

**The gap: CI sets none of these flags.** `.github/workflows` passes no
`NEXT_PUBLIC_*` value to the e2e job, so every flag-split spec runs its
flag-OFF branch and the flag-ON branch is exercised only by jest. Production now
runs the opposite configuration on all of them. CLAUDE.md already warns "test
rollback paths deliberately; never let CI infer them from an omitted flag" —
this is that failure in the other direction: the *shipped* path is the one CI
infers away.

Concretely, `e2e/lexicon.spec.ts` had to have its outside-tap target moved off
`run-setup` because `RunSetupPanel` does not render with `RUN_FLOW_V1` off in
CI — while in production that panel is exactly what players get. The e2e job
should run a second, flag-on matrix leg mirroring the production environment,
otherwise the configuration real players use has no browser-level coverage.

`PWA_V1` was reviewed before the flip and is safely reversible: the worker has
no `fetch` handler, no cache and no offline shell (notifications only), and
`/sw.js` answers 404 with the flag off, which makes browsers drop an existing
registration rather than stranding it.
