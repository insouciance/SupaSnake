import type { DynastyId } from '@/shared/types/game';
import {
  GAME_SCREEN_COLORS,
  getDynastyScreenTokens,
} from './gameScreenTokens';

/**
 * Renderer-local material direction.
 *
 * `gameScreenTokens` remains the canonical semantic colour source shared by
 * DOM and WebGL. This layer answers the narrower rendering question: how does
 * each dynasty turn those colours into a physical surface? Keeping that
 * distinction here prevents the snake, arena lights, and chassis from slowly
 * rebuilding three unrelated theme systems.
 */
export interface SnakeSurfaceProfile {
  readonly baseColor: string;
  readonly emissiveColor: string;
  readonly headEmissiveIntensity: number;
  readonly bodyEmissiveIntensity: number;
  readonly headMetalness: number;
  readonly bodyMetalness: number;
  readonly headRoughness: number;
  readonly bodyRoughness: number;
  /** Keeps fusion-tone instance colours below bloom while retaining substance. */
  readonly bodyAlbedoScalar: number;
  readonly coilSealColor: string;
}

export interface ArenaSurfaceProfile {
  readonly atmosphereColor: string;
  readonly rimColor: string;
  readonly cornerColor: string;
  readonly undertrayRailColor: string;
  readonly undertrayCornerColor: string;
  readonly edgeWashStrength: number;
  readonly restingEmissiveIntensity: number;
  readonly restingPulseAmplitude: number;
  readonly pylonEmissiveIntensity: number;
}

export interface LightingProfile {
  readonly keyColor: string;
  readonly objectiveColor: string;
}

export interface GameMaterialProfile {
  readonly snake: SnakeSurfaceProfile;
  readonly arena: ArenaSurfaceProfile;
  readonly lighting: LightingProfile;
}

/** Electric blue belongs to the shared cyan/blue/yellow colour book, but is
 * deliberately renderer-local until it earns a semantic DOM role. */
export const ELECTRIC_BLUE = '#3f8cff';

const cyber = getDynastyScreenTokens('CYBER');
const primal = getDynastyScreenTokens('PRIMAL');
const cosmic = getDynastyScreenTokens('COSMIC');

export const GAME_MATERIAL_PROFILES: Record<DynastyId, GameMaterialProfile> = {
  CYBER: {
    snake: {
      baseColor: cyber.snake,
      emissiveColor: ELECTRIC_BLUE,
      headEmissiveIntensity: 0.68,
      bodyEmissiveIntensity: 0.3,
      headMetalness: 0.62,
      bodyMetalness: 0.24,
      headRoughness: 0.24,
      bodyRoughness: 0.52,
      bodyAlbedoScalar: 0.86,
      coilSealColor: GAME_SCREEN_COLORS.systemCyan,
    },
    arena: {
      atmosphereColor: cyber.primary,
      rimColor: ELECTRIC_BLUE,
      cornerColor: GAME_SCREEN_COLORS.systemCyan,
      undertrayRailColor: ELECTRIC_BLUE,
      undertrayCornerColor: cyber.primary,
      edgeWashStrength: 0.5,
      restingEmissiveIntensity: 0.2,
      restingPulseAmplitude: 0.045,
      pylonEmissiveIntensity: 0.3,
    },
    lighting: {
      keyColor: cyber.primary,
      objectiveColor: GAME_SCREEN_COLORS.systemCyan,
    },
  },
  PRIMAL: {
    snake: {
      baseColor: primal.snake,
      emissiveColor: primal.secondary,
      headEmissiveIntensity: 0.5,
      bodyEmissiveIntensity: 0.22,
      headMetalness: 0.1,
      bodyMetalness: 0.04,
      headRoughness: 0.5,
      bodyRoughness: 0.72,
      bodyAlbedoScalar: 0.88,
      coilSealColor: '#d8e879',
    },
    arena: {
      atmosphereColor: primal.primary,
      rimColor: primal.secondary,
      cornerColor: GAME_SCREEN_COLORS.systemCyan,
      undertrayRailColor: primal.primary,
      undertrayCornerColor: primal.secondary,
      edgeWashStrength: 0.42,
      restingEmissiveIntensity: 0.15,
      restingPulseAmplitude: 0.035,
      pylonEmissiveIntensity: 0.22,
    },
    lighting: {
      keyColor: primal.primary,
      objectiveColor: GAME_SCREEN_COLORS.systemCyan,
    },
  },
  COSMIC: {
    snake: {
      baseColor: cosmic.snake,
      emissiveColor: cosmic.secondary,
      headEmissiveIntensity: 0.58,
      bodyEmissiveIntensity: 0.25,
      headMetalness: 0.5,
      bodyMetalness: 0.18,
      headRoughness: 0.27,
      bodyRoughness: 0.55,
      bodyAlbedoScalar: 0.86,
      coilSealColor: cosmic.secondary,
    },
    arena: {
      atmosphereColor: cosmic.primary,
      rimColor: cosmic.secondary,
      cornerColor: cosmic.secondary,
      undertrayRailColor: cosmic.primary,
      undertrayCornerColor: cosmic.secondary,
      edgeWashStrength: 0.44,
      restingEmissiveIntensity: 0.14,
      restingPulseAmplitude: 0.03,
      pylonEmissiveIntensity: 0.24,
    },
    lighting: {
      keyColor: cosmic.primary,
      objectiveColor: GAME_SCREEN_COLORS.systemCyan,
    },
  },
};

export function getGameMaterialProfile(
  dynasty: DynastyId
): GameMaterialProfile {
  return GAME_MATERIAL_PROFILES[dynasty];
}
