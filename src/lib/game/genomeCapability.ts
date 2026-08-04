/**
 * Client boundary for the server-issued Genome capability.
 *
 * A malformed or partial block never turns Genome behavior on: callers
 * receive null and run through the legacy engine path. This is primarily a
 * deploy-safety guard, not a trust boundary (the server still validates the
 * end payload independently).
 */

import {
  GENOME_V2_ELIGIBILITY_CONTRACT_VERSION,
  genomeV2DynastyForVocabulary,
  genomeV2PlayableVocabulary,
  isGeneId,
  isGenomeV2ActiveGeneId,
  type GeneId,
  type GenomeV2ActiveGeneId,
} from '@/shared/game/genes';
import {
  GENOME_V2_INTERACTION_AUTO_OFFER,
  deriveGenomeV2FtuePresentation,
  GENOME_RULES_V1,
  GENOME_RULES_V2,
  GENOME_V2_MAX_STRAIN_THRESHOLD_SHIFT,
  genomeV2FtueFromPresentation,
  isGenomeV2InteractionVersion,
  type GenomeV2FtuePresentation,
  type GenomeV2InteractionVersion,
} from '@/shared/game/genomeV2';
import {
  isStrainId,
  STRAIN_THRESHOLDS,
  type StrainId,
  type StrainPoints,
} from '@/shared/game/strains';
import type { LineageBias } from '@/shared/game/offerGravity';

export interface GenomeFtueCapability {
  bankedRuns: number;
  strainTagsUnlocked: boolean;
  expressionsUnlocked: boolean;
  infuseUnlocked: boolean;
  spawnPointsUnlocked: boolean;
  splicesUnlocked: boolean;
  apexesUnlocked: boolean;
}

export interface SanitizedGenomeV1Capability {
  /** Historical starts omit this; explicit v1 inputs sanitize identically. */
  rulesVersion?: typeof GENOME_RULES_V1;
  runSeed: string;
  heirloom: StrainPoints;
  genePool: GeneId[];
  lineage: LineageBias | null;
  anomalyStrain: StrainId | null;
  suppressedStrains: StrainId[];
  strainThresholdDelta: Partial<Record<StrainId, number>>;
  prevRunDied: boolean;
  ftue: GenomeFtueCapability;
}

/** Exact fresh-start contract. No v1 alias is present or synthesized. */
export interface SanitizedGenomeV2Capability {
  rulesVersion: typeof GENOME_RULES_V2;
  /** Missing on an issued legacy manifest sanitizes to automatic offers. */
  interactionVersion: GenomeV2InteractionVersion;
  runSeed: string;
  v2GenePool: GenomeV2ActiveGeneId[];
  heirloom: StrainPoints;
  ftuePresentation: GenomeV2FtuePresentation;
  offerTiltStrain: StrainId | null;
  suppressedStrains: StrainId[];
  strainThresholdDelta: Partial<Record<StrainId, number>>;
  /**
   * The curriculum stamp (WP-B), present only on a run started with the
   * curriculum live. All three keys arrive and are validated together, and a
   * pool that does not follow from its own declared inputs sanitizes to null —
   * the same refusal a malformed FTUE presentation gets, which routes the
   * client through the legacy engine path rather than a guessed vocabulary.
   */
  eligibilityContractVersion?: number;
  learningEventVersion?: number;
  eligibilityInputs?: {
    eligibleGeneIds: GenomeV2ActiveGeneId[];
    trialGeneId: GenomeV2ActiveGeneId | null;
    bankedRuns: number;
    masteryLevel: number;
  };
  /** Keeps shared callers type-safe without emitting a legacy FTUE alias. */
  ftue?: never;
}

export type SanitizedGenomeCapability =
  | SanitizedGenomeV1Capability
  | SanitizedGenomeV2Capability;

function sanitizeStrainList(raw: unknown): StrainId[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.filter(isStrainId)));
}

function sanitizePoints(raw: unknown): StrainPoints {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const points: StrainPoints = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isStrainId(key) || typeof value !== 'number' || !Number.isFinite(value)) continue;
    const normalized = Math.max(0, Math.min(2, Math.floor(value)));
    if (normalized > 0) points[key] = normalized;
  }
  return points;
}

/**
 * The world condition's per-strain threshold shift (WP-2.10b).
 *
 * Legacy v1 is bounded to +/-`MAX_V1_STRAIN_THRESHOLD_SHIFT` on the way in.
 * Genome v2 uses its tighter canonical authored-condition envelope below.
 * Not a trust
 * boundary - the server recomputes the run under the condition it stamped on
 * the session row - but a malformed or absurd block must degrade to ordinary
 * thresholds rather than hand the engine a tier ladder the payout will never
 * agree with.
 */
const MAX_V1_STRAIN_THRESHOLD_SHIFT = 2;

