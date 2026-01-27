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

describe('computeEffectiveStats', () => {
  const baseStats: SnakeStats = { speed: 10, size: 5, hp: 100 };

  describe('Generation Scaling', () => {
    it('Gen 1 should equal base stats (before dynasty bonus)', () => {
      // Using a dynasty with no applicable bonus (dna_generation)
      const result = computeEffectiveStats(baseStats, 1, mockPrimalDynasty);
      expect(result.speed).toBe(10);
      expect(result.size).toBe(5);
      expect(result.hp).toBe(100);
    });

    it('Gen 2 should be 5% higher than base', () => {
      const result = computeEffectiveStats(baseStats, 2, mockPrimalDynasty);
      expect(result.speed).toBeCloseTo(10.5, 2);
      expect(result.size).toBeCloseTo(5.25, 2);
      expect(result.hp).toBeCloseTo(105, 2);
    });

    it('Gen 5 should be 20% higher than base', () => {
      const result = computeEffectiveStats(baseStats, 5, mockPrimalDynasty);
      // Gen 5 multiplier = 1 + (5-1) * 0.05 = 1.20
      expect(result.speed).toBeCloseTo(12, 2);
      expect(result.size).toBeCloseTo(6, 2);
      expect(result.hp).toBeCloseTo(120, 2);
    });

    it('Gen 10 should be 45% higher than base', () => {
      const result = computeEffectiveStats(baseStats, 10, mockPrimalDynasty);
      // Gen 10 multiplier = 1 + (10-1) * 0.05 = 1.45
      expect(result.speed).toBeCloseTo(14.5, 2);
      expect(result.size).toBeCloseTo(7.25, 2);
      expect(result.hp).toBeCloseTo(145, 2);
    });
  });

  describe('Dynasty Bonuses', () => {
    it('CYBER dynasty should add 5% to speed', () => {
      const result = computeEffectiveStats(baseStats, 1, mockCyberDynasty);
      // speed = 10 * 1.0 * 1.05 = 10.5
      expect(result.speed).toBeCloseTo(10.5, 2);
      expect(result.size).toBe(5); // No bonus
      expect(result.hp).toBe(100); // No bonus
    });

    it('COSMIC dynasty should add 5% to size', () => {
      const result = computeEffectiveStats(baseStats, 1, mockCosmicDynasty);
      expect(result.speed).toBe(10); // No bonus
      expect(result.size).toBeCloseTo(5.25, 2); // size = 5 * 1.05 = 5.25
      expect(result.hp).toBe(100); // No bonus
    });

    it('PRIMAL dynasty bonus (dna_generation) should not affect stats', () => {
      const result = computeEffectiveStats(baseStats, 1, mockPrimalDynasty);
      expect(result.speed).toBe(10);
      expect(result.size).toBe(5);
      expect(result.hp).toBe(100);
    });
  });

  describe('Combined Scaling', () => {
    it('Gen 5 CYBER should combine generation and dynasty bonuses', () => {
      const result = computeEffectiveStats(baseStats, 5, mockCyberDynasty);
      // speed = 10 * 1.20 (gen) * 1.05 (dynasty) = 12.6
      expect(result.speed).toBeCloseTo(12.6, 2);
      expect(result.size).toBeCloseTo(6, 2); // Only gen scaling
      expect(result.hp).toBeCloseTo(120, 2); // Only gen scaling
    });
  });

  describe('Edge Cases', () => {
    it('should handle generation 0 (edge case)', () => {
      const result = computeEffectiveStats(baseStats, 0, mockPrimalDynasty);
      // Gen 0 multiplier = 1 + (0-1) * 0.05 = 0.95
      expect(result.speed).toBeCloseTo(9.5, 2);
    });

    it('should handle very high generations', () => {
      const result = computeEffectiveStats(baseStats, 100, mockPrimalDynasty);
      // Gen 100 multiplier = 1 + 99 * 0.05 = 5.95
      expect(result.speed).toBeCloseTo(59.5, 2);
    });

    it('should round to 2 decimal places', () => {
      const result = computeEffectiveStats(baseStats, 3, mockCyberDynasty);
      // Ensure no floating point issues
      expect(String(result.speed).split('.')[1]?.length || 0).toBeLessThanOrEqual(2);
    });
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
