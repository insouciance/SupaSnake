/**
 * Clan Gauntlet API - payload mapping + RPC error translation
 * (get_gauntlet / contribute_tithe / set_research_target /
 * submit_gauntlet_picks JSONB -> API response)
 */

import { mapGauntlet, type RpcGauntlet } from '@/app/api/clan/duel/utils';

export interface RpcResearchUnlock {
  node_id: string;
  unlocked_at: string;
}

export interface RpcResearchTithe {
  name: string;
  amount: number;
  week_start: string;
}

export interface RpcResearch {
  pool: number;
  target: string | null;
  unlocked: RpcResearchUnlock[];
  tithe_cap: number;
  my_tithe_this_week: number;
  recent_tithes: RpcResearchTithe[];
}

export interface RpcGauntletDetail extends RpcGauntlet {
  duel_id: string;
  week_start: string;
  opponent: { id: string; name: string; tag: string; rating: number } | null;
  scouting: {
    roster: Array<{
      name: string;
      mastery: Record<string, { level: number; xp?: number }>;
    }>;
    last_picks: Array<{
      week_start: string;
      dynasty: string;
      dynasty_2: string | null;
      modifier: string | null;
      ban: string | null;
    }>;
    detail: boolean;
  } | null;
  can_substitute: boolean;
}

export interface RpcGauntletPayload {
  is_officer: boolean;
  research: RpcResearch | null;
  gauntlet: RpcGauntletDetail | null;
  early_preview: { name: string; tag: string; rating: number } | null;
}

/** Map the get_gauntlet JSONB payload to the API response shape. */
export function mapGauntletPayload(payload: RpcGauntletPayload) {
  return {
    live: true,
    isOfficer: payload.is_officer === true,
    research: payload.research
      ? {
          pool: payload.research.pool ?? 0,
          target: payload.research.target ?? null,
          unlocked: (payload.research.unlocked || []).map((u) => ({
            nodeId: u.node_id,
            unlockedAt: u.unlocked_at,
          })),
          titheCap: payload.research.tithe_cap ?? 500,
          myTitheThisWeek: payload.research.my_tithe_this_week ?? 0,
          recentTithes: (payload.research.recent_tithes || []).map((t) => ({
            name: t.name,
            amount: t.amount,
            weekStart: t.week_start,
          })),
        }
      : null,
    gauntlet: payload.gauntlet
      ? {
          ...mapGauntlet(payload.gauntlet)!,
          duelId: payload.gauntlet.duel_id,
          weekStart: payload.gauntlet.week_start,
          opponent: payload.gauntlet.opponent
            ? {
                name: payload.gauntlet.opponent.name,
                tag: payload.gauntlet.opponent.tag,
                rating: payload.gauntlet.opponent.rating,
              }
            : null,
          scouting: payload.gauntlet.scouting
            ? {
                roster: (payload.gauntlet.scouting.roster || []).map((m) => ({
                  name: m.name,
                  mastery: m.mastery || {},
                })),
                lastPicks: (payload.gauntlet.scouting.last_picks || []).map((p) => ({
                  weekStart: p.week_start,
                  dynasty: p.dynasty,
                  dynasty2: p.dynasty_2 ?? null,
                  modifier: p.modifier ?? null,
                  ban: p.ban ?? null,
                })),
                detail: payload.gauntlet.scouting.detail === true,
              }
            : null,
          canSubstitute: payload.gauntlet.can_substitute === true,
        }
      : null,
    earlyPreview: payload.early_preview ?? null,
  };
}

/**
 * Translate an RPC RAISE EXCEPTION message (error-code convention from
 * migration 020) into an HTTP status + user-facing message. Unknown
 * errors fall through to a 500.
 */
export function mapGauntletRpcError(message: string): {
  status: number;
  error: string;
  code: string;
} | null {
  const codes: Array<{ code: string; status: number; error: string }> = [
    { code: 'TITHE_CAP_EXCEEDED', status: 400, error: 'Weekly tithe cap reached (500 DNA per member per week)' },
    { code: 'INSUFFICIENT_DNA', status: 400, error: 'Not enough DNA' },
    { code: 'INVALID_AMOUNT', status: 400, error: 'Invalid tithe amount' },
    { code: 'PLAYER_NOT_FOUND', status: 404, error: 'Player not found' },
    { code: 'NOT_IN_CLAN', status: 404, error: 'Not in a clan' },
    { code: 'NOT_AN_OFFICER', status: 403, error: 'Officers only' },
    { code: 'INVALID_NODE', status: 400, error: 'Unknown research node' },
    { code: 'ALREADY_UNLOCKED', status: 400, error: 'Node already unlocked' },
    { code: 'PREREQ_LOCKED', status: 400, error: 'Previous node in this branch is still locked' },
    { code: 'NO_DUEL_THIS_WEEK', status: 400, error: 'No duel this week' },
    { code: 'BYE_WEEK', status: 400, error: 'Bye week - no opponent to pick against' },
    { code: 'PICKS_CLOSED', status: 400, error: 'Picks locked at Wednesday 00:00 UTC' },
    { code: 'ALREADY_LOCKED', status: 400, error: 'Your clan already locked its picks this week' },
    { code: 'INVALID_DYNASTY_SPLIT', status: 400, error: 'Invalid dynasty split pick' },
    { code: 'INVALID_DYNASTY', status: 400, error: 'Invalid dynasty pick' },
    { code: 'SPLIT_PICK_LOCKED', status: 400, error: 'Dynasty split pick requires the Protocols 4 research node' },
    { code: 'INVALID_MODIFIER', status: 400, error: 'Unknown modifier' },
    { code: 'ANOMALY_NOT_LIVE', status: 400, error: 'Anomaly Doctrine needs the Anomaly board (coming with Seasons)' },
    { code: 'MODIFIER_LOCKED', status: 400, error: 'That modifier requires a research unlock' },
    { code: 'INVALID_BAN', status: 400, error: 'Unknown mutation to ban' },
    { code: 'SUBSTITUTION_LOCKED', status: 400, error: 'Roster substitution requires the Logistics 2 research node' },
    { code: 'NO_LOCKED_ROSTER', status: 400, error: 'No locked roster this week' },
    { code: 'ALREADY_SUBSTITUTED', status: 400, error: 'Substitution already used this week' },
    { code: 'OUT_NOT_ON_ROSTER', status: 400, error: 'That member is not on the locked roster' },
    { code: 'IN_ALREADY_ON_ROSTER', status: 400, error: 'That member is already on the roster' },
    { code: 'IN_NOT_A_MEMBER', status: 400, error: 'Substitute must be a clan member' },
  ];

  for (const entry of codes) {
    if (message.includes(entry.code)) {
      return { status: entry.status, error: entry.error, code: entry.code };
    }
  }
  return null;
}
