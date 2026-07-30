import { settleSessionReward } from './sessionReward';

const input = {
  playerId: 'player-1',
  sessionId: '550e8400-e29b-41d4-a716-446655440000',
  finalDna: 220,
  score: 900,
  validated: true,
  metadata: { yield_dna: 100 },
};

describe('atomic session reward wrapper', () => {
  it('passes only server-authored settlement facts and maps authoritative state', async () => {
    const rpc = jest.fn(async () => ({
      data: {
        applied: true,
        player: {
          dna: 1220,
          total_games_played: 8,
          high_score: 900,
          total_dna_earned: 5220,
          breeds_completed: 2,
        },
        personal_best: {
          eligible: true,
          before: 700,
          after: 900,
          improved: true,
        },
      },
      error: null,
    }));
    const result = await settleSessionReward({ rpc } as never, input);
    expect(rpc).toHaveBeenCalledWith('settle_game_session_reward', {
      p_player_id: input.playerId,
      p_session_id: input.sessionId,
      p_final_dna: 220,
      p_score: 900,
      p_validated: true,
      p_metadata: { yield_dna: 100 },
    });
    expect(result).toEqual({
      ok: true,
      settlement: {
        applied: true,
        player: {
          dna: 1220,
          totalGamesPlayed: 8,
          highScore: 900,
          totalDnaEarned: 5220,
          breedsCompleted: 2,
        },
        personalBest: {
          eligible: true,
          before: 700,
          after: 900,
          improved: true,
        },
      },
    });
  });

  it('keeps RPC failures and malformed success payloads retryable', async () => {
    await expect(
      settleSessionReward(
        {
          rpc: jest.fn(async () => ({
            data: null,
            error: { code: '40001', message: 'serialization failure' },
          })),
        } as never,
        input
      )
    ).resolves.toMatchObject({ ok: false });

    await expect(
      settleSessionReward(
        { rpc: jest.fn(async () => ({ data: { applied: true }, error: null })) } as never,
        input
      )
    ).resolves.toMatchObject({ ok: false });
  });

  it('accepts a same-session replay without weakening immutable PB truth', async () => {
    const result = await settleSessionReward(
      {
        rpc: jest.fn(async () => ({
          data: {
            applied: false,
            player: {
              dna: 2000,
              total_games_played: 9,
              high_score: 1200,
              total_dna_earned: 6000,
              breeds_completed: 2,
            },
            personal_best: {
              eligible: true,
              before: 700,
              after: 900,
              improved: true,
            },
          },
          error: null,
        })),
      } as never,
      input
    );
    expect(result).toMatchObject({
      ok: true,
      settlement: {
        applied: false,
        personalBest: { before: 700, after: 900, improved: true },
      },
    });
  });
});
