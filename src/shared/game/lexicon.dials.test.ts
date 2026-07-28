/**
 * The one-home rule, held mechanically (WP-2.07a).
 *
 * A number lives only in its tuning module; a sentence lives only on the def
 * that owns it, else in lexicon.ts — and lexicon.ts never RETYPES a number,
 * it interpolates one.
 *
 * Every case below reads a dial from the module that tunes it, renders the
 * fragment the copy is supposed to contain, and asserts the copy contains
 * it. So the day someone retunes `STRAIN_THRESHOLDS.minor` from 2 to 3, any
 * sentence that hardcoded "2" fails here **by name** — the failure message
 * says which entry, which half, and what it should have said.
 *
 * The fragments carry surrounding words on purpose ("2 points", "×1.25")
 * rather than the bare digit: a lone "2" would match almost any sentence
 * and the guard would pass while lying.
 */

import { describe as describeEntry, strainTierId } from './lexicon';
import { BANK } from './rulesets';
import { STRAIN_ECONOMICS, STRAIN_PHYSICS, STRAIN_THRESHOLDS } from './strains';
import { GEN3_SLOT_UNLOCK, MAX_TRAIT_SLOTS, TRAIT_PHYSICS } from './traits';
import {
  ASCENDANCE_COST_STEEPENING,
  ASCENDANCE_FIRST_INCREMENT,
  ASCENDANCE_START_GENERATION,
  ASCENDANCE_YIELD_CEILING,
} from './ascendance';
import { ANOMALY_ECONOMICS, ANOMALY_PHYSICS } from './anomalies';
import { GAME_CONFIG } from '@/shared/config/game';

const FTUE = GAME_CONFIG.genome.ftue;
const ENERGY = GAME_CONFIG.economy.energy;

/** The test's own copies of the display transforms — deliberately not shared. */
const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;
const signed = (multiplier: number) => {
  const points = Math.round((multiplier - 1) * 100);
  return `${points >= 0 ? '+' : '−'}${Math.abs(points)}%`;
};
const signedDelta = (value: number) =>
  `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}`;

type Half = 'effect' | 'cost';
type Case = [kind: 'mechanic' | 'strainTier' | 'anomaly', id: string, half: Half, fragment: string];

