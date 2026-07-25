/**
 * Paired weeks — the rival LAYER on the Serpent hunt (Constitution §9.4).
 *
 * This file is pure: no database, no clock, no randomness. Given the week's
 * candidate clans it says who is paired with whom, and given two Depths it
 * says how the week read. Everything stateful lives in
 * `src/lib/server/clanHunt.ts` and migration 048.
 *
 * WHY THIS IS A LAYER AND NOT THE POINT
 *
 * "Twenty players split into one active clan and one lapsed clan would
 * produce a walkover, which is worse than no competition." So §9.4 makes the
 * PRIMARY weekly outcome self-referential — clan Depth against the clan's own
 * best week — and pairing an optional extra that happens only when a
 * symmetric rival exists. Three consequences are load-bearing here:
 *
 *   1. `pairClanWeek` is allowed to return NO pairs. An unpaired clan is not
 *      an error state, is never told it failed to qualify, and settles its
 *      week exactly as a paired clan does.
 *   2. Symmetry is enforced BEFORE the match, by band, not after it by
 *      handicap. Two clans meet only if they are the same size band and the
 *      same trailing-four-week activity band.
 *   3. Nothing in this file returns a reward. `resolvePairOutcome` returns a
 *      reading of the week; §9.4 pays it in laurels and Chronicle entries,
 *      and Rule 8 forbids it ever paying anything a member could bank.
 *
 * THE DUEL THAT WAS FOLDED IN
 *
 * The shipped system (migrations 011/020) ran its own weekly `clan_duels`
 * calendar, its own Elo `clans.rating`, and paid a ×1.05 DNA week to the
 * winning clan — the live exploit WP-0.02 deleted. Pairing now rides the
 * Serpent week that already exists (§12.2 caps weekly surfaces at one), reads
 * the Depth that settlement already computed, and pays nothing.
 */

/**
 * Size bands (§9.4 [H]). A clan meets a clan of comparable headcount, so the
 * sum it is measured against is a sum of comparable size.
 *
 * Band 0 is the clan of one, and it is a real band: two solo clans are a
 * perfectly symmetric pairing, and the owner's "two clans of one person each"
 * instinct is exactly this row of the table.
 */
export const CLAN_SIZE_BANDS: readonly { id: number; min: number; max: number }[] = [
  { id: 0, min: 1, max: 1 },
  { id: 1, min: 2, max: 3 },
  { id: 2, min: 4, max: 6 },
  { id: 3, min: 7, max: 12 },
] as const;

/**
 * Activity bands (§9.4 [H]) — how many of the trailing FOUR weeks the clan
 * actually hunted. Trailing activity, not current form: a clan that came back
 * after three quiet weeks is not thrown at a clan that never stopped.
 */
export const CLAN_ACTIVITY_BANDS: readonly { id: number; min: number; max: number }[] = [
  { id: 0, min: 0, max: 0 },
  { id: 1, min: 1, max: 1 },
  { id: 2, min: 2, max: 3 },
  { id: 3, min: 4, max: 4 },
] as const;

/** The trailing window activity is measured over. */
export const CLAN_ACTIVITY_WINDOW_WEEKS = 4;

export function clanSizeBand(memberCount: number): number {
  const count = Math.max(1, Math.floor(Number(memberCount) || 0));
  const band = CLAN_SIZE_BANDS.find((entry) => count >= entry.min && count <= entry.max);
  // Over the cap can only mean a grandfathered clan from before §12.2's 12;
  // it lands in the top band rather than falling out of the world.
  return band ? band.id : CLAN_SIZE_BANDS[CLAN_SIZE_BANDS.length - 1].id;
}

export function clanActivityBand(weeksActiveOfLastFour: number): number {
  const weeks = Math.min(
    CLAN_ACTIVITY_WINDOW_WEEKS,
    Math.max(0, Math.floor(Number(weeksActiveOfLastFour) || 0))
  );
  const band = CLAN_ACTIVITY_BANDS.find((entry) => weeks >= entry.min && weeks <= entry.max);
  return band ? band.id : 0;
}

