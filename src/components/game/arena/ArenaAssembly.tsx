'use client';

import type { DynastyId } from '@/shared/types/game';
import { ArenaFloor, EDGE_WASH_ON_STONE } from '@/components/game/ArenaFloor';
import { ArenaBorder } from '@/components/game/ArenaBorder';
import { ArenaUndertray } from '@/components/game/arena/ArenaUndertray';
import {
  ARENA_STONE,
  GAME_SCREEN_COLORS,
} from '@/components/game/screen/gameScreenTokens';
import { getGameMaterialProfile } from '@/components/game/screen/gameMaterialProfiles';
import type { BoardTheme } from '@/components/game/screen/boardThemes';
import { SEAM_DEPTH } from '@/components/game/screen/boardTiles';

interface ArenaAssemblyProps {
  gridSize: number;
  dynasty: DynastyId;
  torus?: boolean;
  /**
   * NEON DYNASTY THEMES (concept). This component is the ONE place where a
   * theme meets the arena, exactly as it is the one place a dynasty does.
   * `null` - the default, and every shipped path - renders the stone board.
   */
  boardTheme?: BoardTheme | null;
  /**
   * COMPARE TOGGLE (concept, dev fixture only). Restore the drawn seam the
   * line-free ruling retired - see `ArenaFloor.seamLines`. Themed board only.
   */
  boardSeamLines?: boolean;
}


/**
 * Cockpit-v1 arena visual assembly. It deliberately contains no gameplay
 * state beyond the existing semantic border phase.
 */
export function ArenaAssembly({
  gridSize,
  dynasty,
  torus = false,
  boardTheme = null,
  boardSeamLines = false,
}: ArenaAssemblyProps) {
  const profile = getGameMaterialProfile(dynasty);

  /**
   * PASS 5. A themed board is built from real blocks, so its slab is recessed
   * by one seam depth to keep the blocks' tops on the shipped play plane. That
   * is a fact about the STONE, and the two objects that stand on the stone -
   * the north rune engraved in the apron and the curb around it - have to know
   * it or they float. One number, resolved once, here: this component is
   * already the one place a theme meets the arena.
   */
  const apronY = boardTheme ? -SEAM_DEPTH : 0;

  return (
    <group>
      <ArenaUndertray gridSize={gridSize} dynasty={dynasty} apronY={apronY} />
      {/* The tile. `gridColor` is now the checker's finish and
          `majorGridColor` the lit wall of a carved groove - both are stone
          values, because the board is stone. A neon theme, when present,
          supersedes every one of them from inside ArenaFloor. */}
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
        neonTheme={boardTheme}
        seamLines={boardSeamLines}
      />
      {/* The rim: a stone curb cut from the same tile, roughly 3x the width
          and 1.8x the height of the rail it replaces. Its stone follows the
          board's, so a warm board never grows a cool slate frame. */}
      <ArenaBorder
        gridSize={gridSize}
        color={boardTheme?.rimTint ?? profile.arena.rimColor}
        emissiveIntensity={0.42}
        torus={torus}
        railHeight={0.24}
        railWidth={0.32}
        restingEmissiveIntensity={
          boardTheme?.rimEmissive ?? profile.arena.restingEmissiveIntensity
        }
        restingPulseAmplitude={
          boardTheme?.rimPulse ?? profile.arena.restingPulseAmplitude
        }
        stoneColor={boardTheme?.rimStone ?? ARENA_STONE.rim}
        tintAmount={boardTheme?.rimTintAmount}
        emissiveScale={boardTheme?.rimEmissiveScale}
        sink={-apronY}
      />
    </group>
  );
}

export default ArenaAssembly;
