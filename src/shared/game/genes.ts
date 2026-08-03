/**
 * Genes - Buildcraft: The Genome (BUILDCRAFT_GENOME_DESIGN.md section 3)
 *
 * A gene is a mutation with a strain tag. The 22 existing mutation ids
 * keep their exact wire format and economics (mutations.ts is untouched
 * and remains the authority for their [E] math); this module layers the
 * strain tags, the legacy genome-era additions, and the genome-aware per-food
 * math on top. Old sessions and mid-deploy clients therefore validate
 * byte-identically: a GeneId is a superset of MutationId, and
 * geneFoodValueModifier delegates to foodValueModifier for legacy ids.
 *
 * Taxonomy unchanged: [E] exact recompute, [P] engine-only, plus the
 * bounded-trust [BT] claim class documented in strains.ts.
 */

import {
  MUTATIONS,
  MUTATION_POOL,
  foodValueFlatBonus,
  foodValueModifier,
  isMutationId,
  type MutationId,
  type MutationKind,
  type MutationPick,
} from '@/shared/game/mutations';
import { isStrainId, type StrainId } from '@/shared/game/strains';
import {
  GENE_OFFER_CADENCE,
  GENOME_V2_GENE_OFFER_CADENCE,
} from '@/shared/game/geneCadence';

/** Genome-era gene ids. V1 and V2 draw from separate curated pools below. */
export type NewGeneId =
  | 'loan_shark'
  | 'tithe'
  | 'static_charge'
  | 'slipstream'
  | 'bulk_up'
  | 'serpentine'
  | 'pocket_rift'
  | 'grave_robber'
  | 'last_gasp'
  // M10 dynasty signature genes (section 3.5)
  | 'heartwood'
  | 'zenith_protocol'
  | 'constellation_crown';

/** IDs introduced only by Genome rules v2. They deliberately stay out of the
 * version-neutral/v1 `GENES` catalog so legacy exhaustive consumers do not
 * silently acquire v2 semantics. */
export type GenomeV2OnlyGeneId =
  | 'live_wire'
  | 'circuit_run'
  | 'coilkeeper'
  | 'phase_gate'
  | 'loom_anchor';

/** A gene id: every existing mutation id plus the genome-era additions. */
export type GeneId = MutationId | NewGeneId;

export type GeneKind = MutationKind;

/** Validation class: pure = exact recompute, path = bounded-trust, none. */
export type GeneEconomics = 'pure' | 'path' | 'none';

export interface GeneDef {
  id: GeneId;
  name: string;
  kind: GeneKind;
  /** 1-2 strain tags (dual-tag genes grant a point to each strain). */
  strains: readonly StrainId[];
  effect: string;
  cost: string;
  economics: GeneEconomics;
}

/** A held gene pick - wire-identical to MutationPick. */
export interface GenePick {
  id: GeneId;
  /** foodEaten at the moment of pickup - effects apply to foods AFTER this. */
  atFood: number;
}

/**
 * Strain tags for the 22 existing mutation ids (section 3.1-3.3). The
 * defs themselves stay in mutations.ts; only the tag lives here.
 */
export const MUTATION_STRAINS: Record<MutationId, readonly StrainId[]> = {
  gold_trail: ['AURUM'],
  overgrowth: ['FERAL'],
  wall_rush: ['FLUX'],
  shed: ['FERAL'],
  mirror_wager: ['UMBRA'],
  magnet_pulse: ['FLUX'],
  time_dilation: ['VOLT'],
  splitter: ['VOLT'],
  phoenix: ['UMBRA'],
  compound_interest: ['AURUM'],
  deep_roots: ['FERAL'],
  ancient_grove: ['AURUM', 'FERAL'],
  tectonic_patience: ['FLUX'],
  redline_dividend: ['VOLT'],
  afterburner: ['VOLT', 'AURUM'],
  overclock_harvest: ['UMBRA'],
  starweaver: ['VOLT'],
  gravity_well: ['FLUX'],
  event_horizon: ['FLUX'],
  solstice_engine: ['AURUM', 'VOLT'],
  glacial_reserve: ['FERAL'],
  midnight_oil: ['AURUM'],
};

