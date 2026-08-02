import {
  ASCENDANCE_MULTIPLIER_BPS,
  ascendanceYieldMultiplierBps,
  type AscendanceCurveVersion,
} from '@/shared/game/ascendance';
import {
  GENOME_RULES_V2,
  GENOME_V2_CONFIG,
  GENOME_V2_STRAIN_THRESHOLDS,
  genomeV2HasGene,
  projectGenomeV2,
  type GenomeV2State,
  type GenomeV2StrainThreshold,
} from '@/shared/game/genomeV2';
import type { GenomeV2ActivationPresentation } from './genomeV2PresentationAdapter';

type UnknownRecord = Record<string, unknown>;

export type GenomeV2OfferResolution =
  | {
      action: 'choose';
      offerId: string;
      candidateIndex: 0 | 1;
      replacementSlot?: number;
    }
  | {
      action: 'decline';
      offerId: string;
      pinCandidateIndex?: 0 | 1;
    };

export type GenomeV2PortalResolution =
  | { action: 'bank'; portalId: string }
  | { action: 'continue'; portalId: string; activateMirror?: boolean }
  | {
      action: 'mutate';
      portalId: string;
      candidateIndex: 0 | 1;
      replacementSlot?: number;
    };

export type GenomeV2OverclockSource = 'volt_apex' | 'zenith_protocol';

export interface GenomeV2OverclockPresentation {
  active: {
    source: GenomeV2OverclockSource;
    label: string;
    multiplierBps: number;
    remainingMoves: number;
  } | null;
  available: Array<{
    source: GenomeV2OverclockSource;
    label: string;
    multiplierBps: number;
    moveBudget: number;
  }>;
}

/** Narrow structural seam to the live engine; v1 engines simply return null. */
export interface GenomeV2RuntimeBridge {
  getState(): { genomeV2?: GenomeV2State | null };
  resolveGenomeV2Offer(resolution: GenomeV2OfferResolution): boolean;
  inspectGenomeV2PortalCandidate(
    portalId: string,
    candidateIndex: 0 | 1
  ): string | null;
  resolveGenomeV2Portal(resolution: GenomeV2PortalResolution): boolean;
  activateGenomeV2Overclock(resolution: {
    source: GenomeV2OverclockSource;
  }): boolean;
}

export interface AscendanceRunPresentationStamp {
  curveVersion: AscendanceCurveVersion;
  multiplierBps: number;
  legacy: boolean;
}

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function progressText(value: unknown): string | undefined {
  const progress = record(value);
  if (!progress) return undefined;
  const bankedRuns = record(progress.bankedRuns);
  const mastery = record(progress.mastery);
  const bankCurrent = nonNegativeInteger(bankedRuns?.current);
  const bankRequired = nonNegativeInteger(bankedRuns?.required);
  const masteryCurrent = nonNegativeInteger(mastery?.current);
  const masteryRequired = nonNegativeInteger(mastery?.required);
  const paths: string[] = [];
  if (bankCurrent !== null && bankRequired !== null) {
    paths.push(`${bankCurrent} / ${bankRequired} validated BANKS`);
  }
  if (masteryCurrent !== null && masteryRequired !== null) {
    paths.push(`M${masteryCurrent} / M${masteryRequired}`);
  }
  return paths.length > 0 ? paths.join(' · or ') : undefined;
}

function unlockReason(value: UnknownRecord): string | undefined {
  if (value.unlocked === true) return undefined;
  switch (value.reason) {
    case 'banked_runs':
      return 'Validated BANK progression';
    case 'banked_runs_or_mastery':
      return 'Validated BANK progression or Dynasty Mastery';
    case 'mastery':
      return 'Dynasty Mastery';
    default:
      return typeof value.reason === 'string' && value.reason.length > 0
        ? value.reason.replaceAll('_', ' ')
        : 'Locked by this run’s progression stamp';
  }
}

function capability(
  capabilities: UnknownRecord,
  key: string
): GenomeV2ActivationPresentation['continue'] | null {
  const value = record(capabilities[key]);
  if (!value || typeof value.unlocked !== 'boolean') return null;
  return {
    unlocked: value.unlocked,
    reason: unlockReason(value),
    progress: progressText(value.progress),
  };
}

/**
 * Parse the frozen server-authored FTUE presentation. This adapter formats
 * its counters; it never reconstructs the 1/2/4/6/10-bank thresholds.
 */
