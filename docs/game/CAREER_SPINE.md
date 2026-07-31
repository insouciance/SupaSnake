# SupaSnake Career Spine

**Status:** Owner-approved product contract · 30 July 2026
**Authority:** `docs/PRODUCT_CONSTITUTION.md` v1.6 remains design law. This
contract defines the recognition, attention, career-memory, and social-witness
projection of its three progression pillars. Where an older identity or flow
document conflicts, this contract wins.

## 1. Purpose

SupaSnake's run is the attraction. The persistent career gives each run a
reason, turns a snake into something owned, and lets a small clan notice when a
player delivers.

The Career Spine is not a fourth progression system. It is the route by which
the already-authoritative systems become legible:

```text
authoritative settlement
          |
          v
durable Run Impact Receipt
   |           |              |
   v           v              v
Results     Attention      Permanent memory
(now)       (later)        Chronicle / Lab / Clan
```

The emotional sequence is:

> Fun attracts the player. Progress gives the run purpose. Ownership creates
> attachment. Social recognition gives achievement meaning beyond the self.

## 2. Binding boundaries

1. There is no Account Level, account XP, new currency, new mode, new daily
   surface, or new metagame hub.
2. Every durable advancement belongs to Mastery, Lineage, or Discovery. Clan is
   the witness, not a fourth pillar. Calendar systems provide context, not a
   second account progression graph.
3. Rewards and progress secure immediately and server-authoritatively. A reveal
   may never hold value hostage. Daily Take remains the only literal collect.
4. Training remains rewardless. A run may leave an honest receipt without
   advancing a bar; activity is not disguised as achievement.
5. Results stays three layers, contains exactly one recommended next action,
   keeps Replay immediately available, and contains no commerce.
6. Recognition has a budget: at most three grouped beats after one run. It is
   optional, skippable, reduced-motion safe, and never interrupts live play.
7. Other clan members' attempts, Energy, generations, thresholds, absences,
   contribution totals, and ranks remain private. Social proof is earned,
   event-based, and voluntarily shared.
8. Free players receive every career fact and every conclusion needed to
   improve. Keeper may alter archive depth, organization, and presentation;
   Atelier may alter appearance. Neither may mint or imitate earned proof.
9. **No progress-related fact, payload, receipt, notification, seen state,
   pursuit, reward request, or career projection is stored in `localStorage`,
   `sessionStorage`, IndexedDB, Cache Storage, cookies, analytics persistence,
   or another browser-persistent store.** Authenticated state is server-held.
   Guest presentation may live in
   memory for the current document and disappear on reload. Consent, legal
   choices, device preferences, and non-progress accessibility/UI preferences
   are outside this rule only when no player progress can be inferred from
   them.
10. `NEXT_PUBLIC_CAREER_SPINE_V1` is a presentation-only rollback boundary.
    When it is not the exact string `true`, the new Career Pulse, snake
    passport, run-recognition review, attention reads, and seen transitions are
    absent. Settlement, receipts, moments, lineage history, and every earned
    mutation continue server-side; switching presentation off can never stop
    or erase progress.

## 3. The canonical impact contract

Every completed authoritative settlement owns one immutable, versioned receipt.
The client renders it; the client does not infer it.

```ts
type ImpactSignificance = 'routine' | 'notable' | 'milestone' | 'historic';

interface RunImpactEnvelope {
  version: 1;
  sessionId: string;
  settledAt: string;
  outcome: 'extracted' | 'crashed' | 'completed';
  dynasty: 'CYBER' | 'PRIMAL' | 'COSMIC';
  receipt: {
    validated: boolean;
    score: number;
    yieldDna: number;
    dnaCredited: number;
    energyCommitted: number;
    commitmentMultiplierBps: number;
    generation: number;
    personalBest: {
      eligible: boolean;
      before: number;
      after: number;
      improved: boolean;
    };
  };
  impacts: RunImpact[];
  featuredImpactKeys: string[]; // zero to three
  recommendedAction: {
    headline: string;
    destination: CareerDestination;
    artifactRef?: string;
  } | null;
}

interface RunImpact {
  key: string;
  pillar: 'mastery' | 'lineage' | 'discovery' | 'clan' | 'calendar';
  kind: string;
  headline: string;
  detail?: string;
  before?: number;
  after?: number;
  delta?: number;
  significance: ImpactSignificance;
  destination?: CareerDestination;
  artifactRef?: string;
  metadata?: Record<string, JSONValue>;
}
```

