import {
  ASCENDANCE_MULTIPLIER_BPS,
  ASCENDANCE_V2_GENERATION_FACTOR,
  CURRENT_ASCENDANCE_CURVE_VERSION,
  ascendanceEvolutionProgress,
  ascendanceYieldMultiplierBps,
  formatYieldMultiplier,
  type AscendanceCurveVersion,
} from '@/shared/game/ascendance';
import type { AscendanceProgressionModel } from './AscendanceProgressionInstrument';

function formatBps(multiplierBps: number): string {
  return formatYieldMultiplier(multiplierBps / ASCENDANCE_MULTIPLIER_BPS);
}

export interface AscendanceProgressionInput {
  generation: number;
  curveVersion?: AscendanceCurveVersion;
  /** Exact immutable current-run value. It never affects future generations. */
  frozenMultiplierBps?: number;
}

/** Version-aware presentation built only from authoritative fixed-point helpers. */
export function buildAscendanceProgressionModel({
  generation,
  curveVersion = CURRENT_ASCENDANCE_CURVE_VERSION,
  frozenMultiplierBps,
}: AscendanceProgressionInput): AscendanceProgressionModel {
  const safeGeneration = Number.isSafeInteger(generation) && generation > 0
    ? generation
    : 1;
  const frozenBps = typeof frozenMultiplierBps === 'number'
    && Number.isSafeInteger(frozenMultiplierBps)
    && frozenMultiplierBps >= ASCENDANCE_MULTIPLIER_BPS
    ? frozenMultiplierBps
    : null;
  const currentBps = frozenBps !== null
    ? frozenBps
    : ascendanceYieldMultiplierBps(safeGeneration, curveVersion);
  const nextGeneration = safeGeneration + 1;
  const nextBps = ascendanceYieldMultiplierBps(nextGeneration, curveVersion);
  const evolution = ascendanceEvolutionProgress(safeGeneration, curveVersion);
  const nextMilestoneGeneration = evolution.next?.generation ?? safeGeneration;
  const milestoneBps = evolution.next?.multiplierBps ?? currentBps;
  return {
    generation: safeGeneration,
    curveVersion,
    currentMultiplier: formatBps(currentBps),
    nextGeneration,
    nextMultiplier: formatBps(nextBps),
    relativeStepPercent: curveVersion === 2
      ? ((ASCENDANCE_V2_GENERATION_FACTOR - 1) * 100).toFixed(2)
      : 'legacy',
    nextMilestoneGeneration,
    milestoneMultiplier: formatBps(milestoneBps),
    generationsUntilMilestone: evolution.generationsUntilNext,
  };
}
