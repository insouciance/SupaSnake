/**
 * Tests for Dynasty Data System
 */

import { describe, it, expect } from '@jest/globals';
import {
  ALL_DYNASTIES,
  DYNASTIES_BY_ID,
  ALL_VARIANTS,
  VARIANTS_BY_ID,
  STARTER_VARIANTS,
  getRandomVariantForBreeding,
  getRarityForVariant,
  getStatsForRarity,
  createVariant,
} from './dynasties';
import { Rarity } from '../types/game';

describe('Dynasty Data', () => {
  describe('Helper Functions', () => {
    describe('getRarityForVariant', () => {
      it('should return common for variants 1-3', () => {
        expect(getRarityForVariant(1)).toBe('common');
        expect(getRarityForVariant(2)).toBe('common');
        expect(getRarityForVariant(3)).toBe('common');
      });

      it('should return uncommon for variants 4-6', () => {
        expect(getRarityForVariant(4)).toBe('uncommon');
        expect(getRarityForVariant(5)).toBe('uncommon');
        expect(getRarityForVariant(6)).toBe('uncommon');
      });

      it('should return rare for variants 7-8', () => {
        expect(getRarityForVariant(7)).toBe('rare');
        expect(getRarityForVariant(8)).toBe('rare');
      });

      it('should return epic for variant 9', () => {
        expect(getRarityForVariant(9)).toBe('epic');
      });

      it('should return legendary for variant 10', () => {
        expect(getRarityForVariant(10)).toBe('legendary');
      });

      it('should handle edge case 0', () => {
        expect(getRarityForVariant(0)).toBe('common');
      });

      it('should handle values greater than 10', () => {
        expect(getRarityForVariant(11)).toBe('legendary');
        expect(getRarityForVariant(100)).toBe('legendary');
      });
    });

    describe('getStatsForRarity', () => {
      it('should return zero bonuses for common', () => {
        const stats = getStatsForRarity('common');
        expect(stats.dnaBonus).toBe(0.0);
        expect(stats.speedBonus).toBe(0.0);
        expect(stats.sizeBonus).toBe(0);
      });

      it('should return correct bonuses for uncommon', () => {
        const stats = getStatsForRarity('uncommon');
        expect(stats.dnaBonus).toBe(0.1);
        expect(stats.speedBonus).toBe(0.05);
        expect(stats.sizeBonus).toBe(0);
      });

      it('should return correct bonuses for rare', () => {
        const stats = getStatsForRarity('rare');
        expect(stats.dnaBonus).toBe(0.25);
        expect(stats.speedBonus).toBe(0.1);
        expect(stats.sizeBonus).toBe(1);
      });

      it('should return correct bonuses for epic', () => {
        const stats = getStatsForRarity('epic');
        expect(stats.dnaBonus).toBe(0.5);
        expect(stats.speedBonus).toBe(0.15);
        expect(stats.sizeBonus).toBe(1);
      });

      it('should return max bonuses for legendary', () => {
        const stats = getStatsForRarity('legendary');
        expect(stats.dnaBonus).toBe(1.0);
        expect(stats.speedBonus).toBe(0.25);
        expect(stats.sizeBonus).toBe(2);
      });

      it('should have increasing dnaBonus by rarity', () => {
        const rarities: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
        const bonuses = rarities.map(r => getStatsForRarity(r).dnaBonus);
        for (let i = 1; i < bonuses.length; i++) {
          expect(bonuses[i]).toBeGreaterThan(bonuses[i - 1]);
        }
      });
    });

    describe('createVariant', () => {
      it('should create valid variant with correct properties', () => {
        const variant = createVariant('EMBER', 1, '#FF0000', '#FFD700');
        expect(variant.id).toBe('EMBER_1');
        expect(variant.dynastyId).toBe('EMBER');
        expect(variant.variantNumber).toBe(1);
        expect(variant.totalInDynasty).toBe(10);
        expect(variant.displayName).toBe('EMBER 1/10');
        expect(variant.colorPrimary).toBe('#FF0000');
        expect(variant.colorSecondary).toBe('#FFD700');
      });

      it('should assign correct rarity based on variant number', () => {
        const variant1 = createVariant('CRYSTAL', 1, '#000000', '#FFFFFF');
        expect(variant1.rarity).toBe('common');

        const variant5 = createVariant('CRYSTAL', 5, '#000000', '#FFFFFF');
        expect(variant5.rarity).toBe('uncommon');

        const variant10 = createVariant('CRYSTAL', 10, '#000000', '#FFFFFF');
        expect(variant10.rarity).toBe('legendary');
      });

      it('should assign stats matching the rarity', () => {
        const variant = createVariant('VOID', 10, '#000000', '#FFFFFF');
        expect(variant.rarity).toBe('legendary');
        expect(variant.stats.dnaBonus).toBe(1.0);
        expect(variant.stats.speedBonus).toBe(0.25);
        expect(variant.stats.sizeBonus).toBe(2);
      });

      it('should generate description', () => {
        const variant = createVariant('EMBER', 5, '#000000', '#FFFFFF');
        expect(variant.description).toBeTruthy();
        expect(variant.description.length).toBeGreaterThan(0);
        expect(variant.description).toContain('EMBER');
      });

      it('should create variants for all dynasties', () => {
        const ember = createVariant('EMBER', 1, '#FF0000', '#FFD700');
        const crystal = createVariant('CRYSTAL', 1, '#00CED1', '#E0FFFF');
        const void_ = createVariant('VOID', 1, '#4B0082', '#9370DB');

        expect(ember.dynastyId).toBe('EMBER');
        expect(crystal.dynastyId).toBe('CRYSTAL');
        expect(void_.dynastyId).toBe('VOID');
      });
    });
  });

  describe('Data Structure Validation', () => {
    it('should have exactly 3 dynasties', () => {
      expect(ALL_DYNASTIES).toHaveLength(3);
    });

    it('should have exactly 30 variants (3 × 10)', () => {
      expect(ALL_VARIANTS).toHaveLength(30);
    });

    it('each dynasty should have 10 variants', () => {
      ALL_DYNASTIES.forEach(dynasty => {
        expect(dynasty.variants).toHaveLength(10);
      });
    });

    it('should have EMBER, CRYSTAL, VOID dynasties', () => {
      const dynastyIds = ALL_DYNASTIES.map(d => d.id);
      expect(dynastyIds).toContain('EMBER');
      expect(dynastyIds).toContain('CRYSTAL');
      expect(dynastyIds).toContain('VOID');
    });
  });

  describe('Rarity Distribution', () => {
    it('variants 1-3 should be common', () => {
      ALL_DYNASTIES.forEach(dynasty => {
        const commonVariants = dynasty.variants.slice(0, 3);
        commonVariants.forEach(v => {
          expect(v.rarity).toBe('common');
        });
      });
    });

    it('variants 4-6 should be uncommon', () => {
      ALL_DYNASTIES.forEach(dynasty => {
        const uncommonVariants = dynasty.variants.slice(3, 6);
        uncommonVariants.forEach(v => {
          expect(v.rarity).toBe('uncommon');
        });
      });
    });

    it('variants 7-8 should be rare', () => {
      ALL_DYNASTIES.forEach(dynasty => {
        const rareVariants = dynasty.variants.slice(6, 8);
        rareVariants.forEach(v => {
          expect(v.rarity).toBe('rare');
        });
      });
    });

    it('variant 9 should be epic', () => {
      ALL_DYNASTIES.forEach(dynasty => {
        expect(dynasty.variants[8].rarity).toBe('epic');
      });
    });

    it('variant 10 should be legendary', () => {
      ALL_DYNASTIES.forEach(dynasty => {
        expect(dynasty.variants[9].rarity).toBe('legendary');
      });
    });
  });

  describe('Variant Naming', () => {
    it('should use n/N format for display names', () => {
      const emberVariant = VARIANTS_BY_ID['EMBER_1'];
      expect(emberVariant.displayName).toBe('EMBER 1/10');

      const crystalVariant = VARIANTS_BY_ID['CRYSTAL_5'];
      expect(crystalVariant.displayName).toBe('CRYSTAL 5/10');
    });

    it('should have correct variant IDs', () => {
      expect(VARIANTS_BY_ID['EMBER_1']).toBeDefined();
      expect(VARIANTS_BY_ID['CRYSTAL_10']).toBeDefined();
      expect(VARIANTS_BY_ID['VOID_5']).toBeDefined();
    });

    it('all variants should have correct totalInDynasty', () => {
      ALL_VARIANTS.forEach(variant => {
        expect(variant.totalInDynasty).toBe(10);
      });
    });
  });

  describe('Stats Progression', () => {
    it('common variants should have zero bonuses', () => {
      const commonVariant = VARIANTS_BY_ID['EMBER_1'];
      expect(commonVariant.stats.dnaBonus).toBe(0.0);
      expect(commonVariant.stats.speedBonus).toBe(0.0);
      expect(commonVariant.stats.sizeBonus).toBe(0);
    });

    it('legendary variants should have max bonuses', () => {
      const legendaryVariant = VARIANTS_BY_ID['EMBER_10'];
      expect(legendaryVariant.stats.dnaBonus).toBe(1.0);
      expect(legendaryVariant.stats.speedBonus).toBe(0.25);
      expect(legendaryVariant.stats.sizeBonus).toBe(2);
    });

    it('stats should increase with rarity', () => {
      const common = VARIANTS_BY_ID['EMBER_1'];
      const uncommon = VARIANTS_BY_ID['EMBER_4'];
      const rare = VARIANTS_BY_ID['EMBER_7'];
      const epic = VARIANTS_BY_ID['EMBER_9'];
      const legendary = VARIANTS_BY_ID['EMBER_10'];

      expect(common.stats.dnaBonus).toBeLessThan(uncommon.stats.dnaBonus);
      expect(uncommon.stats.dnaBonus).toBeLessThan(rare.stats.dnaBonus);
      expect(rare.stats.dnaBonus).toBeLessThan(epic.stats.dnaBonus);
      expect(epic.stats.dnaBonus).toBeLessThan(legendary.stats.dnaBonus);
    });
  });

  describe('Color System', () => {
    it('all variants should have primary and secondary colors', () => {
      ALL_VARIANTS.forEach(variant => {
        expect(variant.colorPrimary).toMatch(/^#[0-9A-F]{6}$/i);
        expect(variant.colorSecondary).toMatch(/^#[0-9A-F]{6}$/i);
      });
    });

    it('dynasties should have brand colors', () => {
      ALL_DYNASTIES.forEach(dynasty => {
        expect(dynasty.colorPrimary).toMatch(/^#[0-9A-F]{6}$/i);
      });
    });
  });

  describe('Lookup Maps', () => {
    it('DYNASTIES_BY_ID should have all dynasties', () => {
      expect(DYNASTIES_BY_ID.EMBER).toBeDefined();
      expect(DYNASTIES_BY_ID.CRYSTAL).toBeDefined();
      expect(DYNASTIES_BY_ID.VOID).toBeDefined();
    });

    it('VARIANTS_BY_ID should have all 30 variants', () => {
      expect(Object.keys(VARIANTS_BY_ID)).toHaveLength(30);
    });

    it('lookup maps should match original data', () => {
      const emberFromMap = DYNASTIES_BY_ID.EMBER;
      const emberFromArray = ALL_DYNASTIES.find(d => d.id === 'EMBER');
      expect(emberFromMap).toBe(emberFromArray);
    });
  });

  describe('Starter Content', () => {
    it('should provide at least 1 starter snake', () => {
      expect(STARTER_VARIANTS.length).toBeGreaterThan(0);
    });

    it('starter snakes should be common rarity', () => {
      STARTER_VARIANTS.forEach(variant => {
        expect(variant.rarity).toBe('common');
      });
    });

    it('should start with EMBER 1/10', () => {
      const starter = STARTER_VARIANTS[0];
      expect(starter.id).toBe('EMBER_1');
      expect(starter.displayName).toBe('EMBER 1/10');
    });
  });

  describe('Breeding System', () => {
    it('same dynasty breeding should return that dynasty', () => {
      const results = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const result = getRandomVariantForBreeding('EMBER', 'EMBER');
        results.add(result.dynastyId);
      }
      expect(results.size).toBe(1);
      expect(results.has('EMBER')).toBe(true);
    });

    it('cross-dynasty breeding should return one of parent dynasties', () => {
      const results = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const result = getRandomVariantForBreeding('EMBER', 'CRYSTAL');
        results.add(result.dynastyId);
      }
      expect(results.has('EMBER') || results.has('CRYSTAL')).toBe(true);
      expect(results.has('VOID')).toBe(false);
    });

    it('breeding should return valid variants', () => {
      for (let i = 0; i < 20; i++) {
        const result = getRandomVariantForBreeding('CRYSTAL', 'VOID');
        expect(result.variantNumber).toBeGreaterThanOrEqual(1);
        expect(result.variantNumber).toBeLessThanOrEqual(10);
        expect(['CRYSTAL', 'VOID']).toContain(result.dynastyId);
      }
    });
  });

  describe('Data Completeness', () => {
    it('all variants should have descriptions', () => {
      ALL_VARIANTS.forEach(variant => {
        expect(variant.description).toBeTruthy();
        expect(variant.description.length).toBeGreaterThan(10);
      });
    });

    it('all dynasties should have themes', () => {
      ALL_DYNASTIES.forEach(dynasty => {
        expect(dynasty.theme).toBeTruthy();
      });
    });

    it('variant numbers should be sequential 1-10', () => {
      ALL_DYNASTIES.forEach(dynasty => {
        const numbers = dynasty.variants.map(v => v.variantNumber);
        expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      });
    });
  });
});
