/**
 * The Lexicon — one home for every player-facing explanation (WP-2.07a).
 *
 * The owner's first playtest found the game unable to explain its own
 * vocabulary: `TRAITS[].effect` existed but only reached the screen as an
 * HTML `title`, unreadable on touch; the extraction verbs BANK / PASS /
 * INFUSE — the most load-bearing words in the game — were documented
 * nowhere; and the Codex, which should have been the reference, was gated
 * behind 15 banked runs.
 *
 * This module is the registry those surfaces read. `describe(kind, id)`
 * answers "what is this?" for one entry; `lexiconSection(kind)` answers
 * "what is there?" for a Codex section.
 *
 * ── THE ONE-HOME RULE, stated exactly ────────────────────────────────────
 *
 *  1. A **number** lives only in its tuning module (`STRAIN_ECONOMICS`,
 *     `TRAIT_ECONOMICS`, `GAME_CONFIG`, `BANK`, `ASCENDANCE_*` …).
 *  2. A **sentence** lives only on the def that owns it (`TRAITS[].effect`,
 *     `GENES[].cost`, `ANOMALIES[].cost` …) — and where no def owns it,
 *     here.
 *  3. **This module never retypes a number. It interpolates.** Every figure
 *     below arrives through `${…}` from the module that tunes it. Write
 *     `` `Reach ${STRAIN_THRESHOLDS.minor} points…` ``, never a literal 2.
 *
 * `lexicon.dials.test.ts` holds rule 3 mechanically: for every authored
 * sentence that quotes a dial it asserts the copy still contains that
 * dial's rendered value, read independently from the tuning module. Retune
 * a dial and the test names the sentence that lied.
 *
 * Nothing here is derived from player state, and nothing here reaches an
 * API. These are the rules of the game — they are the same for a signed-out
 * visitor and for a player at 200 banked runs, which is what lets `/codex`
 * render them without an auth call.
 */

import {
  ANOMALIES,
  type AnomalyId,
  isAnomalyId,
} from '@/shared/game/anomalies';
import {
  ASCENDANCE_COST_STEEPENING,
  ASCENDANCE_START_GENERATION,
  ASCENDANCE_V2_GENERATION_FACTOR,
} from '@/shared/game/ascendance';
import {
  GENES,
  GENOME_V2_GENES,
  isGeneId,
  isGenomeV2ActiveGeneId,
  type GeneId,
  type GenomeV2ActiveGeneId,
} from '@/shared/game/genes';
import { SPLICES, isSpliceId, spliceStrains, type SpliceId } from '@/shared/game/splices';
import {
  GENOME_V2_CONFIG,
  GENOME_V2_SPLICES,
  GENOME_V2_SPLICE_IDS,
  GENOME_V2_STRAIN_LADDERS,
  genomeV2CarryBankBps,
  type GenomeV2SpliceId,
} from '@/shared/game/genomeV2';
import {
  COSMIC_SPEED_MS,
  RULESETS,
  rulesetExplainer,
  type DynastyName,
} from '@/shared/game/rulesets';
import {
  STRAINS,
  STRAIN_ECONOMICS,
  STRAIN_IDS,
  STRAIN_PHYSICS,
  STRAIN_THRESHOLDS,
  isStrainId,
  type StrainId,
  type StrainTier,
} from '@/shared/game/strains';
import {
  GEN3_SLOT_UNLOCK,
  MAX_TRAIT_SLOTS,
  TRAITS,
  TRAIT_POOL,
  TRAIT_PHYSICS,
  TRAIT_STRAINS,
  isTraitId,
  type TraitId,
} from '@/shared/game/traits';
import { GAME_CONFIG } from '@/shared/config/game';

// =============================================================================
// CONTRACT
// =============================================================================

/**
 * The Lexicon's categories.
 *
 * Deliberately its OWN union, not an extension of `CodexDiscoveryType`:
 * that type is persisted in `player_codex.discovery_type` and validated by
 * the discovery RPC, so growing it would need a migration — and would
 * assert that traits, dynasties and mechanics are *discoverable*, which
 * they are not. They are documentation. Discovery is a separate axis.
 */
