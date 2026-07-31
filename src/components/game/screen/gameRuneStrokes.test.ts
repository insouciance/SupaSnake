import { STRAIN_IDS } from '@/shared/game/strains';
import { genomeRuneStrokes } from './gameRuneStrokes';

describe('canonical renderer Genome runes', () => {
  it('covers every canonical strain with a distinct silhouette', () => {
    const serialized = STRAIN_IDS.map((strain) => {
      const strokes = genomeRuneStrokes(strain);
      expect(strokes.length).toBeGreaterThanOrEqual(3);
      return JSON.stringify(strokes);
    });
    expect(new Set(serialized).size).toBe(STRAIN_IDS.length);
  });

  it('keeps every stroke inside one local design cell', () => {
    for (const strain of STRAIN_IDS) {
      for (const stroke of genomeRuneStrokes(strain)) {
        for (const coordinate of [stroke.x1, stroke.z1, stroke.x2, stroke.z2]) {
          expect(Math.abs(coordinate)).toBeLessThanOrEqual(0.34);
        }
      }
    }
  });
});
