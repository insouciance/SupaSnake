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

/**
 * Mutation ids: the Launch Ten (section 5.2 table order) plus the nine
 * per-dynasty mastery mutations (section 7.1 - unlocked at M3/M6/M9 into
 * that dynasty's offer pool; dynasty-flavored sidegrades in the same
 * [E]/[P] taxonomy, doc-anchored by the PRIMAL M3 "Deep Roots" example).
 */
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
  | 'compound_interest'
  // PRIMAL mastery (M3/M6/M9)
  | 'deep_roots'
  | 'ancient_grove'
  | 'tectonic_patience'
  // CYBER mastery (M3/M6/M9)
  | 'redline_dividend'
  | 'afterburner'
  | 'overclock_harvest'
  // COSMIC mastery (M3/M6/M9)
  | 'starweaver'
  | 'gravity_well'
  | 'event_horizon'
  // Season 1 "Solstice" seasonal mutations (section 7.2 - in the offer
  // pool all season, then they join the permanent pool)
  | 'solstice_engine'
  | 'glacial_reserve'
  | 'midnight_oil';

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
  // --- PRIMAL mastery mutations (section 7.1) -------------------------------
  deep_roots: {
    id: 'deep_roots',
    name: 'Deep Roots',
    kind: 'EP',
    effect: '+1 DNA per food for every 25 foods survived since pickup',
    cost: 'Exit portals despawn 10 ticks sooner',
  },
  ancient_grove: {
    id: 'ancient_grove',
    name: 'Ancient Grove',
    kind: 'E',
    effect: 'Foods after 40 pay +25% DNA',
    cost: 'Foods up to 40 pay −10%',
  },
  tectonic_patience: {
    id: 'tectonic_patience',
    name: 'Tectonic Patience',
    kind: 'EP',
    effect: 'Exit portals linger 30 ticks longer',
    cost: 'Food −10% DNA for the rest of the run',
  },
  // --- CYBER mastery mutations (section 7.1) --------------------------------
  redline_dividend: {
    id: 'redline_dividend',
    name: 'Redline Dividend',
    kind: 'E',
    effect: 'Foods at max overclock (20+) pay +30% DNA',
    cost: 'Foods below max tier pay −10%',
  },
  afterburner: {
    id: 'afterburner',
    name: 'Afterburner',
    kind: 'EP',
    effect: 'Every 10th food after pickup pays ×2 DNA',
    cost: 'Exit portals despawn 20 ticks sooner',
  },
  overclock_harvest: {
    id: 'overclock_harvest',
    name: 'Overclock Harvest',
    kind: 'E',
    effect: 'Banked multiplier ×1.25 → ×1.40',
    cost: 'Death salvage ×0.60 → ×0.45',
  },
  // --- COSMIC mastery mutations (section 7.1) -------------------------------
  starweaver: {
    id: 'starweaver',
    name: 'Starweaver',
    kind: 'P',
    effect: 'Constellation groups spawn 4 foods',
    cost: 'Chain window 2 ticks shorter',
  },
  gravity_well: {
    id: 'gravity_well',
    name: 'Gravity Well',
    kind: 'EP',
    effect: 'Food within 3 cells drifts toward you',
    cost: 'Food −10% DNA for the rest of the run',
  },
  event_horizon: {
    id: 'event_horizon',
    name: 'Event Horizon',
    kind: 'P',
    effect: 'Open (wrap) phases last 25 ticks longer',
    cost: 'Closed (killing) phases last 15 ticks longer',
  },
  // --- Season 1 "Solstice" seasonal mutations (section 7.2) -----------------
  // Authored per the section 5 grammar: [E] effects are pure functions of
  // (food index, pick point) for exact server recompute; costs are either
  // [E] penalties or engine-side [P] portal taxes already in the engine's
  // vocabulary. Distinct from the Launch Ten and the nine mastery
  // mutations by construction (new periods, new windows, new curve).
  solstice_engine: {
    id: 'solstice_engine',
    name: 'Solstice Engine',
    kind: 'EP',
    effect: 'Every 4th food after pickup pays ×2 DNA',
    cost: 'Exit portal interval +2 foods',
  },
  glacial_reserve: {
    id: 'glacial_reserve',
    name: 'Glacial Reserve',
    kind: 'EP',
    effect: 'Food +1% DNA per food survived since pickup (caps at +30%)',
    cost: 'Exit portals despawn 20 ticks sooner',
  },
  midnight_oil: {
    id: 'midnight_oil',
    name: 'Midnight Oil',
    kind: 'E',
    effect: 'First 15 foods after pickup +35% DNA',
    cost: 'Foods beyond the window −5% for the rest of the run',
  },
};