export type LexiconCategory =
  | 'trait'
  | 'gene'
  | 'splice'
  | 'strain'
  | 'strainTier'
  | 'anomaly'
  | 'dynasty'
  | 'mechanic';

/** Severity of a run notice: a removed system warns, a dampened one informs. */
export type LexiconNoticeTone = 'warning' | 'notice';

/**
 * What one entry says. `effect` and `cost` are the two halves of every deal
 * in this game; an empty `cost` means "documented costless" (see
 * `COSTLESS_IDS` below) rather than "cost not written yet".
 */
export interface LexiconEntry {
  kind: LexiconCategory;
  id: string;
  name: string;
  effect: string;
  cost: string;
  /** E = economic (server-recomputed), P = physical, EP = both. */
  taxonomy?: 'E' | 'P' | 'EP';
  strains?: readonly StrainId[];
  /** Body-tint hex, where the entry has one (strains and their tiers). */
  color?: string;
  /**
   * Something this entry changes about the run the player is about to
   * start. Only the two traits that remove or dampen a whole system carry
   * one — a notice on every entry would be noise, and noise is not
   * information.
   */
  runNotice?: { tone: LexiconNoticeTone; text: string };
}

// =============================================================================
// FORMATTING — display transforms, so the copy can interpolate a raw dial
// =============================================================================

/** A multiplier as a signed shift: 1.05 -> "+5%", 0.85 -> "−15%". */
function shift(multiplier: number): string {
  const points = Math.round((multiplier - 1) * 100);
  return `${points >= 0 ? '+' : '−'}${Math.abs(points)}%`;
}

