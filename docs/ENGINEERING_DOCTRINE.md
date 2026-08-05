# SupaSnake engineering doctrine

**Binding for system-shaped work from 2026-08-04.** Subordinate to
`docs/PRODUCT_CONSTITUTION.md` (v1.14), which decides *what* may be built. This
document and `AGENTS.md` decide *how* infrastructure is built: `AGENTS.md` governs
process, this document governs design.

Three production incidents in one week — PRs #59, #65, #72 — had public, well-known
answers we did not look up first. The directive behind this file: *we shouldn't need
to fall into every trap; other games must have addressed these issues; we should
anticipate.* §1 is the contract, §2 the catalog of traps with the incident that
taught each one, §3 the gate that makes us read before we build.

---

## 1. Principles

### A0 — the absolute

**No ceiling may ever invalidate a legitimate run.** (Owner ruling, 2026-08-04.)
Every bound — byte cap, tick ceiling, action ceiling, attempt budget, rate
allowance, pool size, retention window — is sized against the largest *legal* run,
not the median one, and reaching it degrades rather than rejects. A limit whose
only victims are the players who played longest is a defect in the limit. A0
outranks every other line in this document.

### The seven

1. **Play is always available.** No state of a supporting subsystem may remove the
   primary action. Persistence, settlement, validation and release machinery are
   allowed to fail, lag, retry and be wrong without the player finding out.
2. **The server completes without the client.** Every durable multi-step outcome
   finishes server-side, on its own schedule, with the client absent. A
   client-driven path may be the fast path; it is never the only path.
3. **Checks never destroy honest value.** A check's consequence is proportionate to
   its certainty. Fatal is reserved for the forgery-proof; everything else degrades
   to flagged-for-review with value held. Committed cost is never forfeited because
   a validator was wrong. `src/lib/server/gameValidator.ts` is the built reference.
4. **One source of truth per fact.** A fact has exactly one authority and every
   other layer asks it instead of re-deriving it. Two computations of one fact are
   a defect whether or not they currently agree.
5. **Ambient, not modal.** A surface may interrupt only for a decision the player
   must make and *can* make. Status about a background job is a line, never a wall.
6. **Nothing is invisible.** Every swallowed error, degraded path and refusal emits
   telemetry before it decides what the player sees. If the only detector is a
   player report, the subsystem is uninstrumented.
7. **Every state has an exit.** No state is terminal by construction. Every
   quarantine, dead letter, hold and lock has a named transition out, an owner, and
   an alert when it is entered.

---

## 2. The failure-mode catalog

Cite these by id in PR descriptions. Each entry: how to spot it in review, what to
build instead, the test shape that catches it, and what it already cost us.

### FM-1 · Dual source of truth

- **Recognize.** Two layers answer one legality question with separately written
  predicates — a caller asks "is this target shaped like X?", the authority asks
  "is X still enabled?".
- **Counter.** One predicate exported from the owning module; engine, runtime and
  reducer all call it — `genomeV2GildedForkChoiceAvailable`,
  `genomeV2PhaseGateAvailable` (`src/shared/game/genomeV2.ts`).
- **Test.** Drive the caller's precondition true, assert the authority accepts —
  one case per legality guard, not per happy path.
- **Incident.** PR #62 (2026-08-04): a golden food eaten without the Gilded Fork
  Splice raised a fatal engine fault on legal play. Phase Gate had the same shape
  with three predicates for one fact; both closed by PR #70.

### FM-2 · Silent swallow

- **Recognize.** `catch {}` or a catch that discards the error; an unchecked
  Supabase `error`; a caller turning a bare `false`/`null` into a generic message.
- **Counter.** Record the reason and report it before deciding what the player
  sees — `GenomeV2Runtime.refuse()`. A swallowed *read* that pays less is worst.
- **Test.** Assert the surfaced reason, not the boolean. A test checking only
  `=== false` is compatible with the bug.
- **Incident.** Ten bare catches in `genomeV2Runtime.ts`, eight feeding generic
  fatal throws; both incidents in that class were found only by a player report.
  Closed by PR #70.

### FM-3 · Validation couples availability

- **Recognize.** A correct check with a disproportionate consequence — a validator
  failure that halts a run, blocks a start, or voids earned value. Fatal by default.
- **Counter.** The `gameValidator.ts` split: `FATAL_VALIDATION_CODES` is exactly
  two, all else advisory, and an **unknown code is advisory**
  (`severityOfValidationCode`), so the fail-safe default pays the player.
- **Test.** Deliberately corrupt the validator; the player is still paid, still
  plays, and an alert fires.
