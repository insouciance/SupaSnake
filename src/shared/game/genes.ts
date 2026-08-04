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
  /**
   * The long form, for surfaces with room to read: the Workbench and the
   * Codex. `effect` stays the one line the Drop can show in a hurry.
   *
   * Both live on this def on purpose. Until now a Power carried three
   * different descriptions in three tables — this one, `GENE_PROJECTED_RULE`
   * and `GENE_TRIGGER_LABEL` — and they had drifted into disagreement,
   * because nothing made them agree. One table with two lengths cannot
   * drift from itself.
   */
  detail: string;
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
    name: 'Golden Hour',
    kind: 'EP',
    strains: GENOME_V2_GENE_STRAINS.gold_trail,
    effect: 'Every 5th food turns gold. Eat it before it fades.',
    cost: 'Let the six-second timer run out and the triple pay is gone.',
    detail: 'Every fifth food turns gold and starts a six-second timer. Reach it in time and it pays triple. Let it fade and it pays like anything else.',
    economics: 'path',
    category: 'yield',
    dynasties: [],
  },
  compound_interest: {
    id: 'compound_interest',
    name: 'Stash',
    kind: 'E',
    strains: GENOME_V2_GENE_STRAINS.compound_interest,
    effect: 'Every power you skip pays +8% when you BANK.',
    cost: 'A crash pays out nothing, and every skip gives up a power.',
    detail: 'Say no to a power and you put money away instead. Up to three, each worth +8% when you leave — and nothing at all if you crash.',
    economics: 'pure',
    category: 'banking',
    dynasties: [],
  },
  loan_shark: {
    id: 'loan_shark',
    name: 'Double or Nothing',
    kind: 'E',
    strains: GENOME_V2_GENE_STRAINS.loan_shark,
    effect: 'Eat 6 foods after a portal to double their pay.',
    cost: 'BANK or crash before the sixth food and you lose what is on the table.',
    detail: 'Riding a portal starts a six-food deal. Finish it and that food pays double. BANK early or crash and you lose the lot.',
    economics: 'path',
    category: 'banking',
    dynasties: [],
  },
  live_wire: {
    id: 'live_wire',
    name: 'Straight Shot',
    kind: 'EP',
    strains: GENOME_V2_GENE_STRAINS.live_wire,
    effect: 'Every 3rd food: go almost straight for ×3, or 0.',
    cost: 'Wander off the route and that food pays nothing at all.',
    detail: 'Every third food is a test. Take a near-direct route — two spare moves, no more — and it pays triple. Wander and it pays nothing.',
    economics: 'path',
    category: 'execution',
    dynasties: [],
  },
  circuit_run: {
    id: 'circuit_run',
    name: 'Food Chain',
    kind: 'EP',
    strains: GENOME_V2_GENE_STRAINS.circuit_run,
    effect: 'Every 4th food starts a chain. Eat in order for ×4.',
    cost: 'Break the order and the whole chain pays nothing. You still grow.',
    detail: 'Every fourth food starts a chain that must be eaten in order. Finish it for four times the pay. Break it and the whole chain pays nothing.',
    economics: 'path',
    category: 'execution',
    dynasties: [],
  },
  time_dilation: {
    id: 'time_dilation',
    name: 'Slo-Mo',
    kind: 'EP',
    strains: GENOME_V2_GENE_STRAINS.time_dilation,
    effect: 'The world slows 12%. You grow a little faster.',
    cost: 'Every fourth food adds an extra segment. Not available in CYBER.',
    detail: 'Everything moves 12% slower, which makes tight turns easier. You pay in length: every fourth food adds a segment. Not in CYBER.',
    economics: 'path',
    category: 'body',
    dynasties: ['PRIMAL', 'COSMIC'],
  },
  overgrowth: {
    id: 'overgrowth',
    name: 'Feast',
    kind: 'EP',
    strains: GENOME_V2_GENE_STRAINS.overgrowth,
    effect: 'Food pays more as the board fills. You grow double.',
    cost: 'Every food adds an extra segment. You are the one crowding the board.',
    detail: 'The more crowded it gets, the more each food pays — ×1.4 up to ×2.5. But every food adds an extra segment, so you are the one crowding it.',
    economics: 'path',
    category: 'body',
    dynasties: [],
  },
  coilkeeper: {
    id: 'coilkeeper',
    name: 'Loop Trap',
    kind: 'EP',
    strains: GENOME_V2_GENE_STRAINS.coilkeeper,
    effect: 'Circle empty ground. The next food pays ×4 to ×6.',
    cost: 'Sealed ground turns to wall for the rest of the run.',
    detail: 'After eight foods you can loop your body around empty ground to seal it. The next food pays four to six times by how much you sealed. The ground turns to wall for the rest of the run.',
    economics: 'path',
    category: 'terrain',
    dynasties: [],
  },
  wall_rush: {
    id: 'wall_rush',
    name: 'Wall Bounce',
    kind: 'EP',
    strains: GENOME_V2_GENE_STRAINS.wall_rush,
    effect: 'Hit a wall on purpose. The next food pays ×2.5.',
    cost: 'The bounce is spent even when you miss the food it armed.',
    detail: 'Drive into a wall deliberately and bounce off along a path shown to you first. Reach the next food within six moves for ×2.5. One bounce per portal.',
    economics: 'path',
    category: 'terrain',
    dynasties: [],
  },
  phase_gate: {
    id: 'phase_gate',
    name: 'Side Door',
    kind: 'EP',
    strains: GENOME_V2_GENE_STRAINS.phase_gate,
    effect: 'Open a side door to every 5th food for ×3.',
    cost: 'The cells you pass through become permanent Scars.',
    detail: 'Every fifth food can be reached through a door you open yourself. Going through pays triple — and leaves a permanent scar.',
    economics: 'path',
    category: 'terrain',
    dynasties: [],
  },
  mirror_wager: {
    id: 'mirror_wager',
    name: 'Split Bet',
    kind: 'E',
    strains: GENOME_V2_GENE_STRAINS.mirror_wager,
    effect: 'Bet 40% at a portal. BANK doubles it.',
    cost: 'A crash takes the bet. What you keep otherwise is untouched.',
    detail: 'When you ride a portal you can set aside 40% of that stretch as a bet. BANK and it pays double. Crash and you lose only the bet — the rest is safe.',
    economics: 'pure',
    category: 'banking',
    dynasties: [],
  },
  phoenix: {
    id: 'phoenix',
    name: 'Phoenix',
    kind: 'P',
    strains: GENOME_V2_GENE_STRAINS.phoenix,
    effect: 'Survive one death. That slot burns out.',
    cost: 'You come back ten segments longer, and the slot is burned out for good.',
    detail: 'The first time you die you come back — three cells back, briefly able to pass through yourself, ten segments longer. The slot burns out for good.',
    economics: 'none',
    category: 'survival',
    dynasties: [],
  },
  loom_anchor: {
    id: 'loom_anchor',
    name: 'On Ice',
    kind: 'P',
    strains: GENOME_V2_GENE_STRAINS.loom_anchor,
    effect: 'Keep one power you skipped. It comes back.',
    cost: 'One save, restored when you ride a portal.',
    detail: 'Skip a power and this holds it — waiting in your next drop. One save at a time; riding a portal gives it back.',
    economics: 'none',
    category: 'genome',
    dynasties: [],
  },
  heartwood: {
    id: 'heartwood',
    name: 'Roots',
    kind: 'EP',
    strains: GENOME_V2_GENE_STRAINS.heartwood,
    effect: 'Wrap ground with your body. Big claims pay ×3.5.',
    cost: 'The bigger the claim, the less room you leave yourself. PRIMAL only.',
    detail: 'Loop your body around open ground to hold it. Four cells pays double, ten or more pays ×3.5. The bigger the claim, the tighter the space you left yourself.',
    economics: 'path',
    category: 'body',
    dynasties: ['PRIMAL'],
  },
  zenith_protocol: {
    id: 'zenith_protocol',
    name: 'Redline',
    kind: 'EP',
    strains: GENOME_V2_GENE_STRAINS.zenith_protocol,
    effect: 'Switch on the burst yourself. Food pays ×1.75.',
    cost: 'You chose the harder speed. Nothing goes fast unless you call it.',
    detail: 'You choose when to go fast. While it runs the world is 20% quicker and food pays ×1.75, for fourteen moves. Nothing speeds up unless you call it.',
    economics: 'path',
    category: 'execution',
    dynasties: ['CYBER'],
  },
  constellation_crown: {
    id: 'constellation_crown',
    name: 'Night Vision',
    kind: 'EP',
    strains: GENOME_V2_GENE_STRAINS.constellation_crown,
    effect: 'See stars coming. Clear a whole wave for ×4.',
    cost: 'Only clearly marked stars can be eaten or crashed into.',
    detail: 'You can see which stars are live and which are next. Clear a whole wave without missing one and it pays four times. Only marked stars can be eaten or hit.',
    economics: 'path',
    category: 'execution',
    dynasties: ['COSMIC'],
  },
};

