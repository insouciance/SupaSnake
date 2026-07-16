/**
 * Tests for ThemeManager
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ThemeManager } from './ThemeManager';
import type { DynastyId } from '@/shared/types/game';

describe('ThemeManager', () => {
  let themeManager: ThemeManager;

  beforeEach(() => {
    themeManager = new ThemeManager();
  });

  describe('Dynasty Theme Retrieval', () => {
    it('should return CYBER theme', () => {
      const theme = themeManager.getTheme('CYBER');
      expect(theme.id).toBe('CYBER');
      expect(theme.primary).toBeDefined();
      expect(theme.secondary).toBeDefined();
    });

    it('should return PRIMAL theme', () => {
      const theme = themeManager.getTheme('PRIMAL');
      expect(theme.id).toBe('PRIMAL');
    });

    it('should return COSMIC theme', () => {
      const theme = themeManager.getTheme('COSMIC');
      expect(theme.id).toBe('COSMIC');
    });

    it('should have valid hex colors', () => {
      const dynasties: DynastyId[] = ['CYBER', 'PRIMAL', 'COSMIC'];
      dynasties.forEach(dynasty => {
        const theme = themeManager.getTheme(dynasty);
        expect(theme.primary).toMatch(/^#[0-9A-F]{6}$/i);
        expect(theme.secondary).toMatch(/^#[0-9A-F]{6}$/i);
        expect(theme.accent).toMatch(/^#[0-9A-F]{6}$/i);
      });
    });
  });

  describe('Color Conversion', () => {
    it('should convert hex to Three.js Color', () => {
      const color = themeManager.hexToThreeColor('#FF0000');
      expect(color).toHaveProperty('r');
      expect(color).toHaveProperty('g');
      expect(color).toHaveProperty('b');
      expect(color.r).toBeCloseTo(1, 2);
      expect(color.g).toBeCloseTo(0, 2);
      expect(color.b).toBeCloseTo(0, 2);
    });

    it('should handle different hex formats', () => {
      const color1 = themeManager.hexToThreeColor('#00FF00');
      expect(color1.g).toBeCloseTo(1, 2);

      const color2 = themeManager.hexToThreeColor('#0000FF');
      expect(color2.b).toBeCloseTo(1, 2);
    });
  });

  describe('Material Creation', () => {
    it('should create snake material for dynasty', () => {
      const material = themeManager.createSnakeMaterial('CYBER');
      expect(material).toBeDefined();
      expect(material.color).toBeDefined();
    });

    it('should create different materials for different dynasties', () => {
      const emberMaterial = themeManager.createSnakeMaterial('CYBER');
      const crystalMaterial = themeManager.createSnakeMaterial('PRIMAL');

      expect(emberMaterial.color).not.toEqual(crystalMaterial.color);
    });

    it('should create emissive materials', () => {
      const material = themeManager.createSnakeMaterial('CYBER');
      expect(material.emissive).toBeDefined();
      expect(material.emissiveIntensity).toBeGreaterThan(0);
    });
  });

  describe('Food Material Creation', () => {
    it('should create food material matching dynasty', () => {
      const material = themeManager.createFoodMaterial('PRIMAL');
      expect(material).toBeDefined();
      expect(material.color).toBeDefined();
    });

    it('should create glowing food material', () => {
      const material = themeManager.createFoodMaterial('COSMIC');
      expect(material.emissive).toBeDefined();
      expect(material.emissiveIntensity).toBeGreaterThan(0);
    });
  });

  describe('Particle System Colors', () => {
    it('should return particle colors for dynasty', () => {
      const colors = themeManager.getParticleColors('CYBER');
      expect(Array.isArray(colors)).toBe(true);
      expect(colors.length).toBeGreaterThan(0);
    });

    it('should return Three.js Color objects', () => {
      const colors = themeManager.getParticleColors('PRIMAL');
      colors.forEach(color => {
        expect(color).toHaveProperty('r');
        expect(color).toHaveProperty('g');
        expect(color).toHaveProperty('b');
      });
    });

    it('should provide multiple colors for variety', () => {
      const colors = themeManager.getParticleColors('COSMIC');
      expect(colors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Theme Caching', () => {
    it('should cache created materials', () => {
      const material1 = themeManager.createSnakeMaterial('CYBER');
      const material2 = themeManager.createSnakeMaterial('CYBER');
      expect(material1).toBe(material2);
    });

    it('should cache per dynasty', () => {
      const emberMat = themeManager.createSnakeMaterial('CYBER');
      const crystalMat = themeManager.createSnakeMaterial('PRIMAL');
      const emberMat2 = themeManager.createSnakeMaterial('CYBER');

      expect(emberMat).toBe(emberMat2);
      expect(emberMat).not.toBe(crystalMat);
    });
  });

  describe('Ambient Colors', () => {
    it('should provide ambient background color', () => {
      const color = themeManager.getAmbientColor('CYBER');
      expect(color).toMatch(/^#[0-9A-F]{6}$/i);
    });

    it('should have different ambient colors per dynasty', () => {
      const emberAmbient = themeManager.getAmbientColor('CYBER');
      const crystalAmbient = themeManager.getAmbientColor('PRIMAL');
      const voidAmbient = themeManager.getAmbientColor('COSMIC');

      expect(emberAmbient).not.toBe(crystalAmbient);
      expect(crystalAmbient).not.toBe(voidAmbient);
    });
  });
});
