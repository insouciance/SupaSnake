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

export interface RpcGauntletPicks {
  dynasty: string;
  dynasty_2: string | null;
  modifier: string | null;
  ban: string | null;
  locked_at: string;
}

export interface RpcSideRules {
  dynasty: string | null;
  dynasty2: string | null;
  modifier: string | null;
  top_members: number;
  best_runs: number;
  weight: number;
  extracted_only: boolean;
  banned: string | null;
}

export interface RpcRivalry {
  wins: number;
  losses: number;
  ties: number;
  meetings: number;
  last_winner_me: boolean;
}

/** Gauntlet block on the duel (migration 020; absent pre-020). */
export interface RpcGauntlet {
  phase: 'picks_open' | 'locked' | 'scoring';
  picks_deadline: string;
  window_from: string;
  window_to: string;
  revealed: boolean;
  my_picks: RpcGauntletPicks | null;
  their_picks: RpcGauntletPicks | null;
  my_rules: RpcSideRules | null;
  their_rules: RpcSideRules | null;
  rivalry: RpcRivalry | null;
  revenge: boolean;
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
  /** Pre-020 payloads have no gauntlet field - mapped to null. */
  gauntlet?: RpcGauntlet | null;
}

export interface RpcLastWeek {
  result: 'won' | 'lost' | 'tie';
  rating_delta: number;
  opponent_name: string | null;
  my_score: number;
  their_score: number;
  /**
   * Vestigial. The clan-duel DNA bonus this flagged was DELETED by WP-0.02
   * (Rule 8: no intra-clan reward mathematics). get_clan_duel still emits
   * the key; nothing reads it, and nothing may start reading it again.
   */
  bonus_active?: boolean;
}

export interface RpcDuelPayload {
  error?: string;
  rating: number;
  record: { wins: number; losses: number };
  duel: RpcDuel | null;
  last_week: RpcLastWeek | null;
}

function mapPicks(picks: RpcGauntletPicks | null | undefined) {
  if (!picks) return null;
  return {
    dynasty: picks.dynasty,
    dynasty2: picks.dynasty_2 ?? null,
    modifier: picks.modifier ?? null,
    ban: picks.ban ?? null,
    lockedAt: picks.locked_at,
  };
}

function mapRules(rules: RpcSideRules | null | undefined) {
  if (!rules) return null;
  return {
    dynasty: rules.dynasty ?? null,
    dynasty2: rules.dynasty2 ?? null,
    modifier: rules.modifier ?? null,
    topMembers: rules.top_members,
    bestRuns: rules.best_runs,
    weight: Number(rules.weight),
    extractedOnly: rules.extracted_only === true,
    banned: rules.banned ?? null,
  };
}

/** Map the gauntlet block (null pre-migration-020 - the panel hides it). */
export function mapGauntlet(gauntlet: RpcGauntlet | null | undefined) {
  if (!gauntlet) return null;
  return {
    phase: gauntlet.phase,
    picksDeadline: gauntlet.picks_deadline,
    windowFrom: gauntlet.window_from,
    windowTo: gauntlet.window_to,
    revealed: gauntlet.revealed === true,
    myPicks: mapPicks(gauntlet.my_picks),
    theirPicks: mapPicks(gauntlet.their_picks),
    myRules: mapRules(gauntlet.my_rules),
    theirRules: mapRules(gauntlet.their_rules),
    rivalry: gauntlet.rivalry
      ? {
          wins: gauntlet.rivalry.wins ?? 0,
          losses: gauntlet.rivalry.losses ?? 0,
          ties: gauntlet.rivalry.ties ?? 0,
          meetings: gauntlet.rivalry.meetings ?? 0,
          lastWinnerMe: gauntlet.rivalry.last_winner_me === true,
        }
      : null,
    revenge: gauntlet.revenge === true,
  };
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
          gauntlet: mapGauntlet(payload.duel.gauntlet),
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
        }
      : null,
  };
}
