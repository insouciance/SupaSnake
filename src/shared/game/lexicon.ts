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
  ASCENDANCE_FIRST_INCREMENT,
  ASCENDANCE_START_GENERATION,
  ASCENDANCE_YIELD_CEILING,
} from '@/shared/game/ascendance';
import { GENES, isGeneId, type GeneId } from '@/shared/game/genes';
import { SPLICES, SPLICE_IDS, isSpliceId, spliceStrains, type SpliceId } from '@/shared/game/splices';
import {
  BANK,
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
  STRAIN_TIER_NAMES,
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

// =============================================================================
// STRAIN TIERS — the 15 pairs. Numbers exist today only in the JSDoc of
// STRAIN_ECONOMICS / STRAIN_PHYSICS; this is where they become sentences.
// =============================================================================

/** The tier-0 label. Promoted here from `StrainMeterHUD`'s private copy. */
export const STRAIN_TIER_DORMANT = 'Dormant';

/** The activation tiers that carry an effect. Tier 0 is `STRAIN_TIER_DORMANT`. */
export const ACTIVE_STRAIN_TIERS: readonly Extract<StrainTier, 1 | 2 | 3>[] = [
  1, 2, 3,
] as const;

/** The registry id of one strain tier, e.g. `AURUM:2`. */
export function strainTierId(strain: StrainId, tier: 1 | 2 | 3): string {
  return `${strain}:${tier}`;
}

const TIER_KEY = { 1: 'minor', 2: 'expression', 3: 'apex' } as const;

/**
 * The player-facing name of a strain at a tier — the single authority for
 * this string. `StrainMeterHUD` reads it here rather than keeping its own
 * copy of the same four branches.
 */
export function strainTierLabel(strain: StrainId, tier: number): string {
  if (tier >= 3) return STRAIN_TIER_NAMES[strain].apex;
  if (tier >= 2) return STRAIN_TIER_NAMES[strain].expression;
  if (tier >= 1) return STRAIN_TIER_NAMES[strain].minor;
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
      effect: 'Survive one collision this run instead of dying.',
      cost: `It costs ${STRAIN_PHYSICS.thickHideSegmentLoss} tail segments, and only once.`,
    },
    2: {
      effect: `Every ${STRAIN_PHYSICS.moltEveryFoods} foods the tail sheds to ${share(STRAIN_PHYSICS.moltShedFraction)} of its length, never below ${STRAIN_PHYSICS.moltMinLength}, and drops ${STRAIN_ECONOMICS.moltFoodsPerEvent} molt foods worth ${STRAIN_ECONOMICS.moltFoodFlat} DNA each.`,
      cost: `Each molt speeds the world to ×${STRAIN_PHYSICS.moltTickFactor} tick interval, compounding for the rest of the run — and you can never be shorter than ${STRAIN_PHYSICS.moltMinLength} again.`,
    },
    3: {
      effect: `Bite your own tail tip for ${STRAIN_ECONOMICS.ouroborosBiteFlat} flat DNA, once per ${STRAIN_ECONOMICS.ouroborosFoodsPerBite} foods eaten since the Apex.`,
      cost: `Each bite eats ${STRAIN_PHYSICS.ouroborosSegmentsPerBite} segments, and food pays ${shift(STRAIN_ECONOMICS.ouroborosFoodPenalty)} while active.`,
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
    effect: `Leave through the exit portal. Everything the run earned is secured at ×${BANK.extractMultiplier} and nothing can take it back.`,
    cost: 'The run ends there. No further foods, no further genes, no deeper Score.',
  },
  extraction_pass: {
    name: 'PASS',
    effect: 'Wave the portal away and keep playing. Score and DNA keep climbing, and another portal is already on its way.',
    cost: `Nothing is secured. Crash before the next portal and the run salvages ×${BANK.deathMultiplier} instead of ×${BANK.extractMultiplier}.`,
  },
  extraction_infuse: {
    name: 'INFUSE',
    effect: `Spend the portal on power instead of safety: absorb a gene offer — or, at the gene cap, a Strain Surge — and your body grows ${STRAIN_PHYSICS.infuseGrowth} segments to carry it. Each infuse also shifts the run's outcome by bank ${delta(STRAIN_ECONOMICS.infuseBankDelta)}.`,
    cost: `Salvage ${delta(STRAIN_ECONOMICS.infuseSalvageDelta)} per infuse, the next portal comes +${STRAIN_PHYSICS.infusePortalIntervalPenalty} foods later, and the run allows at most ${STRAIN_PHYSICS.infuseMaxPerRun}. Offered from length ${STRAIN_PHYSICS.infuseMinLength} and from ${FTUE.infuseAt} banked runs.`,
  },
  charges: {
    name: 'Charges',
    effect: `The day grants ${ENERGY.chargesPerDay} charges, back to full at 00:00 UTC. A charged run harvests its DNA at full strength.`,
    cost: `Past the day's ${ENERGY.chargesPerDay}th run the harvest drops to ${share(ENERGY.leanHarvestFactor)} — lean, never zero. Nothing gates play: an uncharged run still Scores, still ranks, still counts. Charges cannot be bought, gifted or earned; the only refill is the clock.`,
  },
  strain_minor: {
    name: 'Minor passive',
    effect: `Reach ${STRAIN_THRESHOLDS.minor} points in one strain — genes, heirloom traits and lineage all count — and its minor passive turns on for the rest of the run.`,
    cost: '',
  },
  strain_expression: {
    name: 'Expression',
    effect: `Reach ${STRAIN_THRESHOLDS.expression} points AND pick ${STRAIN_THRESHOLDS.expressionMinGenes} genes of that strain in this run.`,
    cost: `Points beyond a gate never overflow past it: without those ${STRAIN_THRESHOLDS.expressionMinGenes} picks you stay on the minor passive however many points you carry. Unlocks at ${FTUE.expressionsAt} banked runs.`,
  },
  strain_apex: {
    name: 'Apex',
    effect: `Reach ${STRAIN_THRESHOLDS.apex} points AND pick ${STRAIN_THRESHOLDS.apexMinGenes} genes of that strain in this run.`,
    cost: `Every Apex carries a permanent cost that persists through revives. Unlocks at ${FTUE.apexesAt} banked runs, or earlier on a mastered dynasty.`,
  },
  trait_slots: {
    name: 'Trait slots',
    effect: `A snake carries at most ${MAX_TRAIT_SLOTS} traits. Rare and above start with ${MAX_TRAIT_SLOTS}; any lineage that reaches Gen ${GEN3_SLOT_UNLOCK} gains the second regardless of rarity.`,
    cost: `Rarity buys slot potential and cosmetics — never stats — and the cap of ${MAX_TRAIT_SLOTS} never rises. Traits are drafted at breeding, so the way to change one is to breed again.`,
  },
  lineage_strength: {
    name: 'Lineage strength',
    effect: `Every lineage tilts your gene offers toward its strain, strength 0 included. Strength 1 adds a starting strain point; strength 2 additionally guarantees that strain in your first offer.`,
    cost: `The starting point does nothing until ${FTUE.spawnPointsAt} banked runs, and spawn sources are capped at ${STRAIN_THRESHOLDS.maxSpawnPoints} points per strain — you can never spawn closer than one pick from an Expression.`,
  },
  ascendance: {
    name: 'Ascendance',
    effect: `From Gen ${ASCENDANCE_START_GENERATION} every generation permanently raises that snake's Yield: ${shift(1 + ASCENDANCE_FIRST_INCREMENT)} at the first step, each step smaller than the last, approaching ${shift(1 + ASCENDANCE_YIELD_CEILING)} and never reaching it.`,
    cost: `Each generation past Gen ${GEN3_SLOT_UNLOCK} multiplies the breeding price by ×${ASCENDANCE_COST_STEEPENING}, so every step buys visibly less for visibly more. Score reads none of it — a veteran's snake is never a different game.`,
  },
};