function sanitizeThresholdDelta(raw: unknown): Partial<Record<StrainId, number>> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const delta: Partial<Record<StrainId, number>> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isStrainId(key) || typeof value !== 'number' || !Number.isFinite(value)) continue;
    const normalized = Math.max(
      -MAX_V1_STRAIN_THRESHOLD_SHIFT,
      Math.min(MAX_V1_STRAIN_THRESHOLD_SHIFT, Math.trunc(value))
    );
    if (normalized !== 0) delta[key] = normalized;
  }
  return delta;
}

function strictV2Points(raw: unknown): StrainPoints | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const points: StrainPoints = {};
  for (const [key, value] of Object.entries(raw)) {
    if (
      !isStrainId(key) ||
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > STRAIN_THRESHOLDS.maxSpawnPoints
    ) return null;
    points[key] = value;
  }
  return points;
}

function strictV2StrainList(raw: unknown): StrainId[] | null {
  if (!Array.isArray(raw)) return null;
  const strains: StrainId[] = [];
  for (const value of raw) {
    if (!isStrainId(value) || strains.includes(value)) return null;
    strains.push(value);
  }
  return strains;
}

function strictV2ThresholdDelta(
  raw: unknown
): Partial<Record<StrainId, number>> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const delta: Partial<Record<StrainId, number>> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (
      !isStrainId(key) ||
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < -GENOME_V2_MAX_STRAIN_THRESHOLD_SHIFT ||
      value > GENOME_V2_MAX_STRAIN_THRESHOLD_SHIFT
    ) return null;
    delta[key] = value;
  }
  return delta;
}

function strictV2GenePool(raw: unknown): GenomeV2ActiveGeneId[] | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const pool: GenomeV2ActiveGeneId[] = [];
  for (const value of raw) {
    if (!isGenomeV2ActiveGeneId(value) || pool.includes(value)) return null;
    pool.push(value);
  }
  return pool;
}

function sanitizeLineageBias(raw: unknown): LineageBias | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const strains = sanitizeStrainList(value.strains).slice(0, 2);
  if (strains.length === 0) return null;
  const guaranteeStrains = sanitizeStrainList(value.guaranteeStrains)
    .filter((strain) => strains.includes(strain))
    .slice(0, 1);
  return {
    strains,
    guaranteeFirstOffer: value.guaranteeFirstOffer === true,
    guaranteeStrains,
  };
}

export function sanitizeGenomeFtue(raw: unknown): GenomeFtueCapability {
  const value =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? raw as Record<string, unknown>
      : {};
  return {
    bankedRuns:
      typeof value.bankedRuns === 'number' && Number.isFinite(value.bankedRuns)
        ? Math.max(0, Math.floor(value.bankedRuns))
        : 0,
    strainTagsUnlocked: value.strainTagsUnlocked === true,
    expressionsUnlocked: value.expressionsUnlocked === true,
    infuseUnlocked: value.infuseUnlocked === true,
    spawnPointsUnlocked: value.spawnPointsUnlocked === true,
    splicesUnlocked: value.splicesUnlocked === true,
    apexesUnlocked: value.apexesUnlocked === true,
  };
}

/**
 * Strict, all-or-nothing parse of the curriculum stamp on an issued manifest.
 *
 * `undefined` means the run carries none (curriculum off, or a manifest issued
 * before WP-B) and the pool is the complete legal Dynasty roster — today's
 * behaviour, unchanged. `null` means a stamp is present but does not
 * re-derive, which fails the whole capability closed.
 */
function strictV2Eligibility(
  value: Record<string, unknown>,
  v2GenePool: GenomeV2ActiveGeneId[]
): SanitizedGenomeV2Capability['eligibilityInputs'] | null | undefined {
  const keys = [
    'eligibilityContractVersion',
    'learningEventVersion',
    'eligibilityInputs',
  ] as const;
  const present = keys.filter((key) =>
    Object.prototype.hasOwnProperty.call(value, key)
  );
  if (present.length === 0) return undefined;
  if (present.length !== keys.length) return null;
  if (
    value.eligibilityContractVersion !==
      GENOME_V2_ELIGIBILITY_CONTRACT_VERSION ||
    !Number.isSafeInteger(value.learningEventVersion) ||
    (value.learningEventVersion as number) < 1
  ) {
    return null;
  }
  const raw = value.eligibilityInputs;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const inputs = raw as Record<string, unknown>;
  if (
    !Array.isArray(inputs.eligibleGeneIds) ||
    !inputs.eligibleGeneIds.every(isGenomeV2ActiveGeneId) ||
    new Set(inputs.eligibleGeneIds).size !== inputs.eligibleGeneIds.length ||
    (inputs.trialGeneId !== null &&
      !isGenomeV2ActiveGeneId(inputs.trialGeneId)) ||
    !Number.isSafeInteger(inputs.bankedRuns) ||
    (inputs.bankedRuns as number) < 0 ||
    !Number.isSafeInteger(inputs.masteryLevel) ||
    (inputs.masteryLevel as number) < 0
  ) {
    return null;
  }
  const sanitized = {
    eligibleGeneIds: [...(inputs.eligibleGeneIds as GenomeV2ActiveGeneId[])],
    trialGeneId: inputs.trialGeneId as GenomeV2ActiveGeneId | null,
    bankedRuns: inputs.bankedRuns as number,
    masteryLevel: inputs.masteryLevel as number,
  };
  const dynasty = genomeV2DynastyForVocabulary(v2GenePool);
  if (!dynasty) return null;
  const rederived = genomeV2PlayableVocabulary(dynasty, sanitized);
  if (
    rederived.length !== v2GenePool.length ||
    rederived.some((geneId, index) => geneId !== v2GenePool[index])
  ) {
    return null;
  }
  return sanitized;
}