export interface ClanPairingCandidate {
  clanId: string;
  memberCount: number;
  /** Weeks hunted out of the trailing four (settled weeks only). */
  weeksActive: number;
  /**
   * The standing rival, if this clan has one and neither side has declined
   * continuation. §9.4: "Pairing prefers the standing rival while both clans
   * remain in-band."
   */
  standingRivalId?: string | null;
}

export interface ClanPair {
  clanAId: string;
  clanBId: string;
  sizeBand: number;
  activityBand: number;
  /** True when this pair is a continuing rivalry rather than a fresh draw. */
  standingRival: boolean;
}

export interface ClanPairingResult {
  pairs: ClanPair[];
  /**
   * Clans with no symmetric rival this week. §9.4: "No symmetric rival this
   * week → no pairing, no shame, the hunt still resolves." They are returned
   * so a caller can prove the set is partitioned, never so a surface can
   * render a list of the unmatched.
   */
  unpaired: string[];
}

/** Canonical, symmetric key for an unordered pair. */
export function rivalryKey(a: string, b: string): [string, string] {
  return a <= b ? [a, b] : [b, a];
}

/**
 * Pair the week.
 *
 * Deterministic: the same candidate set produces the same pairing on every
 * machine and every replay, because the only ordering is a lexicographic sort
 * on clan id. There is no randomness to seed and no clock to read, which is
 * also why the caller can re-run pairing idempotently after a crash.
 *
 * The algorithm, per (size band, activity band) group:
 *
 *   1. Honour standing rivalries first — both clans must be in THIS group and
 *      must name each other. A rivalry that survives is a derby; a rivalry
 *      whose clans drifted apart in size or activity simply is not paired
 *      this week, which is §9.4's "sustained band divergence dissolves a
 *      mismatch automatically".
 *   2. Pair whatever is left in sorted order, two by two.
 *   3. An odd clan out is unpaired. So is every clan alone in its group —
 *      including, always, the only clan in the world.
 */
export function pairClanWeek(
  candidates: readonly ClanPairingCandidate[]
): ClanPairingResult {
  const pairs: ClanPair[] = [];
  const unpaired: string[] = [];

  const groups = new Map<string, ClanPairingCandidate[]>();
  for (const candidate of candidates) {
    if (!candidate.clanId) continue;
    const sizeBand = clanSizeBand(candidate.memberCount);
    const activityBand = clanActivityBand(candidate.weeksActive);
    const key = `${sizeBand}:${activityBand}`;
    const group = groups.get(key);
    if (group) group.push(candidate);
    else groups.set(key, [candidate]);
  }

  const groupKeys = Array.from(groups.keys()).sort();
  for (const key of groupKeys) {
    const [sizeBand, activityBand] = key.split(':').map(Number);
    const group = (groups.get(key) ?? [])
      .slice()
      .sort((a, b) => a.clanId.localeCompare(b.clanId));

    const byId = new Map(group.map((entry) => [entry.clanId, entry]));
    const taken = new Set<string>();

    // 1. standing rivalries, mutual and in-band
    for (const candidate of group) {
      if (taken.has(candidate.clanId)) continue;
      const rivalId = candidate.standingRivalId ?? null;
      if (!rivalId || taken.has(rivalId)) continue;
      const rival = byId.get(rivalId);
      if (!rival) continue;
      if ((rival.standingRivalId ?? null) !== candidate.clanId) continue;
      const [clanAId, clanBId] = rivalryKey(candidate.clanId, rivalId);
      pairs.push({ clanAId, clanBId, sizeBand, activityBand, standingRival: true });
      taken.add(candidate.clanId);
      taken.add(rivalId);
    }

    // 2. everyone else, in sorted order
    const rest = group.filter((entry) => !taken.has(entry.clanId));
    for (let index = 0; index + 1 < rest.length; index += 2) {
      const [clanAId, clanBId] = rivalryKey(rest[index].clanId, rest[index + 1].clanId);
      pairs.push({ clanAId, clanBId, sizeBand, activityBand, standingRival: false });
    }

    // 3. the odd one out
    if (rest.length % 2 === 1) unpaired.push(rest[rest.length - 1].clanId);
  }

  pairs.sort(
    (a, b) => a.clanAId.localeCompare(b.clanAId) || a.clanBId.localeCompare(b.clanBId)
  );
  unpaired.sort();
  return { pairs, unpaired };
}

