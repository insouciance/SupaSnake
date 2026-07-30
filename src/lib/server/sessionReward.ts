import type { SupabaseClient } from '@supabase/supabase-js';

export interface AuthoritativePlayerState {
  dna: number;
  totalGamesPlayed: number;
  highScore: number;
  totalDnaEarned: number;
  breedsCompleted: number;
}

export interface PersonalBestTruth {
  eligible: boolean;
  before: number;
  after: number;
  improved: boolean;
}

export interface SessionRewardSettlement {
  applied: boolean;
  player: AuthoritativePlayerState;
  personalBest: PersonalBestTruth;
}

export type SessionRewardSettlementResult =
  | { ok: true; settlement: SessionRewardSettlement }
  | { ok: false; error: unknown };

export interface SettleSessionRewardInput {
  playerId: string;
  sessionId: string;
  finalDna: number;
  score: number;
  validated: boolean;
  metadata: Record<string, unknown>;
}

function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function parseSettlement(value: unknown): SessionRewardSettlement | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const player = row.player;
  const personalBest = row.personal_best;
  if (
    typeof row.applied !== 'boolean' ||
    !player ||
    typeof player !== 'object' ||
    Array.isArray(player) ||
    !personalBest ||
    typeof personalBest !== 'object' ||
    Array.isArray(personalBest)
  ) {
    return null;
  }
  const playerRow = player as Record<string, unknown>;
  const pbRow = personalBest as Record<string, unknown>;
  const dna = integer(playerRow.dna);
  const totalGamesPlayed = integer(playerRow.total_games_played);
  const highScore = integer(playerRow.high_score);
  const totalDnaEarned = integer(playerRow.total_dna_earned);
  const breedsCompleted = integer(playerRow.breeds_completed);
  const before = integer(pbRow.before);
  const after = integer(pbRow.after);
  if (
    dna === null ||
    totalGamesPlayed === null ||
    highScore === null ||
    totalDnaEarned === null ||
    breedsCompleted === null ||
    before === null ||
    after === null ||
    after < before ||
    typeof pbRow.eligible !== 'boolean' ||
    typeof pbRow.improved !== 'boolean' ||
    pbRow.improved !== (pbRow.eligible && after > before)
  ) {
    return null;
  }
  return {
    applied: row.applied,
    player: { dna, totalGamesPlayed, highScore, totalDnaEarned, breedsCompleted },
    personalBest: {
      eligible: pbRow.eligible,
      before,
      after,
      improved: pbRow.improved,
    },
  };
}

export async function settleSessionReward(
  supabase: SupabaseClient,
  input: SettleSessionRewardInput
): Promise<SessionRewardSettlementResult> {
  try {
    const { data, error } = await supabase.rpc('settle_game_session_reward', {
      p_player_id: input.playerId,
      p_session_id: input.sessionId,
      p_final_dna: input.finalDna,
      p_score: input.score,
      p_validated: input.validated,
      p_metadata: input.metadata,
    });
    if (error) return { ok: false, error };
    const settlement = parseSettlement(data);
    if (!settlement) {
      return {
        ok: false,
        error: new Error('settle_game_session_reward returned invalid data'),
      };
    }
    return { ok: true, settlement };
  } catch (error) {
    return { ok: false, error };
  }
}
