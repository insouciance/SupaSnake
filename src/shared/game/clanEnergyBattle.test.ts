import { GAME_CONFIG } from '@/shared/config/game';
import {
  clanMemberContribution,
  clanResultThreshold,
  energyBattleCycleAt,
  strongestClanResults,
} from './clanEnergyBattle';

const result = (sessionId: string, score: number, energyCommitted = 1) => ({
  sessionId,
  score,
  energyCommitted,
  completedAt: `2026-07-29T0${sessionId.length}:00:00.000Z`,
});

describe('Clan Energy Battle cycle', () => {
  it('runs three active days followed by one intermission day', () => {
    expect(GAME_CONFIG.economy.clanBattle.activeDurationSeconds).toBe(259_200);
    expect(GAME_CONFIG.economy.clanBattle.intermissionDurationSeconds).toBe(86_400);
    expect(energyBattleCycleAt(new Date('2026-07-27T00:00:00.000Z')).phase).toBe('active');
    expect(energyBattleCycleAt(new Date('2026-07-30T00:00:00.000Z')).phase).toBe('intermission');
    expect(energyBattleCycleAt(new Date('2026-07-31T00:00:00.000Z')).index).toBe(1);
  });
});

describe('best-five scoring', () => {
  const attempts = [
    result('a', 100, 6),
    result('bb', 900, 1),
    result('ccc', 300, 2),
    result('dddd', 700, 3),
    result('eeeee', 500, 4),
    result('ffffff', 1100, 1),
    result('ggggggg', 2000, 6),
  ];

  it('keeps only five exceptional performances, independent of commitment', () => {
    expect(strongestClanResults(attempts).map((entry) => entry.score)).toEqual([
      2000, 1100, 900, 700, 500,
    ]);
    expect(clanResultThreshold(attempts)).toBe(500);
    expect(clanMemberContribution(attempts)).toBe(5200);
  });

  it('leaves the threshold open until five results exist', () => {
    expect(clanResultThreshold(attempts.slice(0, 4))).toBe(0);
  });
});
