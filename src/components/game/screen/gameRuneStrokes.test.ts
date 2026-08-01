import { STRAIN_IDS } from '@/shared/game/strains';
import { genomeRuneEngravingStrokes } from './gameRuneStrokes';

describe('bounded WebGL engravings derived from canonical Genome runes', () => {
  it('covers every canonical strain with a distinct recognition silhouette', () => {
    const serialized = STRAIN_IDS.map((strain) => {
      const strokes = genomeRuneEngravingStrokes(strain);
      expect(strokes.length).toBeGreaterThanOrEqual(3);
      return JSON.stringify(strokes);
    });
    expect(new Set(serialized).size).toBe(STRAIN_IDS.length);
  });

  it('keeps every stroke inside one local design cell', () => {
    for (const strain of STRAIN_IDS) {
      for (const stroke of genomeRuneEngravingStrokes(strain)) {
        for (const coordinate of [stroke.x1, stroke.z1, stroke.x2, stroke.z2]) {
          expect(Math.abs(coordinate)).toBeLessThanOrEqual(0.34);
        }
      }
    }
  });
});
