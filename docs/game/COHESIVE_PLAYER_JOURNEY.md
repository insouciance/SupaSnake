# SupaSnake Cohesive Player Journey

**Status:** Review candidate · awaiting Product Owner UX validation · 31 July 2026

**Authority:** `docs/PRODUCT_CONSTITUTION.md` v1.7 remains design law. This
review candidate defines the proposed end-to-end player journey, information
architecture, run-continuity presentation, and cross-system attention behavior;
it becomes an authoritative product contract only after Product Owner approval.
The Career Spine, Run Cockpit, Energy Commitment, Player Flow, and clan contracts
remain authoritative for their system calculations. Where an older document says
a disconnect itself ends a run, or a Lab action silently starts one, this candidate
records the proposed replacement; it supersedes that language only after approval.

## 1. Outcome and design thesis

SupaSnake should feel deep without making the player operate its depth. The
canonical loop is:

```text
Prepare -> Launch -> Play -> Resolve -> Celebrate -> Progress -> Play again
```

Each transition has one job:

| Transition | Player question | Product answer |
|---|---|---|
| Prepare | What am I about to fly? | One preconfigured cockpit with the snake, mode, stake, and relevant risk visible. |
| Launch | Did the shown commitment really start? | One idempotent server-authoritative start; no hidden second action. |
| Play | Can I trust the controls and state? | An unobstructed protected run, with only gameplay decisions interrupting it. |
| Resolve | Was the result secured? | One verified, atomic, recoverable settlement. |
| Celebrate | What did that run achieve? | A bounded, tactile Victory Lap over already-secured rewards. |
| Progress | Where did it matter? | The exact Mastery, Lineage, Discovery, and clan destinations retain the memory. |
| Play again | What is the obvious next move? | Replay immediately, or return to the same Setup context. |

This is not a new metagame hub. It is one route through systems that already
exist. The interface earns simplicity by grouping, preserving context, and
showing detail only when requested—not by deleting advanced play.

### Binding principles

1. **Play is always the gravitational center.** A normal player can prepare and
   launch without understanding breeding, buildcraft, records, or clan governance.
2. **State changes happen where their consequence is visible.** Choosing a snake
   happens in Setup; breeding and ancestry remain in the Lab; battle contribution
   appears on Results and in Compete.
3. **Navigation preserves intent.** A deeper side journey returns to the surface
   that opened it, with the player's authoritative choices intact.
4. **Rewards come to the player.** Progress secures before presentation, then up
   to three meaningful collection beats let the player raise what arrived. These
   taps acknowledge presentation; they never gate or grant value.
5. **Competition is desirable and legible.** Strong play, developed lineages,
   reliable contribution, ranks, and earned honors are credible status symbols.
6. **The browser is a view and input device, never the progress ledger.** No run
   stake, checkpoint, receipt, attention state, or career fact depends on browser
   persistence.
7. **Mobile defines the hierarchy.** Desktop may add space, never a different
   mental model.

## 2. Information architecture

The permanent navigation contains five stable positions. Labels do not move when
the current route changes:

| Position | Destination | Contains |
|---|---|---|
| 1 | **Play** | Home/Launch and the path into Setup. |
| 2 | **Lab** | Active snakes, collection, breeding, ancestry, Genome/buildcraft, and deep management. |
| 3 | **Compete** | Score leaderboard, Clan, Clan Energy Battle, Ascension, rivalry, and competitive history. |
| 4 | **You** | Chronicle, Career Pulse, Mastery, Records, identity, and curated earned proof. |
| 5 | **More** | Shop, Settings, notification inbox, account, accessibility, and infrequent utilities. |

Collection is a Lab view, not another primary destination. Clan and Serpent are
views within Compete, not parallel menu islands. Career and rewards belong to You,
while Results remains the immediate post-run expression of them. Shop deliberately
lives under More so commerce never competes with Play.

Setup, Run, and Results are transactional states in the Play journey, not extra
permanent destinations:

- **Setup** retains a clear way back to Play and contextual links into Lab.
- **Run** is immersive. The ordinary app rail is absent; leaving is possible only
  through the run's own verified terminal state or explicit confirmed abandonment.