/** A ratio as a share: 0.25 -> "25%". */
function share(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/** An additive delta as a signed figure: 0.05 -> "+0.05", -0.1 -> "−0.10". */
function delta(value: number): string {
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}`;
}

/**
 * A basis-point multiplier as a readable factor: 12_500 -> "×1.25".
 *
 * BANK is the one figure this module used to retype. It stated a flat ×1.25,
 * which stopped being true the day Carry started compounding: v2 BANK is
 * `1.25^(passes+1)` through pass five and then `+0.40` a pass
 * (`genomeV2CarryBankBps`). The sentence now interpolates that function at two
 * points, so a Carry retune moves the copy with it.
 */
function multiplier(bps: number): string {
  return `×${(bps / 10_000).toFixed(2).replace(/\.?0+$/, '')}`;
}

// =============================================================================
// STRAIN TIERS — the 15 pairs. Numbers exist today only in the JSDoc of
// STRAIN_ECONOMICS / STRAIN_PHYSICS; this is where they become sentences.
// =============================================================================

/** The tier-0 label. Promoted here from `StrainMeterHUD`'s private copy. */
export const STRAIN_TIER_DORMANT = 'Asleep';

/** Tier numerals for the `{Path} {Roman} — {Rung}` display form. */
const ROMAN = { 1: 'I', 2: 'II', 3: 'III' } as const;

/**
 * The rung a Path reaches at a tier, read from the live v2 ladder.
 *
 * The v1 `STRAIN_TIER_NAMES` table is no longer a display source: it named
 * fifteen rungs the v2 ladder had already replaced, so the meter and the
 * Workbench were calling the same rung two different things.
 */
function rungName(strain: StrainId, tier: 1 | 2 | 3): string {
  return GENOME_V2_STRAIN_LADDERS[strain][tier - 1].name;
}

/** The activation tiers that carry an effect. Tier 0 is `STRAIN_TIER_DORMANT`. */
export const ACTIVE_STRAIN_TIERS: readonly Extract<StrainTier, 1 | 2 | 3>[] = [
  1, 2, 3,
] as const;

/** The registry id of one strain tier, e.g. `AURUM:2`. */
export function strainTierId(strain: StrainId, tier: 1 | 2 | 3): string {
  return `${strain}:${tier}`;
}

/**
 * The player-facing name of a strain at a tier — the single authority for
 * this string. `StrainMeterHUD` reads it here rather than keeping its own
 * copy of the same four branches.
 */
export function strainTierLabel(strain: StrainId, tier: number): string {
  if (tier >= 3) return rungName(strain, 3);
  if (tier >= 2) return rungName(strain, 2);
  if (tier >= 1) return rungName(strain, 1);
  return STRAIN_TIER_DORMANT;
}

type TierCopy = { effect: string; cost: string };

const STRAIN_TIER_COPY: Record<StrainId, Record<1 | 2 | 3, TierCopy>> = {
  AURUM: {
    1: {
      effect: `Every food from the activation onward pays ${shift(STRAIN_ECONOMICS.giltFoodBonus)}.`,
      cost: '',
    },
    2: {
      effect: `Your trail gilds. Re-crossing a gilded cell pays ${STRAIN_ECONOMICS.aurumWakeCellFlat} flat DNA, up to ${share(STRAIN_ECONOMICS.aurumWakeMaxBonusRatio)} of what the run earned on its own. Gilded cells live ${STRAIN_PHYSICS.gildedCellLifetimeTicks} ticks, ${STRAIN_PHYSICS.gildedMaxCells} at a time.`,
      cost: `Exit portals despawn ${STRAIN_PHYSICS.aurumWakePortalTicksPenalty} ticks sooner.`,
    },
    3: {
      effect: `A food eaten within ${STRAIN_PHYSICS.midasWindowTicks} ticks of the last one is golden — worth up to ${share(STRAIN_ECONOMICS.midasMaxBonusRatio)} on top of everything earned after the Apex.`,
      cost: `Salvage ${delta(STRAIN_ECONOMICS.midasSalvageDelta)} for the rest of the run, revives included.`,
    },
  },
  VOLT: {
    1: {
      effect: `The world runs ${STRAIN_PHYSICS.tempoSlowMs} ms slower per tick — on CYBER, as if you had eaten ${STRAIN_PHYSICS.tempoCyberFoodOffset} fewer foods.`,
      cost: '',
    },
    2: {
      effect: `Every eat arcs to ${STRAIN_PHYSICS.arcMaxPerEat} more foods within ${STRAIN_PHYSICS.arcRadius} cells, collected at full value.`,
      cost: `Food ${shift(STRAIN_ECONOMICS.arcLightningFoodPenalty)} while active — the deterministic price of the reach.`,
    },
    3: {
      effect: `Food ${shift(STRAIN_ECONOMICS.overclockedRealityFoodBonus)} from the Apex onward.`,
      cost: `The world speeds to ×${STRAIN_PHYSICS.overclockedRealityTickFactor} tick interval and portal windows close ${STRAIN_PHYSICS.overclockedPortalTicksPenalty} ticks sooner.`,
    },
  },
  FERAL: {
    1: {
      effect: 'Survive one self-collision this run instead of dying.',
      cost: `The pardon grows ${STRAIN_PHYSICS.thickHideGrowth} permanent segments, and only once.`,
    },
    2: {
      effect: `Every ${STRAIN_PHYSICS.fortressEveryFoods} foods your oldest ${STRAIN_PHYSICS.fortressSegments} segments petrify: they stop following and become fixed terrain, paying ${STRAIN_ECONOMICS.fortressSegmentDna} DNA each.`,
      cost: `The stone forms for ${STRAIN_PHYSICS.fortressFormingSeconds} seconds and then kills on contact, for the rest of the run. It still counts toward your length — nothing here makes you shorter — and nothing petrifies while it would leave you under ${STRAIN_PHYSICS.fortressMinLiveLength} living segments.`,
    },
    3: {
      effect: `Bite your own tail tip for ${STRAIN_ECONOMICS.ouroborosBiteFlat} flat DNA, once per ${STRAIN_ECONOMICS.ouroborosFoodsPerBite} foods eaten since the Apex.`,
      cost: `Each bite grows ${STRAIN_PHYSICS.ouroborosGrowthPerBite} permanent segments, and food pays ${shift(STRAIN_ECONOMICS.ouroborosFoodPenalty)} while active.`,
    },
  },
  FLUX: {
    1: {
      effect: `One free edge-wrap, recharging every ${STRAIN_PHYSICS.warpSkinRechargeFoods} foods.`,
      cost: '',
    },
    2: {
      effect: 'All four walls wrap, permanently. The board stops having edges.',
      cost: `Food ${shift(STRAIN_ECONOMICS.riftAuraFoodPenalty)} while active and exit portal interval +${STRAIN_PHYSICS.riftAuraPortalIntervalPenalty} foods.`,
    },
    3: {
      effect: `Every ${STRAIN_ECONOMICS.singularityEveryFoods} foods, the board's food is pulled within ${STRAIN_PHYSICS.singularityPullRadius} cells of your head and pays ${STRAIN_ECONOMICS.singularityFlat} flat DNA.`,
      cost: `Exit portal interval +${STRAIN_PHYSICS.singularityPortalIntervalPenalty} foods.`,
    },
  },
  UMBRA: {
    1: {
      effect: `Salvage ${delta(STRAIN_ECONOMICS.shadowSkinSalvageDelta)} if the run ends in death.`,
      cost: 'Voided by Phoenix — you cannot be paid twice for the same death.',
    },
    2: {
      effect: `Your tail phases for ${STRAIN_PHYSICS.phantomCoilTicks} ticks after every eat.`,
      cost: `Portal windows close ${STRAIN_PHYSICS.phantomPortalTicksPenalty} ticks sooner.`,
    },
    3: {
      effect: `Salvage ${delta(STRAIN_ECONOMICS.secondSunSalvageDelta)}, and the trigger pays up to ${STRAIN_ECONOMICS.secondSunTriggerFlat} flat DNA once.`,
      cost: `Bank ${delta(STRAIN_ECONOMICS.secondSunBankDelta)} while active.`,
    },
  },
};

