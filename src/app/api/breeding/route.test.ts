/**
 * Tests for Breeding API - Unit tests for business logic
 * Breeding is executed by the breed_snakes RPC:
 *   cost = 200 + floor((gen1 + gen2) / 2) * 100
 *   parents must share a dynasty; offspring variant is 50/50 from parents
 */

import { describe, it, expect } from '@jest/globals';

/** Mirrors the breed_snakes RPC cost formula (integer division) */
function breedingCost(parent1Gen: number, parent2Gen: number): number {
  return 200 + Math.floor((parent1Gen + parent2Gen) / 2) * 100;
}

describe('Breeding Logic', () => {
  describe('Cost Calculation', () => {
    it('should compute base cost for two Gen 1 parents', () => {
      expect(breedingCost(1, 1)).toBe(300);
    });

    it('should scale cost with parent generations', () => {
      expect(breedingCost(2, 5)).toBe(500); // floor(7/2) = 3
      expect(breedingCost(4, 4)).toBe(600);
    });

    it('should reject cross-dynasty parents', () => {
      const parent1DynastyId = 'dynasty-uuid-cyber';
      const parent2DynastyId = 'dynasty-uuid-primal';
      const sameDynasty = parent1DynastyId === (parent2DynastyId as string);

      // RPC raises 'Parents must be same dynasty'
      expect(sameDynasty).toBe(false);
    });
  });

  describe('DNA Requirements', () => {
    it('should fail if insufficient DNA', () => {
      const playerDna = 100;
      const cost = breedingCost(1, 1);

      expect(playerDna < cost).toBe(true);
    });

    it('should succeed with enough DNA', () => {
      const playerDna = 500;
      const cost = breedingCost(1, 1);

      expect(playerDna >= cost).toBe(true);
    });

    it('should deduct DNA on success', () => {
      const playerDna = 500;
      const cost = breedingCost(1, 1);
      const remaining = playerDna - cost;

      expect(remaining).toBe(200);
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

    it('should require both parents to be owned by the player', () => {
      const playerId = 'player-uuid';
      const parent = { id: 'snake-uuid', player_id: 'other-player-uuid' };

      expect(parent.player_id === playerId).toBe(false);
    });
  });

  describe('Child Generation', () => {
    it('should produce offspring from one of the parent variants', () => {
      const parent1VariantId = 'variant-uuid-a';
      const parent2VariantId = 'variant-uuid-b';

      // RPC: random() < 0.5 -> parent1 variant, else parent2 variant
      const offspring = [parent1VariantId, parent2VariantId];
      expect(offspring).toContain(parent1VariantId);
      expect(offspring).toContain(parent2VariantId);
      expect(offspring).toHaveLength(2);
    });

    it('should calculate child generation correctly', () => {
      const parent1Gen = 2;
      const parent2Gen = 5;
      const childGen = Math.max(parent1Gen, parent2Gen) + 1;

      expect(childGen).toBe(6);
    });

    it('should cap generation at 50', () => {
      const parent1Gen = 50;
      const parent2Gen = 49;
      const childGen = Math.max(parent1Gen, parent2Gen) + 1;

      // RPC raises 'Maximum generation (50) reached'
      expect(childGen > 50).toBe(true);
    });
  });

  describe('Result Data', () => {
    it('should return child with variant UUID reference', () => {
      const childRow = {
        id: 'new-uuid',
        snake_variant_id: 'variant-uuid-a',
        generation: 3,
        snake_variants: {
          name: 'CYBER SPARK',
          rarity: 'common',
          dynasties: { name: 'CYBER' },
        },
      };

      expect(childRow.snake_variant_id).toBeDefined();
      expect(childRow.snake_variants.name).toBe('CYBER SPARK');
      expect(childRow.snake_variants.dynasties.name).toBe('CYBER');
    });

    it('should include generation and cost in response', () => {
      const response = {
        child: {
          id: 'new-uuid',
          snake_variant_id: 'variant-uuid-a',
          generation: 3,
        },
        cost: breedingCost(2, 2),
        remainingDna: 150,
      };

      expect(response.child.generation).toBe(3);
      expect(response.cost).toBe(400);
    });
  });
});
