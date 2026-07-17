/**
 * Tests for DNA Multipliers - streak x dynasty x set bonus stack
 */

import {
  normalizeStreakMultiplier,
  normalizeClanDuelBonus,
  getDynastyDnaMultiplier,
  getSetBonusMultiplier,
  countCompletedDynasties,
  combineDnaMultipliers,
  applyDnaMultiplier,
  getDnaMultiplier,
  SET_BONUS_PER_DYNASTY,
  CLAN_DUEL_WIN_MULTIPLIER,
  type EquippedVariantInfo,
} from './dnaMultipliers';

describe('normalizeStreakMultiplier', () => {
  it('passes through valid numeric multipliers', () => {
    expect(normalizeStreakMultiplier(1.25)).toBe(1.25);
  });

  it('parses DECIMAL string values from postgres', () => {
    expect(normalizeStreakMultiplier('1.50')).toBe(1.5);
  });

  it('defaults to 1 for null/undefined', () => {
    expect(normalizeStreakMultiplier(null)).toBe(1);
    expect(normalizeStreakMultiplier(undefined)).toBe(1);
  });

  it('defaults to 1 for garbage and sub-1 values', () => {
    expect(normalizeStreakMultiplier('abc')).toBe(1);
    expect(normalizeStreakMultiplier(0)).toBe(1);
    expect(normalizeStreakMultiplier(0.5)).toBe(1);
    expect(normalizeStreakMultiplier(NaN)).toBe(1);
  });
});

describe('getDynastyDnaMultiplier', () => {
  it('grants +5% for dna_generation with fractional value (PRIMAL seed: 0.05)', () => {
    const info: EquippedVariantInfo = {
      statBonusType: 'dna_generation',
      statBonusValue: 0.05,
    };
    expect(getDynastyDnaMultiplier(info)).toBeCloseTo(1.05);
  });

  it('grants +5% for dna_generation with percent-style value (5)', () => {
    const info: EquippedVariantInfo = {
      statBonusType: 'dna_generation',
      statBonusValue: 5,
    };
    expect(getDynastyDnaMultiplier(info)).toBeCloseTo(1.05);
  });

  it('returns 1 for non-DNA bonus types (CYBER speed, COSMIC size)', () => {
    expect(
      getDynastyDnaMultiplier({ statBonusType: 'speed', statBonusValue: 0.05 })
    ).toBe(1);
    expect(
      getDynastyDnaMultiplier({ statBonusType: 'size', statBonusValue: 0.05 })
    ).toBe(1);
  });

  it('returns 1 for null info or invalid values', () => {
    expect(getDynastyDnaMultiplier(null)).toBe(1);
    expect(
      getDynastyDnaMultiplier({ statBonusType: 'dna_generation', statBonusValue: null })
    ).toBe(1);
    expect(
      getDynastyDnaMultiplier({ statBonusType: 'dna_generation', statBonusValue: 0 })
    ).toBe(1);
    expect(
      getDynastyDnaMultiplier({ statBonusType: 'dna_generation', statBonusValue: -2 })
    ).toBe(1);
  });
});

describe('getSetBonusMultiplier', () => {
  it('is 1 with no completed dynasties', () => {
    expect(getSetBonusMultiplier(0)).toBe(1);
  });

  it('adds 10% per completed dynasty', () => {
    expect(getSetBonusMultiplier(1)).toBeCloseTo(1.1);
    expect(getSetBonusMultiplier(2)).toBeCloseTo(1.2);
    expect(getSetBonusMultiplier(3)).toBeCloseTo(1.3);
    expect(SET_BONUS_PER_DYNASTY).toBe(0.1);
  });

  it('ignores negative/invalid counts', () => {
    expect(getSetBonusMultiplier(-1)).toBe(1);
    expect(getSetBonusMultiplier(NaN)).toBe(1);
  });
});

describe('countCompletedDynasties', () => {
  const activeVariants = [
    { id: 'c1', dynastyId: 'cyber' },
    { id: 'c2', dynastyId: 'cyber' },
    { id: 'p1', dynastyId: 'primal' },
    { id: 'p2', dynastyId: 'primal' },
    { id: 'p3', dynastyId: 'primal' },
    { id: 'k1', dynastyId: 'cosmic' },
  ];

  it('counts a dynasty when all active variants are owned', () => {
    expect(countCompletedDynasties(activeVariants, ['c1', 'c2'])).toBe(1);
  });

  it('does not count partially collected dynasties', () => {
    expect(countCompletedDynasties(activeVariants, ['p1', 'p2'])).toBe(0);
  });

  it('counts multiple completed dynasties', () => {
    expect(
      countCompletedDynasties(activeVariants, ['c1', 'c2', 'k1', 'p1'])
    ).toBe(2);
  });

  it('handles duplicate owned entries (bred copies of same variant)', () => {
    expect(countCompletedDynasties(activeVariants, ['k1', 'k1', 'k1'])).toBe(1);
  });

  it('ignores owned ids not in the active catalog (retired variants)', () => {
    expect(countCompletedDynasties(activeVariants, ['retired-1'])).toBe(0);
  });

  it('handles null variant ids and empty inputs', () => {
    expect(countCompletedDynasties(activeVariants, [null, undefined])).toBe(0);
    expect(countCompletedDynasties([], ['c1'])).toBe(0);
  });
});

