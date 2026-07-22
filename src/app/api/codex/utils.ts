import { GENES, isGeneId, type GeneId } from '@/shared/game/genes';
import { SPLICES, SPLICE_IDS, isSpliceId, type SpliceId } from '@/shared/game/splices';
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
  id: GeneId;
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
  id: SpliceId;
  name: string;
  parents: readonly [GeneId, GeneId];
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
  genes: Map<GeneId, CodexEntryStats>;
  splices: Map<SpliceId, CodexEntryStats>;
} {
  const genes = new Map<GeneId, CodexEntryStats>();
  const splices = new Map<SpliceId, CodexEntryStats>();
  for (const row of rows) {
    if (typeof row.genome !== 'object' || row.genome === null) continue;
    const genome = row.genome as Record<string, unknown>;
    if (genome.v !== 1) continue;
    const banked = row.extracted === true;
    const seenGenes = new Set<GeneId>();
    if (Array.isArray(genome.picks)) {
      for (const item of genome.picks) {
        if (typeof item !== 'object' || item === null) continue;
        const id = (item as Record<string, unknown>).id;
        if (!isGeneId(id)) continue;
        seenGenes.add(id);
      }
    }
    for (const id of Array.from(seenGenes)) {
      const stat = genes.get(id) ?? emptyStats();
      stat.picks += 1;
      if (banked) stat.banks += 1;
      genes.set(id, stat);
    }

    const seenSplices = new Set<SpliceId>();
    if (Array.isArray(genome.splices)) {
      for (const item of genome.splices) {
        if (typeof item !== 'object' || item === null) continue;
        const id = (item as Record<string, unknown>).id;
        if (!isSpliceId(id)) continue;
        seenSplices.add(id);
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

  const genes = (Object.keys(GENES) as GeneId[]).map((id): CodexGeneView => {
    const def = GENES[id];
    const stat = stats.genes.get(id) ?? emptyStats();
    const key = rowKey('gene', id);
    return {
      id,
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

  const splices = SPLICE_IDS.map((id): CodexSpliceView => {
    const def = SPLICES[id];
    const stat = stats.splices.get(id) ?? emptyStats();
    const strains = Array.from(
      new Set(def.parents.flatMap((parent) => GENES[parent].strains))
    );
    const key = rowKey('splice', id);
    return {
      id,
      name: def.name,
      parents: def.parents,
      strains,
      effect: def.effect,
      cost: def.cost,
      discoveries: stat.picks,
      banks: stat.banks,
      discovered: discoveryMap.has(key),
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
  const discovered = discoveryRows.length;
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
