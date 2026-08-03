import {
  CURRENT_ASCENDANCE_CURVE_VERSION,
  ascendanceEvolutionProgress,
  type AscendanceCurveVersion,
} from '@/shared/game/ascendance';

export interface AscendanceVisualPresentation {
  generation: number;
  /** Zero before Gen5; increments at Gen5, Gen10, Gen15, and so on. */
  stage: number;
  milestoneGeneration: number | null;
  auraBlur: number;
  auraOpacity: number;
  auraWidth: number;
  patternDasharray: string;
  patternDashoffset: number;
}

/**
 * Display-only evolution vocabulary. The milestone cadence comes from the
 * authoritative Ascendance helper; these values only turn its ordinal into a
 * deterministic pattern and aura. No Yield or breeding arithmetic lives here.
 */
export function buildAscendanceVisualPresentation(
  generation: number,
  curveVersion: AscendanceCurveVersion = CURRENT_ASCENDANCE_CURVE_VERSION
): AscendanceVisualPresentation {
  const safeGeneration = Number.isSafeInteger(generation) && generation > 0
    ? generation
    : 1;
  const milestone = ascendanceEvolutionProgress(safeGeneration, curveVersion).current;
  const stage = milestone?.ordinal ?? 0;

  if (stage === 0) {
    return {
      generation: safeGeneration,
      stage: 0,
      milestoneGeneration: null,
      auraBlur: 0,
      auraOpacity: 0,
      auraWidth: 0,
      patternDasharray: '',
      patternDashoffset: 0,
    };
  }

  // The first dash grows at every milestone, so later evolution beats never
  // collapse into one of a small repeated set of cosmetic tiers.
  const longDash = 4 + stage * 1.35;
  const gap = 7 + ((stage * 5) % 9);
  const rune = 2 + ((stage * 3) % 5);

  return {
    generation: safeGeneration,
    stage,
    milestoneGeneration: milestone?.generation ?? null,
    auraBlur: Number((2.2 + Math.log2(stage + 1) * 1.6).toFixed(2)),
    auraOpacity: Number((0.19 + ((stage * 7) % 13) / 100).toFixed(2)),
    auraWidth: Number((8 + Math.log2(stage + 1) * 3.5).toFixed(2)),
    patternDasharray: `${longDash.toFixed(2)} ${gap} ${rune} ${gap + 3}`,
    patternDashoffset: stage * -3,
  };
}