const LEGACY_ECONOMICS: Record<MutationId, GeneEconomics> = {
  gold_trail: 'pure',
  overgrowth: 'pure',
  wall_rush: 'pure',
  shed: 'pure',
  mirror_wager: 'pure',
  magnet_pulse: 'none',
  time_dilation: 'pure',
  splitter: 'pure',
  phoenix: 'none',
  compound_interest: 'pure',
  deep_roots: 'pure',
  ancient_grove: 'pure',
  tectonic_patience: 'pure',
  redline_dividend: 'pure',
  afterburner: 'pure',
  overclock_harvest: 'pure',
  starweaver: 'none',
  gravity_well: 'pure',
  event_horizon: 'none',
  solstice_engine: 'pure',
  glacial_reserve: 'pure',
  midnight_oil: 'pure',
};

const NEW_GENES: Record<NewGeneId, Omit<GeneDef, 'id'>> = {
  loan_shark: {
    name: 'Loan Shark',
    kind: 'E',
    strains: ['AURUM'],
    effect: 'First 10 foods after pickup +100% DNA',
    cost: 'Foods 11–30 after pickup −20%',
    economics: 'pure',
  },
  tithe: {
    name: 'Tithe',
    kind: 'E',
    strains: ['AURUM'],
    effect: 'Every 10th food after pickup +20 flat DNA',
    cost: 'Every food −1 flat (never below 1)',
    economics: 'pure',
  },
  static_charge: {
    name: 'Static Charge',
    kind: 'EP',
    strains: ['VOLT'],
    effect: 'A food eaten after ≥8 ticks of fasting pays ×2',
    cost: 'Portal windows 10 ticks shorter',
    economics: 'path',
  },
  slipstream: {
    name: 'Slipstream',
    kind: 'P',
    strains: ['VOLT'],
    effect: 'Input grace — turns buffer one tick earlier',
    cost: 'Food −5% DNA',
    economics: 'pure',
  },
  bulk_up: {
    name: 'Bulk Up',
    kind: 'EP',
    strains: ['FERAL'],
    effect: '+3 extra segments per food; +2 flat DNA per 10 segments of length',
    cost: 'The length itself',
    economics: 'pure',
  },
  serpentine: {
    name: 'Serpentine',
    kind: 'P',
    strains: ['FERAL'],
    effect: 'Your last 5 tail segments no longer kill on contact',
    cost: 'Food −5% DNA',
    economics: 'pure',
  },
  pocket_rift: {
    name: 'Pocket Rift',
    kind: 'P',
    strains: ['FLUX'],
    effect: 'Once per 20 foods, a wall hit teleports you to the opposite wall',
    cost: 'Exit portal interval +2 foods',
    economics: 'none',
  },
  grave_robber: {
    name: 'Grave Robber',
    kind: 'E',
    strains: ['UMBRA'],
    effect: 'If your previous run ended in death, food +10% this run',
    cost: 'Only the slot — and the death you already paid',
    economics: 'pure',
  },
  last_gasp: {
    name: 'Last Gasp',
    kind: 'E',
    strains: ['UMBRA'],
    effect: 'Foods eaten at length ≥30 pay +15%',
    cost: 'Foods at length <30 pay −5%',
    economics: 'pure',
  },
  heartwood: {
    name: 'Heartwood',
    kind: 'EP',
    strains: ['FERAL'],
    effect: 'Each Fortress petrification pays 30 flat DNA',
    cost: 'Food −5% DNA',
    economics: 'path',
  },
  zenith_protocol: {
    name: 'Zenith Protocol',
    kind: 'E',
    strains: ['VOLT'],
    effect: 'Foods at max overclock (20+) pay +4 flat DNA',
    cost: 'Foods below max tier −5%',
    economics: 'pure',
  },
  constellation_crown: {
    name: 'Constellation Crown',
    kind: 'P',
    strains: ['FLUX'],
    effect: 'Constellation window +3 seconds',
    cost: 'Constellations spawn one fewer star',
    economics: 'none',
  },
};