- **Incident.** Fatal-by-default cost ~10 honest extractions their progression
  (WP-2.05, in `gameValidator.ts`'s design comment) — then survived one file over
  in `runContinuity.ts`, where a rejected terminal proof returned 400 and destroyed
  a finished run.

### FM-4 · Disagreeing limits for the same data

- **Recognize.** Two bounds on one data lifecycle, set independently. Fatal when
  the *later* stage is smaller: we record an outcome we can never settle.
- **Counter.** Bounds on one path are declared together and move together; the
  record bound is never larger than the settle bound. Derive, don't pick.
- **Test.** Drive a fixture at the largest *recordable* size through the whole
  chain, not through the stage under edit.
- **Incident.** PR #72 (2026-08-04): terminal facts accepted 262,144 bytes while
  the settlement envelope capped at 65,536. Two accounts froze large outcomes that
  were permanently unsettleable; A0 was ruled off this.

### FM-5 · Unknown error defaults to retryable

- **Recognize.** An error classifier with an `else → 5xx retryable` tail. A
  permanent rejection surfaces as transient and the client retries forever.
- **Counter.** Unknown is non-retryable **and** alerting; retry budgets are bounded
  and end in a dead letter with an owner (Principle 7). Note the asymmetry with
  FM-3: for *value* the safe default pays; for *classification* it stops and reports.
- **Test.** Raise an unmapped server exception; assert the client classifies it
  terminally and reports it, never that it schedules another attempt.
- **Incident.** PR #72: `terminalError()` mapped neither
  `INVALID_PENDING_GAME_END_ENVELOPE` nor `invalid_free_run_facts`, so both became
  a bare 503 — "naming these as non-retryable would have surfaced this incident in
  minutes."

### FM-6 · Mock weaker than reality

- **Recognize.** A fake returning success without enforcing what the real
  dependency enforces — byte caps, CHECK and unique constraints, RLS, ordering.
- **Counter.** The harness enforces the real bounds with the same helper production
  uses, or the proof runs against real SQL. A gap that must remain is written down.
- **Test.** A fixture the real dependency rejects must fail the suite. If nothing
  fails when you widen the fake's tolerance, the fake is all that is tested.
- **Incident.** PR #72: "the route test harness's RPC fake succeeded
  unconditionally, so every test passed on a payload production could never
  accept" — the gap behind which PR #65 shipped a correct fix for the wrong cause.

### FM-7 · Skill-scaled data meets a fixed cap

- **Recognize.** A per-tick structure persisted whole against a fixed bound; a
  guard that only fires for long runs; a compaction window that discards evidence a
  later stage reads. It selects for engaged players and hides in QA.
- **Counter.** Persist a projection of what consumers actually read
  (`src/shared/game/settlementGenome.ts`), size the bound against the worst legal
  run, and never resolve a fact by scanning a structure that compacts.
- **Test.** A synthetic maximal-length run as a fixture, asserted under the bound,
  in every suite touching the payload.
- **Incident.** PR #72: `journal` + `targets` were 64,468 B of a 65,177 B snapshot;
  short runs settled normally, so a third account was never hit. Projection cut the
  payloads to 12,895 B and 9,149 B.

### FM-8 · Client as the only driver

- **Recognize.** A durable server-side state whose only transition is triggered by
  client code. The server driver may exist but be a janitor: coarse cron cadence,
  one row per player per pass, head-of-line blocking, no backoff.
- **Counter.** The relay is the primary completer and the client an accelerator
  (Principle 2): triggered on write as well as on schedule, per-item backoff,
  attempt counters, dead letter. A queue in a browser tab is not an outbox.
- **Test.** Kill the client at the terminal moment; assert the row settles
  server-side inside the target window with no client ever returning.
- **Incident.** PR #65 (2026-08-04): two accounts hard-blocked behind the "Result
  secured" modal. The sweep ran every 10 minutes and
  `list_pending_game_progression_sessions` is still `DISTINCT ON (gs.player_id)`.

### FM-9 · Measurement mismatch

- **Recognize.** A precheck measuring a bound with a different function than the
  enforcer uses: `JSON.stringify` vs `jsonb::text`, `String.length` vs UTF-8 bytes,
  client clock vs server clock, app-side count vs SQL predicate.
- **Counter.** One shared helper measures on both sides (`jsonbTextByteLength`), in
  the enforcer's own unit.
- **Test.** Assert the discrepancy itself, both numbers named, so the blind spot
  cannot silently return.
- **Incident.** PR #72: the envelope measured 63,687 B via `JSON.stringify` — under
  the cap — and 70,113 B as `jsonb::text`, which is what Postgres measures.

### FM-10 · Workflow allowlist without a growth path

- **Recognize.** A safety gate whose permitted set is enumerated by hand, with no
  documented procedure for adding the next entry, and whose enforcement is split
  across steps that must be extended together.
- **Counter.** Keep the allowlist closed — that part is correct — but ship the
  reviewed rollout contract in the *same* PR as the thing it must admit, and name
  every coupled step in one place so a half-extension is impossible.
- **Test.** Drive the classifier's own `run` block with the new plan plus adjacent
  negatives (predecessor+new, new+successor, successor alone, whitespace variant)
  and prove they still hard-stop, before dispatch.
- **Incident.** PR #73 (2026-08-04): run `30931765333` halted cleanly because
  migration 066 had no reviewed contract. The halt was correct; the defect was that
  classifying 066 *alone* would have failed later, after Preview was built.

### FM-11 · Guard after mutation

- **Recognize.** A check running once state has moved — head advanced, heading
  rewritten, row updated — so failure leaves an unreproducible intermediate state
  and containment can only halt, never continue.
- **Counter.** Every guard runs before the first mutation. Where a contract cannot
  be satisfied, drop the contract rather than throw mid-way; the wave preflight in
  `SnakeGameLogic.ts` is the shape.
- **Test.** Force the guard to fail and assert state is identical to before the
  call — the operation is transactional or it is not a guard.
- **Incident.** Phase Gate and Wall Rush threw after `newHead` had moved or the
  heading was rewritten, so the server could never replay the board the client
  halted on. Fixed in PR #70.

### FM-12 · Exact version equality where tolerance is needed

- **Recognize.** A version or contract string compared with `===` on a path that
  spans a deploy, with no grace window and no migration branch.
- **Counter.** In-flight work completes under the version it started on — the
  comparison is a policy, not an equality. Where impossible, the item is settled and
  paid at its last verified state, never abandoned uncompensated.
- **Test.** Bump the version against an open run; assert the run still completes
  and still pays.
- **Incident.** `SNAKE_RULES_VERSION` is compared for exact equality on five paths.
  A finished run survives a bump; a run *in progress* becomes `incompatible` and the
  player's only action is to throw it away. Latent — this entry keeps it that way.

### FM-13 · A loading guard that does not guard failure

- **Recognize.** `<Suspense>` around anything that FETCHES — drei's `useTexture`
  and `useGLTF` are the live examples — with no error boundary above it. The hook
  suspends while the asset loads but THROWS when it 404s, and a throw walks past
  every Suspense boundary to the nearest *error* boundary. Suspense reads like it
  covers loading, so the site looks finished; it covers half the cases.
- **Counter.** `AssetGate` (`components/game/AssetGate.tsx`) — the boundary and
  the Suspense are one component taking ONE `fallback`, so the failed and the
  slow case cannot drift apart and the boundary cannot be forgotten. A decorative
  asset falls back to `null`; anything the player must see falls back to the
  primitive version of itself, never to an empty scene.
- **Test.** Throw from the child and assert the fallback renders AND that an
  outer sentinel boundary never trips. Assert the counter-example too: bare
  Suspense with the same child must let the throw escape, or the test is
  passing for the wrong reason.
- **Incident.** PR #90 (2026-08-05): two decorative JPEGs 404'd and the throw
  reached `global-error.tsx`, replacing the whole of Home with "Something went
  wrong". Fixed there in one component and left untested, so the LF-D sweep
  found five more unguarded sites — including the live run screen, where a
  missing GLB would have ended a run in progress on the global error page.

---

## 3. The prior-art gate

**Any work package that builds or reshapes an infrastructure system opens with a
prior-art brief, before implementation.** System-shaped means persistence,
settlement, session/state lifecycle, validation, sync, caching, or
workflow/release machinery.

It lives in the WP's design document, or in the PR description above "What changed"
when the WP has none. About one page, in four parts:

1. **Two to three references**, named and linked — shipped games, engineering
   writing from companies that ran the system at scale, or primary standards. Quote
   what each source says, verified now rather than recalled; label inference.
2. **The failure modes they design against** — usually stated more plainly than
   what went right.
3. **The mapping onto our invariants** — which of the seven principles each
   reference serves, which catalog entries it prevents, and where we deliberately
   differ, with the reason.
4. **What we reject** from the prior art, and why. A brief with no rejections has
   not been thought about.

If the brief cannot be written in a page, the work package is not scoped yet.

**Named precedent — Package A.** `docs/game/PLAYER_EVOLUTION_ONBOARDING.md` §12
carries five cited references and an explicit rejection list; §10 shipped the
contracts, simulation harness, learning-event catalog, server contract and decision
table as a complete package with **no implementation**, and
`docs/IMPLEMENTATION_HANDOFF.md` §6c holds every downstream package closed until the
owner ratifies §13 line by line. Contracts and evidence before code.

**Named counter-example — the continuity incidents.** Settlement, run continuity and
the release classifier were each built without a prior-art pass. The transactional
outbox drained by a server-side relay, durable execution whose completion does not
depend on the caller, deferred enforcement that keeps play available while integrity
reconciles out of band, and the settled criteria for when a dialog may be modal at
all are public, decades-old answers to exactly the failures we shipped. Cost: three
production incidents in one week, two accounts permanently blocked, one the
owner's.

**Review clause.** Every PR states which catalog entries its change touches and
links the brief, new or updated. `n/a — not system-shaped` is the correct answer
for product and UI work, and reviewers should expect to read it often.