/**
 * The one name a Power answers to, wherever it is shown.
 *
 * Thirteen ids live in both catalogs. The v2 pool is the one a live run draws
 * from, so a shared id shows its v2 name — including on a share card, whose
 * whole job is to be the same object the player saw. The v1 table still names
 * the ids the v2 pool never took.
 */
export function geneDisplayName(id: GeneId | GenomeV2ActiveGeneId): string {
  if (isGenomeV2ActiveGeneId(id)) return GENOME_V2_GENES[id].name;
  return isGeneId(id) ? GENES[id].name : id;
}

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

// ---------------------------------------------------------------------------
// Curriculum vocabulary (WP-B — PEO §4.1-4.3, server contract §3)
// ---------------------------------------------------------------------------

/** Every Dynasty a v2 run can be issued for. */
export type GenomeV2Dynasty = keyof typeof SIGNATURE_GENES;

/**
 * The eligibility contract this build stamps and re-derives against
 * (`PLAYER_EVOLUTION_SERVER_CONTRACT.md`). A change to the composition rule
 * below changes this number, and a run stamped at an older contract keeps
 * settling under the pool it was stamped with.
 */
export const GENOME_V2_ELIGIBILITY_CONTRACT_VERSION = 1;

/**
 * Starter pools, one per Dynasty (PEO §4.3, owner-ratified 2026-08-04).
 *
 * SEVEN, NOT SIX, AND THE SIGNATURE IS IN IT. `rollGenomeV2Offer` stops
 * serving once fewer than two unseen legal entries remain, and every
 * acquisition *and every Recode* consumes one — so an n-Gene pool supports at
 * most n-1 acquisitions and six can never fill six loci. A starved run is
 * permanent: the runtime parks the next cadence offer at MAX_SAFE_INTEGER and
 * relics stop for the rest of the run.
 * `PLAYER_EVOLUTION_STARTER_POOL_SIMULATION.md` measures it — every 6-pool
 * starves in 1.000 of 1,600 traversals, every 7-pool in 0.000.
 *
 * The three lists differ by exactly one entry beyond the Signature (the
 * execution Gene that partners its Strain), which is the mechanical proof that
 * no Dynasty is presented as the neutral tutorial.
 */