function legacyGeneDef(id: MutationId): GeneDef {
  const def = MUTATIONS[id];
  return {
    id,
    name: def.name,
    kind: def.kind,
    strains: MUTATION_STRAINS[id],
    effect: def.effect,
    cost: def.cost,
    economics: LEGACY_ECONOMICS[id],
  };
}

/** The full version-neutral catalog. Offerability is decided by the ruleset. */
export const GENES: Record<GeneId, GeneDef> = {
  ...(Object.fromEntries(
    (Object.keys(MUTATIONS) as MutationId[]).map((id) => [id, legacyGeneDef(id)])
  ) as Record<MutationId, GeneDef>),
  ...(Object.fromEntries(
    (Object.keys(NEW_GENES) as NewGeneId[]).map((id) => [
      id,
      { id, ...NEW_GENES[id] },
    ])
  ) as Record<NewGeneId, GeneDef>),
};

export function isGeneId(value: unknown): value is GeneId {
  return typeof value === 'string' && value in GENES;
}

export function isNewGeneId(value: unknown): value is NewGeneId {
  return isGeneId(value) && !isMutationId(value);
}

/** Strain tags for any gene id. */
export function geneStrains(id: GeneId): readonly StrainId[] {
  return GENES[id]?.strains ?? [];
}

/**
 * The BASE genome offer pool: the legacy Launch Ten plus the 9 new base
 * genes. Mastery genes (M3/M6/M9), the 3 M10 signature genes, and
 * seasonal genes join a player's pool exactly as before (server-side
 * pool composition); lineage may add its strain's signature gene too.
 */
export const GENE_POOL: GeneId[] = [
  ...MUTATION_POOL,
  'loan_shark',
  'tithe',
  'static_charge',
  'slipstream',
  'bulk_up',
  'serpentine',
  'pocket_rift',
  'grave_robber',
  'last_gasp',
];

/** M10 dynasty signature genes (section 3.5) - dynasty -> gene. */
export const SIGNATURE_GENES: Record<'PRIMAL' | 'CYBER' | 'COSMIC', NewGeneId> = {
  PRIMAL: 'heartwood',
  CYBER: 'zenith_protocol',
  COSMIC: 'constellation_crown',
};

// =============================================================================
// GENOME RULES V2 — curated active roster
// =============================================================================

/**
 * V2 is deliberately a separate catalog rather than a rewrite of
 * `MUTATION_STRAINS`/`GENE_POOL`. Historical v1 sessions still parse and fold
 * through those declarations byte-for-byte; new sessions are stamped with
 * Genome rules v2 and use this curated roster.
 */
export const GENOME_V2_SHARED_GENE_IDS = [
  'gold_trail',
  'compound_interest',
  'loan_shark',
  'live_wire',
  'circuit_run',
  'time_dilation',
  'overgrowth',
  'coilkeeper',
  'wall_rush',
  'phase_gate',
  'mirror_wager',
  'phoenix',
  'loom_anchor',
] as const satisfies readonly (GeneId | GenomeV2OnlyGeneId)[];

export type GenomeV2SharedGeneId =
  (typeof GENOME_V2_SHARED_GENE_IDS)[number];
export type GenomeV2SignatureGeneId =
  | 'heartwood'
  | 'zenith_protocol'
  | 'constellation_crown';
export type GenomeV2ActiveGeneId =
  | GenomeV2SharedGeneId
  | GenomeV2SignatureGeneId;

export const GENOME_V2_GENE_STRAINS: Readonly<
  Record<GenomeV2ActiveGeneId, readonly StrainId[]>
