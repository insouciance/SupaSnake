/**
 * Mutation Food - Design v2 Phase 2 (GAME_DESIGN_V2.md section 5)
 *
 * The Launch Ten mutation definitions plus every piece of mutation math
 * that must be shared between the client engine and the server validator.
 *
 * Taxonomy (the thing that keeps exact server validation possible):
 * - [E]conomic effects are pure functions of (food index, mutation set) and
 *   are recomputed exactly by the server via computeRunTotals.
 * - [P]hysical effects change survival rules inside the engine only and
 *   never touch the payout formula.
 *
 * Phoenix trigger semantics (decision, per section 5.3 note 4): triggering
 * Phoenix voids mutation economic BENEFITS (Gold Trail gold foods,
 * Overgrowth +20%, Mirror Wager's x1.50 bank, Compound Interest) from the
 * trigger food onward, while economic COSTS (the "for the rest of the run"
 * -10%/-20%/x0.7 food penalties and Mirror Wager's x0.30 salvage) persist.
 * This makes reporting a trigger strictly payout-non-increasing, so
 * under- OR over-reporting a Phoenix trigger can never inflate the payout.
 */

/** The Launch Ten mutation ids, in the section 5.2 table order. */
export type MutationId =
  | 'gold_trail'
  | 'overgrowth'
  | 'wall_rush'
  | 'shed'
  | 'mirror_wager'
  | 'magnet_pulse'
  | 'time_dilation'
  | 'splitter'
  | 'phoenix'
  | 'compound_interest';

/** Effect kind: E = economic (server-recomputed), P = physical (engine-only). */
export type MutationKind = 'E' | 'P' | 'EP';

export interface MutationDef {
  id: MutationId;
  name: string;
  kind: MutationKind;
  /** One-line effect - readable at a glance on the choice card. */
  effect: string;
  /** One-line cost - every mutation is an offer with a cost. */
  cost: string;
}

export const MUTATIONS: Record<MutationId, MutationDef> = {
  gold_trail: {
    id: 'gold_trail',
    name: 'Gold Trail',
    kind: 'E',
    effect: 'Every 5th food after pickup is golden: ×3 value',
    cost: 'Exit portals despawn 30 ticks sooner',
  },
  overgrowth: {
    id: 'overgrowth',
    name: 'Overgrowth',
    kind: 'EP',
    effect: 'Food +20% DNA',
    cost: 'Snake grows +2 extra segments per food',
  },
  wall_rush: {
    id: 'wall_rush',
    name: 'Wall Rush',
    kind: 'P',
    effect: 'Walls no longer kill — you slide along them',
    cost: 'Food −10% DNA for the rest of the run',
  },
  shed: {
    id: 'shed',
    name: 'Shed',
    kind: 'EP',
    effect: 'Every 25 foods, tail resets to length 8',
    cost: 'Food −10% DNA for the rest of the run',
  },
  mirror_wager: {
    id: 'mirror_wager',
    name: 'Mirror Wager',
    kind: 'E',
    effect: 'Banked multiplier ×1.25 → ×1.50',
    cost: 'Death salvage ×0.60 → ×0.30',
  },
  magnet_pulse: {
    id: 'magnet_pulse',
    name: 'Magnet Pulse',
    kind: 'P',
    effect: 'Food within 2 cells is pulled toward you',
    cost: 'Exit portal interval +4 foods',
  },
  time_dilation: {
    id: 'time_dilation',
    name: 'Time Dilation',
    kind: 'EP',
    effect: 'Speed −1 tier (slower world)',
    cost: 'Food −20% DNA',
  },
  splitter: {
    id: 'splitter',
    name: 'Splitter',
    kind: 'EP',
    effect: 'Food spawns in pairs — collect faster',
    cost: 'Each food worth 70%',
  },
  phoenix: {
    id: 'phoenix',
    name: 'Phoenix',
    kind: 'P',
    effect: 'Survive one death (reborn at length 8, rewound 3 cells)',
    cost: 'On trigger, lose all mutation economic bonuses',
  },
  compound_interest: {
    id: 'compound_interest',
    name: 'Compound Interest',
    kind: 'E',
    effect: 'Banked bonus +10% per mutation held at extraction',
    cost: 'Only the pick slot it occupies',
  },
};

/** The launch offer pool, in table order. */
export const MUTATION_POOL: MutationId[] = [
  'gold_trail',
  'overgrowth',
  'wall_rush',
  'shed',
  'mirror_wager',
  'magnet_pulse',
  'time_dilation',
  'splitter',
  'phoenix',
  'compound_interest',
];

export function isMutationId(value: unknown): value is MutationId {
  return typeof value === 'string' && value in MUTATIONS;
}

/** A held mutation: which one, and the food count when it was picked. */
export interface MutationPick {
  id: MutationId;
  /** foodEaten at the moment of pickup - effects apply to foods AFTER this. */
  atFood: number;
}

