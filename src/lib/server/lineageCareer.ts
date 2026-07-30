import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CareerDynasty,
  LineageDossier,
  LineageSpecimen,
} from '@/shared/progression/career';
import { isMissingRunImpactInfra } from './runImpact';

export type LineageDossierRead =
  | { ok: true; available: boolean; dossiers: LineageDossier[] }
  | { ok: false; error: unknown };

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function int(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

export async function readLineageDossiers(
  supabase: SupabaseClient,
  playerId: string
): Promise<LineageDossierRead> {
  const { data: dossierRows, error: dossierError } = await supabase
    .from('lineage_dossiers')
    .select('id, snake_variant_id, created_at, updated_at, snake_variants(id, name, rarity, dynasties(name))')
    .eq('player_id', playerId)
    .order('updated_at', { ascending: false });
  if (dossierError) {
    if (isMissingRunImpactInfra(dossierError)) {
      return { ok: true, available: false, dossiers: [] };
    }
    console.error('Lineage dossier read failed:', { playerId, error: dossierError });
    return { ok: false, error: dossierError };
  }

  const rows = (dossierRows ?? []) as Array<Record<string, unknown>>;
  if (rows.length === 0) return { ok: true, available: true, dossiers: [] };
  const ids = rows.map((row) => String(row.id));
  const { data: specimenRows, error: specimenError } = await supabase
    .from('lineage_specimens')
    .select('specimen_id, dossier_id, status, generation, parent1_specimen_id, parent2_specimen_id, traits, lineage, acquired_at, retired_at, breeding_history_id, runs_completed, extractions, best_score, best_yield, highest_energy, clan_depth_delivered, last_run_at')
    .eq('player_id', playerId)
    .in('dossier_id', ids)
    .order('generation', { ascending: false })
    .order('acquired_at', { ascending: false });
  if (specimenError) {
    console.error('Lineage specimen read failed:', { playerId, error: specimenError });
    return { ok: false, error: specimenError };
  }

  const specimensByDossier = new Map<string, Record<string, unknown>[]>();
  for (const specimen of (specimenRows ?? []) as Record<string, unknown>[]) {
    const dossierId = String(specimen.dossier_id);
    const list = specimensByDossier.get(dossierId) ?? [];
    list.push(specimen);
    specimensByDossier.set(dossierId, list);
  }

  const dossiers: LineageDossier[] = rows.map((row) => {
    const variant = one(row.snake_variants as Record<string, unknown> | Record<string, unknown>[] | null);
    const dynasty = one(
      variant?.dynasties as Record<string, unknown> | Record<string, unknown>[] | null
    );
    const rawSpecimens = specimensByDossier.get(String(row.id)) ?? [];
    const highestActiveGeneration = rawSpecimens.reduce<number | null>(
      (highest, specimen) =>
        specimen.status === 'active'
          ? Math.max(highest ?? 0, int(specimen.generation))
          : highest,
      null
    );
    const specimens: LineageSpecimen[] = rawSpecimens.map((specimen) => {
      const active = specimen.status === 'active';
      const generation = Math.max(1, int(specimen.generation));
      const lineage = specimen.lineage;
      return {
        id: String(specimen.specimen_id),
        status: active ? 'active' : 'retired_refunded',
        owned: active,
        equippable: active && generation === highestActiveGeneration,
        generation,
        parent1Id:
          typeof specimen.parent1_specimen_id === 'string'
            ? specimen.parent1_specimen_id
            : null,
        parent2Id:
          typeof specimen.parent2_specimen_id === 'string'
            ? specimen.parent2_specimen_id
            : null,
        traits: Array.isArray(specimen.traits)
          ? specimen.traits.filter((trait): trait is string => typeof trait === 'string')
          : [],
        lineage:
          lineage && typeof lineage === 'object' && !Array.isArray(lineage)
            ? (lineage as Record<string, unknown>)
            : null,
        acquiredAt: String(specimen.acquired_at),
        retiredAt:
          typeof specimen.retired_at === 'string' ? specimen.retired_at : null,
        breedingHistoryId:
          typeof specimen.breeding_history_id === 'string'
            ? specimen.breeding_history_id
            : null,
        runs: {
          completed: int(specimen.runs_completed),
          extractions: int(specimen.extractions),
          bestScore: int(specimen.best_score),
          bestYield: int(specimen.best_yield),
          highestEnergy: int(specimen.highest_energy),
          clanDepthDelivered: int(specimen.clan_depth_delivered),
          lastRunAt:
            typeof specimen.last_run_at === 'string' ? specimen.last_run_at : null,
        },
      };
    });
    return {
      id: String(row.id),
      variant: {
        id: String(variant?.id ?? row.snake_variant_id),
        name: String(variant?.name ?? 'Unknown specimen'),
        dynasty: String(dynasty?.name ?? 'PRIMAL').toUpperCase() as CareerDynasty,
        rarity: String(variant?.rarity ?? 'common'),
      },
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      highestActiveGeneration,
      specimens,
    };
  });
  return { ok: true, available: true, dossiers };
}
