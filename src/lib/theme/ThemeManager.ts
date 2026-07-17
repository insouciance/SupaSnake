/**
 * ThemeManager - Dynasty Visual Themes
 * Manages colors, materials, and visual identity per dynasty
 */

import { Color, MeshStandardMaterial } from 'three';
import type { DynastyId } from '@/shared/types/game';

export interface DynastyTheme {
  id: DynastyId;
  name: string;
  primary: string;      // Hex color
  secondary: string;    // Hex color
  accent: string;       // Hex color
  ambient: string;      // Background ambient color
}

/**
 * ThemeManager Class
 * Singleton pattern for managing dynasty themes
 */
export class ThemeManager {
  private themes: Record<DynastyId, DynastyTheme>;
  private materialCache: Map<string, MeshStandardMaterial>;

  constructor() {
    this.materialCache = new Map();
    // Colors track src/hooks/useDynastyTheme.ts (Collection UI), brightened
    // where needed for 3D lighting contrast.
    this.themes = {
      CYBER: {
        id: 'CYBER',
        name: 'CYBER',
        primary: '#00FFFF',    // Cyan
        secondary: '#FF00FF',  // Magenta
        accent: '#00AAFF',     // Electric blue
        ambient: '#001a1a',    // Dark teal
      },
      PRIMAL: {
        id: 'PRIMAL',
        name: 'PRIMAL',
        // Brightened again (#4A7C2A -> #5A9636): with the snake base color
        // now mixed toward the void and the arena floor darkened to
        // #0b1016, the old forest green read muddy against the board.
        primary: '#5A9636',
        secondary: '#7CB342',  // Leaf green
        accent: '#9CCC65',     // Light lime
        ambient: '#0a1400',    // Dark moss
      },
      COSMIC: {
        id: 'COSMIC',
        name: 'COSMIC',
        primary: '#6A0DAD',    // Purple (brightened from #4a0e4e for 3D)
        secondary: '#FFD700',  // Gold
        accent: '#9B30FF',     // Bright violet
        ambient: '#0d0a1a',    // Dark space
      },
    };
  }

  /**
   * Get theme for a dynasty
   */
  getTheme(dynastyId: DynastyId): DynastyTheme {
    return this.themes[dynastyId];
  }

  /**
   * Convert hex color to Three.js Color
   */
  hexToThreeColor(hex: string): Color {
    return new Color(hex);
  }

  /**
   * Create snake material for dynasty
   */
  createSnakeMaterial(dynastyId: DynastyId): MeshStandardMaterial {
    const cacheKey = `snake_${dynastyId}`;
    if (this.materialCache.has(cacheKey)) {
      return this.materialCache.get(cacheKey)!;
    }

    const theme = this.getTheme(dynastyId);
    const material = new MeshStandardMaterial({
      color: this.hexToThreeColor(theme.primary),
      emissive: this.hexToThreeColor(theme.secondary),
      emissiveIntensity: 0.3,
      metalness: 0.5,
      roughness: 0.3,
    });

    this.materialCache.set(cacheKey, material);
    return material;
  }

  /**
   * Create food material for dynasty
   */
  createFoodMaterial(dynastyId: DynastyId): MeshStandardMaterial {
    const cacheKey = `food_${dynastyId}`;
    if (this.materialCache.has(cacheKey)) {
      return this.materialCache.get(cacheKey)!;
    }

    const theme = this.getTheme(dynastyId);
    const material = new MeshStandardMaterial({
      color: this.hexToThreeColor(theme.accent),
      emissive: this.hexToThreeColor(theme.accent),
      emissiveIntensity: 0.8,
      metalness: 0.8,
      roughness: 0.2,
    });

    this.materialCache.set(cacheKey, material);
    return material;
  }

  /**
   * Get particle colors for dynasty
   */
  getParticleColors(dynastyId: DynastyId): Color[] {
    const theme = this.getTheme(dynastyId);
    return [
      this.hexToThreeColor(theme.primary),
      this.hexToThreeColor(theme.secondary),
      this.hexToThreeColor(theme.accent),
    ];
  }

  /**
   * Get ambient background color
   */
  getAmbientColor(dynastyId: DynastyId): string {
    return this.getTheme(dynastyId).ambient;
  }

  /**
   * Clear material cache (for cleanup)
   */
  clearCache(): void {
    this.materialCache.forEach(material => material.dispose());
    this.materialCache.clear();
  }
}

/**
 * Singleton instance
 */
export const themeManager = new ThemeManager();
