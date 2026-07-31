/**
 * Current social facts for the World Report.
 *
 * This reader is intentionally aggregate-only: a returning player can see
 * how their clan's settled battles moved, but never another member's Energy,
 * attempts, generation, threshold, absence, or rank. It reads existing
 * server-authored history and writes nothing.
 */

import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  WorldReportEnergyBattle,
  WorldReportEnergyContext,
} from '@/lib/report/worldReport';

const REPORT_BATTLE_LIMIT = 4;

interface ErrorLike {
  code?: string;
  message?: string;
}

function report(scope: string, error: unknown, extra: Record<string, unknown>) {
  console.error(`World Report ${scope} failed:`, { ...extra, error });
  Sentry.captureException(
    error instanceof Error ? error : new Error(`World Report ${scope} failed`),
    { extra: { scope, ...extra, error } }
  );
}

function isMissingBattleSchema(error: ErrorLike | null | undefined): boolean {
  if (!error) return false;
  return (
    ['42P01', '42703', 'PGRST200', 'PGRST204'].includes(error.code ?? '') ||
    /clan_energy_(?:battles|battle_sides)/i.test(error.message ?? '')
  );
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function battleOutcome(value: unknown): WorldReportEnergyBattle['outcome'] | null {
  return value === 'victor' ||
    value === 'participant' ||
    value === 'stalemate' ||
    value === 'bye'
    ? value
    : null;
}

/**
 * Read current monotonic Depth and the latest settled Clan Energy Battles
 * since `lastSeenAt`. `undefined` means a required read failed; the caller
 * must render no report rather than splice current and stale social history.
 */
export async function readWorldReportEnergyContext(
  supabase: SupabaseClient,
  playerId: string,
  lastSeenAt: string,
  now: Date | number = Date.now()
): Promise<WorldReportEnergyContext | undefined> {
  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('user_id, lifetime_depth, best_week_depth')
    .eq('id', playerId)
    .maybeSingle();
  if (playerError || !player) {
    report('current standing read', playerError ?? new Error('Player missing'), {
      playerId,
    });
    return undefined;
  }

  const standing: WorldReportEnergyContext['standing'] = {
    bestBattleDepth: Math.max(0, Number(player.best_week_depth ?? 0)),
    lifetimeDepth: Math.max(0, Number(player.lifetime_depth ?? 0)),
  };
  const userId = typeof player.user_id === 'string' ? player.user_id : null;
  if (!userId) return { standing, battles: [] };

  const { data: membership, error: membershipError } = await supabase
    .from('clan_members')
    .select('clan_id')
    .eq('player_id', userId)
    .maybeSingle();
  if (membershipError) {
    report('current clan read', membershipError, { playerId });
    return undefined;
  }
  const clanId = typeof membership?.clan_id === 'string' ? membership.clan_id : null;
  if (!clanId) return { standing, battles: [] };

  const { data: sideRows, error: sideError } = await supabase
    .from('clan_energy_battle_sides')
    .select(
      'battle_id, clan_id, score, outcome, clans(name, tag), clan_energy_battles!inner(settled_at)'
    )
    .eq('clan_id', clanId)
    .not('clan_energy_battles.settled_at', 'is', null)
    .gte('clan_energy_battles.settled_at', lastSeenAt)
    .lte('clan_energy_battles.settled_at', new Date(now).toISOString())
    .order('cycle_index', { ascending: false })
    .limit(REPORT_BATTLE_LIMIT);
  if (sideError) {
    if (!isMissingBattleSchema(sideError)) {
      report('battle history read', sideError, { playerId, clanId });
    } else {
      report('battle history schema read', sideError, { playerId, clanId });
    }
    return undefined;
  }

  const ownRows = (sideRows ?? []) as Array<Record<string, unknown>>;
  const battleIds = ownRows
    .map((row) => (typeof row.battle_id === 'string' ? row.battle_id : null))
    .filter((id): id is string => Boolean(id));
  const opponentByBattle = new Map<
    string,
    WorldReportEnergyBattle['opponent']
  >();

  if (battleIds.length > 0) {
    const { data: opponentRows, error: opponentError } = await supabase
      .from('clan_energy_battle_sides')
      .select('battle_id, score, clans(name, tag)')
      .in('battle_id', battleIds)
      .neq('clan_id', clanId);
    if (opponentError) {
      report('battle opponent read', opponentError, { playerId, clanId });
      return undefined;
    }
    for (const row of (opponentRows ?? []) as Array<Record<string, unknown>>) {
      if (typeof row.battle_id !== 'string') continue;
      const clan = one(
        row.clans as
          | { name?: unknown; tag?: unknown }
          | Array<{ name?: unknown; tag?: unknown }>
          | null
      );
      if (!clan || typeof clan.name !== 'string') continue;
      opponentByBattle.set(row.battle_id, {
        name: clan.name,
        tag: typeof clan.tag === 'string' ? clan.tag : null,
        depth: Math.max(0, Number(row.score ?? 0)),
      });
    }
  }

  const since = new Date(lastSeenAt).getTime();
  const until = new Date(now).getTime();
  const battles: WorldReportEnergyBattle[] = [];
  for (const row of ownRows) {
    if (typeof row.battle_id !== 'string') continue;
    const outcome = battleOutcome(row.outcome);
    if (!outcome) continue;
    const clan = one(
      row.clans as
        | { name?: unknown; tag?: unknown }
        | Array<{ name?: unknown; tag?: unknown }>
        | null
    );
    const battle = one(
      row.clan_energy_battles as
        | { settled_at?: unknown }
        | Array<{ settled_at?: unknown }>
        | null
    );
    const settledAt = typeof battle?.settled_at === 'string' ? battle.settled_at : '';
    const settledMs = new Date(settledAt).getTime();
    if (
      !clan ||
      typeof clan.name !== 'string' ||
      !Number.isFinite(settledMs) ||
      settledMs < since ||
      settledMs > until
    ) {
      continue;
    }
    battles.push({
      battleId: row.battle_id,
      settledAt,
      outcome,
      clan: {
        id: clanId,
        name: clan.name,
        tag: typeof clan.tag === 'string' ? clan.tag : null,
        depth: Math.max(0, Number(row.score ?? 0)),
      },
      opponent: opponentByBattle.get(row.battle_id) ?? null,
    });
  }

  return { standing, battles };
}