export const GENOME_V2_STARTER_POOLS: Readonly<
  Record<GenomeV2Dynasty, readonly GenomeV2ActiveGeneId[]>
> = {
  CYBER: [
    'zenith_protocol',
    'live_wire',
    'gold_trail',
    'compound_interest',
    'phoenix',
    'overgrowth',
    'phase_gate',
  ],
  PRIMAL: [
    'heartwood',
    'live_wire',
    'gold_trail',
    'compound_interest',
    'phoenix',
    'overgrowth',
    'phase_gate',
  ],
  COSMIC: [
    'constellation_crown',
    'circuit_run',
    'gold_trail',
    'compound_interest',
    'phoenix',
    'overgrowth',
    'phase_gate',
  ],
};

/** Seven is the arithmetic floor, not a preference. See above. */
export const GENOME_V2_STARTER_POOL_SIZE = 7;

/**
 * Graduation to the complete legal roster (PEO §8, decision 9).
 *
 * Deliberately the existing Apex thresholds
 * (`GENOME_V2_CONFIG.ftue.apexAtBankedRuns` / `apexAtMastery`), so the
 * curriculum introduces no new progression number. They are duplicated here
 * rather than imported because `genomeV2.ts` imports this module;
 * `genomeV2.starterPool.test.ts` asserts the two stay in lockstep.
 */
export const GENOME_V2_GRADUATION = {
  bankedRuns: 10,
  masteryLevel: 3,
} as const;