function sanitizeGenomeV2Capability(
  value: Record<string, unknown>
): SanitizedGenomeV2Capability | null {
  if (typeof value.runSeed !== 'string' || value.runSeed.length < 8) return null;

  // `genePool` is not a compatibility spelling for v2. Accepting it would let
  // a mixed/stale manifest silently enable different offer authority.
  if (Object.prototype.hasOwnProperty.call(value, 'genePool')) return null;
  const v2GenePool = strictV2GenePool(value.v2GenePool);
  const heirloom = strictV2Points(value.heirloom);
  const suppressedStrains = strictV2StrainList(value.suppressedStrains);
  const strainThresholdDelta = strictV2ThresholdDelta(
    value.strainThresholdDelta
  );
  if (!v2GenePool || !heirloom || !suppressedStrains || !strainThresholdDelta) {
    return null;
  }
  if (
    !Object.prototype.hasOwnProperty.call(value, 'offerTiltStrain') ||
    (value.offerTiltStrain !== null && !isStrainId(value.offerTiltStrain))
  ) return null;
  if (
    value.interactionVersion !== undefined &&
    !isGenomeV2InteractionVersion(value.interactionVersion)
  ) {
    return null;
  }

  let ftuePresentation: GenomeV2FtuePresentation;
  try {
    genomeV2FtueFromPresentation(value.ftuePresentation);
    const rawPresentation = value.ftuePresentation as GenomeV2FtuePresentation;
    ftuePresentation = deriveGenomeV2FtuePresentation(
      rawPresentation.bankedRuns,
      rawPresentation.masteryLevel
    );
  } catch {
    return null;
  }

  const eligibilityInputs = strictV2Eligibility(value, v2GenePool);
  if (eligibilityInputs === null) return null;

  return {
    rulesVersion: GENOME_RULES_V2,
    interactionVersion:
      value.interactionVersion ?? GENOME_V2_INTERACTION_AUTO_OFFER,
    runSeed: value.runSeed,
    v2GenePool,
    heirloom,
    ftuePresentation,
    offerTiltStrain: value.offerTiltStrain,
    suppressedStrains,
    strainThresholdDelta,
    ...(eligibilityInputs
      ? {
          eligibilityContractVersion:
            value.eligibilityContractVersion as number,
          learningEventVersion: value.learningEventVersion as number,
          eligibilityInputs,
        }
      : {}),
  };
}

function sanitizeGenomeV1Capability(
  value: Record<string, unknown>
): SanitizedGenomeV1Capability | null {
  if (typeof value.runSeed !== 'string' || value.runSeed.length < 8) return null;

  const genePool: GeneId[] = [];
  if (Array.isArray(value.genePool)) {
    for (const id of value.genePool) {
      if (isGeneId(id) && !genePool.includes(id)) genePool.push(id);
    }
  }
  // A legal offer needs two options. Falling back to the global pool would
  // diverge from the server's unlock calculation, so fail the handshake.
  if (genePool.length < 2) return null;

  return {
    runSeed: value.runSeed,
    heirloom: sanitizePoints(value.heirloom),
    genePool,
    lineage: sanitizeLineageBias(value.lineage),
    anomalyStrain: isStrainId(value.anomalyStrain) ? value.anomalyStrain : null,
    suppressedStrains: sanitizeStrainList(value.suppressedStrains),
    strainThresholdDelta: sanitizeThresholdDelta(value.strainThresholdDelta),
    prevRunDied: value.prevRunDied === true,
    ftue: sanitizeGenomeFtue(value.ftue),
  };
}

export function sanitizeGenomeCapability(
  raw: unknown
): SanitizedGenomeCapability | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (value.rulesVersion === GENOME_RULES_V2) {
    return sanitizeGenomeV2Capability(value);
  }
  if (
    value.rulesVersion !== undefined &&
    value.rulesVersion !== GENOME_RULES_V1
  ) return null;
  return sanitizeGenomeV1Capability(value);
}
