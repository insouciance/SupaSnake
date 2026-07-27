/**
 * The World Serpent — the weekly hunt and the home of Depth.
 *
 * Authority: Constitution §7.3 (the Serpent), §6.2 (Yield and Depth), §8.6
 * (the harvest envelope — Serpent attempts are exempt), Rule 5 (absence is
 * never destructive), Rule 6 (earned things are permanent), Rule 8 (clans
 * never grade and never bill), Rule 10 / §12.2 (the Serpent is the ONE weekly
 * surface) and Rule 11 (server authority).
 *
 * Everything in this file is pure. No clock is read that is not passed in, no
 * database is touched, no environment is consulted. That is deliberate: the
 * week, its seed and its modifier set are a function of the UTC calendar and
 * nothing else, so the server can derive them without asking anybody — least
 * of all the client (Rule 11) — and a test can pin any week in history or in
 * the future by naming a date.
 *
 * THE THREE NUMBERS, AND WHY THEY CANNOT DRIFT
 *
 *   weekly Depth   = the sum of a player's best THREE Serpent Yields in the
 *                    week. Improvement, not volume (§7.3): a fourth run can
 *                    raise the number only by being better than the third.
 *   clan Depth     = the plain SUM of its members' weekly Depths. An additive
 *                    sum of participation, with no threshold, no floor, no
 *                    minimum and no bar anywhere in it (Rule 8). A clan of one
 *                    reads exactly as meaningfully as a clan of twelve.
 *   lifetime Depth = the sum over every settled week, taken monotonically.
 *                    It is RECOMPUTED from the persisted weekly rows and then
 *                    clamped upward — never incremented. That single choice is
 *                    what makes settlement idempotent (running it twice cannot
 *                    double-count) and monotonic (Rules 5 and 6) at the same
 *                    time.
 *
 * DEPTH READS FULL-STRENGTH YIELD, ALWAYS
 *
 * §8.6: "all Serpent attempts consume no Energy; Depth always counts
 * full-strength Yield regardless of charge state." So every fold here reads
 * `yield_dna` — the full-strength number WP-0.01 records separately — and
 * never `dna_earned`, which is the lean-adjusted DNA the run actually paid.
 * A player who spent their six charges before the hunt hunts at full depth.
 *
 * MONEY CANNOT REACH ANY OF IT (Rule 3, §6.2)
 *
 * The only input to Depth is `yield_dna` on a settled session row. Nothing in
 * this module reads an entitlement, a subscription, a purchase, a cosmetic or
 * an account flag, and there is no parameter through which one could be
 * introduced without changing a signature.
 */

import {
  ANOMALIES,
  ANOMALY_ROTATION,
  anomalySummary,
  isAnomalyId,
  type AnomalyId,
} from '@/shared/game/anomalies';
import {
  CONDITION_CLAUSES_PER_WEEK,
  CONDITION_CLAUSE_DOMAINS,
  conditionClausesForKey,
  type ConditionClauseId,
} from '@/shared/game/worldCondition';
import { endReasonSettles } from '@/lib/session/lifecycle';

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

// ---------------------------------------------------------------------------
// The calendar
// ---------------------------------------------------------------------------

/**
 * Week epoch: Monday 2024-01-01 00:00 UTC — the same Monday the Anomaly
 * rotation uses (`ANOMALY_EPOCH_UTC`). Sharing the epoch is not decorative:
 * §7.3 has the Serpent absorb the weekly-Anomaly machinery, so the two must
 * agree on where a week starts for as long as both exist. `serpent.test.ts`
 * asserts the two week-start functions agree on every day of a two-year span.
 */
export const SERPENT_EPOCH_UTC = Date.UTC(2024, 0, 1);

/**
 * Monday 00:00 UTC of the week containing `at`.
 *
 * "Sunday midnight UTC it submerges" (§7.3) is the END of Sunday, i.e. the
 * next Monday 00:00 UTC — so the window is [Mon 00:00, next Mon 00:00).
 */
export function serpentWeekStart(at: Date | number = Date.now()): Date {
  const d = new Date(at);
  const utcMidnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const daysSinceMonday = (d.getUTCDay() + 6) % 7; // 0 = Sunday -> 6
  return new Date(utcMidnight - daysSinceMonday * DAY_MS);
}

