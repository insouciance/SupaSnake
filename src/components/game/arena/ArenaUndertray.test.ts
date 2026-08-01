import { arenaOrientationRuneLayout } from './ArenaUndertray';

describe('arena Genome orientation rune', () => {
  it('uses one distinct canonical mark per dynasty', () => {
    const serialized = ['CYBER', 'PRIMAL', 'COSMIC'].map((dynasty) =>
      JSON.stringify(
        arenaOrientationRuneLayout(
          20,
          dynasty as Parameters<typeof arenaOrientationRuneLayout>[1]
        )
      )
    );
    expect(new Set(serialized).size).toBe(3);
  });

  it('stays outside the playable board and inside the north undertray edge', () => {
    for (const dynasty of ['CYBER', 'PRIMAL', 'COSMIC'] as const) {
      const strokes = arenaOrientationRuneLayout(20, dynasty);
      expect(strokes.length).toBeLessThanOrEqual(5);
      for (const stroke of strokes) {
        const half = stroke.length / 2;
        expect(stroke.z + half).toBeLessThan(0);
        expect(stroke.z - half).toBeGreaterThan(-1.3);
        expect(stroke.x - half).toBeGreaterThan(0);
        expect(stroke.x + half).toBeLessThan(20);
      }
    }
  });
});
