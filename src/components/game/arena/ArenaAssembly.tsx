'use client';

import type { DynastyId } from '@/shared/types/game';
import { ArenaFloor } from '@/components/game/ArenaFloor';
import { ArenaBorder } from '@/components/game/ArenaBorder';
import { ArenaUndertray } from '@/components/game/arena/ArenaUndertray';
import { GAME_SCREEN_COLORS } from '@/components/game/screen/gameScreenTokens';
import { getGameMaterialProfile } from '@/components/game/screen/gameMaterialProfiles';

interface ArenaAssemblyProps {
  gridSize: number;
  dynasty: DynastyId;
  torus?: boolean;
}

/**
 * Cockpit-v1 arena visual assembly. It deliberately contains no gameplay
 * state beyond the existing semantic border phase.
 */
export function ArenaAssembly({
  gridSize,
  dynasty,
  torus = false,
}: ArenaAssemblyProps) {
  const profile = getGameMaterialProfile(dynasty);

  return (
    <group>
      <ArenaUndertray gridSize={gridSize} dynasty={dynasty} />
      <ArenaFloor
        gridSize={gridSize}
        floorColor={GAME_SCREEN_COLORS.arenaFloor}
        gridColor={GAME_SCREEN_COLORS.gridMinor}
        majorGridColor={GAME_SCREEN_COLORS.gridMajor}
        accentColor={profile.arena.atmosphereColor}
        surfacePreset="cockpit"
        edgeWashStrength={profile.arena.edgeWashStrength}
        minorGridOpacity={0.28}
        majorGridOpacity={0.46}
        showCornerMarkers={false}
      />
      <ArenaBorder
        gridSize={gridSize}
        color={profile.arena.rimColor}
        accentColor={profile.arena.cornerColor}
        emissiveIntensity={0.42}
        torus={torus}
        railHeight={0.13}
        railWidth={0.11}
        glowStrength={0.62}
        restingEmissiveIntensity={profile.arena.restingEmissiveIntensity}
        restingPulseAmplitude={profile.arena.restingPulseAmplitude}
        pylonEmissiveIntensity={profile.arena.pylonEmissiveIntensity}
      />
    </group>
  );
}

export default ArenaAssembly;
