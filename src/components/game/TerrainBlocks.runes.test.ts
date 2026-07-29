import { terrainRuneStrokes } from './TerrainBlocks';

describe('terrain causal runes', () => {
  it('maps each cause to a distinct Genome-derived silhouette', () => {
    expect(terrainRuneStrokes('cyber')).toHaveLength(3);
    expect(terrainRuneStrokes('fortress')).toHaveLength(3);
    expect(terrainRuneStrokes('cosmic')).toHaveLength(4);
    expect(terrainRuneStrokes('ladder')).toHaveLength(5);

    const serialized = ['cyber', 'fortress', 'cosmic', 'ladder'].map((source) =>
      JSON.stringify(
        terrainRuneStrokes(source as Parameters<typeof terrainRuneStrokes>[0])
      )
    );
    expect(new Set(serialized).size).toBe(4);
  });

  it('replaces COSMIC\'s ambiguous crossed bars with short broken portal arcs', () => {
    for (const stroke of terrainRuneStrokes('cosmic')) {
      const length = Math.hypot(stroke.x2 - stroke.x1, stroke.z2 - stroke.z1);
      expect(length).toBeLessThan(0.3);
    }
  });

  it('keeps every stroke inside the claimed board cell', () => {
    for (const source of ['cyber', 'fortress', 'cosmic', 'ladder'] as const) {
      for (const stroke of terrainRuneStrokes(source)) {
        for (const coordinate of [stroke.x1, stroke.z1, stroke.x2, stroke.z2]) {
          expect(Math.abs(coordinate)).toBeLessThanOrEqual(0.34);
        }
      }
    }
  });
});