// =============================================================================
// MECHANICS — the vocabulary no def owns
// =============================================================================

export type MechanicId =
  | 'extraction_bank'
  | 'extraction_pass'
  | 'extraction_infuse'
  | 'charges'
  | 'strain_minor'
  | 'strain_expression'
  | 'strain_apex'
  | 'trait_slots'
  | 'lineage_strength'
  | 'ascendance';

const FTUE = GAME_CONFIG.genome.ftue;
const ENERGY = GAME_CONFIG.economy.energy;

const MECHANICS: Record<MechanicId, Omit<LexiconEntry, 'kind' | 'id'>> = {
  extraction_bank: {
    name: 'BANK',
    effect: `Leave now and keep it all. Every portal you rode makes this bigger: ${multiplier(genomeV2CarryBankBps(0))} at the first portal, ${multiplier(genomeV2CarryBankBps(3))} once you have ridden three.`,
    cost: 'The run ends there. No more food, no more powers.',
  },
  extraction_pass: {
    name: 'RIDE ON',
    effect: 'Keep going. Bigger payout, bigger fall.',
    cost: 'Nothing is safe yet. Crash and you keep less each time.',
  },
  extraction_infuse: {
    name: 'TRADE UP',
    effect: 'Trade body length for a new power.',
    cost: `Your snake grows to carry it. Max ${GENOME_V2_CONFIG.portalGenome.maxActions} per run.`,
  },
  charges: {
    name: 'Energy Commitment',
    effect: `Store up to ${ENERGY.capacity} Energy. One recovers every ${ENERGY.recoveryIntervalSeconds / 3600} hour on server time, including while offline. Commit 1–${ENERGY.capacity} before a run for a nonlinear harvest multiplier.`,
    cost: `Every committed unit is consumed when the run starts and is never refunded for a crash or abandonment. A zero-Energy run still Scores, ranks and counts at ${share(ENERGY.leanHarvestFactor)} harvest. Energy cannot be bought or gifted.`,
  },
  strain_minor: {
    name: 'Level I',
    effect: `Reach ${STRAIN_THRESHOLDS.minor} points in one Path — powers, heirloom traits and bloodline all count — and its first rung turns on for the rest of the run.`,
    cost: '',
  },
  strain_expression: {
    name: 'Level II',
    effect: `Reach ${STRAIN_THRESHOLDS.expression} points AND pick ${STRAIN_THRESHOLDS.expressionMinGenes} powers of that Path in this run.`,
    cost: `Points beyond a gate never overflow past it: without those ${STRAIN_THRESHOLDS.expressionMinGenes} picks you stay on Level I however many points you carry. Unlocks at ${FTUE.expressionsAt} banked runs.`,
  },
  strain_apex: {
    name: 'Level III',
    effect: `Reach ${STRAIN_THRESHOLDS.apex} points AND pick ${STRAIN_THRESHOLDS.apexMinGenes} powers of that Path in this run.`,
    cost: `Every Level III carries a permanent cost that persists through revives. Unlocks at ${FTUE.apexesAt} banked runs, or earlier on a mastered dynasty.`,
  },
  trait_slots: {
    name: 'Trait slots',
    effect: `A snake carries at most ${MAX_TRAIT_SLOTS} traits. Rare and above start with ${MAX_TRAIT_SLOTS}; any lineage that reaches Gen ${GEN3_SLOT_UNLOCK} gains the second regardless of rarity.`,
    cost: `Rarity buys slot potential and cosmetics — never stats — and the cap of ${MAX_TRAIT_SLOTS} never rises. Traits are drafted at breeding, so the way to change one is to breed again.`,
  },
  lineage_strength: {
    name: 'Bloodline strength',
    effect: `Every bloodline tilts your power offers toward its Path, strength 0 included. Strength 1 adds a starting Path point; strength 2 additionally guarantees that Path in your first offer.`,
    cost: `The starting point does nothing until ${FTUE.spawnPointsAt} banked runs, and spawn sources are capped at ${STRAIN_THRESHOLDS.maxSpawnPoints} points per strain — you can never spawn closer than one pick from Level II.`,
  },
  ascendance: {
    name: 'Legacy',
    effect: `From Gen ${ASCENDANCE_START_GENERATION}, every new generation compounds that snake's permanent Payout by ×${ASCENDANCE_V2_GENERATION_FACTOR}. The proportional gain never shrinks and there is no designed Payout ceiling.`,
    cost: `Each generation past Gen ${GEN3_SLOT_UNLOCK} multiplies the breeding price by ×${ASCENDANCE_COST_STEEPENING}. Score reads none of it — Legacy rewards long-term ownership without rewriting the competitive gameplay result.`,
  },
};

