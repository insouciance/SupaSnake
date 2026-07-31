import { STRAIN_IDS } from '@/shared/game/strains';
import type { DynastyId } from '@/shared/types/game';
import {
  GAME_MATERIAL_PROFILES,
  getGameMaterialProfile,
} from './gameMaterialProfiles';

const DYNASTIES: readonly DynastyId[] = ['CYBER', 'PRIMAL', 'COSMIC'];

describe('renderer material profiles', () => {
  it('covers every active dynasty with a complete physical identity', () => {
    expect(Object.keys(GAME_MATERIAL_PROFILES).sort()).toEqual(
      [...DYNASTIES].sort()
    );

    for (const dynasty of DYNASTIES) {
      const profile = getGameMaterialProfile(dynasty);
      expect(profile.snake.baseColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(profile.snake.emissiveColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(profile.snake.headEmissiveIntensity).toBeGreaterThan(
        profile.snake.bodyEmissiveIntensity
      );
      expect(profile.snake.bodyAlbedoScalar).toBeGreaterThanOrEqual(0.8);
      // Fusion tone tops out at 1.1. The body remains under bloom even when
      // fully fused, while no longer reading as a translucent light volume.
      expect(profile.snake.bodyAlbedoScalar * 1.1).toBeLessThan(1);
      expect(profile.arena.edgeWashStrength).toBeLessThanOrEqual(0.5);
      expect(profile.lighting.objectiveColor).toBeTruthy();
    }
  });

  it('keeps the dynasties materially distinct, not merely recoloured', () => {
    const cyber = getGameMaterialProfile('CYBER').snake;
    const primal = getGameMaterialProfile('PRIMAL').snake;
    const cosmic = getGameMaterialProfile('COSMIC').snake;

    expect(cyber.headMetalness).toBeGreaterThan(cosmic.headMetalness);
    expect(cosmic.headMetalness).toBeGreaterThan(primal.headMetalness);
    expect(primal.bodyRoughness).toBeGreaterThan(cosmic.bodyRoughness);
    expect(cosmic.bodyRoughness).toBeGreaterThan(cyber.bodyRoughness);
  });

  it('does not accidentally alter the canonical Genome strain catalog', () => {
    // The profiles consume the colour language; they never create a sixth
    // strain/rune identity to decorate the arena.
    expect(STRAIN_IDS).toEqual(['AURUM', 'VOLT', 'FERAL', 'FLUX', 'UMBRA']);
  });
});