> = {
  gold_trail: ['AURUM'],
  compound_interest: ['AURUM'],
  loan_shark: ['AURUM', 'UMBRA'],
  live_wire: ['VOLT'],
  circuit_run: ['VOLT', 'FLUX'],
  time_dilation: ['VOLT', 'FERAL'],
  overgrowth: ['FERAL'],
  coilkeeper: ['FERAL', 'FLUX'],
  wall_rush: ['FLUX', 'VOLT'],
  phase_gate: ['FLUX'],
  mirror_wager: ['UMBRA'],
  phoenix: ['UMBRA', 'FERAL'],
  loom_anchor: ['AURUM', 'UMBRA'],
  heartwood: ['FERAL'],
  zenith_protocol: ['VOLT'],
  constellation_crown: ['FLUX'],
};

export type GenomeV2GeneCategory =
  | 'yield'
  | 'banking'
  | 'execution'
  | 'body'
  | 'terrain'
  | 'survival'
  | 'genome';

export interface GenomeV2GeneDef extends Omit<GeneDef, 'id'> {
  id: GenomeV2ActiveGeneId;
  category: GenomeV2GeneCategory;
  /** Empty means every dynasty; otherwise this is a deliberate affinity. */
  dynasties: readonly (keyof typeof SIGNATURE_GENES)[];
}

/**
 * The authoritative player-facing v2 catalog. Reused IDs intentionally do
 * not read their prose from `GENES`: that table is the durable v1 meaning.
 */
export const GENOME_V2_GENES: Readonly<
  Record<GenomeV2ActiveGeneId, GenomeV2GeneDef>