const CASES: Case[] = [
  // ── The extraction verbs ────────────────────────────────────────────────
  ['mechanic', 'extraction_bank', 'effect', `×${BANK.extractMultiplier}`],
  ['mechanic', 'extraction_pass', 'cost', `×${BANK.deathMultiplier}`],
  ['mechanic', 'extraction_pass', 'cost', `×${BANK.extractMultiplier}`],
  ['mechanic', 'extraction_infuse', 'effect', `${STRAIN_PHYSICS.infuseGrowth} segments`],
  ['mechanic', 'extraction_infuse', 'effect', `bank ${signedDelta(STRAIN_ECONOMICS.infuseBankDelta)}`],
  ['mechanic', 'extraction_infuse', 'cost', `Salvage ${signedDelta(STRAIN_ECONOMICS.infuseSalvageDelta)}`],
  ['mechanic', 'extraction_infuse', 'cost', `+${STRAIN_PHYSICS.infusePortalIntervalPenalty} foods later`],
  ['mechanic', 'extraction_infuse', 'cost', `at most ${STRAIN_PHYSICS.infuseMaxPerRun}`],
  ['mechanic', 'extraction_infuse', 'cost', `length ${STRAIN_PHYSICS.infuseMinLength}`],
  ['mechanic', 'extraction_infuse', 'cost', `from ${FTUE.infuseAt} banked runs`],

  // ── Charges ─────────────────────────────────────────────────────────────
  ['mechanic', 'charges', 'effect', `grants ${ENERGY.chargesPerDay} charges`],
  ['mechanic', 'charges', 'cost', `${ENERGY.chargesPerDay}th run`],
  ['mechanic', 'charges', 'cost', pct(ENERGY.leanHarvestFactor)],

  // ── The three strain thresholds ─────────────────────────────────────────
  ['mechanic', 'strain_minor', 'effect', `${STRAIN_THRESHOLDS.minor} points`],
  ['mechanic', 'strain_expression', 'effect', `${STRAIN_THRESHOLDS.expression} points`],
  ['mechanic', 'strain_expression', 'effect', `pick ${STRAIN_THRESHOLDS.expressionMinGenes} genes`],
  ['mechanic', 'strain_expression', 'cost', `those ${STRAIN_THRESHOLDS.expressionMinGenes} picks`],
  ['mechanic', 'strain_expression', 'cost', `${FTUE.expressionsAt} banked runs`],
  ['mechanic', 'strain_apex', 'effect', `${STRAIN_THRESHOLDS.apex} points`],
  ['mechanic', 'strain_apex', 'effect', `pick ${STRAIN_THRESHOLDS.apexMinGenes} genes`],
  ['mechanic', 'strain_apex', 'cost', `${FTUE.apexesAt} banked runs`],

  // ── Slots, lineage, Ascendance ──────────────────────────────────────────
  ['mechanic', 'trait_slots', 'effect', `at most ${MAX_TRAIT_SLOTS} traits`],
  ['mechanic', 'trait_slots', 'effect', `Gen ${GEN3_SLOT_UNLOCK}`],
  ['mechanic', 'trait_slots', 'cost', `cap of ${MAX_TRAIT_SLOTS}`],
  ['mechanic', 'lineage_strength', 'cost', `${FTUE.spawnPointsAt} banked runs`],
  ['mechanic', 'lineage_strength', 'cost', `${STRAIN_THRESHOLDS.maxSpawnPoints} points per strain`],
  ['mechanic', 'ascendance', 'effect', `Gen ${ASCENDANCE_START_GENERATION}`],
  ['mechanic', 'ascendance', 'effect', signed(1 + ASCENDANCE_FIRST_INCREMENT)],
  ['mechanic', 'ascendance', 'effect', signed(1 + ASCENDANCE_YIELD_CEILING)],
  ['mechanic', 'ascendance', 'cost', `Gen ${GEN3_SLOT_UNLOCK}`],
  ['mechanic', 'ascendance', 'cost', `×${ASCENDANCE_COST_STEEPENING}`],

  // ── The fifteen strain tiers ────────────────────────────────────────────
  ['strainTier', strainTierId('AURUM', 1), 'effect', signed(STRAIN_ECONOMICS.giltFoodBonus)],
  ['strainTier', strainTierId('AURUM', 2), 'effect', `${STRAIN_ECONOMICS.aurumWakeCellFlat} flat DNA`],
  ['strainTier', strainTierId('AURUM', 2), 'effect', pct(STRAIN_ECONOMICS.aurumWakeMaxBonusRatio)],
  ['strainTier', strainTierId('AURUM', 2), 'effect', `${STRAIN_PHYSICS.gildedCellLifetimeTicks} ticks`],
  ['strainTier', strainTierId('AURUM', 2), 'effect', `${STRAIN_PHYSICS.gildedMaxCells} at a time`],
  ['strainTier', strainTierId('AURUM', 2), 'cost', `${STRAIN_PHYSICS.aurumWakePortalTicksPenalty} ticks sooner`],
  ['strainTier', strainTierId('AURUM', 3), 'effect', `${STRAIN_PHYSICS.midasWindowTicks} ticks`],
  ['strainTier', strainTierId('AURUM', 3), 'effect', pct(STRAIN_ECONOMICS.midasMaxBonusRatio)],
  ['strainTier', strainTierId('AURUM', 3), 'cost', `Salvage ${signedDelta(STRAIN_ECONOMICS.midasSalvageDelta)}`],

  ['strainTier', strainTierId('VOLT', 1), 'effect', `${STRAIN_PHYSICS.tempoSlowMs} ms slower`],
  ['strainTier', strainTierId('VOLT', 1), 'effect', `${STRAIN_PHYSICS.tempoCyberFoodOffset} fewer foods`],
  ['strainTier', strainTierId('VOLT', 2), 'effect', `${STRAIN_PHYSICS.arcMaxPerEat} more foods`],
  ['strainTier', strainTierId('VOLT', 2), 'effect', `${STRAIN_PHYSICS.arcRadius} cells`],
  ['strainTier', strainTierId('VOLT', 2), 'cost', signed(STRAIN_ECONOMICS.arcLightningFoodPenalty)],
  ['strainTier', strainTierId('VOLT', 3), 'effect', signed(STRAIN_ECONOMICS.overclockedRealityFoodBonus)],
  ['strainTier', strainTierId('VOLT', 3), 'cost', `×${STRAIN_PHYSICS.overclockedRealityTickFactor}`],
  ['strainTier', strainTierId('VOLT', 3), 'cost', `${STRAIN_PHYSICS.overclockedPortalTicksPenalty} ticks sooner`],

  ['strainTier', strainTierId('FERAL', 1), 'cost', `${STRAIN_PHYSICS.thickHideSegmentLoss} tail segments`],
  // FERAL:2 is Fortress (WP-3.11). All five of its dials appear in the copy,
  // which is the property this file exists to hold: a tier whose numbers the
  // player cannot read is a tier they cannot decide about.
  ['strainTier', strainTierId('FERAL', 2), 'effect', `Every ${STRAIN_PHYSICS.fortressEveryFoods} foods`],
  ['strainTier', strainTierId('FERAL', 2), 'effect', `oldest ${STRAIN_PHYSICS.fortressSegments} segments`],
  ['strainTier', strainTierId('FERAL', 2), 'effect', `${STRAIN_ECONOMICS.fortressSegmentDna} DNA each`],
  ['strainTier', strainTierId('FERAL', 2), 'cost', `${STRAIN_PHYSICS.fortressFormingSeconds} seconds`],
  ['strainTier', strainTierId('FERAL', 2), 'cost', `under ${STRAIN_PHYSICS.fortressMinLiveLength} living segments`],
  ['strainTier', strainTierId('FERAL', 3), 'effect', `${STRAIN_ECONOMICS.ouroborosBiteFlat} flat DNA`],
  ['strainTier', strainTierId('FERAL', 3), 'effect', `per ${STRAIN_ECONOMICS.ouroborosFoodsPerBite} foods`],
  ['strainTier', strainTierId('FERAL', 3), 'cost', `${STRAIN_PHYSICS.ouroborosSegmentsPerBite} segments`],
  ['strainTier', strainTierId('FERAL', 3), 'cost', signed(STRAIN_ECONOMICS.ouroborosFoodPenalty)],

  ['strainTier', strainTierId('FLUX', 1), 'effect', `every ${STRAIN_PHYSICS.warpSkinRechargeFoods} foods`],
  ['strainTier', strainTierId('FLUX', 2), 'cost', signed(STRAIN_ECONOMICS.riftAuraFoodPenalty)],
  ['strainTier', strainTierId('FLUX', 2), 'cost', `+${STRAIN_PHYSICS.riftAuraPortalIntervalPenalty} foods`],
  ['strainTier', strainTierId('FLUX', 3), 'effect', `Every ${STRAIN_ECONOMICS.singularityEveryFoods} foods`],
  ['strainTier', strainTierId('FLUX', 3), 'effect', `${STRAIN_PHYSICS.singularityPullRadius} cells`],
  ['strainTier', strainTierId('FLUX', 3), 'effect', `${STRAIN_ECONOMICS.singularityFlat} flat DNA`],
  ['strainTier', strainTierId('FLUX', 3), 'cost', `+${STRAIN_PHYSICS.singularityPortalIntervalPenalty} foods`],

  ['strainTier', strainTierId('UMBRA', 1), 'effect', `Salvage ${signedDelta(STRAIN_ECONOMICS.shadowSkinSalvageDelta)}`],
  ['strainTier', strainTierId('UMBRA', 2), 'effect', `${STRAIN_PHYSICS.phantomCoilTicks} ticks`],
  ['strainTier', strainTierId('UMBRA', 2), 'cost', `${STRAIN_PHYSICS.phantomPortalTicksPenalty} ticks sooner`],
  ['strainTier', strainTierId('UMBRA', 3), 'effect', `Salvage ${signedDelta(STRAIN_ECONOMICS.secondSunSalvageDelta)}`],
  ['strainTier', strainTierId('UMBRA', 3), 'effect', `${STRAIN_ECONOMICS.secondSunTriggerFlat} flat DNA`],
  ['strainTier', strainTierId('UMBRA', 3), 'cost', `Bank ${signedDelta(STRAIN_ECONOMICS.secondSunBankDelta)}`],

  // ── Anomalies: the halves split onto the def, still interpolating dials ──
  ['anomaly', 'gold_rush', 'effect', `×${ANOMALY_ECONOMICS.goldRushFoodMultiplier}`],
  ['anomaly', 'gold_rush', 'cost', `${ANOMALY_PHYSICS.goldRushPortalIntervalPenalty} foods later`],
  ['anomaly', 'twin_exits', 'cost', `×${ANOMALY_ECONOMICS.twinExitsBankMultiplier}`],
  ['anomaly', 'twin_exits', 'cost', `×${BANK.extractMultiplier}`],
  ['anomaly', 'overgrown', 'effect', `${ANOMALY_ECONOMICS.overgrownPetrifySegmentDna} DNA`],
  ['anomaly', 'overgrown', 'cost', `${ANOMALY_PHYSICS.overgrownExtraSegments === 1 ? 'one' : ANOMALY_PHYSICS.overgrownExtraSegments} extra segment`],
  ['anomaly', 'meteor_shower', 'effect', `${ANOMALY_PHYSICS.meteorShowerFoodDespawnTicks} ticks`],
  ['anomaly', 'blackout', 'effect', `${ANOMALY_PHYSICS.blackoutVisibilityRadius} cells`],
];

describe('lexicon copy interpolates its dials, never retypes them', () => {
  it.each(CASES)('%s:%s %s contains "%s"', (kind, id, half, fragment) => {
    const entry = describeEntry(kind, id);
    expect(entry).not.toBeNull();
    expect(entry![half]).toContain(fragment);
  });

  it('quotes the Patient dampening as a share of the tuned interval', () => {
    // The dial is an interval MULTIPLIER (×2); the copy states the spawn
    // rate it produces (50%). If the multiplier moves, so must the sentence.
    expect(describeEntry('trait', 'patient')!.runNotice!.text).toContain(
      pct(1 / TRAIT_PHYSICS.patientMutationIntervalMultiplier)
    );
  });
});
