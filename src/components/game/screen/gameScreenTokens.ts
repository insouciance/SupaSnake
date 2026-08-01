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
    primary: '#91d653',
    secondary: '#c8f57d',
    ambientCss: 'rgba(101, 171, 54, 0.34)',
    snake: '#98e15a',
  },
  CYBER: {
    primary: '#35e6ff',
    secondary: '#ff63df',
    ambientCss: 'rgba(0, 213, 240, 0.3)',
    snake: '#2de7ff',
  },
  COSMIC: {
    primary: '#ad83ff',
    secondary: '#ffd86a',
    ambientCss: 'rgba(133, 85, 225, 0.34)',
    snake: '#b58cff',
  },
};

export function getDynastyScreenTokens(dynasty: DynastyId): DynastyScreenTokens {
  return DYNASTY_SCREEN_TOKENS[dynasty];
}
