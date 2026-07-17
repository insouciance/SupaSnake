/**
 * Clan Duel API - payload mapping (get_clan_duel JSONB -> API response)
 */

export interface RpcOpponent {
  id: string;
  name: string;
  tag: string;
  rating: number;
}

export interface RpcContributor {
  name: string;
  dna: number;
}

export interface RpcDuel {
  week_start: string;
  ends_at: string;
  status: 'active' | 'settled' | 'bye';
  is_bye: boolean;
  my_score: number;
  their_score: number;
  opponent: RpcOpponent | null;
  top_contributors: RpcContributor[];
}

export interface RpcLastWeek {
  result: 'won' | 'lost' | 'tie';
  rating_delta: number;
  opponent_name: string | null;
  my_score: number;
  their_score: number;
  bonus_active: boolean;
}

export interface RpcDuelPayload {
  error?: string;
  rating: number;
  record: { wins: number; losses: number };
  duel: RpcDuel | null;
  last_week: RpcLastWeek | null;
}

/** Map the get_clan_duel JSONB payload to the API response shape. */
export function mapDuelPayload(payload: RpcDuelPayload) {
  return {
    duel: payload.duel
      ? {
          weekStart: payload.duel.week_start,
          status: payload.duel.status,
          isBye: payload.duel.is_bye,
          opponent: payload.duel.opponent
            ? {
                name: payload.duel.opponent.name,
                tag: payload.duel.opponent.tag,
                rating: payload.duel.opponent.rating,
              }
            : null,
          myScore: payload.duel.my_score ?? 0,
          theirScore: payload.duel.their_score ?? 0,
          endsAt: payload.duel.ends_at,
          myTopContributors: (payload.duel.top_contributors || []).map((c) => ({
            name: c.name,
            dna: c.dna,
          })),
        }
      : null,
    rating: payload.rating,
    record: {
      wins: payload.record?.wins ?? 0,
      losses: payload.record?.losses ?? 0,
    },
    lastWeek: payload.last_week
      ? {
          result: payload.last_week.result,
          ratingDelta: payload.last_week.rating_delta,
          opponentName: payload.last_week.opponent_name,
          myScore: payload.last_week.my_score ?? 0,
          theirScore: payload.last_week.their_score ?? 0,
          bonusActive: payload.last_week.bonus_active,
        }
      : null,
  };
}
