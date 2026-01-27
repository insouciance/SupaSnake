'use client';

/**
 * Dynasty Theme Hook - Provides theming values based on dynasty name
 * Used by Collection UI components for dynasty-specific styling
 */

import { useMemo } from 'react';

export interface DynastyTheme {
  primary: string;       // Main dynasty color
  secondary: string;     // Accent color
  gradient: string;      // CSS gradient string
  shadow: string;        // CSS box-shadow string
  textOnPrimary: string; // Readable text on primary
}

export const dynastyThemes: Record<string, DynastyTheme> = {
  CYBER: {
    primary: '#00FFFF',
    secondary: '#FF00FF',
    gradient: 'linear-gradient(135deg, #00FFFF 0%, #FF00FF 100%)',
    shadow: '0 4px 20px rgba(0, 255, 255, 0.3)',
    textOnPrimary: '#000000', // Black on cyan (light background)
  },
  PRIMAL: {
    primary: '#2d5016',
    secondary: '#8b4513',
    gradient: 'linear-gradient(135deg, #2d5016 0%, #8b4513 100%)',
    shadow: '0 4px 20px rgba(45, 80, 22, 0.3)',
    textOnPrimary: '#FFFFFF', // White on dark green
  },
  COSMIC: {
    primary: '#4a0e4e',
    secondary: '#ffd700',
    gradient: 'linear-gradient(135deg, #4a0e4e 0%, #ffd700 100%)',
    shadow: '0 4px 20px rgba(74, 14, 78, 0.3)',
    textOnPrimary: '#FFFFFF', // White on dark purple
  },
};

/**
 * Returns theme values for a given dynasty name
 * Defaults to CYBER theme if dynasty is unknown
 */
export function useDynastyTheme(dynastyName: string): DynastyTheme {
  return useMemo(() => {
    const normalizedName = dynastyName?.toUpperCase() ?? '';
    return dynastyThemes[normalizedName] ?? dynastyThemes.CYBER;
  }, [dynastyName]);
}