> = {
  gold_trail: {
    id: 'gold_trail',
    name: 'Gold Trail',
    kind: 'EP',
    strains: GENOME_V2_GENE_STRAINS.gold_trail,
    effect: 'Every fifth target after acquisition is Gilded and pays ×3 inside its visible six-second window.',
    cost: 'Missing the window forfeits the Gilded bonus.',
    economics: 'path',
    category: 'yield',
    dynasties: [],
  },
  compound_interest: {
    id: 'compound_interest',
    name: 'Compound Interest',
    kind: 'E',
    strains: GENOME_V2_GENE_STRAINS.compound_interest,
    effect: 'Each deliberate Loom DECLINE creates a Bond worth +8% at BANK, up to three.',
    cost: 'Bonds pay nothing on crash, and every DECLINE gives up a build opportunity.',
    economics: 'pure',
    category: 'banking',
    dynasties: [],
  },
  loan_shark: {
    id: 'loan_shark',
    name: 'Loan Shark',
    kind: 'E',
    strains: GENOME_V2_GENE_STRAINS.loan_shark,
    effect: 'A portal CONTINUE starts a six-food contract whose completed Escrow pays twice its routed value.',
    cost: 'BANK or crash before completion loses the visible Escrow.',
    economics: 'path',
    category: 'banking',
    dynasties: [],
  },
  live_wire: {
    id: 'live_wire',
    name: 'Live Wire',
    kind: 'EP',
    strains: GENOME_V2_GENE_STRAINS.live_wire,
    effect: 'Every third eligible target becomes a topology-scaled route test worth ×3.',
    cost: 'Missing the route budget burns that target to zero Yield.',
    economics: 'path',
    category: 'execution',
    dynasties: [],
  },
  circuit_run: {
    id: 'circuit_run',
    name: 'Circuit Run',
    kind: 'EP',
    strains: GENOME_V2_GENE_STRAINS.circuit_run,
    effect: 'Every fourth eligible target begins an ordered linked route worth ×4 total.',
    cost: 'Breaking the route pays zero while normal body growth remains.',
    economics: 'path',
    category: 'execution',
    dynasties: [],
  },
  time_dilation: {
    id: 'time_dilation',
    name: 'Time Dilation',
    kind: 'EP',
    strains: GENOME_V2_GENE_STRAINS.time_dilation,
    effect: 'World speed is reduced by 12%.',
    cost: 'Every fourth food adds one extra segment; unavailable in CYBER.',
    economics: 'path',
    category: 'body',
    dynasties: ['PRIMAL', 'COSMIC'],
  },
  overgrowth: {
    id: 'overgrowth',
    name: 'Overgrowth',
    kind: 'EP',
    strains: GENOME_V2_GENE_STRAINS.overgrowth,
    effect: 'Food Yield scales from ×1.4 toward ×2.5 with deterministic board pressure.',
    cost: 'Every food adds one extra body segment.',
    economics: 'path',
    category: 'body',
    dynasties: [],
  },
  coilkeeper: {
    id: 'coilkeeper',
    name: 'Coilkeeper',
    kind: 'EP',
    strains: GENOME_V2_GENE_STRAINS.coilkeeper,
    effect: 'After eight foods, sealing territory empowers the next target from ×4 to ×6 by enclosed area.',
    cost: 'The enclosed cells become permanent terrain for the run.',
    economics: 'path',
    category: 'terrain',
    dynasties: [],
  },
  wall_rush: {
    id: 'wall_rush',
    name: 'Wall Rush',
    kind: 'EP',
    strains: GENOME_V2_GENE_STRAINS.wall_rush,
    effect: 'A charged deliberate wall impact redirects along a previewed legal tangent and arms a ×2.5 route.',
    cost: 'The charge is spent even when the armed route is missed.',
    economics: 'path',
    category: 'terrain',
    dynasties: [],
  },
  phase_gate: {
    id: 'phase_gate',
    name: 'Phase Gate',
    kind: 'EP',
    strains: GENOME_V2_GENE_STRAINS.phase_gate,
    effect: 'Every fifth food can charge an optional gate shortcut that makes its target worth ×3.',
    cost: 'Used gate cells become permanent Scars.',
    economics: 'path',
    category: 'terrain',
    dynasties: [],
  },
  mirror_wager: {
    id: 'mirror_wager',
    name: 'Mirror Wager',
    kind: 'E',
    strains: GENOME_V2_GENE_STRAINS.mirror_wager,
    effect: 'On an explicit portal CONTINUE, optionally freeze 40% of that leg at its current Carry as visible Stake; BANK doubles it.',
    cost: 'A crash loses only the Stake while ordinary salvage remains intact.',
    economics: 'pure',
    category: 'banking',
    dynasties: [],
  },
  phoenix: {
    id: 'phoenix',
    name: 'Phoenix',
    kind: 'P',
    strains: GENOME_V2_GENE_STRAINS.phoenix,
    effect: 'Survive one death with a three-cell rewind, twelve phase ticks, and ten added segments.',
    cost: 'After firing, Ash occupies the socket and contributes no Strain.',
    economics: 'none',
    category: 'survival',
    dynasties: [],
  },
  loom_anchor: {
    id: 'loom_anchor',
    name: 'Loom Anchor',
    kind: 'P',
    strains: GENOME_V2_GENE_STRAINS.loom_anchor,
    effect: 'Pin one declined option into the next Thread slot.',
    cost: 'One charge, restored only by an explicit portal CONTINUE.',
    economics: 'none',
    category: 'genome',
    dynasties: [],
  },
  heartwood: {
    id: 'heartwood',
    name: 'Heartwood',
    kind: 'EP',
    strains: GENOME_V2_GENE_STRAINS.heartwood,
    effect: 'PRIMAL territorial play converts deliberate body geometry into escalating Yield opportunities.',
    cost: 'Its value requires spatial pressure and a safe recovery route.',
    economics: 'path',
    category: 'body',
    dynasties: ['PRIMAL'],
  },
  zenith_protocol: {
    id: 'zenith_protocol',
    name: 'Zenith Protocol',
    kind: 'EP',
    strains: GENOME_V2_GENE_STRAINS.zenith_protocol,
    effect: 'CYBER precision builds player-controlled overclock windows with proportional Yield upside.',
    cost: 'Mistimed overclock creates execution pressure; speed is never imposed automatically.',
    economics: 'path',
    category: 'execution',
    dynasties: ['CYBER'],
  },
  constellation_crown: {
    id: 'constellation_crown',
    name: 'Constellation Crown',
    kind: 'EP',
    strains: GENOME_V2_GENE_STRAINS.constellation_crown,
    effect: 'COSMIC reveals current, future, and Crown Stars for high-value perfect clears.',
    cost: 'Only clearly marked current stars are edible or colliding.',
    economics: 'path',
    category: 'execution',
    dynasties: ['COSMIC'],
  },
};