describe('normalizeClanDuelBonus', () => {
  it('passes through the duel-win multiplier', () => {
    expect(normalizeClanDuelBonus(1.05)).toBe(1.05);
    expect(CLAN_DUEL_WIN_MULTIPLIER).toBe(1.05);
  });

  it('parses NUMERIC string values from postgres', () => {
    expect(normalizeClanDuelBonus('1.05')).toBe(1.05);
    expect(normalizeClanDuelBonus('1.00')).toBe(1);
  });

  it('defaults to 1 for null/undefined/garbage/sub-1 values', () => {
    expect(normalizeClanDuelBonus(null)).toBe(1);
    expect(normalizeClanDuelBonus(undefined)).toBe(1);
    expect(normalizeClanDuelBonus('abc')).toBe(1);
    expect(normalizeClanDuelBonus(0)).toBe(1);
    expect(normalizeClanDuelBonus(0.95)).toBe(1);
    expect(normalizeClanDuelBonus(NaN)).toBe(1);
  });
});

describe('combineDnaMultipliers', () => {
  it('multiplies streak x dynasty x set bonus', () => {
    const { multiplier, breakdown } = combineDnaMultipliers(1.25, 1.05, 2);
    // 1.25 * 1.05 * 1.2 = 1.575
    expect(multiplier).toBeCloseTo(1.575);
    expect(breakdown).toEqual({
      streak: 1.25,
      dynasty: 1.05,
      setBonus: 1.2,
      completedDynasties: 2,
      clanDuel: 1,
      total: 1.575,
    });
  });

  it('is 1.0 with no bonuses', () => {
    const { multiplier, breakdown } = combineDnaMultipliers(1, 1, 0);
    expect(multiplier).toBe(1);
    expect(breakdown.total).toBe(1);
    expect(breakdown.clanDuel).toBe(1);
  });

  it('rounds float noise to 4 decimals', () => {
    const { multiplier } = combineDnaMultipliers(1.1, 1.05, 1);
    // 1.1 * 1.05 * 1.1 = 1.2705000000000002 -> 1.2705
    expect(multiplier).toBe(1.2705);
  });

  it('stacks the clan duel win bonus on top of the other factors', () => {
    const { multiplier, breakdown } = combineDnaMultipliers(1.25, 1.05, 2, 1.05);
    // 1.25 * 1.05 * 1.2 * 1.05 = 1.65375 -> 1.6538 (round4)
    expect(multiplier).toBe(1.6538);
    expect(breakdown.clanDuel).toBe(1.05);
  });

  it('ignores invalid clan duel bonuses (never punish)', () => {
    const { multiplier, breakdown } = combineDnaMultipliers(1, 1, 0, 0.5);
    expect(multiplier).toBe(1);
    expect(breakdown.clanDuel).toBe(1);
  });
});

describe('applyDnaMultiplier', () => {
  it('rounds down the multiplied DNA', () => {
    expect(applyDnaMultiplier(33, 1.25)).toBe(41); // 41.25 -> 41
    expect(applyDnaMultiplier(10, 1.05)).toBe(10); // 10.5 -> 10
  });

  it('returns base for x1 and 0 for non-positive base', () => {
    expect(applyDnaMultiplier(50, 1)).toBe(50);
    expect(applyDnaMultiplier(0, 2)).toBe(0);
    expect(applyDnaMultiplier(-5, 2)).toBe(0);
  });

  it('never reduces DNA on invalid multipliers', () => {
    expect(applyDnaMultiplier(50, NaN)).toBe(50);
    expect(applyDnaMultiplier(50, 0.5)).toBe(50);
  });
});