Requirements:

- A run outcome becomes earned progress when the authoritative end endpoint
  accepts, validates, and freezes its immutable settlement snapshot. Before
  that boundary a client claim is not server-verifiable progress: the live tab
  retries in memory and tells the player to remain online, but never writes the
  claim to browser storage. Once frozen, recovery is wholly server-owned and
  survives tab loss, process death, retries, and reconnects.
- The session reward ledger, player aggregate, DNA audit row, and immutable PB
  truth settle atomically and idempotently before presentation is persisted.
- One receipt per session, unique and idempotent.
- Settlement, duplicate completion, reconnect, and response-loss recovery all
  resolve to the same receipt.
- The receipt includes the server-known transitions for Score/PB, Yield/DNA,
  Mastery, Codex, Records, ladder, Signal, and Clan Energy Battle where those
  systems applied.
- A duplicate end request returns or points to the canonical receipt; it never
  forces the client to discard an unknown recognition outcome.
- Receipt construction and significant-moment materialization are safe to
  retry. A retry cannot grant value or create a moment twice.
- Routine receipts may use bounded retention. Milestone and historic moments,
  lineage history, honors, and owned proof remain permanent under Rule 6.

## 4. Significance and ceremony budget

Significance is deterministic server product logic, not client taste:

| Level | Examples | Presentation | Permanent moment |
|---|---|---|---|
| Routine | XP/DNA delta; progress inside a tier | Compact sentence | No |
| Notable | PB; Signal completion; enters own clan five | Brief accent | Optional/current history |
| Milestone | Mastery level; Record tier; Codex milestone; unlock; clan honor | Review beat + destination | Yes |
| Historic | M10; capstone; top ladder clear; rare verified lineage/clan event | Strong beat + artifact | Yes |

Rules:

- Collapse related impacts into one beat.
- Order by historic → milestone → notable → routine.
- Render at most three beats, even if twenty underlying facts changed.
- Never manufacture movement when nothing was earned. The outcome receipt is
  still honest and complete.
- Motion communicates before → after and threshold crossing; reduced motion
  uses equivalent static state and accessible announcements.

## 5. Results — the lap of applause

### Layer 1: outcome

Outcome, personal best, share artifact, and the Daily Take when eligible.

### Layer 2: the two numbers

Score and full-strength Yield are primary. Credited DNA, Energy commitment, and
the settlement multiplier form one compact receipt. Detailed harvest arithmetic
is a disclosure rather than permanent visual weight.

For an eligible Clan Energy Battle run, Results states only the player's
consequence: entered/replaced, own fifth-best relation, and clan-total delta.
The full private five remains on the clan page.

### Layer 3: run impact

The collapsed summary states what moved. If at least one notable-or-greater
impact exists, one optional **Review run impact** disclosure reveals the bounded
sequence. This is presentation, not claiming. Replay and Setup remain visible
throughout and never wait for it.

Transient run genes, a duplicate Player Card, commercial content, and
asynchronously arriving Analyst narration do not belong in this digest. Analyst
may remain an optional run review or Chronicle artifact outside the reward
sequence.

## 6. Attention is not recognition

### 6.1 Action attention

Only unresolved actions may create the global bell's urgent count:

- Daily Take available.
- Save an anonymous account.
- Claim or deliberately dismiss a handle prompt.
- Repair a missing lineage primary or another integrity-required choice.

An action clears only when completed or explicitly dismissed where permitted.

### 6.2 Recognition attention

An unseen milestone may add a subtle destination dot. It does not make the
global bell urgent. Routine progress creates no badge.

- Mastery clears after the relevant dynasty progress is rendered.
- Codex clears after the exact new entries are rendered.
- Record clears after the reached record/tier is rendered.
- Lineage clears after the new or retired specimen chapter is rendered.
- Clan honor clears after the result/honor is rendered.

Opening the notification center or merely mounting a route acknowledges
nothing. Items aggregate by destination and pillar; visible counts cap at `9+`.
No notification, badge, email, or result beat is commercial.

## 7. Career Pulse and goals