/** Version-aware resolver; callers must never infer v2 semantics from GENES. */
export function geneDefinitionForRules(
  id: GeneId | GenomeV2OnlyGeneId,
  rulesVersion: 1 | 2
): GeneDef | GenomeV2GeneDef | null {
  if (rulesVersion === 2) {
    return isGenomeV2ActiveGeneId(id) ? GENOME_V2_GENES[id] : null;
  }
  return isGeneId(id) ? GENES[id] : null;
}

/** A v2 run receives 13 shared genes plus its own signature. CYBER excludes
 * Time Dilation, so its pool intentionally contains 13 and remains above the
 * constitutional floor of 12. */
export function genomeV2ActivePool(
  dynasty: keyof typeof SIGNATURE_GENES
): GenomeV2ActiveGeneId[] {
  const shared = GENOME_V2_SHARED_GENE_IDS.filter(
    (id) => dynasty !== 'CYBER' || id !== 'time_dilation'
  );
  const signature: GenomeV2SignatureGeneId =
    dynasty === 'PRIMAL'
      ? 'heartwood'
      : dynasty === 'CYBER'
        ? 'zenith_protocol'
        : 'constellation_crown';
  return [...shared, signature];
}

export function isGenomeV2ActiveGeneId(
  value: unknown
): value is GenomeV2ActiveGeneId {
  return (
    typeof value === 'string' &&
    ((GENOME_V2_SHARED_GENE_IDS as readonly string[]).includes(value) ||
      (Object.values(SIGNATURE_GENES) as string[]).includes(value))
  );
}

/** Version-aware tags without changing any v1 call site. */
export function genomeV2GeneStrains(
  id: GenomeV2ActiveGeneId
): readonly StrainId[] {
  return GENOME_V2_GENE_STRAINS[id];
}

/** Universal build cadence, with the Genome-era cap raised to six. */
export const GENOME_SPAWN = {
  ...GENE_OFFER_CADENCE,
  despawnTicks: 40,
  /** Max genes held per run (section 1) - up from the mutation-era 4. */
  maxHeld: 6,
} as const;

/** V2 cadence/cap without mutating the durable v1 wrapper above. */
export const GENOME_V2_SPAWN = {
  ...GENOME_V2_GENE_OFFER_CADENCE,
  maxHeld: 6,
} as const;

/** Economic tuning for the new genes, exported for tests + UI copy. */
export const GENE_ECONOMICS = {
  /** Loan Shark: first 10 foods after pickup x2; foods 11-30 x0.8. */
  loanSharkWindowFoods: 10,
  loanSharkBonus: 2,
  loanSharkPaybackFoods: 30,
  loanSharkPenalty: 0.8,
  /** Tithe: every 10th food after pickup +20 flat; every food -1 flat. */
  titheEveryNth: 10,
  titheBonus: 20,
  tithePerFoodCost: 1,
  /** Static Charge [BT]: fasting foods x2 -> claim caps. */
  staticChargeFastingTicks: 8,
  staticChargeMaxClaimsPerFoods: 3, // claims <= floor(foodsSincePickup / 3)
  staticChargeMaxBonusRatio: 0.35,
  /** Slipstream / Serpentine / Heartwood: food x0.95 cost. */
  slipstreamFoodPenalty: 0.95,
  serpentineFoodPenalty: 0.95,
  heartwoodFoodPenalty: 0.95,
  /** Bulk Up: +2 flat DNA per this many segments of current length. */
  bulkUpFlatPerSegments: 10,
  bulkUpFlatBonus: 2,
  /** Grave Robber: food x1.1 when the previous run died. */
  graveRobberBonus: 1.1,
  /** Last Gasp: length >=30 x1.15, below x0.95. */
  lastGaspLengthThreshold: 30,
  lastGaspBonus: 1.15,
  lastGaspPenalty: 0.95,
  /**
   * Heartwood [E]: flat DNA per Fortress petrify event (WP-3.11).
   *
   * It was a [BT] claim - a golden food dropped on the shed cells, worth the
   * same 30, that the player had to drive back and eat. Fortress turns those
   * cells to stone, so the drop had nowhere fair to land, and the pay moved
   * into the deterministic fold at the same magnitude. PRIMAL's signature gene
   * now has exactly ONE trigger, which is PRIMAL's Expression - every other
   * producer of shed events was retired by Rule 15.
   */
  heartwoodPetrifyFlat: 30,
  /** Zenith Protocol: foods at CYBER max tier +4 flat; below x0.95. */
  zenithMaxTierFood: 20,
  zenithFlatBonus: 4,
  zenithPenalty: 0.95,
} as const;