/**
 * The BASE offer pool: the Launch Ten, in table order. Mastery mutations
 * (section 7.1) are NOT in here - a player's effective pool is
 * unlockedMutationPool(dynasty, masteryLevel) from the shared mastery
 * module (base ten + that dynasty's M3/M6/M9 unlocks).
 */
/**
 * The draftable base pool.
 *
 * RULE 15 (Constitution v1.4, kill-list rows 23-24) REMOVED `shed`. It reset
 * the tail to length 8 every 25 foods, which under a design where length is
 * the difficulty clock is not a strong upgrade but a *clock rewind* - and it
 * simultaneously de-priced INFUSE, the one mechanic denominated in body. One
 * gene breaking two systems.
 *
 * It is removed from the POOL rather than deleted from `MUTATIONS`, and that
 * is deliberate on two counts:
 *
 *   1. Persisted genome blobs on already-settled runs still name it. Deleting
 *      the definition would break the recompute of historical runs, which is
 *      the defect WP-2.05 existed to eliminate.
 *   2. Both of its splices - `splice_regenesis` (overgrowth + shed) and
 *      `splice_molted_rebirth` (shed + phoenix) - require it as a parent, so
 *      removing it here makes them unformable too, with no second edit and no
 *      chance of the two falling out of step.
 *
 * Nothing draws from this list can offer `shed` again. `GENE_POOL` already
 * carries `static_charge` in its own right, so the genome-era draft is
 * unaffected in size.
 */
