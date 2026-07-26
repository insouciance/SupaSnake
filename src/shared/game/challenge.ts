/**
 * Challenge links and the shareable artifact's data model (WP-1.08).
 *
 * Authority: Constitution §11.3 (the shareable artifact — the
 * portal-decision string, the challenge link, "seed + target"), Rule 14
 * ("if it matters, it has a URL"), Rule 7 (no commercial surface on an
 * artifact or its landing page), §12.2 (≤3 taps open → board: a challenge
 * link is ONE tap to a live board, so it must carry everything the board
 * needs).
 *
 * Everything here is pure: no clock that is not passed in, no environment,
 * no database, no `Math.random()`. The Signal day, its seed, the decision
 * string and the challenge codec are functions of their arguments alone, so
 * the server, the OG image renderer and the client all derive the same
 * answer without asking each other — and a test can pin any day by naming
 * a date.
 *
 * WHY A SEED IS ENOUGH
 *
 * `challengeRng` is the exact derivation `SnakeGameLogic` is handed when a
 * challenge starts. Since finding F-12 was fixed (food placement had been
 * calling `Math.random()` behind the injected rng's back), a seed
 * reproduces a board exactly, which is the whole promise of §11.3: "drops
 * the visitor onto the *same seed* with the sharer's score as the target".
 *
 * TRUST MODEL — stated plainly, because a URL is forgeable
 *
 * A challenge link carries a target score in its query string, so anyone
 * can type any number into one. That is fine and deliberate: the target is
 * a *dare*, not a record. It is never written to a leaderboard, never paid
 * out, and never reaches a settlement — the run a challenge link starts
 * settles through the same server recompute as any other run (Rule 11).
 * The artifact cards render a claimed target as a claim ("beat 1,240"), and
 * the numbers they present as fact — the Signal day, its conditions, the
 * Serpent week's seed and modifier, a settled clan Depth — are derived from
 * the calendar or read from the database, never from the link.
 */

import { fnv1a, mulberry32 } from '@/shared/game/offerGravity';

// ---------------------------------------------------------------------------
// The Signal calendar
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

/**
 * Signal day epoch: Monday 2024-01-01 00:00 UTC — the same instant as
 * `SERPENT_EPOCH_UTC` in `serpent.ts`.
 *
 * Sharing the epoch is not decorative. §7.1's cadence stack has the daily
 * Signal and the weekly Serpent running on one calendar, and Signal day
 * `7 * n` is then always the Monday that opens Serpent week `n`. Anything
 * else and "Signal #214" and "week of 2024-08-05" would drift apart in the
 * two places a player ever sees them side by side.
 *
 * Day 1 is the epoch itself: a "Signal #0" reads as a bug, not a day.
 */
export const SIGNAL_EPOCH_UTC = Date.UTC(2024, 0, 1);

/** The day's stable key: its UTC date as `YYYY-MM-DD`. */
export function signalDayKey(at: Date | number = Date.now()): string {
  const d = new Date(at);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  )
    .toISOString()
    .slice(0, 10);
}

