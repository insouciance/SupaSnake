/**
 * Client boundary for the server-issued Genome capability.
 *
 * A malformed or partial block never turns Genome behavior on: callers
 * receive null and run through the legacy engine path. This is primarily a
 * deploy-safety guard, not a trust boundary (the server still validates the
 * end payload independently).
 */

import {
  isGeneId,
  isGenomeV2ActiveGeneId,
  type GeneId,
  type GenomeV2ActiveGeneId,
} from '@/shared/game/genes';
import {
  deriveGenomeV2FtuePresentation,
  GENOME_RULES_V1,
  GENOME_RULES_V2,
  GENOME_V2_MAX_STRAIN_THRESHOLD_SHIFT,
  genomeV2FtueFromPresentation,
  type GenomeV2FtuePresentation,
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
  runSeed: string;
  v2GenePool: GenomeV2ActiveGeneId[];
  heirloom: StrainPoints;
  ftuePresentation: GenomeV2FtuePresentation;
  offerTiltStrain: StrainId | null;
  suppressedStrains: StrainId[];
  strainThresholdDelta: Partial<Record<StrainId, number>>;
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

  return {
    rulesVersion: GENOME_RULES_V2,
    runSeed: value.runSeed,
    v2GenePool,
    heirloom,
    ftuePresentation,
    offerTiltStrain: value.offerTiltStrain,
    suppressedStrains,
    strainThresholdDelta,
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