- **Results** keeps Replay and Setup visible while recognition unfolds.

### Context preservation

A side journey carries a safe internal return target, such as **Back to Setup**.
The target is allow-listed to same-origin product routes; arbitrary URLs are never
accepted. Back copy names the destination rather than merely saying “Back.”

Setup state is split deliberately:

- Equipped snake, ownership, Energy, unlocks, and other durable player facts are
  read from and changed on the server.
- The unsent Setup draft is ephemeral view state. It may travel in memory or in a
  safe, non-sensitive URL representation for one navigation journey, but it is not
  written to `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, cookies,
  or an analytics SDK.
- If ephemeral state is unavailable after a full reload, Setup reconstructs an
  honest default from server-owned equipment and settings. It never fabricates an
  old stake or silently creates a session.

Selecting **Manage in Lab** preserves the Setup destination. Selecting **Use for
next run** in the Lab atomically equips the snake and returns to Setup; it does not
POST a game session, spend Energy, or bypass the commitment preview. Browser Back,
the visible Back action, and successful completion of a side task all have
predictable destinations.

## 3. The canonical journey

### 3.1 Prepare — the launch cockpit

Setup answers the complete ordinary pre-run question at a glance:

- equipped snake, dynasty, generation, and exact Yield multiplier;
- mode and the one-sentence ruleset identity;
- selected ladder/risk context when applicable;
- Energy stock, partial recovery, next recovery time, selected commitment, and
  corresponding harvest multiplier;
- the consequence that committed Energy is consumed at start;
- one dominant **Start run** action.

The default is safe and playable: the currently equipped active snake, the last
valid ordinary configuration, and one Energy when available. Advanced modifiers,
aim, anomaly detail, seeds, and rung selection live in one collapsed **Adjust this
run** disclosure. Setup never opens with a checklist of required decisions.

The compact snake chooser is intentionally narrower than the Lab. It shows only
currently playable highest-generation lineage representatives, with genuinely
distinct equal-generation builds retained. A choice equips immediately, closes the
chooser, updates the Setup summary, and still waits for **Start run**.

Selecting the full Energy capacity requires an explicit confirmation whose action
states both commitment and multiplier. A second tap on an unchanged numeric tile is
not sufficient confirmation. Any stock change that makes the selection invalid
returns the UI to a valid conservative commitment before launch.

### 3.2 Launch — one deliberate, idempotent start

Pressing **Start run** means “start exactly the configuration shown.” The request
has a client-generated invocation ID and a server-derived fingerprint of normalized
player choices. The server:

1. rejects settings that no longer match ownership or available Energy;
2. ensures the player has no other non-terminal run;
3. consumes Energy and snapshots the immutable stake in the same transaction that
   secures the session;
4. stamps server-derived rules, build, clan eligibility, content version, and RNG
   manifest;
5. returns the same prepared session for a duplicate identical invocation;
6. rejects reuse of the invocation ID with different settings.

A lost response can therefore be recovered without a second Energy spend. The
player never has to remember or persist the invocation ID in browser storage: an
authenticated active-run lookup discovers the one open server session.

The board opens held. The first accepted direction is deliberate, and activation
must establish a server-verifiable initial checkpoint before the first simulation
tick is allowed to advance.

### 3.3 Play — the protected core

Normal play remains continuous and unobstructed. Only gameplay's own gene, portal,
surge, infusion, voluntary tactical hold, and confirmed abandonment decisions may
stop it. COSMIC never receives an automatic planning pause. Meta navigation,
notifications, rewards, clan administration, and commerce do not render over a live
run.

Connection loss is an integrity state, not a death. When the most recent verified
checkpoint becomes older than the configured safety budget, the client enters a
board-visible connection hold before accumulating an unbounded amount of
unrecoverable simulation. Recovery resumes from server truth after the connection
returns.

### 3.4 Resolve — verified outcome, then presentation

A run reaches a terminal product outcome only through:

- server-verified death;
- successful server-verified banking/extraction; or
- explicit, confirmed abandonment by the player.

Refresh, route reset, tab closure, browser crash, process crash, device restart, and
temporary network loss are not abandonment. They do not refund the commitment, but
they also do not erase or silently close the run.

Settlement freezes the validated result, reward ledger, Career impact receipt,
clan consequence, and permanent moments atomically and idempotently. If the final
response is lost, Results recovers the same canonical receipt. The client never
guesses progress from the last number it happened to display.

### 3.5 Celebrate — the victory lap

Results retains the Constitution's three layers:

1. outcome, PB status, share artifact, and Daily Take when eligible;
2. Score and full-strength Yield, with credited DNA/Energy arithmetic as one receipt;
3. the run's tactile Career Victory Lap and one recommended destination.

Layer 3 groups server-selected impacts into at most three beats—harvest/salvage,
personal progression or discovery, and clan/world consequence. The player may tap
each large collection affordance to raise that trophy: bars move from before to after,
thresholds cross, and earned artifacts arrive. One action completes the remaining
beats, and the sequence never hides or disables Replay and Setup.

The ceremony is not a reward transaction. Everything except Daily Take was secured
at settlement. Collection state is Results-local presentation only; leaving, reload,
or skipping cannot forfeit progress, and replaying the receipt cannot grant it twice.
Exact destination highlights persist independently until the player views the changed
Mastery, Codex, lineage, Records, or clan content. This preserves tactile payoff
without creating claim debt or a tour through every menu.

Routine progress is still named, but does not pretend to be a milestone. A failed or
practice run receives an honest compact receipt. If settlement remains pending, the
screen says so and offers no invented bar movement; later recovery presents the
server-authored result.

### 3.6 Progress — memory and destination

Results explains what changed now. Persistent destinations explain what it means:

- Mastery and Records live in You/Chronicle;
- active lineage and build decisions live in Lab;
- ancestry and retired leaves live in the snake dossier;
- gene discovery lives in Lab/Codex;
- clan contribution, rank, Glory, and rivalry live in Compete;
- calendar consequence lives in its existing Signal, Ascension, or battle view.

The one recommended action routes to the most significant unresolved destination.
It does not become an additional Results layer and never competes with Replay.

### 3.7 Play again

**Replay** starts the same gameplay configuration without reopening Setup, using one
Energy when available or lean play otherwise. It never silently repeats a
multi-Energy commitment. **Setup** reopens the cockpit with the prior configuration
as a visible draft. From Results to a held board remains at most two actions.

## 4. One evolving snake, not an inventory of generations

A generation is a stage in one lineage, not a new collectible card of equal weight.
The model distinguishes:

- **active leaf:** a currently owned, playable highest generation;
- **active branch:** a genuinely distinct top-generation build that remains a real
  player choice;
- **ancestor:** a lower generation retained as immutable pedigree and history, not
  an everyday selector option;
- **retired/refunded leaf:** an immutable historical specimen that is no longer
  owned or playable and cannot impersonate current-generation proof.

Everyday Setup and Lab roster surfaces show active leaves only. The equipped snake
comes first, followed by favorites/recent strong alternatives with dynasty and build
distinctions legible. The projection remains compact regardless of lineage age.

Opening a snake reveals its dossier: pedigree, generations, inherited traits,
creation and retirement events, notable runs, PBs, Energy commitment history, clan
deliveries, and visible evolution stages. Downgrade removes only the highest active
leaf through the existing exact-receipt refund rule; it reveals the next valid leaf
while preserving the retired chapter. History never leaks back into the playable
selector.

This trades the nostalgic visibility of twenty parallel cards for a stronger form of
ownership: the player sees one snake become storied over time. The dossier protects
the history that the compact roster omits.

## 5. Run continuity and recovery authority

### 5.1 Honest state model

```text
setup draft
    |
    v