/** Physical tuning for the new genes (engine-side), exported for tests. */
export const GENE_PHYSICS = {
  /** Static Charge cost: portal windows 10 ticks shorter. */
  staticChargePortalTicksPenalty: 10,
  /** Bulk Up: extra segments per food (on top of the normal +1). */
  bulkUpExtraSegments: 3,
  /** Serpentine: tail segments (from the tip) that do not kill. */
  serpentineSafeTailSegments: 5,
  /** Pocket Rift: recharge cadence in foods. */
  pocketRiftRechargeFoods: 20,
  /** Pocket Rift cost: exit portal interval +2 foods. */
  pocketRiftPortalIntervalPenalty: 2,
  /**
   * Constellation Crown, RE-AUTHORED in WP-3.13.
   *
   * It read "combo cap x2.4 -> x2.8" and lost its referent when the COSMIC
   * combo was deleted; `DYNASTY_COSMIC.md` §5 requires it re-authored in the
   * same package rather than silently orphaned. It is now the terraformer's
   * gene: three more seconds of routing time for one fewer star. Fewer stars
   * is less DNA per wave, so the trade is real - you buy the ability to
   * finish a constellation clean, and pay for it in what a constellation is
   * worth.
   *
   * Deliberately [P] only. The old Crown raised a bounded-trust CEILING,
   * which is how account state reached a payout ratio; nothing in COSMIC
   * claims a payout any more, so there is no ceiling left to raise.
   */
  crownConstellationWindowSeconds: 3,
  crownConstellationStarPenalty: 1,
} as const;

/**
 * The genome-era per-food [E] multiplier: legacy ids delegate to
 * foodValueModifier (byte-identical math), new genes multiply on top.
 * Same discipline: a pick affects only foods after it; benefits void
 * after a benefit-voiding revive trigger (classic Phoenix), costs
 * persist. `lengthAt` supplies the deterministic length model for
 * Last Gasp (null = length-blind: benefit denied, cost still applied -
 * conservative for the payer).
 */
