/**
 * Chronicle assembly (Player Identity v1 section 7) - one builder for
 * both career surfaces: the own Chronicle (/profile via /api/chronicle)
 * and the public profile (/p/[handle] via /api/profile/[handle]).
 *
 * PRE-MIGRATION SAFE: sections degrade independently - records/PB
 * timeline/clan history read as "not live yet" pre-023, season chapters
 * pre-021 - and a missing section is null, never a failed request.
 * PUBLIC-SAFE: the public payload strips user ids and applies the
 * section 7.2 empty-state rule (<5 earning runs = header + collection
 * log only).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import {
  fallbackIdentity,
  getLiveIdentityForPlayer,
  isMissingIdentityInfra,
} from '@/lib/server/identity';
import { isMissingRecordsInfra } from '@/lib/server/records';
import {
  buildPbTimeline,
  type AcquisitionRow,
  type PbTimelineRow,
} from '@/lib/chronicle/pbTimeline';
import {
  CAPSTONE_TITLES,
  type CapstoneProgress,
  type ChroniclePayload,
  type ChronicleRecord,
  type ClanSection,
  type CollectionLogEntry,
  type RecordCategory,
  type RecordsCabinetData,
  type SeasonChapter,
  type TriviaEntry,
} from '@/lib/chronicle/types';
import { buildAimTrivia } from '@/lib/chronicle/aimTrivia';

/** The section 7.2 public empty-state threshold. */
export const PUBLIC_MIN_EARNING_RUNS = 5;

export interface ChroniclePlayerRow {
  id: string;
  user_id: string | null;
  created_at: string;
}

function logUnlessMissing(
  context: string,
  error: { code?: string; message?: string } | null
): void {
  if (error && !isMissingRecordsInfra(error) && !isMissingIdentityInfra(error)) {
    console.error(`Chronicle ${context} error:`, error);
  }
}

/** All 21 records joined with the player's progress; null pre-023. */
async function buildRecordsSection(
  supabase: SupabaseClient,
  playerId: string
): Promise<RecordsCabinetData | null> {
  const { data: definitions, error: defsError } = await supabase
    .from('record_definitions')
    .select('id, name, category, dynasty, measures, thresholds, tier_points, sort_order')
    .order('sort_order', { ascending: true });
  if (defsError || !definitions || definitions.length === 0) {
    logUnlessMissing('record_definitions', defsError);
    return null;
  }

  const { data: progress, error: progressError } = await supabase
    .from('player_records')
    .select('record_id, value, tier')
    .eq('player_id', playerId);
  if (progressError) {
    logUnlessMissing('player_records', progressError);
    return null;
  }

  const progressById = new Map(
    (progress ?? []).map((row) => [row.record_id as string, row])
  );

  const records: ChronicleRecord[] = definitions.map((def) => {
    const row = progressById.get(def.id as string);
    return {
      id: def.id as string,
      name: def.name as string,
      category: def.category as RecordCategory,
      dynasty: (def.dynasty as string | null) ?? null,
      measures: def.measures as string,
      thresholds: (def.thresholds as number[]) ?? [],
      tierPoints: (def.tier_points as number[]) ?? [5, 10, 20, 35, 60],
      value: Number(row?.value ?? 0),
      tier: Number(row?.tier ?? 0),
    };
  });

  const capstones: CapstoneProgress[] = (
    Object.keys(CAPSTONE_TITLES) as RecordCategory[]
  )
    .filter((category) => records.some((r) => r.category === category))
    .map((category) => {
      const categoryRecords = records.filter((r) => r.category === category);
      const minTier = Math.min(...categoryRecords.map((r) => r.tier));
      return {
        category,
        titleId: CAPSTONE_TITLES[category].id,
        titleName: CAPSTONE_TITLES[category].name,
        minTier,
        unlocked: minTier >= 4,
        apex: minTier >= 5,
      };
    });

  return { records, capstones };
}

