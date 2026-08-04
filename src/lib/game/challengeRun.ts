/**
 * Reading a challenge off the game URL (WP-1.08, Constitution §11.3).
 *
 * `challengePlayPath` puts a challenge on `/game` as
 * `?seed=…&target=…&challenge=signal:214&by=…`, and this is the other end of
 * that wire: it turns the query string into the two things a run needs — a
 * seeded rng and a number to beat — or into `null`, which means "an ordinary
 * run", never "a half-configured one".
 *
 * WHAT A CHALLENGE CAN AND CANNOT DO
 *
 * It can choose the seed the engine's rng starts from, which (since F-12)
 * reproduces the board exactly. That is its entire mechanical power.
 *
 * It cannot touch a payout, a Score, a Yield, a Depth or a leaderboard row.
 * The `target` never leaves the client: nothing sends it to the server,
 * nothing settles against it, and the run it decorates settles through the
 * same exact server recompute as any other run (Rule 11). A URL that could
 * change a number would be a URL that could change a number for anybody.
 *
 * Score also stays build-independent (Rule 2, `rulesets.ts:261-267`): a
 * seeded board changes where the food is, never what it pays.
 */

import { SHARE_ARTIFACTS_V1_ENABLED } from '@/lib/features/shareArtifacts';
import {
  challengeRng,
  isValidSeed,
  parseHandle,
  parseSignalDay,
  parseTarget,
} from '@/shared/game/challenge';
import { formatAmount } from '@/shared/format/amount';

export interface ChallengeRun {
  seed: string;
  /** The number to beat, shown to the player. Never sent anywhere. */
  target: number | null;
  /** Which Signal day this came from, when it came from one. */
  signalDay: number | null;
  by: string | null;
}

/**
 * Parse `?seed=…&target=…&challenge=…&by=…`.
 *
 * Returns null when the flag is off, when there is no seed, or when the seed
 * is not a seed — an unreadable challenge starts an ordinary run rather than
 * a subtly different one the player was never told about.
 */
export function readChallengeRun(search: string): ChallengeRun | null {
  if (!SHARE_ARTIFACTS_V1_ENABLED) return null;

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }

  const seed = params.get('seed');
  if (!isValidSeed(seed)) return null;

  const provenance = params.get('challenge') ?? '';
  const signalDay = provenance.startsWith('signal:')
    ? parseSignalDay(provenance.slice('signal:'.length))
    : null;

  return {
    seed,
    target: parseTarget(params.get('target')),
    signalDay,
    by: parseHandle(params.get('by')),
  };
}

/** The rng a challenge run's engine is constructed with. */
export function challengeRunRng(challenge: ChallengeRun): () => number {
  return challengeRng(challenge.seed);
}

/** The one line the setup surface shows so the dare is legible before START. */
export function challengeRunNote(challenge: ChallengeRun): string {
  const where =
    challenge.signalDay !== null ? `Signal #${challenge.signalDay}` : 'this seed';
  if (challenge.target === null) {
    return `Challenge · ${where} · seed ${challenge.seed}`;
  }
  const target = formatAmount(challenge.target);
  return challenge.by
    ? `Challenge · beat ${challenge.by}'s ${target} on ${where}`
    : `Challenge · beat ${target} on ${where}`;
}