/** `YYYY-MM-DD` → the Date it names at 00:00 UTC. */
export function signalDayKeyToDate(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00.000Z`);
}

/** The day's public number — the `214` in `supasnake.com/s/214` (§11.3). */
export function signalDayIndex(at: Date | number = Date.now()): number {
  const midnight = signalDayKeyToDate(signalDayKey(at)).getTime();
  return Math.round((midnight - SIGNAL_EPOCH_UTC) / DAY_MS) + 1;
}

/** The inverse: Signal #N → the UTC date key it names. */
export function signalIndexToDayKey(index: number): string {
  return signalDayKey(SIGNAL_EPOCH_UTC + (Math.floor(index) - 1) * DAY_MS);
}

/**
 * The day's seed, as it is displayed and as the engine consumes it:
 * `D` + 8 hex digits of FNV-1a over the day key. Identical shape and
 * derivation to `serpentWeekSeed`, which uses `S`.
 */
export function signalDaySeed(dayKey: string): string {
  return `D${(fnv1a(dayKey) >>> 0).toString(16).padStart(8, '0')}`;
}

/** Signal #N → the seed every player in the world plays that day on. */
export function signalSeedForIndex(index: number): string {
  return signalDaySeed(signalIndexToDayKey(index));
}

// ---------------------------------------------------------------------------
// The seeded run
// ---------------------------------------------------------------------------

/**
 * The rng a seeded run is built with. One derivation, used by the engine,
 * the tests and any future replay — if this function moves, determinism
 * moves with it and nothing else has to be found and changed.
 */
export function challengeRng(seed: string): () => number {
  return mulberry32(fnv1a(seed));
}

/** Seeds are opaque tokens in a URL; keep them to what a path can hold. */
export const SEED_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidSeed(value: unknown): value is string {
  return typeof value === 'string' && SEED_PATTERN.test(value);
}

// ---------------------------------------------------------------------------
// The portal-decision string — the run's dramatic arc in five characters
// ---------------------------------------------------------------------------

/**
 * §11.3 renders the arc as `⚡▶▶💰` — "infuse · pass · pass · BANKED ×1.25".
 * The URL carries the compact letters; the card renders the glyphs, so a
 * link stays copy-pasteable through clients that mangle emoji.
 */
export type PortalDecision = 'infuse' | 'pass' | 'bank' | 'crash';

const DECISION_LETTERS: Record<PortalDecision, string> = {
  infuse: 'i',
  pass: 'p',
  bank: 'b',
  crash: 'x',
};

const LETTER_DECISIONS: Record<string, PortalDecision> = {
  i: 'infuse',
  p: 'pass',
  b: 'bank',
  x: 'crash',
};

export const DECISION_GLYPHS: Record<PortalDecision, string> = {
  infuse: '⚡',
  pass: '▶',
  bank: '💰',
  crash: '💀',
};

export const DECISION_WORDS: Record<PortalDecision, string> = {
  infuse: 'infuse',
  pass: 'pass',
  // The terminal decisions are the ones the arc lands on, so they shout.
  bank: 'BANKED',
  crash: 'CRASHED',
};

/**
 * A run's arc is at most this many portals long in a share. A run can meet
 * more portals than this; the string keeps the last decisions, because the
 * ending is the story and an unbounded string is a URL-length attack.
 */
export const MAX_DECISIONS = 12;

/** Decisions → the compact URL token (`ippb`). */
export function encodeDecisions(decisions: readonly PortalDecision[]): string {
  return decisions
    .slice(-MAX_DECISIONS)
    .map((decision) => DECISION_LETTERS[decision])
    .join('');
}

/** The URL token → decisions. Unknown letters are dropped, never guessed. */
export function parseDecisions(raw: unknown): PortalDecision[] {
  if (typeof raw !== 'string') return [];
  const decisions: PortalDecision[] = [];
  for (const letter of raw.slice(0, MAX_DECISIONS)) {
    const decision = LETTER_DECISIONS[letter];
    if (decision) decisions.push(decision);
  }
  return decisions;
}

/** The glyph row: `⚡▶▶💰`. Empty for a run that never met a portal. */
export function decisionGlyphs(decisions: readonly PortalDecision[]): string {
  return decisions.map((decision) => DECISION_GLYPHS[decision]).join('');
}

/**
 * The words under the glyphs: `infuse · pass · pass · BANKED ×1.25`.
 * The ×1.25 is the shipped BANK multiplier and is appended only to a banked
 * arc, because that is the only arc it applies to.
 */
export function decisionWords(decisions: readonly PortalDecision[]): string {
  if (decisions.length === 0) return 'no portal met';
  return decisions
    .map((decision, index) =>
      decision === 'bank' && index === decisions.length - 1
        ? `${DECISION_WORDS.bank} ×1.25`
        : DECISION_WORDS[decision]
    )
    .join(' · ');
}

// ---------------------------------------------------------------------------
// The challenge itself
// ---------------------------------------------------------------------------

/** What kind of artifact a challenge was cut from. */
export type ChallengeKind = 'signal' | 'run';

export interface Challenge {
  kind: ChallengeKind;
  /** The seed both players play. Derived for a Signal, explicit for a run. */
  seed: string;
  /** The sharer's score, as a dare. Never a record — see the trust model. */
  target: number | null;
  /** Signal day index, when the challenge came from a Signal day. */
  day: number | null;
  /** Who threw it down, if they were willing to be named. */
  by: string | null;
  decisions: PortalDecision[];
}

/**
 * Targets are clamped to a sane band so a hand-edited URL cannot render a
 * card with a 40-digit number in it. The ceiling is far above any score the
 * shipped fold can produce; it exists to bound the glyph, not to judge.
 */
export const MAX_TARGET = 100_000_000;

/** Handles that reach a card are trimmed to the shipped handle shape. */
const HANDLE_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

export function parseTarget(raw: unknown): number | null {
  const value =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim() !== ''
        ? Number(raw)
        : NaN;
  if (!Number.isFinite(value)) return null;
  const floored = Math.floor(value);
  if (floored <= 0) return null;
  return Math.min(floored, MAX_TARGET);
}

export function parseHandle(raw: unknown): string | null {
  return typeof raw === 'string' && HANDLE_PATTERN.test(raw) ? raw : null;
}

/** A Signal day number that a URL segment may legally name. */
export function parseSignalDay(raw: unknown): number | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const text = String(raw);
  if (!/^\d{1,7}$/.test(text)) return null;
  const day = Number(text);
  return day >= 1 ? day : null;
}

export interface ChallengeQuery {
  t?: string | null;
  by?: string | null;
  d?: string | null;
  seed?: string | null;
}

/**
 * Read a challenge off a Signal artifact URL: `/s/214?t=1240&by=…&d=ippb`.
 * The seed is *derived from the day*, never taken from the query — that is
 * what makes "same conditions worldwide" (§7.2) true for a challenge too.
 */
export function challengeFromSignal(
  day: number,
  query: ChallengeQuery = {}
): Challenge {
  return {
    kind: 'signal',
    seed: signalSeedForIndex(day),
    target: parseTarget(query.t),
    day,
    by: parseHandle(query.by),
    decisions: parseDecisions(query.d),
  };
}

/** Read a challenge off a run artifact URL: `/r/<seed>?t=1240&d=ippb`. */
export function challengeFromRun(
  seed: string,
  query: ChallengeQuery = {}
): Challenge | null {
  if (!isValidSeed(seed)) return null;
  return {
    kind: 'run',
    seed,
    target: parseTarget(query.t),
    day: null,
    by: parseHandle(query.by),
    decisions: parseDecisions(query.d),
  };
}

/**
 * The challenge as query parameters, omitting everything absent so a bare
 * artifact link stays bare. Ordered, so two identical challenges produce
 * one identical URL and a shared link dedupes in a feed.
 */
export function challengeQueryParams(
  challenge: Pick<Challenge, 'target' | 'by' | 'decisions'>
): Array<[string, string]> {
  const params: Array<[string, string]> = [];
  if (challenge.target !== null) params.push(['t', String(challenge.target)]);
  if (challenge.by) params.push(['by', challenge.by]);
  if (challenge.decisions.length > 0) {
    params.push(['d', encodeDecisions(challenge.decisions)]);
  }
  return params;
}

/** The one-line dare a card and a share text both lead with. */
export function challengeHeadline(challenge: Challenge): string {
  const where =
    challenge.kind === 'signal' && challenge.day !== null
      ? `Signal #${challenge.day}`
      : 'this seed';
  if (challenge.target === null) {
    return `Play ${where}`;
  }
  const target = challenge.target.toLocaleString('en-US');
  return challenge.by
    ? `Beat ${challenge.by}'s ${target} on ${where}`
    : `Beat ${target} on ${where}`;
}