export type ClanPairOutcome = 'a' | 'b' | 'draw';

/**
 * How the paired week read. Depth only — the number settlement already
 * computed as the plain SUM of member Depths.
 *
 * Equal Depths are a draw and not a coin flip: there is no rating to break
 * and no reward to allocate, so there is nothing a tiebreak would be for.
 */
export function resolvePairOutcome(depthA: number, depthB: number): ClanPairOutcome {
  const a = Math.max(0, Number(depthA) || 0);
  const b = Math.max(0, Number(depthB) || 0);
  if (a > b) return 'a';
  if (b > a) return 'b';
  return 'draw';
}

export interface RivalryMemory {
  meetings: number;
  winsA: number;
  winsB: number;
  draws: number;
  /** The clan currently on a winning streak, and how long it is. */
  streakClanId: string | null;
  streakLength: number;
  /** Smallest and largest settled margin across the whole rivalry. */
  closestMargin: number;
  largestMargin: number;
}

export interface SettledPair {
  clanAId: string;
  clanBId: string;
  depthA: number;
  depthB: number;
  /** Ordering key — the week the pair settled. */
  weekStart: string;
}

/**
 * Recompute a rivalry's memory from its settled weeks (§9.4: "Rivalry has
 * memory … head-to-head records (W–L, streaks, closest week, all-time
 * margin)").
 *
 * A RECOMPUTE, not an accumulator. The same argument that makes Serpent
 * settlement idempotent applies here: nothing is `+= 1`, so re-settling a
 * week, replaying a cron or recovering from a half-finished transaction
 * converges on the stored history rather than compounding it.
 */
export function foldRivalryMemory(
  clanAId: string,
  clanBId: string,
  settled: readonly SettledPair[]
): RivalryMemory {
  const memory: RivalryMemory = {
    meetings: 0,
    winsA: 0,
    winsB: 0,
    draws: 0,
    streakClanId: null,
    streakLength: 0,
    closestMargin: 0,
    largestMargin: 0,
  };

  const ordered = settled
    .filter(
      (entry) =>
        (entry.clanAId === clanAId && entry.clanBId === clanBId) ||
        (entry.clanAId === clanBId && entry.clanBId === clanAId)
    )
    .slice()
    .sort((left, right) => left.weekStart.localeCompare(right.weekStart));

  let closest: number | null = null;
  for (const entry of ordered) {
    const depthA = entry.clanAId === clanAId ? entry.depthA : entry.depthB;
    const depthB = entry.clanAId === clanAId ? entry.depthB : entry.depthA;
    const outcome = resolvePairOutcome(depthA, depthB);
    const margin = Math.abs(depthA - depthB);

    memory.meetings += 1;
    if (outcome === 'a') memory.winsA += 1;
    else if (outcome === 'b') memory.winsB += 1;
    else memory.draws += 1;

    if (closest === null || margin < closest) closest = margin;
    if (margin > memory.largestMargin) memory.largestMargin = margin;

    if (outcome === 'draw') {
      memory.streakClanId = null;
      memory.streakLength = 0;
    } else {
      const winner = outcome === 'a' ? clanAId : clanBId;
      if (memory.streakClanId === winner) memory.streakLength += 1;
      else {
        memory.streakClanId = winner;
        memory.streakLength = 1;
      }
    }
  }

  memory.closestMargin = closest ?? 0;
  return memory;
}