// =============================================================================
// DYNASTIES
// =============================================================================

const DYNASTY_COSTS: Record<DynastyName, string> = {
  PRIMAL: 'No speed tier and no debris to build with: the compounding is gentle, and so is the ceiling.',
  CYBER: 'The world accelerates with every food, and the top tier is only worth what you survive long enough to bank.',
  COSMIC: `A fixed ${COSMIC_SPEED_MS} ms/tick, and every star you fail to reach in time turns solid where it sat, for the rest of the run. Stars are worth more the longer you last — but the board you are routing through is the one you built.`,
};

// =============================================================================
// TRAIT RUN NOTICES — only the two that change what the run contains
// =============================================================================

const TRAIT_RUN_NOTICES: Partial<
  Record<TraitId, { tone: LexiconNoticeTone; text: string }>
> = {
  ascetic: {
    tone: 'warning',
    text: 'Ascetic: no mutation foods spawn this run. No genes, no splices, no strains — pure snake.',
  },
  patient: {
    tone: 'notice',
    text: `Patient: mutation foods spawn ${share(1 / TRAIT_PHYSICS.patientMutationIntervalMultiplier)} as often this run.`,
  },
};

/**
 * Entries whose `cost` is empty because the design gives them none — the
 * documented costless list, so an empty string is never read as missing
 * copy. This list is EXACT, and `lexicon.test.ts` asserts it matches the
 * set of empty-cost entries exactly in both directions: adding a costless
 * entry without listing it fails, and listing an entry that grew a cost
 * fails too.
 *
 * Why each one is genuinely free:
 * - A strain **family** is a taxonomy, not a deal. It has an identity, not
 *   a price.
 * - Three of the five **minor passives** are the plain payoff for reaching
 *   the threshold at all. (Thick Hide and Shadow Skin are not on this list:
 *   the first charges eight growth on trigger, the second is voided by
 *   Phoenix.)
 * - **Meteor Shower** and **Blackout** are the two pure-physical anomalies:
 *   they change the board without touching the payout in either direction.
 * - The **minor threshold** itself asks for points and nothing else.
 */
