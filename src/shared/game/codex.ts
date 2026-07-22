/** Shared Codex contracts for Genome discoveries and UI. */

import { GENES, isGeneId } from '@/shared/game/genes';
import { SPLICES, isSpliceId } from '@/shared/game/splices';
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

export function isValidCodexEntry(
  type: CodexDiscoveryType,
  entryId: unknown
): entryId is string {
  if (type === 'gene') return isGeneId(entryId);
  if (type === 'splice') return isSpliceId(entryId);
  return isStrainId(entryId);
}

/** Player-facing name for a discovery response or Codex row. */
export function codexEntryName(
  type: CodexDiscoveryType,
  entryId: string
): string {
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
      if (!isCodexDiscoveryType(row.type) || !isValidCodexEntry(row.type, row.entryId)) {
        continue;
      }
      discoveries.push({
        type: row.type,
        entryId: row.entryId,
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