export function parseGenomeV2ActivationPresentation(
  raw: unknown
): GenomeV2ActivationPresentation | null {
  const presentation = record(raw);
  if (!presentation || presentation.v !== GENOME_RULES_V2) return null;
  const capabilities = record(presentation.capabilities);
  if (!capabilities) return null;
  const continueState = capability(capabilities, 'continue');
  const portalGenome = capability(capabilities, 'portalGenome');
  const expressions = capability(capabilities, 'expressions');
  const splices = capability(capabilities, 'splices');
  const apex = capability(capabilities, 'apex');
  if (!continueState || !portalGenome || !expressions || !splices || !apex) {
    return null;
  }
  return {
    continue: continueState,
    portalGenome,
    expressions,
    splices,
    apex,
  };
}

/** Missing or malformed stamps are historical v1, never silently current. */
export function parseAscendanceRunPresentationStamp(
  raw: unknown,
  generation: number
): AscendanceRunPresentationStamp {
  const stamp = record(raw);
  const curveVersion = stamp?.curveVersion === 2 ? 2 : 1;
  const stampedMultiplier = nonNegativeInteger(stamp?.multiplierBps);
  const multiplierBps = stampedMultiplier !== null
    && stampedMultiplier >= ASCENDANCE_MULTIPLIER_BPS
    ? stampedMultiplier
    : ascendanceYieldMultiplierBps(generation, curveVersion);
  return {
    curveVersion,
    multiplierBps,
    legacy: curveVersion === 1,
  };
}

export function parseGenomeV2State(value: unknown): GenomeV2State | null {
  const state = record(value);
  if (
    !state
    || state.v !== GENOME_RULES_V2
    || !Array.isArray(state.slots)
    || !record(state.instances)
    || !record(state.ledger)
  ) {
    return null;
  }
  return state as unknown as GenomeV2State;
}

/** Exact REDLINE/Overclock instrument from canonical state and config. The
 * surface never invents a duration, multiplier, charge, or cooldown. */
export function buildGenomeV2OverclockPresentation(
  state: GenomeV2State
): GenomeV2OverclockPresentation | null {
  const config = GENOME_V2_CONFIG as typeof GENOME_V2_CONFIG & Partial<{
    ladders: {
      voltOverclockMultiplierBps: number;
      voltOverclockMoveBudget: number;
    };
    signatures: {
      zenithMultiplierBps: number;
      zenithMoveBudget: number;
    };
  }>;
  const projection = projectGenomeV2(state) as ReturnType<typeof projectGenomeV2> & Partial<{
    ladderState: { VOLT: { activeTier: 0 | GenomeV2StrainThreshold } };
  }>;
  const runtimeState = state as GenomeV2State & Partial<{
    overclock: {
      source: GenomeV2OverclockSource;
      expiresAtTick: number;
      multiplierBps: number;
    } | null;
  }>;
  const available: GenomeV2OverclockPresentation['available'] = [];
  if (genomeV2HasGene(state, 'zenith_protocol') && config.signatures) {
    available.push({
      source: 'zenith_protocol',
      label: 'REDLINE',
      multiplierBps: config.signatures.zenithMultiplierBps,
      moveBudget: config.signatures.zenithMoveBudget,
    });
  }
  if (
    projection.ladderState?.VOLT.activeTier === GENOME_V2_STRAIN_THRESHOLDS.apex
    && config.ladders
  ) {
    available.push({
      source: 'volt_apex',
      label: 'OVERCLOCK',
      multiplierBps: config.ladders.voltOverclockMultiplierBps,
      moveBudget: config.ladders.voltOverclockMoveBudget,
    });
  }
  const active = runtimeState.overclock;
  if (available.length === 0 && !active) return null;
  return {
    active: active
      ? {
          source: active.source,
          label: active.source === 'zenith_protocol' ? 'REDLINE' : 'OVERCLOCK',
          multiplierBps: active.multiplierBps,
          remainingMoves: Math.max(0, active.expiresAtTick - state.tick),
        }
      : null,
    available,
  };
}

export function genomeV2RuntimeBridge(value: unknown): GenomeV2RuntimeBridge | null {
  const candidate = value as Partial<GenomeV2RuntimeBridge> | null;
  return candidate
    && typeof candidate.getState === 'function'
    && typeof candidate.resolveGenomeV2Offer === 'function'
    && typeof candidate.inspectGenomeV2PortalCandidate === 'function'
    && typeof candidate.resolveGenomeV2Portal === 'function'
    && typeof candidate.activateGenomeV2Overclock === 'function'
    ? candidate as GenomeV2RuntimeBridge
    : null;
}