export const MUTATION_POOL: MutationId[] = [
  'gold_trail',
  'overgrowth',
  'wall_rush',
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
  // Mastery mutations (section 7.1) - same discipline: pure functions of
  // (food index, mutation set), so the server recompute stays exact.
  /** Deep Roots: +1 flat DNA per this many foods survived since pickup. */
  deepRootsFoodsPerBonus: 25,
  /** Ancient Grove: foods after 40 x1.25; foods up to 40 x0.9. */
  ancientGroveLateAfterFood: 40,
  ancientGroveLateBonus: 1.25,
  ancientGroveEarlyPenalty: 0.9,
  /** Redline Dividend: foods at max CYBER tier (n >= 20) x1.3; below x0.9. */
  redlineDividendMaxTierFood: 20,
  redlineDividendBonus: 1.3,
  redlineDividendPenalty: 0.9,
  /** Afterburner: every 10th food after pickup x2. */
  afterburnerEveryNth: 10,
  afterburnerMultiplier: 2,
  /** Tectonic Patience / Gravity Well: food x0.9 cost (benefit is physical). */
  tectonicPatienceFoodPenalty: 0.9,
  gravityWellFoodPenalty: 0.9,
  /** Overclock Harvest: bank 1.25 -> 1.40, salvage 0.60 -> 0.45 (additive). */
  overclockHarvestBankDelta: 0.15,
  overclockHarvestDeathDelta: -0.15,
  // Season 1 "Solstice" seasonal mutations (section 7.2) - same discipline
  /** Solstice Engine: every 4th food after pickup x2. */
  solsticeEngineEveryNth: 4,
  solsticeEngineMultiplier: 2,
  /** Glacial Reserve: +1% per food survived since pickup, capped at +30%. */
  glacialReservePerFood: 0.01,
  glacialReserveCap: 0.3,
  /** Midnight Oil: first 15 foods after pickup x1.35; beyond x0.95. */
  midnightOilWindowFoods: 15,
  midnightOilBonus: 1.35,
  midnightOilLatePenalty: 0.95,
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
  // Mastery mutations (section 7.1) - engine-side physical tuning
  /** Deep Roots cost: exit portals despawn this many ticks sooner. */
  deepRootsPortalTicksPenalty: 10,
  /** Afterburner cost: exit portals despawn this many ticks sooner. */
  afterburnerPortalTicksPenalty: 20,
  /** Tectonic Patience: exit portals linger this many ticks longer. */
  tectonicPatiencePortalTicksBonus: 30,
  /** Floor for the portal window after stacked despawn costs. */
  minExitDespawnTicks: 10,
  /** Starweaver: constellation groups gain one extra food... */
  starweaverExtraGroupFood: 1,
  /** ...and the chain window shrinks by 2 ticks. */
  starweaverChainWindowPenalty: 2,
  /** Gravity Well: pull radius (Chebyshev) - outranks Magnet Pulse (2). */
  gravityWellRadius: 3,
  /** Event Horizon: open phases +25 ticks, closed phases +15 ticks. */
  eventHorizonOpenTicksBonus: 25,
  eventHorizonClosedTicksPenalty: 15,
  // Season 1 seasonal mutations - engine-side [P] costs
  /** Solstice Engine cost: exit portal interval +2 foods. */
  solsticeEnginePortalIntervalPenalty: 2,
  /** Glacial Reserve cost: exit portals despawn this many ticks sooner. */
  glacialReservePortalTicksPenalty: 20,
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
      // Mastery mutations (section 7.1) - benefits void post-Phoenix,
      // costs persist, exactly like the Launch Ten discipline.
      case 'ancient_grove':
        if (n > MUTATION_ECONOMICS.ancientGroveLateAfterFood) {
          if (!benefitsVoided) mod *= MUTATION_ECONOMICS.ancientGroveLateBonus;
        } else {
          mod *= MUTATION_ECONOMICS.ancientGroveEarlyPenalty;
        }
        break;
      case 'redline_dividend':
        if (n >= MUTATION_ECONOMICS.redlineDividendMaxTierFood) {
          if (!benefitsVoided) mod *= MUTATION_ECONOMICS.redlineDividendBonus;
        } else {
          mod *= MUTATION_ECONOMICS.redlineDividendPenalty;
        }
        break;
      case 'afterburner':
        if (
          !benefitsVoided &&
          (n - pick.atFood) % MUTATION_ECONOMICS.afterburnerEveryNth === 0
        ) {
          mod *= MUTATION_ECONOMICS.afterburnerMultiplier;
        }
        break;
      case 'tectonic_patience':
        mod *= MUTATION_ECONOMICS.tectonicPatienceFoodPenalty;
        break;
      case 'gravity_well':
        mod *= MUTATION_ECONOMICS.gravityWellFoodPenalty;
        break;
      // Season 1 seasonal mutations (section 7.2) - benefits void
      // post-Phoenix, costs persist, exactly like the Launch Ten.
      case 'solstice_engine':
        if (
          !benefitsVoided &&
          (n - pick.atFood) % MUTATION_ECONOMICS.solsticeEngineEveryNth === 0
        ) {
          mod *= MUTATION_ECONOMICS.solsticeEngineMultiplier;
        }
        break;
      case 'glacial_reserve':
        if (!benefitsVoided) {
          mod *= 1 + Math.min(
            MUTATION_ECONOMICS.glacialReserveCap,
            MUTATION_ECONOMICS.glacialReservePerFood * (n - pick.atFood)
          );
        }
        break;
      case 'midnight_oil':
        if (n - pick.atFood <= MUTATION_ECONOMICS.midnightOilWindowFoods) {
          if (!benefitsVoided) mod *= MUTATION_ECONOMICS.midnightOilBonus;
        } else {
          mod *= MUTATION_ECONOMICS.midnightOilLatePenalty;
        }
        break;
      // mirror_wager, magnet_pulse, phoenix, compound_interest,
      // overclock_harvest, starweaver, event_horizon, deep_roots:
      // no per-food MULTIPLIER effect (deep_roots is a flat bonus - see
      // foodValueFlatBonus)
    }
  }
  return mod;
}

/**
 * The per-food FLAT [E] DNA bonus for the n-th food (1-based) - the
 * additive counterpart of foodValueModifier, folded into the same per-food
 * observation point by computeRunTotals and the engine's eat path.
 *
 * Deep Roots (PRIMAL M3, the doc's authored example): +1 DNA per food for
 * every 25 foods survived since pickup - floor((n - atFood) / 25). A flat
 * bonus is a benefit, so a Phoenix trigger voids it from the trigger food
 * onward (costs persist; Deep Roots' cost is physical - portal ticks).
 */
export function foodValueFlatBonus(
  picks: MutationPick[],
  n: number,
  phoenixTriggeredAtFood: number | null = null
): number {
  let bonus = 0;
  const benefitsVoided =
    phoenixTriggeredAtFood !== null && n > phoenixTriggeredAtFood;
  if (benefitsVoided) return 0;
  for (const pick of picks) {
    if (n <= pick.atFood) continue;
    if (pick.id === 'deep_roots') {
      bonus += Math.floor(
        (n - pick.atFood) / MUTATION_ECONOMICS.deepRootsFoodsPerBonus
      );
    }
  }
  return bonus;
}