/** Weekly PBs + acquisition annotations; null pre-023. */
async function buildPbSection(
  supabase: SupabaseClient,
  playerId: string
): Promise<ChroniclePayload['pbTimeline']> {
  const { data: rows, error: rpcError } = await supabase.rpc(
    'chronicle_pb_timeline',
    { p_player_id: playerId }
  );
  if (rpcError) {
    logUnlessMissing('chronicle_pb_timeline', rpcError);
    return null;
  }

  // Annotation moments: record tiers + mastery rungs (022+ inventory).
  let acquisitions: AcquisitionRow[] = [];
  const { data: cosmeticRows, error: cosmeticsError } = await supabase
    .from('player_cosmetics')
    .select('cosmetic_id, acquired_at, source, cosmetic_definitions(name, rarity)')
    .eq('player_id', playerId)
    .in('source', ['records', 'mastery']);
  if (cosmeticsError) {
    logUnlessMissing('player_cosmetics', cosmeticsError);
  } else {
    acquisitions = (cosmeticRows ?? []).map((row) => {
      const def = row.cosmetic_definitions as unknown as {
        name: string;
        rarity: string;
      } | null;
      return {
        cosmetic_id: row.cosmetic_id as string,
        acquired_at: (row.acquired_at as string | null) ?? null,
        name: def?.name ?? (row.cosmetic_id as string),
        rarity: def?.rarity ?? 'common',
        source: (row.source as string | null) ?? null,
      };
    });
  }

  return buildPbTimeline((rows ?? []) as PbTimelineRow[], acquisitions);
}

/**
 * Every variant with the player's first-acquired date; undiscovered
 * variants ride along as silhouettes (section 7.2: silhouettes are
 * content - they are the want-list).
 */
async function buildCollectionLog(
  supabase: SupabaseClient,
  playerId: string
): Promise<CollectionLogEntry[]> {
  const { data: variants, error: variantsError } = await supabase
    .from('snake_variants')
    .select('id, name, rarity, sort_order, dynasties(name)')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (variantsError || !variants) {
    logUnlessMissing('snake_variants', variantsError);
    return [];
  }

  const { data: collected, error: collectedError } = await supabase
    .from('collected_snakes')
    .select('snake_variant_id, acquired_at, generation')
    .eq('player_id', playerId);
  if (collectedError) {
    logUnlessMissing('collected_snakes', collectedError);
  }

  // First-acquired per variant (OSRS collection log), best generation.
  const firstAcquired = new Map<string, { acquiredAt: string; generation: number }>();
  for (const row of collected ?? []) {
    const variantId = row.snake_variant_id as string;
    const acquiredAt = row.acquired_at as string;
    const generation = (row.generation as number) ?? 1;
    const existing = firstAcquired.get(variantId);
    if (!existing) {
      firstAcquired.set(variantId, { acquiredAt, generation });
    } else {
      if (acquiredAt < existing.acquiredAt) existing.acquiredAt = acquiredAt;
      if (generation > existing.generation) existing.generation = generation;
    }
  }

  return variants.map((variant) => {
    const dynasty = variant.dynasties as unknown as { name: string } | null;
    const acquisition = firstAcquired.get(variant.id as string);
    return {
      variantId: variant.id as string,
      name: variant.name as string,
      dynasty: dynasty?.name ?? 'PRIMAL',
      rarity: (variant.rarity as string) ?? 'common',
      sortOrder: (variant.sort_order as number) ?? 0,
      acquiredAt: acquisition?.acquiredAt ?? null,
      generation: acquisition?.generation ?? null,
    };
  });
}

/**
 * One chapter per season the account overlapped (section 7.2: seasons
 * before the account existed simply don't render); null pre-021.
 */
