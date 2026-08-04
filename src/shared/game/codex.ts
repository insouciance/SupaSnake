/** Shared Codex contracts for Genome discoveries and UI. */

import {
  GENES,
  GENOME_V2_GENES,
  geneDisplayName,
  isGeneId,
  isGenomeV2ActiveGeneId,
} from '@/shared/game/genes';
import { SPLICES, isSpliceId } from '@/shared/game/splices';
import {
  GENOME_V2_SPLICES,
  GENOME_V2_SPLICE_IDS,
  type GenomeRulesVersion,
} from '@/shared/game/genomeV2';
import { STRAINS, isStrainId } from '@/shared/game/strains';

export type CodexDiscoveryType = 'gene' | 'splice' | 'expression' | 'apex';

export const CODEX_DISCOVERY_REWARDS: Record<CodexDiscoveryType, number> = {
  gene: 0,
  splice: 250,
  expression: 150,
  apex: 400,
};

export interface CodexDiscovery {
  type: CodexDiscoveryType;
  entryId: string;
  rulesVersion: GenomeRulesVersion;
  rewardDna: number;
  worldFirst: boolean;
}
export interface CodexDiscoveryResult {
  discoveries: CodexDiscovery[];
  rewardDna: number;
  genomeWeaverUnlocked: boolean;
}

export function isCodexDiscoveryType(value: unknown): value is CodexDiscoveryType {
  return (
    value === 'gene' ||
    value === 'splice' ||
    value === 'expression' ||
    value === 'apex'
  );
}

export function isValidCodexEntryForRules(
  type: CodexDiscoveryType,
  entryId: unknown,
  rulesVersion: GenomeRulesVersion
): entryId is string {
  if (type === 'gene') {
    return rulesVersion === 2
      ? isGenomeV2ActiveGeneId(entryId)
      : isGeneId(entryId);
  }
  if (type === 'splice') {
    return rulesVersion === 2
      ? typeof entryId === 'string'
        && (GENOME_V2_SPLICE_IDS as readonly string[]).includes(entryId)
      : isSpliceId(entryId);
  }
  return isStrainId(entryId);
}

/** Durable discovery rows predate version stamping, so reads accept either
 * catalog without changing the v1 validators themselves. */
export function isValidCodexEntry(
  type: CodexDiscoveryType,
  entryId: unknown
): entryId is string {
  return isValidCodexEntryForRules(type, entryId, 1)
    || isValidCodexEntryForRules(type, entryId, 2);
}

/** Player-facing name for a discovery response or Codex row. */
export function codexEntryName(
  type: CodexDiscoveryType,
  entryId: string,
  rulesVersion: GenomeRulesVersion = 1
): string {
  // Version-independent for a shared id. A discovery row written before v2
  // carries no version stamp and defaults to 1, and naming the same Power
  // "Gold Trail" in an old row and "Golden Hour" everywhere else is the
  // double-naming this pass exists to delete. The v1 catalog keeps its own
  // prose for the ids the v2 pool never took.
  if (type === 'gene' && isGenomeV2ActiveGeneId(entryId)) {
    return geneDisplayName(entryId);
  }
  if (
    type === 'splice'
    && rulesVersion === 2
    && (GENOME_V2_SPLICE_IDS as readonly string[]).includes(entryId)
  ) {
    return GENOME_V2_SPLICES[entryId as keyof typeof GENOME_V2_SPLICES].name;
  }
  if (type === 'gene' && isGeneId(entryId)) return GENES[entryId].name;
  if (type === 'splice' && isSpliceId(entryId)) return SPLICES[entryId].name;
  if (isStrainId(entryId)) {
    const suffix = type === 'apex' ? 'Apex' : 'Expression';
    return `${STRAINS[entryId].name} ${suffix}`;
  }
  return entryId;
}

/** Parse the service-only RPC result without trusting database JSON. */
export function sanitizeCodexDiscoveryResult(raw: unknown): CodexDiscoveryResult {
  const object =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const discoveries: CodexDiscovery[] = [];
  if (Array.isArray(object.discoveries)) {
    for (const item of object.discoveries) {
      if (typeof item !== 'object' || item === null) continue;
      const row = item as Record<string, unknown>;
      const rulesVersion: GenomeRulesVersion = row.rulesVersion === 2 ? 2 : 1;
      if (
        !isCodexDiscoveryType(row.type)
        || !isValidCodexEntryForRules(row.type, row.entryId, rulesVersion)
      ) {
        continue;
      }
      discoveries.push({
        type: row.type,
        entryId: row.entryId,
        rulesVersion,
        rewardDna:
          typeof row.rewardDna === 'number' && Number.isFinite(row.rewardDna)
            ? Math.max(0, Math.floor(row.rewardDna))
            : CODEX_DISCOVERY_REWARDS[row.type],
        worldFirst: row.worldFirst === true,
      });
    }
  }
  return {
    discoveries,
    rewardDna:
      typeof object.rewardDna === 'number' && Number.isFinite(object.rewardDna)
        ? Math.max(0, Math.floor(object.rewardDna))
        : discoveries.reduce((sum, entry) => sum + entry.rewardDna, 0),
    genomeWeaverUnlocked: object.genomeWeaverUnlocked === true,
  };
}
