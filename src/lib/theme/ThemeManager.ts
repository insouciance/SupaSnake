/**
 * ThemeManager - Dynasty Visual Themes
 * Manages colors, materials, and visual identity per dynasty
 */

import { Color, MeshStandardMaterial } from 'three';
import type { DynastyId } from '@/shared/types/game';
import { DYNASTIES_BY_ID } from '@/shared/data/dynasties';

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
    this.themes = {
      EMBER: {
        id: 'EMBER',
        name: 'EMBER',
        primary: '#FF4500',    // Orange-red
        secondary: '#FFD700',  // Gold
        accent: '#FF6347',     // Tomato
        ambient: '#1a0a00',    // Dark warm
      },
      CRYSTAL: {
        id: 'CRYSTAL',
        name: 'CRYSTAL',
        primary: '#00CED1',    // Dark turquoise
        secondary: '#E0FFFF',  // Light cyan
        accent: '#1E90FF',     // Dodger blue
        ambient: '#000a1a',    // Dark cool
      },
      VOID: {
        id: 'VOID',
        name: 'VOID',
        primary: '#4B0082',    // Indigo
        secondary: '#9370DB',  // Medium purple
        accent: '#8B00FF',     // Electric violet
        ambient: '#0a000a',    // Dark purple
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
