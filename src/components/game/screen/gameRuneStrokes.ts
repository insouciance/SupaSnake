import type { StrainId } from '@/shared/game/strains';

/** Local-cell linework shared by gameplay terrain and the arena orientation
 * mark. These are the canonical Genome silhouettes, not decorative aliases. */
export interface GenomeRuneStroke {
  readonly x1: number;
  readonly z1: number;
  readonly x2: number;
  readonly z2: number;
  readonly width: number;
}

const GAME_RUNE_STROKES: Record<StrainId, readonly GenomeRuneStroke[]> = {
  VOLT: [
    { x1: 0.15, z1: -0.32, x2: -0.09, z2: -0.04, width: 0.075 },
    { x1: -0.09, z1: -0.04, x2: 0.09, z2: -0.04, width: 0.075 },
    { x1: 0.09, z1: -0.04, x2: -0.15, z2: 0.32, width: 0.075 },
  ],
  FERAL: [
    { x1: 0, z1: -0.3, x2: 0, z2: 0.3, width: 0.07 },
    { x1: -0.29, z1: -0.08, x2: 0, z2: 0.09, width: 0.07 },
    { x1: 0.29, z1: -0.08, x2: 0, z2: 0.09, width: 0.07 },
  ],
  FLUX: [
    { x1: -0.23, z1: -0.15, x2: -0.06, z2: -0.31, width: 0.065 },
    { x1: 0.06, z1: -0.31, x2: 0.23, z2: -0.15, width: 0.065 },
    { x1: 0.23, z1: 0.15, x2: 0.06, z2: 0.31, width: 0.065 },
    { x1: -0.06, z1: 0.31, x2: -0.23, z2: 0.15, width: 0.065 },
  ],
  AURUM: [
    { x1: 0, z1: -0.31, x2: 0.28, z2: -0.1, width: 0.06 },
    { x1: 0.28, z1: -0.1, x2: 0.17, z2: 0.28, width: 0.06 },
    { x1: 0.17, z1: 0.28, x2: -0.17, z2: 0.28, width: 0.06 },
    { x1: -0.17, z1: 0.28, x2: -0.28, z2: -0.1, width: 0.06 },
    { x1: -0.28, z1: -0.1, x2: 0, z2: -0.31, width: 0.06 },
  ],
  UMBRA: [
    { x1: -0.27, z1: -0.24, x2: 0.03, z2: -0.04, width: 0.065 },
    { x1: 0.03, z1: -0.04, x2: -0.27, z2: 0.24, width: 0.065 },
    { x1: 0.08, z1: -0.27, x2: 0.08, z2: 0.27, width: 0.065 },
    { x1: 0.08, z1: 0, x2: 0.29, z2: 0, width: 0.065 },
  ],
};

export function genomeRuneStrokes(
  strain: StrainId
): readonly GenomeRuneStroke[] {
  return GAME_RUNE_STROKES[strain];
}
