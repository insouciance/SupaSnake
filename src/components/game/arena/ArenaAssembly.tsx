'use client';

import type { DynastyId } from '@/shared/types/game';
import { ArenaFloor } from '@/components/game/ArenaFloor';
import { ArenaBorder } from '@/components/game/ArenaBorder';
import { ArenaUndertray } from '@/components/game/arena/ArenaUndertray';
import {
  ARENA_STONE,
  GAME_SCREEN_COLORS,
} from '@/components/game/screen/gameScreenTokens';
import { getGameMaterialProfile } from '@/components/game/screen/gameMaterialProfiles';

interface ArenaAssemblyProps {
  gridSize: number;
  dynasty: DynastyId;
  torus?: boolean;
}

/**
 * How much of the profile's dynasty edge wash survives on a stone board.
 *
 * The wash was authored against a near-black plane, where it read as the
 * board's edge being lit. On the slab it read as a 4-cell-wide painted frame
 * inside the playfield - on PRIMAL, a bright olive one - which is the single
 * loudest thing fighting "a fine slab of stone". The rim now carries dynasty
 * identity in its own tint and emissive, so the wash only has to be the
 * atmosphere it always claimed to be.
 */
const EDGE_WASH_ON_STONE = 0.25;

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
      {/* The tile. `gridColor` is now the checker's finish and
          `majorGridColor` the lit wall of a carved groove - both are stone
          values, because the board is stone. */}
      <ArenaFloor
        gridSize={gridSize}
        floorColor={GAME_SCREEN_COLORS.arenaFloor}
        gridColor={ARENA_STONE.checker}
        majorGridColor={ARENA_STONE.cut}
        accentColor={profile.arena.atmosphereColor}
        surfacePreset="cockpit"
        edgeWashStrength={profile.arena.edgeWashStrength * EDGE_WASH_ON_STONE}
        minorGridOpacity={0.4}
        majorGridOpacity={0.58}
      />
      {/* The rim: a stone curb cut from the same tile, roughly 3x the width
          and 1.8x the height of the rail it replaces. */}
      <ArenaBorder
        gridSize={gridSize}
        color={profile.arena.rimColor}
        emissiveIntensity={0.42}
        torus={torus}
        railHeight={0.24}
        railWidth={0.32}
        restingEmissiveIntensity={profile.arena.restingEmissiveIntensity}
        restingPulseAmplitude={profile.arena.restingPulseAmplitude}
      />
    </group>
  );
}

export default ArenaAssembly;
