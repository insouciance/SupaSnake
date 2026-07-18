/**
 * Snake Data Model Types - Unit Tests
 * Tests for helper functions in snake-data-model.ts
 */

// Using Jest (project default)
import {
  computeEffectiveStats,
  canUnlockVariant,
  getUnlockCostDisplay,
  DEFAULT_BASE_STATS,
  GENERATION_SCALING_FACTOR,
  type Dynasty,
  type SnakeVariant,
  type SnakeStats,
} from './snake-data-model';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const mockCyberDynasty: Dynasty = {
  id: 'cyber-uuid',
  name: 'CYBER',
  displayName: 'Cyber Dynasty',
  description: 'Test description',
  colorPrimary: '#00FFFF',
  colorSecondary: '#FF00FF',
  statBonusType: 'speed',
  statBonusValue: 0.05,
  sortOrder: 1,
  isActive: true,
  createdAt: '2025-01-22T00:00:00Z',
  updatedAt: '2025-01-22T00:00:00Z',
};

const mockPrimalDynasty: Dynasty = {
  ...mockCyberDynasty,
  id: 'primal-uuid',
  name: 'PRIMAL',
  displayName: 'Primal Dynasty',
  statBonusType: 'dna_generation',
  sortOrder: 2,
};

const mockCosmicDynasty: Dynasty = {
  ...mockCyberDynasty,
  id: 'cosmic-uuid',
  name: 'COSMIC',
  displayName: 'Cosmic Dynasty',
  statBonusType: 'size',
  sortOrder: 3,
};

const mockStarterVariant: SnakeVariant = {
  id: 'starter-uuid',
  dynastyId: 'cyber-uuid',
  name: 'CYBER SPARK',
  rarity: 'common',
  loreText: 'Test lore',
  artUrl: null,
  baseStats: { speed: 10, size: 5, hp: 100 },
  unlockCostDna: 0,
  isStarter: true,
  sortOrder: 1,
  isActive: true,
  createdAt: '2025-01-22T00:00:00Z',
  updatedAt: '2025-01-22T00:00:00Z',
};

const mockUnlockableVariant: SnakeVariant = {
  ...mockStarterVariant,
  id: 'unlockable-uuid',
  name: 'CYBER PULSE',
  unlockCostDna: 500,
  isStarter: false,
  sortOrder: 2,
};

// =============================================================================
// computeEffectiveStats TESTS
// =============================================================================

describe('computeEffectiveStats (Design v2: flat stats)', () => {
  const baseStats: SnakeStats = { speed: 10, size: 5, hp: 100 };

  it('returns base stats unchanged regardless of generation', () => {
    for (const gen of [1, 2, 5, 10, 100]) {
      const result = computeEffectiveStats(baseStats, gen, mockPrimalDynasty);
      expect(result).toEqual({ speed: 10, size: 5, hp: 100 });
    }
  });

  it('ignores dynasty stat bonuses (CYBER speed, COSMIC size)', () => {
    expect(computeEffectiveStats(baseStats, 1, mockCyberDynasty)).toEqual(baseStats);
    expect(computeEffectiveStats(baseStats, 1, mockCosmicDynasty)).toEqual(baseStats);
    expect(computeEffectiveStats(baseStats, 1, mockPrimalDynasty)).toEqual(baseStats);
  });

  it('rounds base stats to 2 decimals (mirrors the DB function)', () => {
    const result = computeEffectiveStats(
      { speed: 10.005, size: 5.129, hp: 99.999 },
      3,
      mockCyberDynasty
    );
    expect(result).toEqual({ speed: 10.01, size: 5.13, hp: 100 });
  });

  it('does not mutate the input stats', () => {
    const input = { ...baseStats };
    computeEffectiveStats(input, 7, mockCyberDynasty);
    expect(input).toEqual(baseStats);
  });
});

// =============================================================================
// canUnlockVariant TESTS
// =============================================================================

describe('canUnlockVariant', () => {
  describe('Sufficient DNA', () => {
    it('should allow unlock when DNA >= cost', () => {
      const result = canUnlockVariant(mockUnlockableVariant, 500);
      expect(result.canUnlock).toBe(true);
      expect(result.dnaNeeded).toBe(0);
    });

    it('should allow unlock when DNA > cost', () => {
      const result = canUnlockVariant(mockUnlockableVariant, 1000);
      expect(result.canUnlock).toBe(true);
      expect(result.dnaNeeded).toBe(0);
    });
  });

  describe('Insufficient DNA', () => {
    it('should block unlock when DNA < cost', () => {
      const result = canUnlockVariant(mockUnlockableVariant, 100);
      expect(result.canUnlock).toBe(false);
      expect(result.dnaNeeded).toBe(400);
    });

    it('should calculate exact DNA needed', () => {
      const result = canUnlockVariant(mockUnlockableVariant, 499);
      expect(result.canUnlock).toBe(false);
      expect(result.dnaNeeded).toBe(1);
    });

    it('should handle 0 DNA balance', () => {
      const result = canUnlockVariant(mockUnlockableVariant, 0);
      expect(result.canUnlock).toBe(false);
      expect(result.dnaNeeded).toBe(500);
    });
  });

  describe('Free Variants', () => {
    it('should allow unlock for starters (cost = 0)', () => {
      const result = canUnlockVariant(mockStarterVariant, 0);
      expect(result.canUnlock).toBe(true);
      expect(result.dnaNeeded).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle negative DNA balance (edge case)', () => {
      const result = canUnlockVariant(mockUnlockableVariant, -100);
      expect(result.canUnlock).toBe(false);
      expect(result.dnaNeeded).toBe(600);
    });
  });
});

// =============================================================================
// getUnlockCostDisplay TESTS
// =============================================================================

describe('getUnlockCostDisplay', () => {
  it('should return "Starter" for starter variants', () => {
    expect(getUnlockCostDisplay(mockStarterVariant)).toBe('Starter');
  });

  it('should return "X DNA" for unlockable variants', () => {
    expect(getUnlockCostDisplay(mockUnlockableVariant)).toBe('500 DNA');
  });

  it('should return "Free" for non-starter with 0 cost', () => {
    const freeVariant: SnakeVariant = {
      ...mockUnlockableVariant,
      unlockCostDna: 0,
      isStarter: false,
    };
    expect(getUnlockCostDisplay(freeVariant)).toBe('Free');
  });

  it('should handle various costs', () => {
    const variant1000: SnakeVariant = {
      ...mockUnlockableVariant,
      unlockCostDna: 1000,
    };
    expect(getUnlockCostDisplay(variant1000)).toBe('1000 DNA');
  });
});

// =============================================================================
// CONSTANTS TESTS
// =============================================================================

describe('Constants', () => {
  it('DEFAULT_BASE_STATS should match spec', () => {
    expect(DEFAULT_BASE_STATS).toEqual({
      speed: 10,
      size: 5,
      hp: 100,
    });
  });

  it('GENERATION_SCALING_FACTOR should be 0.05', () => {
    expect(GENERATION_SCALING_FACTOR).toBe(0.05);
  });
});