async function buildSeasonChapters(
  supabase: SupabaseClient,
  player: ChroniclePlayerRow
): Promise<SeasonChapter[] | null> {
  const { data: seasons, error: seasonsError } = await supabase
    .from('seasons')
    .select('id, seq, name, theme, starts_on, ends_on, battle_pass_season_id')
    .order('seq', { ascending: true });
  if (seasonsError || !seasons || seasons.length === 0) {
    logUnlessMissing('seasons', seasonsError);
    return null;
  }

  const accountCreatedDay = player.created_at.slice(0, 10);
  const relevant = seasons.filter(
    (season) => (season.ends_on as string) > accountCreatedDay
  );
  if (relevant.length === 0) return [];

  const bpSeasonIds = relevant
    .map((season) => season.battle_pass_season_id as string | null)
    .filter((id): id is string => Boolean(id));

  const trackBySeasonId = new Map<string, number>();
  const maxLevelBySeasonId = new Map<string, number>();
  if (bpSeasonIds.length > 0) {
    const { data: trackRows, error: trackError } = await supabase
      .from('player_battle_pass')
      .select('season_id, current_level')
      .eq('player_id', player.id)
      .in('season_id', bpSeasonIds);
    if (trackError) {
      logUnlessMissing('player_battle_pass', trackError);
    } else {
      for (const row of trackRows ?? []) {
        trackBySeasonId.set(row.season_id as string, row.current_level as number);
      }
    }

    const { data: bpSeasons, error: bpError } = await supabase
      .from('battle_pass_seasons')
      .select('id, max_level')
      .in('id', bpSeasonIds);
    if (bpError) {
      logUnlessMissing('battle_pass_seasons', bpError);
    } else {
      for (const row of bpSeasons ?? []) {
        maxLevelBySeasonId.set(row.id as string, row.max_level as number);
      }
    }
  }

  const seasonIds = relevant.map((season) => season.id as string);
  const championsBySeason = new Map<
    string,
    { clanId: string | null; clanName: string; clanTag: string | null }
  >();
  const { data: champions, error: championsError } = await supabase
    .from('season_champions')
    .select('season_id, clan_id, clan_name, clan_tag')
    .in('season_id', seasonIds);
  if (championsError) {
    logUnlessMissing('season_champions', championsError);
  } else {
    for (const row of champions ?? []) {
      championsBySeason.set(row.season_id as string, {
        clanId: (row.clan_id as string | null) ?? null,
        clanName: row.clan_name as string,
        clanTag: (row.clan_tag as string | null) ?? null,
      });
    }
  }

  // Crowned per season: rostered member of the champion clan in the
  // championship-week (semifinal round) duel; a bye championship falls
  // back to current membership - the same rule refresh_player_records
  // pins for the Crowned record.
  const crownedSeasons = new Set<string>();
  if (player.user_id && championsBySeason.size > 0) {
    const { data: sfMatches, error: sfError } = await supabase
      .from('season_playoff_matches')
      .select('season_id, winner, duel_id')
      .eq('round', 'semifinal')
      .in('season_id', Array.from(championsBySeason.keys()));
    if (sfError) {
      logUnlessMissing('season_playoff_matches', sfError);
    } else {
      const championMatches = (sfMatches ?? []).filter(
        (match) =>
          match.winner &&
          championsBySeason.get(match.season_id as string)?.clanId === match.winner
      );
      const duelIds = championMatches
        .map((match) => match.duel_id as string | null)
        .filter((id): id is string => Boolean(id));

      const rosterByDuel = new Map<
        string,
        { clanA: string; clanB: string | null; rosterA: string[]; rosterB: string[] }
      >();
      if (duelIds.length > 0) {
        const { data: duels, error: duelsError } = await supabase
          .from('clan_duels')
          .select('id, clan_a, clan_b, roster_a, roster_b')
          .in('id', duelIds);
        if (duelsError) {
          logUnlessMissing('clan_duels', duelsError);
        } else {
          for (const duel of duels ?? []) {
            rosterByDuel.set(duel.id as string, {
              clanA: duel.clan_a as string,
              clanB: (duel.clan_b as string | null) ?? null,
              rosterA: (duel.roster_a as string[] | null) ?? [],
              rosterB: (duel.roster_b as string[] | null) ?? [],
            });
          }
        }
      }

      let currentClanId: string | null = null;
      const byeMatches = championMatches.filter((match) => !match.duel_id);
      if (byeMatches.length > 0) {
        const { data: membership, error: membershipError } = await supabase
          .from('clan_members')
          .select('clan_id')
          .eq('player_id', player.user_id)
          .maybeSingle();
        if (membershipError) {
          logUnlessMissing('clan_members', membershipError);
        } else {
          currentClanId = (membership?.clan_id as string | null) ?? null;
        }
      }

      for (const match of championMatches) {
        const seasonId = match.season_id as string;
        const champion = championsBySeason.get(seasonId);
        if (!champion?.clanId) continue;
        if (match.duel_id) {
          const duel = rosterByDuel.get(match.duel_id as string);
          if (!duel) continue;
          const roster =
            duel.clanA === champion.clanId ? duel.rosterA : duel.rosterB;
          if (roster.includes(player.user_id)) crownedSeasons.add(seasonId);
        } else if (currentClanId && currentClanId === champion.clanId) {
          crownedSeasons.add(seasonId);
        }
      }
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  return relevant.map((season) => {
    const bpId = season.battle_pass_season_id as string | null;
    const trackLevel = bpId ? trackBySeasonId.get(bpId) ?? null : null;
    const maxLevel = bpId ? maxLevelBySeasonId.get(bpId) ?? null : null;
    const champion = championsBySeason.get(season.id as string);
    return {
      seq: season.seq as number,
      name: season.name as string,
      theme: season.theme as string,
      startsOn: season.starts_on as string,
      endsOn: season.ends_on as string,
      active:
        (season.starts_on as string) <= today && today < (season.ends_on as string),
      trackLevel,
      maxLevel,
      completed:
        trackLevel !== null && maxLevel !== null && trackLevel >= maxLevel,
      champion: champion
        ? { clanName: champion.clanName, clanTag: champion.clanTag }
        : null,
      crowned: crownedSeasons.has(season.id as string),
    };
  });
}

/**
 * Career footnotes from retired systems (WP-0.07). Today that is exactly the
 * aim-system unlocks retired by §15 overturn 10: the gate is gone, the record
 * of having passed it is not (R6).
 *
 * Deliberately reads `players.high_score / total_games_played /
 * breeds_completed` — the very columns the retired predicates read — because
 * the point is to reproduce what the player was told they had earned. Trivia
 * carries no tier, no points and no cosmetic, so the leaderboard's reason for
 * avoiding `players.high_score` (a flagged run leaving a permanent record)
 * does not apply here: nothing in this section is a record or a reward.
 *
 * Never fails the caller: a read error yields no footnotes.
 */
async function buildTriviaSection(
  supabase: SupabaseClient,
  playerId: string
): Promise<TriviaEntry[]> {
  const { data, error } = await supabase
    .from('players')
    .select('high_score, total_games_played, breeds_completed')
    .eq('id', playerId)
    .single();

  if (error || !data) {
    logUnlessMissing('players trivia stats', error);
    if (error && !isMissingRecordsInfra(error) && !isMissingIdentityInfra(error)) {
      Sentry.captureException(
        new Error(`Chronicle trivia stats read failed: ${error.message}`),
        { extra: { playerId, code: error.code } }
      );
    }
    return [];
  }

  return buildAimTrivia({
    highScore: Number(data.high_score ?? 0),
    totalGames: Number(data.total_games_played ?? 0),
    breeds: Number(data.breeds_completed ?? 0),
  });
}

/**
 * Current clan + 3-day Energy Battle history. Aggregate battle facts and the
 * viewer's equal honors are public Chronicle facts; individual teammate
 * attempts never enter this read. Weekly duels survive only as an explicitly
 * labeled archive.
 */
async function buildClanSection(
  supabase: SupabaseClient,
  player: ChroniclePlayerRow
): Promise<ClanSection | null> {
  if (!player.user_id) return null;

  const { data: membership, error: membershipError } = await supabase
    .from('clan_members')
    .select('clan_id, clans(id, name, tag, rating)')
    .eq('player_id', player.user_id)
    .maybeSingle();
  if (membershipError) {
    logUnlessMissing('clan_members', membershipError);
    return null;
  }
  const clan = membership?.clans as unknown as {
    id: string;
    name: string;
    tag: string;
    rating: number;
  } | null;
  if (!clan) return null;

  let battleHistory: ClanSection['battleHistory'] = [];
  let honors: ClanSection['honors'] = {
    total: 0,
    victories: 0,
    stalemates: 0,
    participations: 0,
  };

  const { data: sideRows, error: sideError } = await supabase
    .from('clan_energy_battle_sides')
    .select(
      'battle_id, cycle_index, score, outcome, clan_energy_battles(starts_at, settled_at)'
    )
    .eq('clan_id', clan.id)
    .order('cycle_index', { ascending: false })
    .limit(12);

  if (sideError) {
    logUnlessMissing('clan_energy_battle_sides', sideError);
  } else {
    const battleIds = (sideRows ?? []).map((row) => row.battle_id as string);
    const opponentsByBattle = new Map<
      string,
      { name: string; tag: string | null; depth: number; outcome: string }
    >();
    if (battleIds.length > 0) {
      const { data: opponentRows, error: opponentError } = await supabase
        .from('clan_energy_battle_sides')
        .select('battle_id, score, outcome, clans(name, tag)')
        .in('battle_id', battleIds)
        .neq('clan_id', clan.id);
      if (opponentError) {
        logUnlessMissing('clan_energy_battle_sides opponents', opponentError);
      } else {
        for (const row of opponentRows ?? []) {
          const opponentJoin = row.clans as unknown as
            | { name: string; tag: string | null }
            | Array<{ name: string; tag: string | null }>
            | null;
          const opponent = Array.isArray(opponentJoin)
            ? opponentJoin[0] ?? null
            : opponentJoin;
          const opponentFacts = opponent as {
            name: string;
            tag: string | null;
          } | null;
          if (!opponentFacts) continue;
          opponentsByBattle.set(row.battle_id as string, {
            name: opponentFacts.name,
            tag: opponentFacts.tag,
            depth: Number(row.score ?? 0),
            outcome: String(row.outcome ?? 'pending'),
          });
        }
      }
    }

    battleHistory = (sideRows ?? []).map((row) => {
      const battleJoin = row.clan_energy_battles as unknown as
        | { starts_at: string; settled_at: string | null }
        | Array<{ starts_at: string; settled_at: string | null }>
        | null;
      const battle = Array.isArray(battleJoin)
        ? battleJoin[0] ?? null
        : battleJoin;
      return {
        battleId: row.battle_id as string,
        startedAt: battle?.starts_at ?? '',
        settledAt: battle?.settled_at ?? null,
        outcome: String(row.outcome ?? 'pending') as ClanSection['battleHistory'][number]['outcome'],
        clanDepth: Number(row.score ?? 0),
        opponent: opponentsByBattle.get(row.battle_id as string) ?? null,
      };
    });
  }

  const { data: honorRows, error: honorError } = await supabase
    .from('clan_energy_honors')
    .select('honor')
    .eq('player_id', player.id);
  if (honorError) {
    logUnlessMissing('clan_energy_honors', honorError);
  } else {
    honors = (honorRows ?? []).reduce<ClanSection['honors']>(
      (summary, row) => {
        summary.total += 1;
        if (row.honor === 'victor') summary.victories += 1;
        else if (row.honor === 'stalemate') summary.stalemates += 1;
        else summary.participations += 1;
        return summary;
      },
      { total: 0, victories: 0, stalemates: 0, participations: 0 }
    );
  }

  // The old ladder is history, not the current clan game. Keep it readable
  // beneath an Archive disclosure so existing careers do not lose context.
  let ratingHistory: NonNullable<ClanSection['legacyArchive']>['ratingHistory'] = [];
  const { data: historyRows, error: historyError } = await supabase
    .from('clan_rating_history')
    .select('week_start, rating_after, delta')
    .eq('clan_id', clan.id)
    .order('week_start', { ascending: true })
    .limit(52);
  if (historyError) {
    logUnlessMissing('clan_rating_history', historyError);
  } else {
    ratingHistory = (historyRows ?? []).map((row) => ({
      weekStart: row.week_start as string,
      ratingAfter: row.rating_after as number,
      delta: row.delta as number,
    }));
  }

  // Rivalry records: settled duels grouped by opponent (top 3 by volume).
  let rivalries: NonNullable<ClanSection['legacyArchive']>['rivalries'] = [];
  const { data: duels, error: duelsError } = await supabase
    .from('clan_duels')
    .select('clan_a, clan_b, winner, clans_a:clan_a(name, tag), clans_b:clan_b(name, tag)')
    .eq('status', 'settled')
    .or(`clan_a.eq.${clan.id},clan_b.eq.${clan.id}`)
    .order('week_start', { ascending: false })
    .limit(60);
  if (duelsError) {
    logUnlessMissing('clan_duels rivalry', duelsError);
  } else {
    const byOpponent = new Map<
      string,
      { opponentName: string; opponentTag: string | null; wins: number; losses: number; ties: number }
    >();
    for (const duel of duels ?? []) {
      const isA = (duel.clan_a as string) === clan.id;
      const opponentId = (isA ? duel.clan_b : duel.clan_a) as string | null;
      if (!opponentId) continue; // bye weeks are not rivalries
      const opponentInfo = (isA ? duel.clans_b : duel.clans_a) as unknown as {
        name: string;
        tag: string;
      } | null;
      const entry = byOpponent.get(opponentId) ?? {
        opponentName: opponentInfo?.name ?? 'Disbanded clan',
        opponentTag: opponentInfo?.tag ?? null,
        wins: 0,
        losses: 0,
        ties: 0,
      };
      if (!duel.winner) entry.ties += 1;
      else if ((duel.winner as string) === clan.id) entry.wins += 1;
      else entry.losses += 1;
      byOpponent.set(opponentId, entry);
    }
    rivalries = Array.from(byOpponent.values())
      .sort(
        (a, b) =>
          b.wins + b.losses + b.ties - (a.wins + a.losses + a.ties)
      )
      .slice(0, 3);
  }

  const legacyArchive =
    ratingHistory.length > 0 || rivalries.length > 0
      ? { rating: clan.rating, ratingHistory, rivalries }
      : null;

  return { name: clan.name, tag: clan.tag, battleHistory, honors, legacyArchive };
}

/**
 * Assemble the Chronicle for a player. `publicView` strips private ids
 * and applies the section 7.2 <5-earning-runs rule.
 */
export async function buildChronicle(
  supabase: SupabaseClient,
  player: ChroniclePlayerRow,
  options: { publicView: boolean }
): Promise<ChroniclePayload> {
  const identity =
    (await getLiveIdentityForPlayer(supabase, player.id)) ??
    fallbackIdentity(player.id);

  // Earning-run count drives the empty-state rules (section 7.2).
  let earningRuns = 0;
  const { count, error: countError } = await supabase
    .from('game_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('player_id', player.id)
    .eq('is_free_play', false)
    .not('ended_at', 'is', null);
  if (countError) {
    // Pre-016 there is no is_free_play column; retry without the filter.
    const { count: retryCount, error: retryError } = await supabase
      .from('game_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('player_id', player.id)
      .not('ended_at', 'is', null);
    if (retryError) {
      logUnlessMissing('game_sessions count', retryError);
    } else {
      earningRuns = retryCount ?? 0;
    }
  } else {
    earningRuns = count ?? 0;
  }

  const limited =
    options.publicView && earningRuns < PUBLIC_MIN_EARNING_RUNS;

  const collectionLog = await buildCollectionLog(supabase, player.id);

  let records: RecordsCabinetData | null = null;
  let pbTimeline: ChroniclePayload['pbTimeline'] = null;
  let seasons: SeasonChapter[] | null = null;
  let clanSection: ClanSection | null = null;
  let trivia: TriviaEntry[] = [];

  if (!limited) {
    [records, pbTimeline, seasons, clanSection, trivia] = await Promise.all([
      buildRecordsSection(supabase, player.id),
      buildPbSection(supabase, player.id),
      buildSeasonChapters(supabase, player),
      buildClanSection(supabase, player),
      buildTriviaSection(supabase, player.id),
    ]);
  }

  const payloadIdentity = options.publicView
    ? { ...identity, userId: null }
    : identity;

  return {
    identity: payloadIdentity,
    legacyScore: identity.legacyScore,
    recordsLive: records !== null,
    earningRuns,
    limited,
    records,
    pbTimeline,
    collectionLog,
    seasons,
    clan: clanSection,
    trivia,
  };
}
