import {
  GENES,
  GENOME_V2_GENES,
  isGeneId,
  isGenomeV2ActiveGeneId,
  type GeneId,
  type GenomeV2ActiveGeneId,
} from '@/shared/game/genes';
import {
  SPLICES,
  SPLICE_IDS,
  isSpliceId,
  type SpliceId,
} from '@/shared/game/splices';
import {
  GENOME_V2_SPLICES,
  GENOME_V2_SPLICE_IDS,
  type GenomeRulesVersion,
  type GenomeV2SpliceId,
} from '@/shared/game/genomeV2';
import { STRAINS, STRAIN_IDS, type StrainId } from '@/shared/game/strains';
import {
  CODEX_DISCOVERY_REWARDS,
  isCodexDiscoveryType,
  isValidCodexEntryForRules,
  type CodexDiscoveryType,
} from '@/shared/game/codex';

export interface CodexDiscoveryRow {
  discoveryType: CodexDiscoveryType;
  entryId: string;
  rulesVersion: GenomeRulesVersion;
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

export type CodexGeneCatalogId = GeneId | GenomeV2ActiveGeneId;
export type CodexSpliceCatalogId = SpliceId | GenomeV2SpliceId;

export interface CodexGeneView extends CodexEntryStats {
  id: CodexGeneCatalogId;
  /** Omitted by the flag-off response; nested archives identify v1 explicitly. */
  rulesVersion?: GenomeRulesVersion;
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
  id: CodexSpliceCatalogId;
  /** Omitted by the flag-off response; nested archives identify v1 explicitly. */
  rulesVersion?: GenomeRulesVersion;
  name: string;
  /** V2 recipes are public; v1 keeps this null until its original discovery. */
  parents: readonly [CodexGeneCatalogId, CodexGeneCatalogId] | null;
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

/**
 * Read-only history from sessions settled under Genome v1. Only recorded
 * entries are included; undiscovered legacy recipes do not become public as a
 * side effect of enabling v2.
 */
export interface CodexLegacyArchive {
  rulesVersion: 1;
  genes: CodexGeneView[];
  splices: CodexSpliceView[];
  recorded: number;
  sampleSize: number;
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
  /** Present only in a v2 response when durable v1 history exists. */
  legacyArchive?: CodexLegacyArchive;
}

function rowKey(
  type: CodexDiscoveryType,
  entryId: string,
  rulesVersion: GenomeRulesVersion
): string {
  return `${rulesVersion}:${type}:${entryId}`;
}

/** Rows created before the versioned migration are historical v1 records. */
function discoveryRulesVersion(value: unknown): GenomeRulesVersion | null {
  if (value === undefined || value === null) return 1;
  return value === 1 || value === 2 ? value : null;
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
    if (!isCodexDiscoveryType(type)) continue;
    const rulesVersion = discoveryRulesVersion(row.rules_version);
    if (
      rulesVersion === null
      || !isValidCodexEntryForRules(type, entryId, rulesVersion)
    ) {
      continue;
    }
    const key = rowKey(type, entryId, rulesVersion);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      discoveryType: type,
      entryId,
      rulesVersion,
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
    if (!isCodexDiscoveryType(type)) continue;
    const rulesVersion = discoveryRulesVersion(row.rules_version);
    if (
      rulesVersion === null
      || !isValidCodexEntryForRules(type, entryId, rulesVersion)
    ) {
      continue;
    }
    result.set(
      rowKey(type, entryId, rulesVersion),
      typeof row.discovered_at === 'string' ? row.discovered_at : null
    );
  }
  return result;
}

function emptyStats(): CodexEntryStats {
  return { picks: 0, banks: 0 };
}

function genomeRulesVersion(row: CodexSessionRow): GenomeRulesVersion | null {
  if (typeof row.genome !== 'object' || row.genome === null) return null;
  const version = (row.genome as Record<string, unknown>).v;
  return version === 1 || version === 2 ? version : null;
}

/** Stats are deliberately bounded to the API's last-200 accepted sessions. */
export function deriveCodexSessionStats(
  rows: CodexSessionRow[],
  rulesVersion: GenomeRulesVersion = 1
): {
  genes: Map<CodexGeneCatalogId, CodexEntryStats>;
  splices: Map<CodexSpliceCatalogId, CodexEntryStats>;
} {
  const genes = new Map<CodexGeneCatalogId, CodexEntryStats>();
  const splices = new Map<CodexSpliceCatalogId, CodexEntryStats>();
  for (const row of rows) {
    if (typeof row.genome !== 'object' || row.genome === null) continue;
    const genome = row.genome as Record<string, unknown>;
    if (genome.v !== rulesVersion) continue;
    const banked = row.extracted === true;
    const seenGenes = new Set<CodexGeneCatalogId>();
    if (rulesVersion === 1 && Array.isArray(genome.picks)) {
      for (const item of genome.picks) {
        if (typeof item !== 'object' || item === null) continue;
        const id = (item as Record<string, unknown>).id;
        if (!isGeneId(id)) continue;
        seenGenes.add(id);
      }
    }
    if (
      rulesVersion === 2
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

    const seenSplices = new Set<CodexSpliceCatalogId>();
    if (rulesVersion === 1 && Array.isArray(genome.splices)) {
      for (const item of genome.splices) {
        if (typeof item !== 'object' || item === null) continue;
        const id = (item as Record<string, unknown>).id;
        if (!isSpliceId(id)) continue;
        seenSplices.add(id);
      }
    }
    if (rulesVersion === 2) {
      // v2 keeps this durable history even after a Recode removes the active
      // braid. Count it alongside current/legacy record shapes so Research
      // stats describe what the run actually discovered, not only what
      // survived in its terminal six loci.
      if (Array.isArray(genome.discoveredSplices)) {
        for (const id of genome.discoveredSplices) {
          if ((GENOME_V2_SPLICE_IDS as readonly unknown[]).includes(id)) {
            seenSplices.add(id as GenomeV2SpliceId);
          }
        }
      }
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

function buildLegacyArchive(
  discoveryMap: ReadonlyMap<string, string | null>,
  worldFirsts: ReadonlyMap<string, string | null>,
  sessionRows: CodexSessionRow[]
): CodexLegacyArchive | undefined {
  const stats = deriveCodexSessionStats(sessionRows, 1);
  const genes = (Object.keys(GENES) as GeneId[]).flatMap((id) => {
    const key = rowKey('gene', id, 1);
    const stat = stats.genes.get(id) ?? emptyStats();
    const discovered = discoveryMap.has(key);
    if (!discovered && stat.picks === 0) return [];
    const def = GENES[id];
    return [{
      id,
      rulesVersion: 1 as const,
      name: def.name,
      kind: def.kind,
      strains: def.strains,
      effect: def.effect,
      cost: def.cost,
      discovered,
      firstDiscoveredAt: discoveryMap.get(key) ?? null,
      worldFirstAt: worldFirsts.get(key) ?? null,
      ...stat,
    }];
  });
  const splices = SPLICE_IDS.flatMap((id) => {
    const key = rowKey('splice', id, 1);
    const stat = stats.splices.get(id) ?? emptyStats();
    const discovered = discoveryMap.has(key);
    if (!discovered && stat.picks === 0) return [];
    const def = SPLICES[id];
    return [{
      id,
      rulesVersion: 1 as const,
      name: def.name,
      // Preserve the exact v1 discovery contract: a run statistic may prove
      // the old Splice existed, but only durable discovery reveals its pair.
      parents: discovered ? def.parents : null,
      strains: Array.from(
        new Set(def.parents.flatMap((parent) => GENES[parent].strains))
      ),
      effect: def.effect,
      cost: def.cost,
      discoveries: stat.picks,
      banks: stat.banks,
      discovered,
      firstDiscoveredAt: discoveryMap.get(key) ?? null,
      worldFirstAt: worldFirsts.get(key) ?? null,
      rewardDna: CODEX_DISCOVERY_REWARDS.splice,
    }];
  });
  if (genes.length === 0 && splices.length === 0) return undefined;
  return {
    rulesVersion: 1,
    genes,
    splices,
    recorded: genes.length + splices.length,
    sampleSize: sessionRows.filter((row) => genomeRulesVersion(row) === 1).length,
  };
}

export function buildCodexPayload(
  discoveryRows: CodexDiscoveryRow[],
  worldFirsts: Map<string, string | null>,
  sessionRows: CodexSessionRow[],
  genomeWeaverUnlocked: boolean,
  rulesVersion: GenomeRulesVersion = 1
): CodexPayload {
  const discoveryMap = new Map(
    discoveryRows.map((row) => [
      rowKey(row.discoveryType, row.entryId, row.rulesVersion),
      row.firstDiscoveredAt,
    ])
  );
  const stats = deriveCodexSessionStats(sessionRows, rulesVersion);

  const genes: CodexGeneView[] = rulesVersion === 2
    ? (Object.keys(GENOME_V2_GENES) as GenomeV2ActiveGeneId[]).map((id) => {
        const def = GENOME_V2_GENES[id];
        const key = rowKey('gene', id, 2);
        return {
          id,
          rulesVersion: 2 as const,
          name: def.name,
          kind: def.kind,
          strains: def.strains,
          effect: def.effect,
          cost: def.cost,
          discovered: discoveryMap.has(key),
          firstDiscoveredAt: discoveryMap.get(key) ?? null,
          worldFirstAt: worldFirsts.get(key) ?? null,
          ...(stats.genes.get(id) ?? emptyStats()),
        };
      })
    : (Object.keys(GENES) as GeneId[]).map((id) => {
        const def = GENES[id];
        const key = rowKey('gene', id, 1);
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
          ...(stats.genes.get(id) ?? emptyStats()),
        };
      });

  const splices: CodexSpliceView[] = rulesVersion === 2
    ? GENOME_V2_SPLICE_IDS.map((id) => {
        const def = GENOME_V2_SPLICES[id];
        const stat = stats.splices.get(id) ?? emptyStats();
        const strains = Array.from(
          new Set(def.parents.flatMap((parent) => GENOME_V2_GENES[parent].strains))
        );
        const key = rowKey('splice', id, 2);
        return {
          id,
          rulesVersion: 2 as const,
          name: def.name,
          parents: def.parents,
          strains,
          effect: def.rule,
          cost: def.strategicCost,
          discoveries: stat.picks,
          banks: stat.banks,
          discovered: discoveryMap.has(key),
          firstDiscoveredAt: discoveryMap.get(key) ?? null,
          worldFirstAt: worldFirsts.get(key) ?? null,
          rewardDna: CODEX_DISCOVERY_REWARDS.splice,
        };
      })
    : SPLICE_IDS.map((id) => {
        const def = SPLICES[id];
        const stat = stats.splices.get(id) ?? emptyStats();
        const key = rowKey('splice', id, 1);
        const discovered = discoveryMap.has(key);
        return {
          id,
          name: def.name,
          parents: discovered ? def.parents : null,
          strains: Array.from(
            new Set(def.parents.flatMap((parent) => GENES[parent].strains))
          ),
          effect: def.effect,
          cost: def.cost,
          discoveries: stat.picks,
          banks: stat.banks,
          discovered,
          firstDiscoveredAt: discoveryMap.get(key) ?? null,
          worldFirstAt: worldFirsts.get(key) ?? null,
          rewardDna: CODEX_DISCOVERY_REWARDS.splice,
        };
      });

  const strains = STRAIN_IDS.map((strain): CodexStrainMilestoneView => {
    const expressionKey = rowKey('expression', strain, rulesVersion);
    const apexKey = rowKey('apex', strain, rulesVersion);
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
    ...genes.map((gene) => rowKey('gene', gene.id, rulesVersion)),
    ...splices.map((splice) => rowKey('splice', splice.id, rulesVersion)),
    ...STRAIN_IDS.flatMap((strain) => [
      rowKey('expression', strain, rulesVersion),
      rowKey('apex', strain, rulesVersion),
    ]),
  ]);
  const discovered = discoveryRows.filter((row) =>
    currentKeys.has(rowKey(row.discoveryType, row.entryId, row.rulesVersion))
  ).length;
  const legacyArchive = rulesVersion === 2
    ? buildLegacyArchive(discoveryMap, worldFirsts, sessionRows)
    : undefined;
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
    sampleSize: sessionRows.filter(
      (row) => genomeRulesVersion(row) === rulesVersion
    ).length,
    ...(legacyArchive ? { legacyArchive } : {}),
  };
}