export function geneFoodValueModifier(
  picks: GenePick[],
  n: number,
  benefitsVoidedAtFood: number | null = null,
  options: {
    /** Deterministic snake length when eating food n (genome.ts model). */
    lengthAt?: (n: number) => number;
    /** Server-derived: did the player's previous run end in death? */
    prevRunDied?: boolean;
  } = {}
): number {
  const legacy = picks.filter((p): p is MutationPick => isMutationId(p.id));
  let mod = foodValueModifier(legacy, n, benefitsVoidedAtFood);
  const benefitsVoided =
    benefitsVoidedAtFood !== null && n > benefitsVoidedAtFood;
  for (const pick of picks) {
    if (n <= pick.atFood || isMutationId(pick.id)) continue;
    switch (pick.id) {
      case 'loan_shark': {
        const since = n - pick.atFood;
        if (since <= GENE_ECONOMICS.loanSharkWindowFoods) {
          if (!benefitsVoided) mod *= GENE_ECONOMICS.loanSharkBonus;
        } else if (since <= GENE_ECONOMICS.loanSharkPaybackFoods) {
          mod *= GENE_ECONOMICS.loanSharkPenalty;
        }
        break;
      }
      case 'slipstream':
        mod *= GENE_ECONOMICS.slipstreamFoodPenalty;
        break;
      case 'serpentine':
        mod *= GENE_ECONOMICS.serpentineFoodPenalty;
        break;
      case 'heartwood':
        mod *= GENE_ECONOMICS.heartwoodFoodPenalty;
        break;
      case 'grave_robber':
        if (!benefitsVoided && options.prevRunDied === true) {
          mod *= GENE_ECONOMICS.graveRobberBonus;
        }
        break;
      case 'last_gasp': {
        const length = options.lengthAt ? options.lengthAt(n) : null;
        if (length !== null && length >= GENE_ECONOMICS.lastGaspLengthThreshold) {
          if (!benefitsVoided) mod *= GENE_ECONOMICS.lastGaspBonus;
        } else {
          mod *= GENE_ECONOMICS.lastGaspPenalty;
        }
        break;
      }
      case 'zenith_protocol':
        if (n < GENE_ECONOMICS.zenithMaxTierFood) {
          mod *= GENE_ECONOMICS.zenithPenalty;
        }
        break;
      // tithe / bulk_up: flat effects (geneFoodValueFlatBonus)
      // static_charge / pocket_rift / constellation_crown: [P] only
    }
  }
  return mod;
}

/**
 * The genome-era per-food FLAT [E] bonus: legacy flat (Deep Roots)
 * plus Tithe, Bulk Up and Zenith Protocol. Negative totals are possible
 * (Tithe's -1/food); computeGenomeRunTotals clamps the per-food result.
 * Benefits void after a benefit-voiding revive; Tithe's -1 persists.
 */
export function geneFoodValueFlatBonus(
  picks: GenePick[],
  n: number,
  benefitsVoidedAtFood: number | null = null,
  options: { lengthAt?: (n: number) => number } = {}
): number {
  const legacy = picks.filter((p): p is MutationPick => isMutationId(p.id));
  let bonus = foodValueFlatBonus(legacy, n, benefitsVoidedAtFood);
  const benefitsVoided =
    benefitsVoidedAtFood !== null && n > benefitsVoidedAtFood;
  for (const pick of picks) {
    if (n <= pick.atFood || isMutationId(pick.id)) continue;
    switch (pick.id) {
      case 'tithe': {
        const since = n - pick.atFood;
        if (
          !benefitsVoided &&
          since % GENE_ECONOMICS.titheEveryNth === 0
        ) {
          bonus += GENE_ECONOMICS.titheBonus;
        }
        bonus -= GENE_ECONOMICS.tithePerFoodCost;
        break;
      }
      case 'bulk_up': {
        if (benefitsVoided) break;
        const length = options.lengthAt ? options.lengthAt(n) : null;
        if (length !== null) {
          bonus +=
            GENE_ECONOMICS.bulkUpFlatBonus *
            Math.floor(length / GENE_ECONOMICS.bulkUpFlatPerSegments);
        }
        break;
      }
      case 'zenith_protocol':
        if (!benefitsVoided && n >= GENE_ECONOMICS.zenithMaxTierFood) {
          bonus += GENE_ECONOMICS.zenithFlatBonus;
        }
        break;
    }
  }
  return bonus;
}

/** Sanitize an untrusted gene-pick list shape (ids checked, order kept). */
export function sanitizeGenePicks(raw: unknown, maxHeld = GENOME_SPAWN.maxHeld): GenePick[] {
  if (!Array.isArray(raw)) return [];
  const picks: GenePick[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (picks.length >= maxHeld) break;
    if (typeof entry !== 'object' || entry === null) continue;
    const { id, atFood } = entry as { id?: unknown; atFood?: unknown };
    if (!isGeneId(id) || seen.has(id)) continue;
    if (typeof atFood !== 'number' || !Number.isInteger(atFood) || atFood < 0) {
      continue;
    }
    seen.add(id);
    picks.push({ id, atFood });
  }
  return picks;
}

export { isStrainId };