export const COSTLESS_IDS: readonly string[] = [
  ...STRAIN_IDS,
  strainTierId('AURUM', 1),
  strainTierId('VOLT', 1),
  strainTierId('FLUX', 1),
  'meteor_shower',
  'blackout',
  'strain_minor',
];

// =============================================================================
// REGISTRY
// =============================================================================

function traitEntry(id: TraitId): LexiconEntry {
  const def = TRAITS[id];
  return {
    kind: 'trait',
    id,
    name: def.name,
    effect: def.effect,
    cost: def.cost,
    taxonomy: def.kind,
    strains: [TRAIT_STRAINS[id]],
    runNotice: TRAIT_RUN_NOTICES[id],
  };
}

/**
 * A Power entry, resolved against the catalog the player can actually reach.
 *
 * Thirteen ids appear in both catalogs with different prose, and the v2 pool
 * is the one a live run draws from, so a reused id answers with its v2
 * meaning. The v1 rows stay reachable by id for already-started v1 sessions,
 * which is the only place they still describe anything true.
 */
function geneEntry(id: GeneId | GenomeV2ActiveGeneId): LexiconEntry {
  if (isGenomeV2ActiveGeneId(id)) {
    const def = GENOME_V2_GENES[id];
    return {
      kind: 'gene',
      id,
      name: def.name,
      effect: def.effect,
      cost: def.cost,
      taxonomy: def.kind,
      strains: def.strains,
    };
  }
  const def = GENES[id];
  return {
    kind: 'gene',
    id,
    name: def.name,
    effect: def.effect,
    cost: def.cost,
    taxonomy: def.kind,
    strains: def.strains,
  };
}

/** The Paths a v2 Combo inherits, taken from the two Powers that make it. */
function genomeV2SpliceStrains(id: GenomeV2SpliceId): StrainId[] {
  return Array.from(
    new Set(
      GENOME_V2_SPLICES[id].parents.flatMap(
        (parent) => GENOME_V2_GENES[parent].strains
      )
    )
  );
}

/**
 * A Combo entry. The v2 recipes are the only ones a v2 run can form; the
 * seven v1 recipes whose parents left the pool are no longer published, which
 * is what stopped the Codex advertising combos nobody could make.
 */
function spliceEntry(id: SpliceId | GenomeV2SpliceId): LexiconEntry {
  if ((GENOME_V2_SPLICE_IDS as readonly string[]).includes(id)) {
    const def = GENOME_V2_SPLICES[id as GenomeV2SpliceId];
    return {
      kind: 'splice',
      id,
      name: def.name,
      effect: def.rule,
      cost: def.strategicCost,
      strains: genomeV2SpliceStrains(id as GenomeV2SpliceId),
    };
  }
  const def = SPLICES[id as SpliceId];
  return {
    kind: 'splice',
    id,
    name: def.name,
    effect: def.effect,
    cost: def.cost,
    strains: spliceStrains(id as SpliceId),
  };
}

function strainEntry(id: StrainId): LexiconEntry {
  const def = STRAINS[id];
  return {
    kind: 'strain',
    id,
    name: def.name,
    effect: def.identity,
    cost: '',
    strains: [id],
    color: def.color,
  };
}

function strainTierEntry(strain: StrainId, tier: 1 | 2 | 3): LexiconEntry {
  const copy = STRAIN_TIER_COPY[strain][tier];
  return {
    kind: 'strainTier',
    id: strainTierId(strain, tier),
    name: `${STRAINS[strain].name} ${ROMAN[tier]} — ${rungName(strain, tier)}`,
    effect: copy.effect,
    cost: copy.cost,
    strains: [strain],
    color: STRAINS[strain].color,
  };
}

function anomalyEntry(id: AnomalyId): LexiconEntry {
  const def = ANOMALIES[id];
  return {
    kind: 'anomaly',
    id,
    name: def.name,
    effect: def.effect,
    cost: def.cost,
    taxonomy: def.kind,
    strains: [def.strainBias],
  };
}

function dynastyEntry(id: DynastyName): LexiconEntry {
  return {
    kind: 'dynasty',
    id,
    name: RULESETS[id].displayName,
    effect: rulesetExplainer[id],
    cost: DYNASTY_COSTS[id],
  };
}

function mechanicEntry(id: MechanicId): LexiconEntry {
  return { kind: 'mechanic', id, ...MECHANICS[id] };
}