describe('getDnaMultiplier (with mocked supabase)', () => {
  interface MockData {
    streakMultiplier: string | number | null;
    activeVariants: Array<{ id: string; dynasty_id: string }>;
    ownedVariantIds: Array<string | null>;
    /** clan_duel_bonus RPC result; 'throw' simulates an RPC failure */
    clanDuelBonus?: string | number | null | 'throw';
  }

  function createMockSupabase(data: MockData) {
    return {
      rpc: async (fn: string) => {
        if (fn === 'clan_duel_bonus') {
          if (data.clanDuelBonus === 'throw') {
            throw new Error('rpc unavailable');
          }
          return { data: data.clanDuelBonus ?? null, error: null };
        }
        return { data: null, error: { message: `unknown rpc ${fn}` } };
      },
      from(table: string) {
        return {
          select() {
            return this;
          },
          eq() {
            if (table === 'player_streaks') {
              return {
                maybeSingle: async () => ({
                  data:
                    data.streakMultiplier === null
                      ? null
                      : { streak_multiplier: data.streakMultiplier },
                  error: null,
                }),
              };
            }
            if (table === 'snake_variants') {
              return Promise.resolve({ data: data.activeVariants, error: null });
            }
            if (table === 'collected_snakes') {
              return Promise.resolve({
                data: data.ownedVariantIds.map((id) => ({ snake_variant_id: id })),
                error: null,
              });
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
    } as unknown as Parameters<typeof getDnaMultiplier>[0];
  }

  it('combines streak, PRIMAL dynasty bonus, and one completed dynasty', async () => {
    const supabase = createMockSupabase({
      streakMultiplier: '1.10',
      activeVariants: [
        { id: 'p1', dynasty_id: 'primal' },
        { id: 'p2', dynasty_id: 'primal' },
        { id: 'c1', dynasty_id: 'cyber' },
      ],
      ownedVariantIds: ['p1', 'p2'],
    });

    const { multiplier, breakdown } = await getDnaMultiplier(supabase, 'player-1', {
      statBonusType: 'dna_generation',
      statBonusValue: 0.05,
    });

    // 1.10 * 1.05 * 1.10 = 1.2705
    expect(multiplier).toBe(1.2705);
    expect(breakdown.streak).toBe(1.1);
    expect(breakdown.dynasty).toBe(1.05);
    expect(breakdown.setBonus).toBe(1.1);
    expect(breakdown.completedDynasties).toBe(1);
  });

  it('defaults to 1.0 for a fresh player with no streak row or snakes', async () => {
    const supabase = createMockSupabase({
      streakMultiplier: null,
      activeVariants: [{ id: 'c1', dynasty_id: 'cyber' }],
      ownedVariantIds: [],
    });

    const { multiplier, breakdown } = await getDnaMultiplier(supabase, 'player-1', null);

    expect(multiplier).toBe(1);
    expect(breakdown).toEqual({
      streak: 1,
      dynasty: 1,
      setBonus: 1,
      completedDynasties: 0,
      clanDuel: 1,
      total: 1,
    });
  });

  it('applies the +5% clan duel win bonus from the RPC (NUMERIC string)', async () => {
    const supabase = createMockSupabase({
      streakMultiplier: null,
      activeVariants: [{ id: 'c1', dynasty_id: 'cyber' }],
      ownedVariantIds: [],
      clanDuelBonus: '1.05',
    });

    const { multiplier, breakdown } = await getDnaMultiplier(supabase, 'player-1', null);

    expect(multiplier).toBe(1.05);
    expect(breakdown.clanDuel).toBe(1.05);
  });

  it('stacks the duel bonus with streak, dynasty, and set bonus', async () => {
    const supabase = createMockSupabase({
      streakMultiplier: '1.10',
      activeVariants: [
        { id: 'p1', dynasty_id: 'primal' },
        { id: 'p2', dynasty_id: 'primal' },
      ],
      ownedVariantIds: ['p1', 'p2'],
      clanDuelBonus: 1.05,
    });

    const { multiplier, breakdown } = await getDnaMultiplier(supabase, 'player-1', {
      statBonusType: 'dna_generation',
      statBonusValue: 0.05,
    });

    // 1.10 * 1.05 * 1.10 * 1.05 = 1.3340...25 -> 1.334 (round4)
    expect(multiplier).toBe(1.334);
    expect(breakdown.clanDuel).toBe(1.05);
  });

  it('falls back to x1 when the clan_duel_bonus RPC throws (non-fatal)', async () => {
    const supabase = createMockSupabase({
      streakMultiplier: '1.25',
      activeVariants: [{ id: 'c1', dynasty_id: 'cyber' }],
      ownedVariantIds: [],
      clanDuelBonus: 'throw',
    });

    const { multiplier, breakdown } = await getDnaMultiplier(supabase, 'player-1', null);

    expect(multiplier).toBe(1.25);
    expect(breakdown.clanDuel).toBe(1);
  });

  it('falls back to x1 when the RPC returns null (player not in a clan)', async () => {
    const supabase = createMockSupabase({
      streakMultiplier: null,
      activeVariants: [{ id: 'c1', dynasty_id: 'cyber' }],
      ownedVariantIds: [],
      clanDuelBonus: null,
    });

    const { breakdown } = await getDnaMultiplier(supabase, 'player-1', null);

    expect(breakdown.clanDuel).toBe(1);
  });
});