The owner Chronicle receives a private Career Pulse above its museum sections:

- A quiet Mastery/Lineage/Discovery snapshot.
- One optional pinned pursuit chosen from an existing system.
- Recent meaningful moments.
- The current private Clan Energy Battle state.
- One clear destination.

A pursuit organizes existing goals; it grants no XP, reward, multiplier, timer,
or obligation. Examples include the next Mastery rung, own fifth-best battle
threshold, breeding cost, Record tier, ladder rung, or Codex completion. Public
profiles never expose a player's uncompleted pursuit.

The public Chronicle remains a curated museum. A new account reads as a
beginning, not a page of zeroes.

## 8. Lineage dossiers and specimen passports

Lineage receives a stable dossier independent of the lifetime of one active
`collected_snakes` row. Each bred specimen or generation leaf records:

- Origin, pedigree, generation, traits, and strain.
- Creation and retirement/refund timestamps.
- Runs, extractions, PB Score, and PB Yield achieved with it.
- Highest successful Energy commitment.
- Selected clan delivery and milestone references.

Downgrade remains the exact-refund exchange already ruled:

- Only the highest active leaf may be unwound.
- Its immutable passport becomes `retired_refunded`; it is history, not current
  ownership.
- It cannot be equipped, selected for a run, or presented as a currently owned
  generation proof.
- The next-highest active generation remains the only playable representative
  of that branch, while equal-generation top builds may remain distinct.

This prevents breed/share/refund prestige laundering while keeping the memory
of what actually happened.

## 9. Credible identity and social witness

The Player Card keeps a maximum of three curated proof/decorative slots. Every
visible item carries a provenance class:

- earned skill;
- lineage;
- discovery;
- clan honor;
- supporter/purchased decoration.

Paid appearance never uses the same visual grammar as an earned tier. The
opaque public Legacy Score headline retires; its underlying Records remain and
may continue to support historical/internal compatibility. Public status comes
from chosen, understandable proof.

Clan recognition uses:

- the player's private five and exact result delta;
- aggregate clan and rival Depth;
- equal participant/stalemate/victor honors;
- clan battle history and rivalry memory;
- voluntary server-verified run, snake, milestone, and clan artifacts.

There is no member KPI, minimum, absence count, contribution rank, officer
output control, or automatic public comparison. Discord posts are rare,
non-commercial, non-comparative, current-system events and are rate-limited.

## 10. Monetization boundary

Free includes all current career facts, recent meaningful history, earned proof,
actionable analysis, and the ability to understand and improve.

Keeper may provide continuity and organization:

- deeper routine-run archive retention;
- folders, tags, annotations, and saved filters;
- additional cosmetic loadouts and showcase layouts;
- richer archive visualization and export packaging.

Atelier may provide appearance. Neither can alter the receipt, significance,
proof provenance, progression, clan outcome, or notification priority. A paid
layout can frame earned proof; it cannot become proof.

## 11. Telemetry and validation

Consent-gated telemetry records presentation behavior, never private teammate
facts:

- receipt recovered after response loss;
- impact summary shown;
- review opened, skipped, or completed;
- significance and grouped-beat count;
- destination opened;
- attention resolved and age-to-resolution;
- verified artifact shared;
- time from Results to Replay/Setup.

Required fixture sets contain 0, 1, 5, and 20 impacts. System tests cover
idempotency, duplicates, reconnects, cross-device state, exact clear semantics,
lineage downgrade history, private/public projections, reduced motion, screen
readers, and the complete absence of progress-related browser persistence.

## 12. Operating cost

The system generates no recurring authored content. Significance rules and
destination mappings change only when an existing progression system changes.
Permanent costs are schema/storage growth, receipt retention, privacy/export
support, occasional copy/provenance review, and regression coverage. Routine
receipts are bounded; permanent moment rows are sparse. This fits Constitution
slot 5, Chronicle and lineage presentation, without opening a new content lane.

The first atomic release deliberately retains each adopted durable-ingress
envelope as recovery evidence. Before run volume makes that duplicate JSON a
material storage cost, compaction may remove or reduce an **adopted** envelope
only after the atomic reward ledger, core progression, Signal, clan result, and
canonical impact receipt all prove durable. `staged` and `quarantined` evidence
has no time-to-live and may never be discarded by retention cleanup.