/** Dynasty ids in display order. */
export const DYNASTY_IDS: readonly DynastyName[] = ['PRIMAL', 'CYBER', 'COSMIC'] as const;

/** Mechanic ids in reading order: the portal first, then the frame around it. */
export const MECHANIC_IDS: readonly MechanicId[] = [
  'extraction_bank',
  'extraction_pass',
  'extraction_infuse',
  'charges',
  'strain_minor',
  'strain_expression',
  'strain_apex',
  'trait_slots',
  'lineage_strength',
  'ascendance',
] as const;

function isMechanicId(value: unknown): value is MechanicId {
  return typeof value === 'string' && value in MECHANICS;
}

function isDynastyName(value: unknown): value is DynastyName {
  return value === 'PRIMAL' || value === 'CYBER' || value === 'COSMIC';
}

function parseStrainTierId(
  value: string
): { strain: StrainId; tier: 1 | 2 | 3 } | null {
  const [strain, rawTier] = value.split(':');
  if (!isStrainId(strain)) return null;
  const tier = Number(rawTier);
  if (tier !== 1 && tier !== 2 && tier !== 3) return null;
  return { strain, tier };
}

/**
 * Explain one entry, or `null` when the id is not in that category. Every
 * id is validated rather than trusted, so an id off the wire (a session
 * blob, a query string) can be handed straight in.
 *
 * Genes read `GENES`, never `MUTATIONS`: 15 of the 34 genes are absent from
 * `MUTATIONS`, and every strain tag with them.
 */
export function describe(kind: LexiconCategory, id: string): LexiconEntry | null {
  switch (kind) {
    case 'trait':
      return isTraitId(id) ? traitEntry(id) : null;
    case 'gene':
      return isGenomeV2ActiveGeneId(id) || isGeneId(id) ? geneEntry(id) : null;
    case 'splice':
      return (GENOME_V2_SPLICE_IDS as readonly string[]).includes(id) || isSpliceId(id)
        ? spliceEntry(id as SpliceId | GenomeV2SpliceId)
        : null;
    case 'strain':
      return isStrainId(id) ? strainEntry(id) : null;
    case 'strainTier': {
      const parsed = parseStrainTierId(id);
      return parsed ? strainTierEntry(parsed.strain, parsed.tier) : null;
    }
    case 'anomaly':
      return isAnomalyId(id) ? anomalyEntry(id) : null;
    case 'dynasty':
      return isDynastyName(id) ? dynastyEntry(id) : null;
    case 'mechanic':
      return isMechanicId(id) ? mechanicEntry(id) : null;
    default:
      return null;
  }
}

/** Every entry of a category, in display order — the Codex's section source. */
export function lexiconSection(kind: LexiconCategory): LexiconEntry[] {
  switch (kind) {
    case 'trait':
      return TRAIT_POOL.map(traitEntry);
    case 'gene':
      return (Object.keys(GENOME_V2_GENES) as GenomeV2ActiveGeneId[]).map(geneEntry);
    case 'splice':
      return GENOME_V2_SPLICE_IDS.map(spliceEntry);
    case 'strain':
      return STRAIN_IDS.map(strainEntry);
    case 'strainTier':
      return STRAIN_IDS.flatMap((strain) =>
        ACTIVE_STRAIN_TIERS.map((tier) => strainTierEntry(strain, tier))
      );
    case 'anomaly':
      return (Object.keys(ANOMALIES) as AnomalyId[]).map(anomalyEntry);
    case 'dynasty':
      return DYNASTY_IDS.map(dynastyEntry);
    case 'mechanic':
      return MECHANIC_IDS.map(mechanicEntry);
    default:
      return [];
  }
}

/**
 * The sections a signed-out visitor can read in full: pure rules, no player
 * state, no API call. Genes and splices are excluded not because their
 * rules are secret — they are not, and the Codex now shows them — but
 * because their section carries a discovery layer that needs an account.
 */
export const DOCUMENTED_SECTIONS: readonly LexiconCategory[] = [
  'mechanic',
  'dynasty',
  'trait',
  'strain',
  'strainTier',
  'anomaly',
] as const;
