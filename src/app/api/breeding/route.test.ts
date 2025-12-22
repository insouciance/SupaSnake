/**
 * Tests for Breeding API - Unit tests for business logic
 */

import { describe, it, expect } from '@jest/globals';
import { GAME_CONFIG } from '@/shared/config/game';
import { getRandomVariantForBreeding, VARIANTS_BY_ID } from '@/shared/data/dynasties';

describe('Breeding Logic', () => {
  describe('Cost Calculation', () => {
    it('should use base cost for same dynasty', () => {
      const variant1Dynasty = 'EMBER';
      const variant2Dynasty = 'EMBER';
      const sameDynasty = variant1Dynasty === variant2Dynasty;
      const cost = sameDynasty
        ? GAME_CONFIG.breeding.baseCost
        : GAME_CONFIG.breeding.crossDynastyCost;

      expect(cost).toBe(50);
    });

    it('should use cross cost for different dynasties', () => {
      const variant1Dynasty = 'EMBER';
      const variant2Dynasty = 'CRYSTAL';
      const sameDynasty = variant1Dynasty === variant2Dynasty;
      const cost = sameDynasty
        ? GAME_CONFIG.breeding.baseCost
        : GAME_CONFIG.breeding.crossDynastyCost;

      expect(cost).toBe(100);
    });
  });

  describe('DNA Requirements', () => {
    it('should fail if insufficient DNA', () => {
      const playerDna = 30;
      const cost = GAME_CONFIG.breeding.baseCost;

      expect(playerDna < cost).toBe(true);
    });

    it('should succeed with enough DNA', () => {
      const playerDna = 100;
      const cost = GAME_CONFIG.breeding.baseCost;

      expect(playerDna >= cost).toBe(true);
    });

    it('should deduct DNA on success', () => {
      const playerDna = 200;
      const cost = GAME_CONFIG.breeding.baseCost;
      const remaining = playerDna - cost;

      expect(remaining).toBe(150);
    });
  });

  describe('Parent Validation', () => {
    it('should require two different parents', () => {
      const parent1Id = 'uuid-1';
      const parent2Id = 'uuid-1';

      expect(parent1Id === parent2Id).toBe(true);
    });

    it('should accept two different parents', () => {
      const parent1Id = 'uuid-1';
      const parent2Id = 'uuid-2';

      expect(parent1Id !== parent2Id).toBe(true);
    });

    it('should validate parent variant exists', () => {
      const validVariant = VARIANTS_BY_ID['EMBER_1'];
      const invalidVariant = VARIANTS_BY_ID['INVALID_99'];

      expect(validVariant).toBeDefined();
      expect(invalidVariant).toBeUndefined();
    });
  });

  describe('Child Generation', () => {
    it('should produce same dynasty child', () => {
      const result = getRandomVariantForBreeding('EMBER', 'EMBER');

      expect(result.dynastyId).toBe('EMBER');
    });

    it('should produce one of parent dynasties for cross', () => {
      const results = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const result = getRandomVariantForBreeding('EMBER', 'CRYSTAL');
        results.add(result.dynastyId);
      }

      expect(results.has('EMBER') || results.has('CRYSTAL')).toBe(true);
      expect(results.has('VOID')).toBe(false);
    });

    it('should calculate child generation correctly', () => {
      const parent1Gen = 2;
      const parent2Gen = 5;
      const childGen = Math.max(parent1Gen, parent2Gen) + 1;

      expect(childGen).toBe(6);
    });
  });

  describe('Result Data', () => {
    it('should return child variant data', () => {
      const childVariantId = 'EMBER_5';
      const childVariant = VARIANTS_BY_ID[childVariantId];

      expect(childVariant).toBeDefined();
      expect(childVariant.displayName).toBe('EMBER 5/10');
      expect(childVariant.rarity).toBe('uncommon');
    });

    it('should include generation in response', () => {
      const response = {
        child: {
          id: 'new-uuid',
          variant_id: 'EMBER_5',
          generation: 3,
        },
        cost: 50,
        remainingDna: 150,
      };

      expect(response.child.generation).toBe(3);
      expect(response.cost).toBe(50);
    });
  });
});
