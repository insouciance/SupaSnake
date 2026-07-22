/**
 * Client boundary for the server-issued Genome capability.
 *
 * A malformed or partial block never turns Genome behavior on: callers
 * receive null and run through the legacy engine path. This is primarily a
 * deploy-safety guard, not a trust boundary (the server still validates the
 * end payload independently).
 */

import type { GenomeEngineConfig } from '@/lib/game/SnakeGameLogic';
import { isGeneId, type GeneId } from '@/shared/game/genes';
import { isStrainId, type StrainId, type StrainPoints } from '@/shared/game/strains';
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

export type SanitizedGenomeCapability = Omit<GenomeEngineConfig, 'ftue'> & {
  ftue: GenomeFtueCapability;
};

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

export function sanitizeGenomeCapability(
  raw: unknown
): SanitizedGenomeCapability | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
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
    prevRunDied: value.prevRunDied === true,
    ftue: sanitizeGenomeFtue(value.ftue),
  };
}