// =============================================================================
// DYNASTIES
// =============================================================================

const DYNASTY_COSTS: Record<DynastyName, string> = {
  PRIMAL: 'No speed tier and no combo chain: the compounding is gentle, and so is the ceiling.',
  CYBER: 'The world accelerates with every food, and the top tier is only worth what you survive long enough to bank.',
  COSMIC: `A fixed ${COSMIC_SPEED_MS} ms/tick and a flat base food value — all of the payout lives in the chaining, and a broken chain pays nothing extra.`,
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
 *   the first costs five tail segments, the second is voided by Phoenix.)
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

function geneEntry(id: GeneId): LexiconEntry {
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

function spliceEntry(id: SpliceId): LexiconEntry {
  const def = SPLICES[id];
  return {
    kind: 'splice',
    id,
    name: def.name,
    effect: def.effect,
    cost: def.cost,
    strains: spliceStrains(id),
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
    name: `${STRAINS[strain].name} ${STRAIN_TIER_NAMES[strain][TIER_KEY[tier]]}`,
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
    name: RULESETS[id].id,
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
      return isGeneId(id) ? geneEntry(id) : null;
    case 'splice':
      return isSpliceId(id) ? spliceEntry(id) : null;
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
      return (Object.keys(GENES) as GeneId[]).map(geneEntry);
    case 'splice':
      return SPLICE_IDS.map(spliceEntry);
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
