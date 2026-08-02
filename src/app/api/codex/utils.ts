import {
  GENOME_V2_GENES,
  isGeneId,
  isGenomeV2ActiveGeneId,
  type GenomeV2ActiveGeneId,
} from '@/shared/game/genes';
import { isSpliceId } from '@/shared/game/splices';
import {
  GENOME_V2_SPLICES,
  GENOME_V2_SPLICE_IDS,
  type GenomeV2SpliceId,
} from '@/shared/game/genomeV2';
import { STRAINS, STRAIN_IDS, type StrainId } from '@/shared/game/strains';
import {
  CODEX_DISCOVERY_REWARDS,
  isCodexDiscoveryType,
  isValidCodexEntry,
  type CodexDiscoveryType,
} from '@/shared/game/codex';

export interface CodexDiscoveryRow {
  discoveryType: CodexDiscoveryType;
  entryId: string;
  firstDiscoveredAt: string | null;
}

export interface CodexSessionRow {
  extracted?: unknown;
  genome?: unknown;
}

export interface CodexEntryStats {
  picks: number;
  banks: number;
}

export interface CodexGeneView extends CodexEntryStats {
  id: GenomeV2ActiveGeneId;
  rulesVersion: 2;
  name: string;
  kind: string;
  strains: readonly StrainId[];
  effect: string;
  cost: string;
  discovered: boolean;
  firstDiscoveredAt: string | null;
  worldFirstAt: string | null;
}

export interface CodexSpliceView {
  id: GenomeV2SpliceId;
  rulesVersion: 2;
  name: string;
  /** Tactical mechanics are public rules; discovery records history, not access. */
  parents: readonly [GenomeV2ActiveGeneId, GenomeV2ActiveGeneId];
  strains: StrainId[];
  effect: string;
  cost: string;
  discoveries: number;
  banks: number;
  discovered: boolean;
  firstDiscoveredAt: string | null;
  worldFirstAt: string | null;
  rewardDna: number;
}

export interface CodexStrainMilestoneView {
  strain: StrainId;
  name: string;
  color: string;
  expression: {
    discovered: boolean;
    firstDiscoveredAt: string | null;
    worldFirstAt: string | null;
    rewardDna: number;
  };
  apex: {
    discovered: boolean;
    firstDiscoveredAt: string | null;
    worldFirstAt: string | null;
    rewardDna: number;
  };
}

export interface CodexPayload {
  genes: CodexGeneView[];
  splices: CodexSpliceView[];
  strains: CodexStrainMilestoneView[];
  progress: {
    discovered: number;
    total: number;
    percent: number;
    genomeWeaverUnlocked: boolean;
  };
  sampleSize: number;
}

function rowKey(type: CodexDiscoveryType, entryId: string): string {
  return `${type}:${entryId}`;
}

export function sanitizeCodexRows(raw: unknown): CodexDiscoveryRow[] {
  if (!Array.isArray(raw)) return [];
  const result: CodexDiscoveryRow[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const row = item as Record<string, unknown>;
    const type = row.discovery_type;
    const entryId = row.entry_id;
    if (!isCodexDiscoveryType(type) || !isValidCodexEntry(type, entryId)) continue;
    const key = rowKey(type, entryId);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      discoveryType: type,
      entryId,
      firstDiscoveredAt:
        typeof row.first_discovered_at === 'string'
          ? row.first_discovered_at
          : null,
    });
  }
  return result;
}

export function sanitizeWorldFirstRows(raw: unknown): Map<string, string | null> {
  const result = new Map<string, string | null>();
  if (!Array.isArray(raw)) return result;
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const row = item as Record<string, unknown>;
    const type = row.discovery_type;
    const entryId = row.entry_id;
    if (!isCodexDiscoveryType(type) || !isValidCodexEntry(type, entryId)) continue;
    result.set(
      rowKey(type, entryId),
      typeof row.discovered_at === 'string' ? row.discovered_at : null
    );
  }
  return result;
}

function emptyStats(): CodexEntryStats {
  return { picks: 0, banks: 0 };
}