preparing -> prepared -> active + verified checkpoint -> settling -> settled
                 |                    |
                 +------ explicit confirmed abandon ------> abandoned
```

`preparing` is a short transactional state while a start is being finalized. It must
be resumable by the same idempotent request or repairable by the server; it is not a
second spend.

`prepared` means Energy and immutable run configuration are secured, but no gameplay
tick has executed. It is exactly recoverable from the start manifest. A prepared
session may truthfully offer **Continue Run**.

`active` means the opening is authorized for gameplay. A start manifest alone is
not enough to continue it: replaying that manifest would rewind the run. An active
session may truthfully offer **Continue Run** only when the server has accepted a
validated deterministic-state checkpoint.

No gameplay tick may execute until the first active checkpoint has been accepted.
During a staged migration, such a legacy session must be described as unrecoverable
or operator-reviewable; the UI must not call a restart “Continue.” A new run never
auto-abandons it.

### 5.2 Verified checkpoint contract

A checkpoint becomes continuation authority only after the server validates it and
stores it under the current exclusive lease. Validation binds it to the immutable
run manifest and simulation seed, enforces the engine/ruleset/grid contract, rejects
terminal or malformed state, applies server-time and food-rate bounds, and requires
elapsed time, food, score, DNA, and RNG draws to move monotonically from the prior
accepted checkpoint. A raw client-uploaded snapshot, hash, or “latest score” is only
a proposal. It never becomes payout authority: terminal settlement still recomputes
and validates the run's economic outcome through the existing server path.

The versioned checkpoint package includes at minimum:

- engine and checkpoint versions plus the manifest-bound dynasty/ruleset/config;
- the session's immutable Energy, snake, simulation, and clan-start manifest;
- deterministic seed, RNG state/draw count, and elapsed simulation time;
- snake/body, board, food, terrain, speed/growth, hold budget, and score/harvest state;
- active genes, mutations, Genome/strain state, offers, portals, and pending decision;
- checkpoint revision, digest, creation/acceptance time, and the lease that owns the
  next write and terminal action.

The server accepts only monotonic checkpoints for the current lease. Resuming issues a
new lease and invalidates the old client, preventing two tabs from forking one stake.
Critical decision boundaries checkpoint immediately. Routine checkpoints use a
configurable cadence; the initial target is no more than three seconds of simulation
between accepted checkpoints. If interruption occurs between them, the UI states the
bounded rollback honestly. It never duplicates food, rerolls an offer, escapes a
verified death, or grants unverified provisional harvest.

The resume package reconstructs the simulation from the latest accepted checkpoint,
then opens held for a deliberate direction. A pending gene/portal decision resumes as
that same decision, not a reroll. A checkpoint rejected by validation leaves the prior
valid checkpoint available and raises an integrity event; it does not silently erase
the session.

### 5.3 Recovery surface

On authenticated entry, before offering Launch, the app reads the one open session:

- **prepared:** primary action **Continue Run**, secondary **Abandon run** with the
  exact committed Energy and consequence;
- **active with verified checkpoint:** primary **Continue Run**, with checkpoint age
  or bounded rollback disclosed only when materially stale;
- **settling:** **Recover result**, which opens the canonical Results receipt when
  ready;
- **no open session:** ordinary Launch;
- **integrity failure:** stay in context with Retry and support/reference data; never
  replace the session with a new anonymous run.

There is one open non-terminal run per player. Explicit abandonment is authenticated,
confirmed, idempotent, and auditable. Stale age by itself does not simulate consent to
abandon.

### 5.4 Browser prohibition

No authoritative or recovery-relevant state is stored in `localStorage`,
`sessionStorage`, IndexedDB, Cache Storage, service-worker caches, cookies, analytics
persistence, or an equivalent browser mechanism. This includes start requests,
Energy commitment, run manifests, checkpoints, input logs, pending gene choices,
settlement requests, reward receipts, attention state, and badge clearing.

In-memory input and rendering state may exist for the live document. Losing it must
lead back to server recovery, not data loss or a client-authored reconstruction.

## 6. Attention and badge hierarchy

Attention guides the player; it does not recreate ten menus on Home.

| Priority | Presentation | Permitted use | Clearing rule |
|---|---|---|---|
| 0 | None | Routine XP/DNA movement and already-seen facts | Nothing to clear. |
| 1 | Quiet destination dot | Unseen earned milestone, unlock, discovery, lineage chapter, or clan honor | Exact artifact or milestone content rendered, then server acknowledges `seen`. |
| 2 | Numeric/exclamation action badge | Daily Take, save-account action, handle decision, or integrity-required repair | Successful completion, or explicit dismissal only where product rules allow it. |
| 3 | Contextual integrity banner | Recoverable run, pending settlement, lost registered session, or blocking server issue | The underlying state is recovered or explicitly resolved; never by opening a menu. |

Priority 3 is not counted as a celebratory notification. It appears where the
blocked action would occur. The global bell counts unresolved Priority 2 actions
only. Recognition never inflates that urgent count.

### Destination mapping

| Earned event | Destination badge |
|---|---|
| Mastery level, Record/achievement tier, PB artifact | You |
| New gene/Codex entry or Discovery milestone | Lab |
| New active lineage stage, ancestry chapter, unlock, or retired leaf | Lab |
| Clan top-five entry, battle result, rank change, Glory, or rivalry milestone | Compete |
| Daily Take or identity/integrity action | More/inbox plus its exact action surface |

Items have one semantic ID, one server status, one destination, and when applicable
one artifact reference. They aggregate by destination and pillar; visible numeric
counts cap at `9+`. An action badge takes precedence over a recognition dot on the
same destination.

Opening the notification center clears nothing. Merely mounting a route clears
nothing. Results may clear a recognition only after the exact beat or exact named
summary has rendered. Leaving Results before a later beat preserves that dot. A
generic sentence such as “three systems advanced” cannot clear three specific
milestones. Seen/resolved transitions are idempotent and server-held; a failed write
keeps the item pending across devices.

There are no commercial badges, notifications, emails, or Results prompts. Guest
attention is current-document memory only and disappears on reload rather than
becoming local pseudo-progress.

## 7. Competitive clans as a usable social system

Compete makes the clan system discoverable without creating a separate gameplay
queue. Positive-Energy normal runs continue to feed the active Clan Energy Battle
automatically.

### Directory and joining

The live directory supports search and shows server-authored:

- clan name and heraldry;
- current members, capacity, and available places;
- open, application, or invite-only policy;
- recent activity and battle performance where enough real data exists;
- the action actually available to the viewer.

Empty, stale, or fabricated activity is never used to make the world look larger.
Founding quotes its current server-configured DNA cost before confirmation and spends
it atomically with creation. Open joins, applications, and invitations share one
audited membership transition model.

### Governance

Player-facing roles are **Leader, Co-leader, Member**:

- Leader manages settings, applications, invitations, removals, co-leaders,
  leadership transfer, and Glory assignments.
- Co-leader handles ordinary recruitment and roster care, but cannot transfer
  leadership, disband the clan, or grant Glory.
- Member plays, contributes, and participates socially without administration.

Every consequential action shows its target and consequence, validates permissions
server-side, and is idempotent. Leadership transfer and removal use destructive
confirmation. Membership and run eligibility keep the battle start snapshot and
cycle-lock rules; switching cannot redirect a completed or active contribution.

### Prestige, contribution, and Glory

Clan surfaces may show member best-five Depth, contribution rank, relevant
generation/commitment context, recent eligible participation, roster totals, rival
totals, and improvement. They distinguish **no eligible result yet** from a failed
run or absence. Leaders cannot type scores, change eligibility, or relabel a client
claim as performance.

Each clan has at most two public Glory seats. A Leader chooses from eligible,
server-verified contributors at the battle boundary. The assignment records actor,
holder, source cycle, evidence, effective cycle, and seat. It locks for the configured
term, pays at most one bounded server-ledgered DNA reward per holder/seat/cycle, and
cannot be rotated through alts for repeated rewards. Self-award, tenure, eligibility,
and reassignment are explicit centrally configured policies, never hidden UI rules.

Glory is prestige because it points to a real contribution. Purchased cosmetics may
frame that proof but may not share its earned visual grammar. Strong accounts should
look strong because their Mastery, lineage, risk history, clan delivery, and rare
accomplishments are visible and verifiable.

## 8. Progressive disclosure and interaction grammar

Each system has three levels:

1. **Glance:** the current choice, consequence, progress, and one primary action.
2. **Adjust/inspect:** one disclosure, sheet, tab, or concise breakdown for normal
   comparison.
3. **Manage/history:** the full Lab, dossier, Chronicle, or clan administration view.

Setup never exposes Level 3 by default. Results may reveal detail but does not become
a management screen. Deep screens always retain a clear playward action.

Action language remains literal and consistent:

- **Choose** changes a Setup choice.
- **Use for next run** equips and returns to Setup.
- **Start run** creates the committed session.
- **Continue Run** restores the same prepared or checkpointed session.
- **Replay** creates a new conservative session with the same gameplay configuration.
- **Claim/Collect** on a Victory Lap beat acknowledges already-secured presentation;
  only Daily Take performs an economic collect.
- **Review** opens history or detail; it does not secure a reward.
- **Abandon run** is destructive and always confirmed.

## 9. Mobile-first and accessibility contract

- The five primary destinations fit supported portrait widths without scaling below
  44 by 44 CSS pixels, clipping, horizontal scroll, or covering a primary action.
- Safe-area insets protect navigation, Setup actions, sheets, pause, and Results.
- Sheets and dialogs trap focus, restore it to their opener, have an explicit close,
  scroll internally at constrained heights, and close predictably with platform Back
  or Escape when the action is non-destructive.
- Visual order, DOM order, focus order, and screen-reader reading order agree.
- Icon-only actions have names; color is never the only indication of role, rarity,
  status, progress, or danger.
- Dynamic stock, start, settlement, checkpoint, badge, and reward states use concise
  live-region announcements without stealing focus or repeatedly reading the entire
  screen.
- Victory-lap motion never flashes, loops perpetually, or blocks navigation. Reduced
  motion shows the same facts as an immediate static ordered summary with threshold
  states, not a frozen first beat that requires extra work.
- Text scaling and zoom may make surfaces taller, but never hide Start, Continue,
  Replay, confirmation, or close actions.
- Touch selection and mobile pause do not share the live steering surface. A control
  cannot resume or turn the snake accidentally when a dialog closes.
- Desktop adds breathing room, hover help, and denser comparison only after keyboard,
  touch, screen-reader, and narrow-mobile semantics are complete.

## 10. Data and architecture boundaries

The player journey projects existing server-owned records rather than creating one
giant client store:

- run session plus immutable start manifest and verified checkpoints;
- atomic settlement and versioned Run Impact Receipt;
- server attention items with exact semantic transitions;
- active collection projection plus permanent lineage dossier/passport;
- clan membership, application/invitation, role, battle contribution, and Glory
  audit/reward ledgers.

Every write endpoint requires authentication where the underlying state is durable,
validates ownership and current version, checks every database error, and supports an
idempotency key or unique natural key. Cross-device reads converge on server state.
Analytics, browser state, and optimistic UI may never settle, clear, equip, spend,
checkpoint, rank, or reward by themselves.

Presentation flags may hide a new surface during rollback, but may not gate settlement,
Energy consumption, receipts, checkpoints, earned history, or attention creation. A
partially disabled presentation must fall back to a coherent older view, not expose
half of the journey.

### Existing implementation foundations

This contract deliberately builds on current paths rather than inventing parallel
systems:

- `RunSetupPanel`, `SnakePickerSheet`, and `src/lib/collection/roster.ts` for the
  cockpit and active-lineage projection;
- `RunResults`, the Run Impact envelope, and Career Spine APIs for recognition;
- `notificationStore` and `/api/progression/attention` for server-backed attention;
- `/api/game/session`, `runContinuity`, and validated deterministic-state checkpoints for run
  recovery;
- the clan API/configuration and forward clan migration for directory, roles, and
  Glory.

The presence of checkpoint export code in the engine does not itself satisfy active
run recovery. The server verification, persistence, lease, resume, and journey
surfaces are part of the same acceptance boundary.

## 11. Telemetry and evaluation

Consent-gated product telemetry measures friction and understanding; it never becomes
authority. Events use server session/artifact references where required, avoid raw
teammate detail, and minimize player-identifying payloads.

### Journey

- Play -> Setup -> board time and tap count;
- Setup changes, snake-sheet opens, Lab detours, return success, and abandonment;
- commitment distribution, maximum confirmation cancellation, and start rejection;
- Results -> Replay/Setup/destination time;
- navigation destination use, More opens, and dead-end/backtracking rate.

### Integrity

- duplicate start recovery and prevented duplicate Energy spend;
- preparing/prepared/active/settling recovery counts and success rate;
- checkpoint cadence, age, validation rejection, bounded rollback, lease conflict,
  and resume completion;
- connection-hold frequency and duration;
- explicit abandonment reason and session age;
- settlement/impact recovery after response loss.

### Recognition and attention

- impacts and grouped beats by significance;
- beat rendered, auto-advanced, manually advanced, collapsed, or left unseen;
- reduced-motion/static-summary completion;
- destination opened and time to next run;
- action age-to-resolution, recognition age-to-seen, failed transitions, and `9+`
  aggregation frequency;
- whether strong runs feel louder without increasing Results abandonment.

### Competition

- directory search-to-view/application/join conversion;
- open join, application, invitation, role, transfer, removal, and failure paths;
- roster contribution/rank views and top-five replacement behavior;
- Glory eligibility, assignment, reassignment attempts, self-award attempts, reward
  idempotency, tenure, alt-like rotation, and later participation;
- repeat winners and whether bounded DNA rewards create progression snowball.

Qualitative tests ask players to narrate what will happen before Start, where they
would change snakes, what a Results bar means, how to resume an interrupted run, why
a badge remains, and why a Glory Member earned the status. Correct task completion
without explanation is the acceptance target; explanatory copy is a fallback, not
the design.

## 12. Explicit tradeoffs and risks

| Decision | Benefit | Cost/risk | Guardrail |
|---|---|---|---|
| Five stable navigation groups | Strong memory and mobile fit | Shop/Settings take one extra action | More remains obvious; Play, Lab, Compete, and You stay direct. |
| Setup-local snake chooser | Ordinary preparation stays in context | Narrow duplication of Lab selection | Chooser exposes active leaves only; all management remains in Lab. |
| Active leaves replace generation cards | Roster remains legible and snake feels evolved | Ancestors are less immediately visible | One-tap dossier preserves lineage and history. |
| Tactile Victory Lap | Strong trophy-raising payoff without claim debt | Can feel repetitive after routine runs | Three-beat cap, immediate Replay/Setup, one-action completion, significance gating. |
| Daily Take as the only economic claim | No stranded rewards or badge debt | Presentation copy must distinguish secured from pending | Explicit “secured” receipt and no grant RPC behind Victory Lap taps. |
| Validated checkpoints | Stake survives process loss credibly | Validation/storage cost; bounded rollback | Configurable cadence, sparse critical checkpoints, retention policy, leases. |
| Visible clan ranks and Glory | Competition, responsibility, and prestige become real | Pressure, favoritism, alt abuse, moderation | Verified context, auditable boundary assignment, bounded idempotent rewards. |
| Mobile-first composition | One teachable hierarchy everywhere | Desktop may initially feel sparse | Add density only through optional detail, never extra primary concepts. |
| No browser progress persistence | Cross-device truth and economy integrity | Offline continuity requires server contact | Short connection hold and transparent recovery; no fake offline authority. |

The main operating costs are checkpoint validation/storage, attention-state support,
clan moderation and abuse review, accessibility regression coverage, and maintaining
destination mappings when an existing progression system changes. The UX itself
requires no recurring authored content.

## 13. Delivery order and acceptance criteria

Delivery may be phased internally, but the player-facing release must be coherent.
Do not advertise active-run recovery until verified checkpoints are live end to end.

### A. Prepare, navigation, and lineage

- [ ] Open -> Launch -> Start -> held board remains at most three actions.
- [ ] Setup shows snake, generation/Yield, mode, Energy/recovery/multiplier, risk, and
      one dominant Start action without requiring adjustment.
- [ ] Choosing/equipping a snake never creates a session or spends Energy.
- [ ] Maximum commitment requires an explicit labelled confirmation and works at 6/6.
- [ ] Setup -> Lab -> Back to Setup preserves server choices and returns predictably.
- [ ] Primary navigation has five stable, unscaled 44px destinations on supported
      mobile viewports; Run remains immersive.
- [ ] Everyday selectors exclude lower generations but retain distinct active
      equal-generation builds; every omitted ancestor remains in the dossier.

### B. Start and run integrity

- [ ] Same start ID plus same fingerprint returns one session and consumes Energy
      once; a different fingerprint conflicts.
- [ ] One non-terminal run per player is enforced atomically under concurrent starts.
- [ ] Refresh or response loss after a six-Energy start recovers the prepared session
      without a second spend.
- [ ] Activation records the first verified checkpoint before simulation advances.
- [ ] Active checkpoints reproduce deterministic future state, including RNG and
      pending choices, after manifest, bound, monotonicity, and lease validation.
- [ ] Resume invalidates the prior lease and cannot fork, reroll, duplicate, or evade a
      verified outcome.
- [ ] Refresh, closure, route reset, client crash, device restart, and network loss do
      not terminally close a run.
- [ ] Only verified death, verified bank, or confirmed abandonment creates a terminal
      outcome; duplicate completion/abandonment is idempotent.
- [ ] Settling and lost-response states recover the same canonical receipt.

### C. Results and attention

- [ ] Results has exactly three layers, no commerce, one recommended destination, and
      immediately available Replay/Setup.
- [ ] A server-authored Victory Lap groups at most three meaningful collection beats,
      visibly renders before/after movement and threshold crossings, and offers one-
      action completion.
- [ ] Routine, practice, pending, milestone, historic, and 20-impact fixtures remain
      truthful and bounded.
- [ ] Reduced motion renders an immediate complete static equivalent.
- [ ] Only Daily Take performs an economic collect; every other reward is secured
      before its optional collection acknowledgement.
- [ ] The global urgent count contains actions only; recognition is a destination dot.
- [ ] Exact render clears only exact recognition; inbox open, route mount, generic
      summary, failed transition, and skipped unseen beat do not.
- [ ] Attention state converges across devices and survives response loss.

### D. Competitive clans

- [ ] Searchable directory truthfully exposes capacity, policy, availability, and
      real activity/performance context.
- [ ] Open, application, and invite-only membership paths are permission-checked,
      atomic, and recoverable.
- [ ] Leader/Co-leader/Member actions match the role matrix; transfer and removal are
      explicit and audited.
- [ ] Founding quotes and atomically spends the server-configured DNA cost.
- [ ] Member contribution and rank derive only from valid server results and distinguish
      no-result from failure/absence.
- [ ] At most two Glory seats can be assigned at a battle boundary to eligible
      contributors; assignment and bounded DNA reward are auditable and idempotent.
- [ ] Payment cannot alter rank, contribution, eligibility, Glory, earned styling, or
      any competitive number.

### E. Authority, accessibility, and quality

- [ ] Automated scans and journey tests find no progress/recovery persistence in
      browser storage or service-worker caches.
- [ ] Every durable mutation checks authentication, ownership, database errors,
      idempotency, and concurrency boundaries.
- [ ] Keyboard, touch, screen reader, 200% zoom, reduced motion, safe-area, short
      landscape, 320px portrait, and focus-return journeys pass.
- [ ] Telemetry covers the failure and decision points above without becoming progress
      authority or copying unnecessary teammate data.
- [ ] Feature-off behavior remains coherent and never disables earning, settlement,
      checkpoints, receipts, history, or attention creation.

The release succeeds when a player can say, without being taught: “Of course I
choose my snake here; of course this returns to Setup; of course that is the run I
committed; of course these are the rewards it moved; of course I can continue after
an interruption; and of course that player and clan have earned their prestige.”