/** The exclusive end of the week that starts at `weekStart`. */
export function serpentWeekEnd(weekStart: Date | number): Date {
  return new Date(new Date(weekStart).getTime() + WEEK_MS);
}

/** The week's stable key: the Monday's UTC date as `YYYY-MM-DD`. */
export function serpentWeekKey(at: Date | number = Date.now()): string {
  return serpentWeekStart(at).toISOString().slice(0, 10);
}

/** Whole weeks since the epoch Monday. Negative before it; still stable. */
export function serpentWeekIndex(at: Date | number = Date.now()): number {
  return Math.round((serpentWeekStart(at).getTime() - SERPENT_EPOCH_UTC) / WEEK_MS);
}

/** `YYYY-MM-DD` -> the Date it names at 00:00 UTC. */
export function serpentWeekKeyToDate(weekKey: string): Date {
  return new Date(`${weekKey}T00:00:00.000Z`);
}

// ---------------------------------------------------------------------------
// The seed and the modifier draw
// ---------------------------------------------------------------------------

/**
 * The curated modifier pool (§7.3: "drawn from the curated modifier pool
 * (reusing the shipped weekly-Anomaly machinery)").
 *
 * Reusing the pool rather than authoring a new one is the point: every entry
 * is an effect the engine already implements exactly and the validator already
 * recomputes, so a Serpent week costs zero authoring (§7.3 solo-operability)
 * and introduces no new balance surface.
 */
export const SERPENT_MODIFIER_POOL: readonly AnomalyId[] = ANOMALY_ROTATION;

/**
 * How many modifiers a week's condition-set draws.
 *
 * ONE, deliberately. §7.3 asks for "one seeded condition-set per week"; a set
 * of size one is a condition-set, and it is the largest one that needs no new
 * rules. Two economic modifiers ([E] in `anomalies.ts` — Gold Rush's ×1.5 food
 * and Twin Exits' ×1.15 bank) would have to define how they compose in the
 * payout fold, and that composition is a balance decision the Constitution
 * does not authorise and the exact-recompute validator would have to learn.
 * The set is stored and typed as an array so raising this constant is a tuning
 * change plus a stacking rule — never a migration.
 */
export const SERPENT_MODIFIERS_PER_WEEK = 1;

/** How many of a player's runs count toward weekly Depth (§7.3). */
export const SERPENT_COUNTED_RUNS = 3;

/**
 * FNV-1a over the week key. Deterministic, dependency-free and identical in
 * every JavaScript runtime — `Math.imul` keeps the multiply in 32 bits, which
 * is what makes it reproducible rather than platform-dependent.
 */
