import type { SupabaseClient } from '@supabase/supabase-js';
import { energyBattleCycleAt } from '@/shared/game/clanEnergyBattle';
import {
  MASTERY_MAX_LEVEL,
  MASTERY_THRESHOLDS,
  levelForXp,
} from '@/shared/game/mastery';
import { readLadderRecords } from './ladderRecords';
import { readLineageDossiers } from './lineageCareer';
import { isMissingRunImpactInfra } from './runImpact';
import type {
  CareerDynasty,
  CareerPulse,
  PinnedPursuit,
  PursuitCandidate,
} from '@/shared/progression/career';
import type {
  ProgressionMoment,
  ProgressionPillar,
} from '@/shared/progression/runImpact';

const DYNASTIES: CareerDynasty[] = ['CYBER', 'PRIMAL', 'COSMIC'];

export type CareerPulseRead =
  | { ok: true; pulse: CareerPulse }
  | { ok: false; error: unknown; scope: string };

function int(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function momentFromRow(row: Record<string, unknown>): ProgressionMoment {
  const moment: ProgressionMoment = {
    id: String(row.id),
    pillar: row.pillar as ProgressionPillar,
    kind: String(row.kind),
    significance: row.significance as ProgressionMoment['significance'],
    headline: String(row.headline),
    securedAt: String(row.secured_at),
    source: { type: String(row.source_type), id: String(row.source_id) },
  };
  if (typeof row.detail === 'string') moment.detail = row.detail;
  if (typeof row.destination === 'string') {
    moment.destination = row.destination as ProgressionMoment['destination'];
  }
  if (typeof row.artifact_ref === 'string') moment.artifactRef = row.artifact_ref;
  return moment;
}

export async function readCareerPulse(
  supabase: SupabaseClient,
  playerId: string,
  authUserId: string
): Promise<CareerPulseRead> {
  const masteryQuery = await supabase
    .from('player_mastery')
    .select('dynasty, xp')
    .eq('player_id', playerId);
  if (masteryQuery.error) return { ok: false, error: masteryQuery.error, scope: 'mastery' };

  const masteryByDynasty = new Map<string, number>();
  for (const row of masteryQuery.data ?? []) {
    masteryByDynasty.set(String(row.dynasty).toUpperCase(), int(row.xp));
  }
  const mastery = DYNASTIES.map((dynasty) => {
    const xp = masteryByDynasty.get(dynasty) ?? 0;
    const level = levelForXp(xp);
    return {
      dynasty,
      xp,
      level,
      nextLevelXp: level >= MASTERY_MAX_LEVEL ? null : MASTERY_THRESHOLDS[level + 1],
    };
  });

  const recordsQuery = await supabase
    .from('player_records')
    .select('record_id, value, tier')
    .eq('player_id', playerId);
  if (recordsQuery.error) return { ok: false, error: recordsQuery.error, scope: 'records' };
  const recordRows = (recordsQuery.data ?? []).map((row) => ({
    id: String(row.record_id),
    value: int(row.value),
    tier: int(row.tier),
  }));

  const codexQuery = await supabase
    .from('player_codex')
    .select('entry_id', { count: 'exact', head: true })
    .eq('player_id', playerId);
  if (codexQuery.error) return { ok: false, error: codexQuery.error, scope: 'codex' };
  const worldFirstQuery = await supabase
    .from('progression_moments')
    .select('id', { count: 'exact', head: true })
    .eq('player_id', playerId)
    .eq('kind', 'codex_discovery')
    .eq('significance', 'historic');
  if (worldFirstQuery.error && !isMissingRunImpactInfra(worldFirstQuery.error)) {
    return { ok: false, error: worldFirstQuery.error, scope: 'world-firsts' };
  }
  const weaverQuery = await supabase
    .from('player_cosmetics')
    .select('cosmetic_id')
    .eq('player_id', playerId)
    .eq('cosmetic_id', 'genome_weaver')
    .maybeSingle();
  if (weaverQuery.error) return { ok: false, error: weaverQuery.error, scope: 'genome-weaver' };

  const ladder = await readLadderRecords(supabase, playerId);
  const lineageResult = await readLineageDossiers(supabase, playerId);
  if (!lineageResult.ok) return { ok: false, error: lineageResult.error, scope: 'lineage' };
  const activeSpecimens = lineageResult.dossiers.flatMap((dossier) => dossier.specimens)
    .filter((specimen) => specimen.status === 'active');
  const highestGeneration = activeSpecimens.reduce(
    (highest, specimen) => Math.max(highest, specimen.generation),
    0
  );

  const momentsQuery = await supabase
    .from('progression_moments')
    .select('id, source_type, source_id, pillar, kind, significance, headline, detail, destination, artifact_ref, secured_at')
    .eq('player_id', playerId)
    .order('secured_at', { ascending: false })
    .limit(20);
  if (momentsQuery.error && !isMissingRunImpactInfra(momentsQuery.error)) {
    return { ok: false, error: momentsQuery.error, scope: 'moments' };
  }
  const recentMoments = ((momentsQuery.data ?? []) as Record<string, unknown>[]).map(
    momentFromRow
  );

  const honorsQuery = await supabase
    .from('clan_energy_honors')
    .select('battle_id, honor, awarded_at')
    .eq('player_id', playerId)
    .order('awarded_at', { ascending: false });
  if (honorsQuery.error && !/clan_energy_honors/i.test(honorsQuery.error.message ?? '')) {
    return { ok: false, error: honorsQuery.error, scope: 'clan-honors' };
  }
  const honors = { participant: 0, victor: 0, stalemate: 0 };
  for (const row of honorsQuery.data ?? []) {
    if (row.honor === 'victor') honors.victor += 1;
    else if (row.honor === 'stalemate') honors.stalemate += 1;
    else if (row.honor === 'participant') honors.participant += 1;
  }
  const honorHistory = (honorsQuery.data ?? []).flatMap((row) => {
    if (
      typeof row.battle_id !== 'string' ||
      typeof row.awarded_at !== 'string' ||
      !['participant', 'victor', 'stalemate'].includes(String(row.honor))
    ) return [];
    return [{
      battleId: row.battle_id,
      honor: row.honor as 'participant' | 'victor' | 'stalemate',
      awardedAt: row.awarded_at,
    }];
  });

  let activeBattle: CareerPulse['clan']['activeBattle'] = null;
  const membershipQuery = await supabase
    .from('clan_members')
    .select('clan_id')
    .eq('player_id', authUserId)
    .maybeSingle();
  if (membershipQuery.error) {
    return { ok: false, error: membershipQuery.error, scope: 'clan-membership' };
  }
  if (membershipQuery.data?.clan_id) {
    const cycle = energyBattleCycleAt();
    if (cycle.phase !== 'active') {
      // Intermission is history/preparation, not an active decision state.
      // Honors still render above; no live threshold is implied.
      activeBattle = null;
    } else {
    const sideQuery = await supabase
      .from('clan_energy_battle_sides')
      .select('id, battle_id, score, clan_energy_battles(ends_at)')
      .eq('cycle_index', cycle.index)
      .eq('clan_id', membershipQuery.data.clan_id)
      .maybeSingle();
    if (sideQuery.error && !/clan_energy_battle/i.test(sideQuery.error.message ?? '')) {
      return { ok: false, error: sideQuery.error, scope: 'clan-battle' };
    }
    if (sideQuery.data) {
      const contributionQuery = await supabase
        .from('clan_energy_contributions')
        .select('score, contribution_rank')
        .eq('battle_id', sideQuery.data.battle_id)
        .eq('player_id', playerId)
        .eq('counted', true)
        .order('contribution_rank');
      if (contributionQuery.error) {
        return { ok: false, error: contributionQuery.error, scope: 'clan-contributions' };
      }
      const opponentQuery = await supabase
        .from('clan_energy_battle_sides')
        .select('score')
        .eq('battle_id', sideQuery.data.battle_id)
        .neq('id', sideQuery.data.id)
        .maybeSingle();
      if (opponentQuery.error) {
        return { ok: false, error: opponentQuery.error, scope: 'clan-opponent' };
      }
      const scores = (contributionQuery.data ?? []).map((row) => int(row.score));
      const battle = one(
        sideQuery.data.clan_energy_battles as
          | { ends_at?: string }
          | { ends_at?: string }[]
          | null
      );
      activeBattle = {
        battleId: String(sideQuery.data.battle_id),
        cycleKey: String(cycle.index),
        endsAt: String(battle?.ends_at ?? cycle.endsAt),
        ownTopFive: scores,
        fifthBest: scores.length >= 5 ? scores[4] : null,
        clanTotal: int(sideQuery.data.score),
        opponentTotal: opponentQuery.data ? int(opponentQuery.data.score) : null,
      };
    }
    }
  }

  const pursuitCandidates: PursuitCandidate[] = [];
  for (const track of mastery) {
    if (track.level >= MASTERY_MAX_LEVEL || track.nextLevelXp === null) continue;
    pursuitCandidates.push({
      id: `mastery:${track.dynasty}:M${track.level + 1}`,
      pillar: 'mastery',
      kind: 'mastery_level',
      targetId: `${track.dynasty}:M${track.level + 1}`,
      headline: `Reach ${track.dynasty} Mastery M${track.level + 1}`,
      destination: 'mastery',
      current: track.xp,
      target: track.nextLevelXp,
    });
  }
  if (ladder.available && ladder.maxBest < 7) {
    pursuitCandidates.push({
      id: `ladder:rung:${ladder.maxBest + 1}`,
      pillar: 'mastery',
      kind: 'ladder_record',
      targetId: String(ladder.maxBest + 1),
      headline: `Bank ladder rung ${ladder.maxBest + 1}`,
      destination: 'mastery',
      current: ladder.maxBest,
      target: ladder.maxBest + 1,
    });
  }
  pursuitCandidates.push({
    id: `lineage:generation:${highestGeneration + 1}`,
    pillar: 'lineage',
    kind: 'lineage_generation',
    targetId: String(highestGeneration + 1),
    headline: `Breed a Gen ${highestGeneration + 1} snake`,
    destination: 'lineage',
    current: highestGeneration,
    target: highestGeneration + 1,
  });

  const pinnedQuery = await supabase
    .from('player_pinned_pursuits')
    .select('candidate_id, pinned_at')
    .eq('player_id', playerId)
    .maybeSingle();
  if (pinnedQuery.error && !isMissingRunImpactInfra(pinnedQuery.error)) {
    return { ok: false, error: pinnedQuery.error, scope: 'pinned-pursuit' };
  }
  const currentCandidate = pursuitCandidates.find(
    (candidate) => candidate.id === pinnedQuery.data?.candidate_id
  );
  const pinnedPursuit: PinnedPursuit | null =
    currentCandidate && pinnedQuery.data
      ? { ...currentCandidate, pinnedAt: String(pinnedQuery.data.pinned_at) }
      : null;

  return {
    ok: true,
    pulse: {
      generatedAt: new Date().toISOString(),
      mastery,
      records: {
        total: recordRows.length,
        tiered: recordRows.filter((record) => record.tier > 0).length,
        apex: recordRows.filter((record) => record.tier >= 5).length,
        strongest: [...recordRows]
          .sort((a, b) => b.tier - a.tier || b.value - a.value || a.id.localeCompare(b.id))
          .slice(0, 5),
      },
      discovery: {
        entries: codexQuery.count ?? 0,
        worldFirsts: worldFirstQuery.count ?? 0,
        genomeWeaverUnlocked: Boolean(weaverQuery.data),
      },
      ladder: { bestByDynasty: ladder.best, maxBest: ladder.maxBest },
      lineage: {
        dossiers: lineageResult.dossiers.length,
        activeSpecimens: activeSpecimens.length,
        highestGeneration,
      },
      clan: { honors, honorHistory, activeBattle },
      recentMoments,
      pursuitCandidates,
      pinnedPursuit,
    },
  };
}
