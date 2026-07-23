'use client';

import type { DynastyId } from '@/shared/types/game';
import { ArenaFloor } from '@/components/game/ArenaFloor';
import { ArenaBorder } from '@/components/game/ArenaBorder';
import { ArenaUndertray } from '@/components/game/arena/ArenaUndertray';
import {
  GAME_SCREEN_COLORS,
  getDynastyScreenTokens,
} from '@/components/game/screen/gameScreenTokens';

interface ArenaAssemblyProps {
  gridSize: number;
  dynasty: DynastyId;
  fluxPhase?: 'open' | 'closed' | null;
  fluxTelegraph?: boolean;
}

/**
 * Cockpit-v1 arena visual assembly. It deliberately contains no gameplay
 * state beyond the existing semantic border phase.
 */
export function ArenaAssembly({
  gridSize,
  dynasty,
  fluxPhase = null,
  fluxTelegraph = false,
}: ArenaAssemblyProps) {
  const theme = getDynastyScreenTokens(dynasty);

  return (
    <group>
      <ArenaUndertray gridSize={gridSize} dynasty={dynasty} />
      <ArenaFloor
        gridSize={gridSize}
        floorColor={GAME_SCREEN_COLORS.arenaFloor}
        gridColor={GAME_SCREEN_COLORS.gridMinor}
        majorGridColor={GAME_SCREEN_COLORS.gridMajor}
        accentColor={theme.primary}
        surfacePreset="cockpit"
        edgeWashStrength={0.48}
        minorGridOpacity={0.28}
        majorGridOpacity={0.46}
        showCornerMarkers={false}
      />
      <ArenaBorder
        gridSize={gridSize}
        color={theme.secondary}
        accentColor={GAME_SCREEN_COLORS.systemCyan}
        emissiveIntensity={0.42}
        fluxPhase={fluxPhase}
        fluxTelegraph={fluxTelegraph}
        railHeight={0.13}
        railWidth={0.11}
        glowStrength={0.62}
        restingEmissiveIntensity={0.18}
        restingPulseAmplitude={0.05}
        pylonEmissiveIntensity={0.28}
      />
    </group>
  );
}

export default ArenaAssembly;