/** The per-account inputs a composed vocabulary is derivable from. */
export interface GenomeV2EligibilityFacts {
  /** Offer-eligible Genes held by the account, from the satellite table. */
  eligibleGeneIds: readonly GenomeV2ActiveGeneId[];
  /** The single selected trial, which occupies a candidate position. */
  trialGeneId: GenomeV2ActiveGeneId | null;
  /** Validated banked runs at run start. */
  bankedRuns: number;
  /** Highest Mastery level across Dynasties at run start. */
  masteryLevel: number;
}

/**
 * True once an account holds the complete legal roster by seniority alone.
 * A veteran is never pushed backward into onboarding (PEO §8).
 */
export function genomeV2Graduated(
  bankedRuns: number,
  masteryLevel: number
): boolean {
  return (
    bankedRuns >= GENOME_V2_GRADUATION.bankedRuns ||
    masteryLevel >= GENOME_V2_GRADUATION.masteryLevel
  );
}

/**
 * The Gene vocabulary a run may draw offers from, for THIS account and THIS
 * Dynasty. Replaces `genomeV2ActivePool(dynasty)` at run start when the
 * curriculum is live.
 *
 * PURE AND TOTAL. It never reads the database, never throws, and satisfies
 * three invariants unconditionally, because the run stamped from it must be
 * re-derivable at settlement and can never be allowed to starve:
 *
 *   1. `result ⊆ genomeV2ActivePool(dynasty)` — `createGenomeV2State` enforces
 *      the same ceiling and rejects anything above it.
 *   2. `result.length >= GENOME_V2_STARTER_POOL_SIZE` — a malformed or
 *      partially-backfilled account composes the complete legal roster
 *      (server contract §7: fail closed to the reviewed legacy behaviour,
 *      never to an empty or client-selected pool).
 *   3. The order is the catalog's, so two callers with the same facts produce
 *      byte-identical arrays.
 *
 * The Dynasty starter seven is a constant of the Dynasty, not an account fact,
 * so it is unioned in here as well as written to the satellite table. That is
 * what makes "a new account receives exactly its seven" true even before the
 * first `grant_starter_eligibility` write lands.
 */
export function genomeV2PlayableVocabulary(
  dynasty: GenomeV2Dynasty,
  facts: GenomeV2EligibilityFacts
): GenomeV2ActiveGeneId[] {
  const catalog = genomeV2ActivePool(dynasty);
  if (
    !Number.isSafeInteger(facts.bankedRuns) ||
    facts.bankedRuns < 0 ||
    !Number.isSafeInteger(facts.masteryLevel) ||
    facts.masteryLevel < 0 ||
    !Array.isArray(facts.eligibleGeneIds) ||
    facts.eligibleGeneIds.some((geneId) => !isGenomeV2ActiveGeneId(geneId)) ||
    (facts.trialGeneId !== null && !isGenomeV2ActiveGeneId(facts.trialGeneId))
  ) {
    return catalog;
  }
  if (genomeV2Graduated(facts.bankedRuns, facts.masteryLevel)) return catalog;
  const eligible = new Set<GenomeV2ActiveGeneId>([
    ...GENOME_V2_STARTER_POOLS[dynasty],
    ...facts.eligibleGeneIds,
  ]);
  if (facts.trialGeneId) eligible.add(facts.trialGeneId);
  const composed = catalog.filter((geneId) => eligible.has(geneId));
  return composed.length < GENOME_V2_STARTER_POOL_SIZE ? catalog : composed;
}

/**
 * The Dynasty a composed vocabulary belongs to, or null when it is not a legal
 * composition for any of them.
 *
 * Every composed pool contains exactly one Signature — the starter seven
 * always carries it, and both fallbacks return the complete roster — so the
 * Dynasty is recoverable from the pool alone. That is what lets
 * `parseRunStartContext` re-derive and compare a stamped vocabulary without
 * being handed a Dynasty it would then have to trust.
 */
export function genomeV2DynastyForVocabulary(
  genePool: readonly GenomeV2ActiveGeneId[]
): GenomeV2Dynasty | null {
  const matches = (
    Object.keys(SIGNATURE_GENES) as GenomeV2Dynasty[]
  ).filter((dynasty) =>
    genePool.includes(SIGNATURE_GENES[dynasty] as GenomeV2ActiveGeneId)
  );
  return matches.length === 1 ? matches[0] : null;
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
