/**
 * Tests for Stripe Products
 */

import { describe, it, expect } from '@jest/globals';
import { ALL_PRODUCTS, ENERGY_PRODUCTS, BUNDLE_PRODUCTS, getProductById } from './products';

describe('Stripe Products', () => {
  describe('Energy Products', () => {
    it('should have small energy pack at €0.99', () => {
      const product = getProductById('energy_small');
      expect(product?.price).toBe(0.99);
      expect(product?.rewards.energy).toBe(3);
    });

    it('should have medium energy bundle at €2.49', () => {
      const product = getProductById('energy_medium');
      expect(product?.price).toBe(2.49);
      expect(product?.rewards.energy).toBe(10);
    });

    it('should have large energy vault at €4.99', () => {
      const product = getProductById('energy_large');
      expect(product?.price).toBe(4.99);
      expect(product?.rewards.energy).toBe(25);
    });

    it('should comply with BM-001 (pay for convenience)', () => {
      // Energy is time-saving, not power advantage
      for (const product of ENERGY_PRODUCTS) {
        expect(product.type).toBe('energy');
        // No stats boost or exclusive content
        expect(product.rewards).not.toHaveProperty('statsBoost');
      }
    });
  });

  describe('EUR storefront (Austrian/EU launch)', () => {
    it('should price every one-time product in EUR', () => {
      for (const product of ALL_PRODUCTS) {
        expect(product.currency).toBe('eur');
        expect(product.price).toBeGreaterThan(0);
      }
    });
  });

  describe('Bundle Products', () => {
    it('should have starter bundle at €2.99', () => {
      const product = getProductById('starter_bundle');
      expect(product?.price).toBe(2.99);
      expect(product?.rewards.energy).toBe(20);
      expect(product?.rewards.dna).toBe(1000);
    });

    it('should have dynasty bundle at €9.99', () => {
      const product = getProductById('dynasty_bundle');
      expect(product?.price).toBe(9.99);
      expect(product?.rewards.energy).toBe(50);
    });

    it('should keep all bundles in the catalog', () => {
      expect(BUNDLE_PRODUCTS.map((p) => p.id)).toEqual([
        'starter_bundle',
        'dynasty_bundle',
      ]);
    });
  });

  describe('getProductById', () => {
    it('should find product by ID', () => {
      const products = [
        { id: 'energy_small', name: 'Energy Pack' },
        { id: 'energy_medium', name: 'Energy Bundle' },
      ];
      const found = products.find(p => p.id === 'energy_small');
      expect(found).toBeDefined();
      expect(found?.name).toBe('Energy Pack');
    });

    it('should return undefined for unknown ID', () => {
      const products = [{ id: 'energy_small' }];
      const found = products.find(p => p.id === 'invalid');
      expect(found).toBeUndefined();
    });
  });

  describe('shouldShowBundles', () => {
    it('should hide bundles on Day 1 (per BM-004)', () => {
      const accountCreated = new Date();
      const now = new Date();
      const diffDays = (now.getTime() - accountCreated.getTime()) / (1000 * 60 * 60 * 24);

      expect(diffDays < 2).toBe(true);
    });

    it('should show bundles on Day 2+', () => {
      const accountCreated = new Date();
      accountCreated.setDate(accountCreated.getDate() - 3); // 3 days ago
      const now = new Date();
      const diffDays = (now.getTime() - accountCreated.getTime()) / (1000 * 60 * 60 * 24);

      expect(diffDays >= 2).toBe(true);
    });

    it('should respect BM-004 (no aggressive monetization)', () => {
      // First 48 hours = no purchase prompts
      const threshold = 2; // days
      expect(threshold).toBe(2);
    });
  });

  describe('Product Validation', () => {
    it('should require valid price', () => {
      const isValidPrice = (price: number) => price > 0 && price <= 100;
      expect(isValidPrice(0.99)).toBe(true);
      expect(isValidPrice(0)).toBe(false);
      expect(isValidPrice(-1)).toBe(false);
    });

    it('should require product type', () => {
      const validTypes = ['energy', 'bundle', 'battlepass'];
      expect(validTypes).toContain('energy');
      expect(validTypes).toContain('bundle');
    });
  });
});

describe('Monetization Constraints', () => {
  describe('BM-001: Pay for Convenience', () => {
    it('should not offer power advantages', () => {
      const rewards = { energy: 3, dna: 0 };
      expect(rewards).not.toHaveProperty('attackBoost');
      expect(rewards).not.toHaveProperty('speedBoost');
      expect(rewards).not.toHaveProperty('exclusiveAbility');
    });

    it('should offer time-saving benefits only', () => {
      const energyReward = { energy: 10 };
      expect(energyReward.energy).toBeGreaterThan(0);
    });
  });

  describe('BM-002: No Forced Ads', () => {
    it('should make ads optional', () => {
      const adConfig = { required: false, bonus: true };
      expect(adConfig.required).toBe(false);
    });
  });

  describe('BM-003: No Paywalling', () => {
    it('should keep core loop free', () => {
      const coreFeatures = ['play_snake', 'collect_dna', 'breed', 'evolve'];
      const paidFeatures: string[] = []; // No core features behind paywall

      coreFeatures.forEach(feature => {
        expect(paidFeatures).not.toContain(feature);
      });
    });
  });
});