/** Spawn cadence + lifetime (section 5.1). */
export const MUTATION_SPAWN = {
  /** Next mutation food spawns intervalBase +/- intervalJitter foods later. */
  intervalBase: 20,
  intervalJitter: 5,
  /** Ticks the mutation food stays on the board before despawning. */
  despawnTicks: 40,
  /** Max mutations held per run - stacking cap. */
  maxHeld: 4,
} as const;

/**
 * Roll the food-interval to the next mutation food: 20 +/- 5, uniform,
 * inclusive (so the first spawn is eligible at food 15-25). rng is
 * injectable for deterministic tests; affects spawn timing only.
 */
export function rollMutationInterval(rng: () => number = Math.random): number {
  const span = 2 * MUTATION_SPAWN.intervalJitter + 1;
  return (
    MUTATION_SPAWN.intervalBase -
    MUTATION_SPAWN.intervalJitter +
    Math.floor(rng() * span)
  );
}

/**
 * Draw a choice-of-2 offer: two distinct mutations from the pool minus the
 * ones already held. Returns null when fewer than 2 remain (cannot happen
 * with the launch pool of 10 and the stacking cap of 4). Offer RNG affects
 * options only, never payout math.
 */
export function rollMutationOffer(
  held: MutationId[],
  rng: () => number = Math.random,
  pool: MutationId[] = MUTATION_POOL
): [MutationId, MutationId] | null {
  const available = pool.filter((id) => !held.includes(id));
  if (available.length < 2) return null;
  const first = Math.floor(rng() * available.length);
  let second = Math.floor(rng() * (available.length - 1));
  if (second >= first) second += 1;
  return [available[first], available[second]];
}

/** Economic tuning constants (section 5.2), exported for tests + UI copy. */
export const MUTATION_ECONOMICS = {
  goldTrailEveryNth: 5,
  goldTrailMultiplier: 3,
  overgrowthFoodBonus: 1.2,
  wallRushFoodPenalty: 0.9,
  shedFoodPenalty: 0.9,
  timeDilationFoodPenalty: 0.8,
  splitterFoodPenalty: 0.7,
  mirrorWagerBank: 1.5,
  mirrorWagerDeath: 0.3,
  compoundInterestPerHeld: 0.1,
} as const;

/** Physical tuning constants (engine-side), exported for tests. */
export const MUTATION_PHYSICS = {
  goldTrailPortalTicks: 60, // 90-tick windows shortened to 60
  overgrowthExtraSegments: 2,
  shedEveryFoods: 25,
  shedResetLength: 8,
  magnetRadius: 2,
  magnetPortalIntervalPenalty: 4,
  timeDilationSlowMs: 40, // PRIMAL/COSMIC: +40 ms/tick
  timeDilationCyberFoodOffset: 5, // CYBER: speed as if one tier (5 foods) earlier
  phoenixRewindCells: 3,
  phoenixRebirthLength: 8,
} as const;

/**
 * The per-food [E] value modifier for the n-th food (1-based) given the
 * held mutations - THE shared economic authority. The client engine and
 * the server recompute both call this, which is what keeps PRIMAL/CYBER
 * validation exact under mutations.
 *
 * - A pick affects only foods eaten after it (n > atFood).
 * - Gold Trail turns every 5th food after its pickup golden (x3).
 * - After a Phoenix trigger at food t, benefit modifiers stop applying to
 *   foods n > t; cost modifiers persist (see file header).
 */
export function foodValueModifier(
  picks: MutationPick[],
  n: number,
  phoenixTriggeredAtFood: number | null = null
): number {
  let mod = 1;
  const benefitsVoided =
    phoenixTriggeredAtFood !== null && n > phoenixTriggeredAtFood;
  for (const pick of picks) {
    if (n <= pick.atFood) continue;
    switch (pick.id) {
      case 'gold_trail':
        if (
          !benefitsVoided &&
          (n - pick.atFood) % MUTATION_ECONOMICS.goldTrailEveryNth === 0
        ) {
          mod *= MUTATION_ECONOMICS.goldTrailMultiplier;
        }
        break;
      case 'overgrowth':
        if (!benefitsVoided) mod *= MUTATION_ECONOMICS.overgrowthFoodBonus;
        break;
      case 'wall_rush':
        mod *= MUTATION_ECONOMICS.wallRushFoodPenalty;
        break;
      case 'shed':
        mod *= MUTATION_ECONOMICS.shedFoodPenalty;
        break;
      case 'time_dilation':
        mod *= MUTATION_ECONOMICS.timeDilationFoodPenalty;
        break;
      case 'splitter':
        mod *= MUTATION_ECONOMICS.splitterFoodPenalty;
        break;
      // mirror_wager, magnet_pulse, phoenix, compound_interest:
      // no per-food value effect
    }
  }
  return mod;
}