/** Stats are deliberately bounded to the API's last-200 accepted sessions. */
export function deriveCodexSessionStats(rows: CodexSessionRow[]): {
  genes: Map<GenomeV2ActiveGeneId, CodexEntryStats>;
  splices: Map<GenomeV2SpliceId, CodexEntryStats>;
} {
  const genes = new Map<GenomeV2ActiveGeneId, CodexEntryStats>();
  const splices = new Map<GenomeV2SpliceId, CodexEntryStats>();
  for (const row of rows) {
    if (typeof row.genome !== 'object' || row.genome === null) continue;
    const genome = row.genome as Record<string, unknown>;
    if (genome.v !== 1 && genome.v !== 2) continue;
    const banked = row.extracted === true;
    const seenGenes = new Set<GenomeV2ActiveGeneId>();
    if (genome.v === 1 && Array.isArray(genome.picks)) {
      for (const item of genome.picks) {
        if (typeof item !== 'object' || item === null) continue;
        const id = (item as Record<string, unknown>).id;
        if (!isGeneId(id) || !isGenomeV2ActiveGeneId(id)) continue;
        seenGenes.add(id);
      }
    }
    if (
      genome.v === 2
      && typeof genome.instances === 'object'
      && genome.instances !== null
      && !Array.isArray(genome.instances)
    ) {
      for (const item of Object.values(genome.instances as Record<string, unknown>)) {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
        const id = (item as Record<string, unknown>).geneId;
        if (isGenomeV2ActiveGeneId(id)) seenGenes.add(id);
      }
    }
    for (const id of Array.from(seenGenes)) {
      const stat = genes.get(id) ?? emptyStats();
      stat.picks += 1;
      if (banked) stat.banks += 1;
      genes.set(id, stat);
    }

    const seenSplices = new Set<GenomeV2SpliceId>();
    if (genome.v === 1 && Array.isArray(genome.splices)) {
      for (const item of genome.splices) {
        if (typeof item !== 'object' || item === null) continue;
        const id = (item as Record<string, unknown>).id;
        if (
          !isSpliceId(id)
          || !(GENOME_V2_SPLICE_IDS as readonly string[]).includes(id)
        ) continue;
        seenSplices.add(id as GenomeV2SpliceId);
      }
    }
    if (genome.v === 2) {
      if (Array.isArray(genome.activeSplices)) {
        for (const id of genome.activeSplices) {
          if ((GENOME_V2_SPLICE_IDS as readonly unknown[]).includes(id)) {
            seenSplices.add(id as GenomeV2SpliceId);
          }
        }
      }
      if (Array.isArray(genome.retired)) {
        for (const item of genome.retired) {
          if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
          const id = (item as Record<string, unknown>).spliceId;
          if ((GENOME_V2_SPLICE_IDS as readonly unknown[]).includes(id)) {
            seenSplices.add(id as GenomeV2SpliceId);
          }
        }
      }
    }
    for (const id of Array.from(seenSplices)) {
      const stat = splices.get(id) ?? emptyStats();
      stat.picks += 1;
      if (banked) stat.banks += 1;
      splices.set(id, stat);
    }
  }
  return { genes, splices };
}

export function buildCodexPayload(
  discoveryRows: CodexDiscoveryRow[],
  worldFirsts: Map<string, string | null>,
  sessionRows: CodexSessionRow[],
  genomeWeaverUnlocked: boolean
): CodexPayload {
  const discoveryMap = new Map(
    discoveryRows.map((row) => [
      rowKey(row.discoveryType, row.entryId),
      row.firstDiscoveredAt,
    ])
  );
  const stats = deriveCodexSessionStats(sessionRows);

  const genes = (Object.keys(GENOME_V2_GENES) as GenomeV2ActiveGeneId[]).map((id): CodexGeneView => {
    const def = GENOME_V2_GENES[id];
    const stat = stats.genes.get(id) ?? emptyStats();
    const key = rowKey('gene', id);
    return {
      id,
      rulesVersion: 2,
      name: def.name,
      kind: def.kind,
      strains: def.strains,
      effect: def.effect,
      cost: def.cost,
      discovered: discoveryMap.has(key),
      firstDiscoveredAt: discoveryMap.get(key) ?? null,
      worldFirstAt: worldFirsts.get(key) ?? null,
      ...stat,
    };
  });

  const splices = GENOME_V2_SPLICE_IDS.map((id): CodexSpliceView => {
    const def = GENOME_V2_SPLICES[id];
    const stat = stats.splices.get(id) ?? emptyStats();
    const strains = Array.from(
      new Set(def.parents.flatMap((parent) => GENOME_V2_GENES[parent].strains))
    );
    const key = rowKey('splice', id);
    const discovered = discoveryMap.has(key);
    return {
      id,
      rulesVersion: 2,
      name: def.name,
      parents: def.parents,
      strains,
      effect: def.rule,
      cost: def.strategicCost,
      discoveries: stat.picks,
      banks: stat.banks,
      discovered,
      firstDiscoveredAt: discoveryMap.get(key) ?? null,
      worldFirstAt: worldFirsts.get(key) ?? null,
      rewardDna: CODEX_DISCOVERY_REWARDS.splice,
    };
  });

  const strains = STRAIN_IDS.map((strain): CodexStrainMilestoneView => {
    const expressionKey = rowKey('expression', strain);
    const apexKey = rowKey('apex', strain);
    return {
      strain,
      name: STRAINS[strain].name,
      color: STRAINS[strain].color,
      expression: {
        discovered: discoveryMap.has(expressionKey),
        firstDiscoveredAt: discoveryMap.get(expressionKey) ?? null,
        worldFirstAt: worldFirsts.get(expressionKey) ?? null,
        rewardDna: CODEX_DISCOVERY_REWARDS.expression,
      },
      apex: {
        discovered: discoveryMap.has(apexKey),
        firstDiscoveredAt: discoveryMap.get(apexKey) ?? null,
        worldFirstAt: worldFirsts.get(apexKey) ?? null,
        rewardDna: CODEX_DISCOVERY_REWARDS.apex,
      },
    };
  });

  const total = genes.length + splices.length + strains.length * 2;
  const currentKeys = new Set([
    ...genes.map((gene) => rowKey('gene', gene.id)),
    ...splices.map((splice) => rowKey('splice', splice.id)),
    ...STRAIN_IDS.flatMap((strain) => [
      rowKey('expression', strain),
      rowKey('apex', strain),
    ]),
  ]);
  const discovered = discoveryRows.filter((row) =>
    currentKeys.has(rowKey(row.discoveryType, row.entryId))
  ).length;
  return {
    genes,
    splices,
    strains,
    progress: {
      discovered,
      total,
      percent: total > 0 ? Math.min(100, Math.floor((discovered / total) * 100)) : 0,
      genomeWeaverUnlocked,
    },
    sampleSize: sessionRows.length,
  };
}
