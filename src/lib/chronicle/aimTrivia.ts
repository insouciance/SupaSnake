/**
 * Retired aim-system unlocks, demoted to Chronicle trivia (WP-0.07).
 *
 * Until WP-0.07 the aim telegraph was meta-progression: Gridlock at high
 * score 15, Pathline at high score 30 *or* 25 games, Firefly at one completed
 * breed *or* high score 50 (GROUND_TRUTH §9.4). Constitution §6.1 and §15
 * overturn 10 make all four universal settings from the first run, so the
 * GATE is gone from `src/lib/game/aimSystems.ts`.
 *
 * The RECORD is not gone. Rule 6: everything earned is permanent, and a
 * player who crossed one of these thresholds owns that fact. The thresholds
 * live on here, read by the Chronicle and by nothing else, so the career
 * surface can still say "you earned Pathline the hard way".
 *
 * This module grants nothing, unlocks nothing and withholds nothing. It is a
 * pure function over stats the players table already keeps; deleting it would
 * cost a player a memory, not a capability.
 */

import type { AimSystemId } from '@/lib/game/aimSystems';
import type { TriviaEntry } from './types';

/** The three stat columns the retired predicates read. */
export interface AimTriviaStats {
  highScore: number;
  totalGames: number;
  breeds: number;
}

interface RetiredAimUnlock {
  aimSystem: AimSystemId;
  name: string;
  /** The unlock hint that used to sit on the locked chip. */
  requirement: string;
  /** The retired predicate, preserved verbatim. */
  wasEarned: (stats: AimTriviaStats) => boolean;
}

/**
 * The retired predicates, in the order the systems used to unlock. Deadeye is
 * absent on purpose: it was never gated, so there is nothing to remember.
 */
export const RETIRED_AIM_UNLOCKS: readonly RetiredAimUnlock[] = [
  {
    aimSystem: 'gridlock',
    name: 'Gridlock',
    requirement: 'a high score of 15',
    wasEarned: (s) => s.highScore >= 15,
  },
  {
    aimSystem: 'pathline',
    name: 'Pathline',
    requirement: 'a high score of 30, or 25 runs played',
    wasEarned: (s) => s.highScore >= 30 || s.totalGames >= 25,
  },
  {
    aimSystem: 'firefly',
    name: 'Firefly',
    requirement: 'a completed breed, or a high score of 50',
    wasEarned: (s) => s.breeds >= 1 || s.highScore >= 50,
  },
];

/**
 * One trivia entry per retired unlock the player actually cleared. A player
 * who cleared none gets an empty list and no section - trivia is a memory,
 * not a checklist to fill.
 */
export function buildAimTrivia(stats: AimTriviaStats): TriviaEntry[] {
  return RETIRED_AIM_UNLOCKS.filter((unlock) => unlock.wasEarned(stats)).map(
    (unlock) => ({
      id: `aim-unlock-${unlock.aimSystem}`,
      label: `${unlock.name}, earned the old way`,
      detail:
        `You cleared the retired ${unlock.name} unlock — ${unlock.requirement}. ` +
        'Every aim system is a setting for everyone now, from the first run.',
    })
  );
}
