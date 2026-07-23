import type { DynastyId } from '@/shared/types/game';

/**
 * Shared game-screen colors. DOM cockpit CSS variables and Three.js arena
 * materials consume the same values so the two renderers feel authored as one
 * screen. Semantic gameplay colors do not change with dynasty.
 */
export const GAME_SCREEN_COLORS = {
  void: '#030609',
  graphiteDeep: '#070c12',
  graphite: '#0b121a',
  graphiteLifted: '#121d28',
  graphiteEdge: '#213143',
  arenaFloor: '#0c141d',
  gridMinor: '#496278',
  gridMajor: '#87bada',
  systemCyan: '#67e8f9',
  secureGold: '#f5c85b',
  dangerRose: '#fb7185',
  bone: '#edf5fb',
  muted: '#8fa3b6',
} as const;

export interface DynastyScreenTokens {
  primary: string;
  secondary: string;
  ambientCss: string;
  snake: string;
}

export const DYNASTY_SCREEN_TOKENS: Record<DynastyId, DynastyScreenTokens> = {
  PRIMAL: {
    primary: '#7fbd48',
    secondary: '#b5e36d',
    ambientCss: 'rgba(84, 140, 47, 0.34)',
    snake: '#78b843',
  },
  CYBER: {
    primary: '#22d3ee',
    secondary: '#f055d7',
    ambientCss: 'rgba(0, 198, 224, 0.28)',
    snake: '#18cde5',
  },
  COSMIC: {
    primary: '#9b6bff',
    secondary: '#f5c85b',
    ambientCss: 'rgba(112, 66, 196, 0.34)',
    snake: '#8e63e9',
  },
};

export function getDynastyScreenTokens(dynasty: DynastyId): DynastyScreenTokens {
  return DYNASTY_SCREEN_TOKENS[dynasty];
}