export function serpentSeedNumber(weekKey: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < weekKey.length; i += 1) {
    hash ^= weekKey.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** The week's seed as it is stored and displayed: `S` + 8 hex digits. */
export function serpentWeekSeed(weekKey: string): string {
  return `S${serpentSeedNumber(weekKey).toString(16).padStart(8, '0')}`;
}

/** xorshift32 — a seeded stream for the draw. Never `Math.random()`. */
function xorshift32(state: number): number {
  let x = state >>> 0;
  if (x === 0) x = 0x9e3779b9;
  x ^= x << 13;
  x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5;
  x >>>= 0;
  return x;
}

/**
 * The week's condition-set: `SERPENT_MODIFIERS_PER_WEEK` distinct modifiers
 * drawn from the curated pool by a seeded partial Fisher–Yates.
 *
 * Deterministic in the week key alone. Returned in draw order and always
 * distinct, so raising the count later cannot produce a doubled modifier.
 */
export function serpentModifiersForWeek(
  at: Date | number = Date.now(),
  count: number = SERPENT_MODIFIERS_PER_WEEK
): AnomalyId[] {
  const pool = [...SERPENT_MODIFIER_POOL];
  const wanted = Math.max(0, Math.min(Math.floor(count), pool.length));
  let state = serpentSeedNumber(serpentWeekKey(at));

  const drawn: AnomalyId[] = [];
  for (let i = 0; i < wanted; i += 1) {
    state = xorshift32(state);
    const pick = state % pool.length;
    drawn.push(pool[pick]);
    pool.splice(pick, 1);
  }
  return drawn;
}

/**
 * The week's CLAUSES (WP-2.10b) — the second half of its condition.
 *
 * Drawn from the same week key by the same seeded partial Fisher–Yates, under
 * the WEEK domain. The domain is what keeps a Monday's Signal clause from
 * being this week's Serpent clause: on a Monday `serpentWeekKey` and
 * `signalDayKey` return the SAME STRING, so an undomained hash would tie the
 * two rhythms together one day in seven. `worldCondition.clauses.test.ts`
 * sweeps ~160 weeks of Mondays asserting they diverge.
 */
export function serpentClausesForWeek(
  at: Date | number = Date.now(),
  count: number = CONDITION_CLAUSES_PER_WEEK
): ConditionClauseId[] {
  return conditionClausesForKey(
    CONDITION_CLAUSE_DOMAINS.week,
    serpentWeekKey(at),
    count
  );
}

/** A modifier as a panel renders it. Pure projection of the shipped pool. */
export interface SerpentModifier {
  id: AnomalyId;
  name: string;
  effect: string;
  kind: 'E' | 'P' | 'EP';
}

export function describeSerpentModifier(id: AnomalyId): SerpentModifier {
  const def = ANOMALIES[id];
  return { id: def.id, name: def.name, effect: anomalySummary(def.id), kind: def.kind };
}

/** The week, fully derived from the calendar. No id — the database owns that. */
export interface SerpentWeekDefinition {
  /** Monday of the week, `YYYY-MM-DD`. The natural key. */
  weekStart: string;
  /** Monday 00:00 UTC, ISO. */
  startsAt: string;
  /** The following Monday 00:00 UTC, ISO — exclusive, and the settle point. */
  endsAt: string;
  seed: string;
  modifiers: AnomalyId[];
  /**
   * The week's clauses. Stored in the SAME `serpent_weeks.modifiers TEXT[]`
   * column as the modifiers — `storedModifiers` below is the one composition —
   * because the two vocabularies are namespaced and cannot collide, which is
   * what lets this land with no migration at all.
   */
  clauses: ConditionClauseId[];
}

/**
 * The week's condition-set exactly as the column holds it: anomalies first,
 * then clauses. ONE function, so the writer, the drift tripwire and any
 * reader that wants to compare a stored row against the calendar all compose
 * the array the same way.
 */
export function serpentStoredModifiers(
  week: Pick<SerpentWeekDefinition, 'modifiers' | 'clauses'>
): string[] {
  return [...week.modifiers, ...week.clauses];
}

/**
 * Derive a week. This is the ONLY place a week is defined; the route, the
 * cron, the panel and the migration's drift check all read it, so there is no
 * second definition to disagree with.
 */
export function describeSerpentWeek(
  at: Date | number = Date.now()
): SerpentWeekDefinition {
  const start = serpentWeekStart(at);
  const weekStart = start.toISOString().slice(0, 10);
  return {
    weekStart,
    startsAt: start.toISOString(),
    endsAt: serpentWeekEnd(start).toISOString(),
    seed: serpentWeekSeed(weekStart),
    modifiers: serpentModifiersForWeek(start),
    clauses: serpentClausesForWeek(start),
  };
}

/** Has this week submerged? True once the exclusive end has passed. */
export function serpentWeekHasEnded(
  week: Pick<SerpentWeekDefinition, 'endsAt'>,
  now: Date | number = Date.now()
): boolean {
  return new Date(now).getTime() >= new Date(week.endsAt).getTime();
}

// ---------------------------------------------------------------------------
// Eligibility — gate two of two (WP-0.05 shape)
// ---------------------------------------------------------------------------

/**
 * A session row, reduced to everything Depth depends on.
 *
 * Deliberately does NOT carry `dna_earned`, `charge_state`, `score` or any
 * account field. Depth reads full-strength Yield and the run's own settlement
 * facts; there is no field here through which a build, a purchase or a charge
 * state could reach the number.
 */
export interface SerpentRunRow {
  sessionId: string;
  playerId: string;
  /** The serpent week the SERVER stamped at start. Never client-asserted. */
  serpentWeekId: string | null;
  /** Full-strength Yield (§6.2). `null` on a row settled before WP-0.01. */
  yieldDna: number | null;
  endedAt: string | null;
  /** `game_sessions.end_reason` (WP-0.06). `null` reads as settled. */
  endReason: string | null;
  validated: boolean | null;
  isFreePlay: boolean | null;
}

/**
 * Does this run contribute Depth to `weekId`?
 *
 * Six predicates, and the query in `src/lib/server/serpent.ts` applies the
 * same six. WP-0.05's two-gate shape: the database filters, and then this pure
 * fold re-applies every predicate to the rows that came back, so a filter that
 * regresses — a dropped `.eq`, a renamed column, a driver quirk — cannot leak
 * an ineligible run into a public number.
 *
 *   1. stamped for THIS week — the run was launched as an attempt in it;
 *   2. ended — an open run has not happened yet;
 *   3. settled — `endReasonSettles` is the single authority (WP-0.06). An
 *      `expired` or `abandoned` run contributes NOTHING, here as everywhere;
 *   4. validated — a flagged run never reaches a public number;
 *   5. not practice — Free Play pays nothing, so it counts nothing;
 *   6. positive Yield — a zero-Yield run is not an error, it just adds zero.
 */
export function isDepthEligibleRun(run: SerpentRunRow, weekId: string): boolean {
  if (run.serpentWeekId !== weekId) return false;
  if (!run.endedAt) return false;
  if (!endReasonSettles(run.endReason)) return false;
  if (run.validated === false) return false;
  if (run.isFreePlay === true) return false;
  return typeof run.yieldDna === 'number' && Number.isFinite(run.yieldDna) && run.yieldDna > 0;
}

// ---------------------------------------------------------------------------
// The folds
// ---------------------------------------------------------------------------

/**
 * The best `count` values, descending. The whole of "improvement, not volume".
 */
export function bestYields(
  yields: readonly number[],
  count: number = SERPENT_COUNTED_RUNS
): number[] {
  return [...yields].sort((a, b) => b - a).slice(0, Math.max(0, count));
}

/** One member's week. */
export interface SerpentPlayerDepth {
  playerId: string;
  /** Sum of the best three eligible Yields. Denominated in segments (§6.2). */
  depth: number;
  /** Eligible attempts. Unlimited by law (§7.3) — informational only. */
  attempts: number;
  /** The single best Yield of the week. */
  bestYield: number;
  /** The Yields that actually made the number, descending. */
  countedYields: number[];
  /** Clan at settlement time, or null. Never a grade — see Rule 8. */
  clanId: string | null;
}

/**
 * One member's weekly Depth from their candidate runs.
 *
 * Yields are floored to whole segments before they are summed, so the number
 * a panel shows and the number the database stores are the same integer.
 */
export function foldPlayerDepth(
  playerId: string,
  runs: readonly SerpentRunRow[],
  weekId: string,
  clanId: string | null = null,
  count: number = SERPENT_COUNTED_RUNS
): SerpentPlayerDepth {
  const eligible = runs
    .filter((run) => run.playerId === playerId && isDepthEligibleRun(run, weekId))
    .map((run) => Math.max(0, Math.floor(run.yieldDna as number)));

  const counted = bestYields(eligible, count);
  return {
    playerId,
    depth: counted.reduce((sum, value) => sum + value, 0),
    attempts: eligible.length,
    bestYield: counted.length > 0 ? counted[0] : 0,
    countedYields: counted,
    clanId,
  };
}

/** One clan's week. Additive, and nothing else (Rule 8). */
export interface SerpentClanDepth {
  clanId: string;
  /** The plain sum of member Depths. No threshold, no floor, no bar. */
  depth: number;
  /** Members who hunted this week. Informational; never a requirement. */
  contributingMembers: number;
}

export interface SerpentSettlement {
  weekId: string;
  players: SerpentPlayerDepth[];
  clans: SerpentClanDepth[];
}

/**
 * Settle a week: every member's Depth, and every clan's sum of them.
 *
 * `clanByPlayer` maps a player id to the clan they were in at settlement.
 * Membership is read once, at settlement, and recorded on the row — so a
 * player who leaves a clan afterwards never retroactively removes Depth the
 * clan already reached (Rule 6), and a clan cannot lose a settled number
 * because somebody walked.
 *
 * Members with zero eligible runs are kept in the output with `depth: 0`.
 * That is not an accident: Rule 8's reviewer question is "can any member's
 * reward change because of another member's number?", and the honest answer
 * is only visible if a zero-Depth member is a row like everybody else rather
 * than an absence. A clan of one whose single member did not hunt settles at
 * Depth 0 and loses nothing by it (Rule 5).
 */
export function settleSerpentWeek(
  weekId: string,
  runs: readonly SerpentRunRow[],
  clanByPlayer: ReadonlyMap<string, string | null> = new Map(),
  members: readonly string[] = []
): SerpentSettlement {
  const playerIds = new Set<string>(members);
  for (const run of runs) {
    if (isDepthEligibleRun(run, weekId)) playerIds.add(run.playerId);
  }

  const players = Array.from(playerIds)
    .sort()
    .map((playerId) =>
      foldPlayerDepth(playerId, runs, weekId, clanByPlayer.get(playerId) ?? null)
    );

  const byClan = new Map<string, SerpentClanDepth>();
  for (const player of players) {
    if (!player.clanId) continue;
    const entry = byClan.get(player.clanId) ?? {
      clanId: player.clanId,
      depth: 0,
      contributingMembers: 0,
    };
    // Additive sum of participation. There is no branch here, and adding one
    // — a minimum, a cut line, a multiplier keyed to another member — is the
    // documented way this design dies (§6.2, Rule 8).
    entry.depth += player.depth;
    if (player.depth > 0) entry.contributingMembers += 1;
    byClan.set(player.clanId, entry);
  }

  return {
    weekId,
    players,
    clans: Array.from(byClan.values()).sort((a, b) =>
      a.clanId.localeCompare(b.clanId)
    ),
  };
}

// ---------------------------------------------------------------------------
// Standings — monotonic by construction
// ---------------------------------------------------------------------------

/** What a player or clan carries across weeks. */
export interface SerpentStandings {
  lifetimeDepth: number;
  bestWeekDepth: number;
}

/**
 * Project standings forward from the FULL set of settled weekly Depths.
 *
 * Two properties, both load-bearing, both asserted in `serpent.test.ts`:
 *
 *   IDEMPOTENT — lifetime is the SUM of the persisted weekly rows, not an
 *     increment of the previous lifetime. Settling the same week again feeds
 *     the same set and produces the same sum, so a cron that runs twice, or
 *     re-runs after a partial failure, converges instead of double-counting.
 *
 *   MONOTONIC — the result is clamped upward against what is already stored
 *     (Rules 5 and 6). A shrinking source — a session invalidated later, a
 *     member who left, a row a GDPR erasure removed — can lower the recompute
 *     but can never lower the stored number. Depth never decreases, expires or
 *     decays; a missed week costs that week's opportunity and nothing else.
 *
 * The SQL in migration 046 implements exactly this, and
 * `serpent.migration.test.ts` pins that it uses `SUM` and `GREATEST` to do it.
 */
export function projectStandings(
  current: SerpentStandings,
  settledWeeklyDepths: readonly number[]
): SerpentStandings {
  const recomputedLifetime = settledWeeklyDepths.reduce(
    (sum, value) => sum + Math.max(0, Math.floor(value)),
    0
  );
  const recomputedBest = settledWeeklyDepths.reduce(
    (best, value) => Math.max(best, Math.max(0, Math.floor(value))),
    0
  );
  return {
    lifetimeDepth: Math.max(current.lifetimeDepth, recomputedLifetime),
    bestWeekDepth: Math.max(current.bestWeekDepth, recomputedBest),
  };
}

// ---------------------------------------------------------------------------
// Chronicle
// ---------------------------------------------------------------------------

/**
 * What settlement writes into the Chronicle (§7.3: "a Chronicle entry for
 * records (personal best week, clan best week)").
 *
 * Records only — no DNA settlement bonus exists anywhere in this work package,
 * because §7.3 forbids one ("Depth is measured, not farmed").
 */
export const SERPENT_CHRONICLE_KINDS = [
  'personal_best_week',
  'clan_best_week',
] as const;

export type SerpentChronicleKind = (typeof SERPENT_CHRONICLE_KINDS)[number];

export function isSerpentChronicleKind(
  value: unknown
): value is SerpentChronicleKind {
  return (
    typeof value === 'string' &&
    (SERPENT_CHRONICLE_KINDS as readonly string[]).includes(value)
  );
}

/**
 * Does this week earn a personal-best Chronicle entry?
 *
 * Strictly greater: matching your best week is not a new record, and writing
 * an entry for it every week would turn the Chronicle into a log.
 */
export function isNewBestWeek(depth: number, previousBest: number): boolean {
  return depth > 0 && depth > previousBest;
}

/** Re-export for callers that only import this module. */
export { isAnomalyId };
export type { AnomalyId };
